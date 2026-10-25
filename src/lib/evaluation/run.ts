import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LLMProvider } from "@/lib/llm/types";
import { EVALUATOR_SYSTEM, batchPrompt, overallPrompt, type EvalQuestion } from "./prompts";
import { quoteInTranscript, quoteStartMs } from "./quotes";
import { batchEvalSchema, overallEvalSchema, type QuestionEval } from "./schema";

export const BATCH_SIZE = 5;
const LEASE_MS = 90_000;
const BLUEPRINT_GAP_MS = 60_000;
export type StepResult = "done" | "more" | "busy" | "deferred" | "failed";

interface InputQuestion {
  id: string;
  parent_id: string | null;
  primary_index: number;
  follow_up_index: number;
  category: string;
  text: string;
  rubric: EvalQuestion["rubric"] | null;
  status: string;
  transcript: string | null;
  evaluation_status: string;
  avg_confidence: number | null;
  segments: { text: string; start_ms: number }[];
}
interface EvaluationInput {
  interview: { id: string; status: string; experience_level: string; stt_engines: (string | null)[] };
  job: { title: string; required_skills: unknown; analysis: unknown };
  resume: unknown;
  questions: InputQuestion[];
}

type Usage = { calls: number; prompt_tokens: number; completion_tokens: number; by_model: Record<string, number> };

/**
 * Loads evaluator input through the evaluation_input() SQL function, the evaluator's only data
 * path. It returns questions, rubrics, transcripts, JD analysis and resume, and never proctoring
 * data, so integrity signals cannot influence scores.
 */
export async function loadEvaluationInput(admin: SupabaseClient, interviewId: string): Promise<EvaluationInput> {
  const { data, error } = await admin.rpc("evaluation_input", { iid: interviewId });
  if (error || !data) throw new Error(`evaluation_input failed: ${error?.message ?? "no data"}`);
  return data as EvaluationInput;
}

function groupQuestions(input: EvaluationInput) {
  const primaries = input.questions.filter((q) => q.follow_up_index === 0);
  return primaries.map((p) => {
    const followUps = input.questions.filter((q) => q.parent_id === p.id).sort((a, b) => a.follow_up_index - b.follow_up_index);
    const allTranscript = [p.transcript ?? "", ...followUps.map((f) => f.transcript ?? "")].join("\n").trim();
    const confs = [p, ...followUps].map((q) => q.avg_confidence).filter((c): c is number => typeof c === "number" && c > 0);
    const avgConf = confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : null;
    return { primary: p, followUps, allTranscript, avgConf, segments: [...p.segments, ...followUps.flatMap((f) => f.segments)] };
  });
}

function transcriptNote(engines: (string | null)[], avgConf: number | null): string | null {
  const notes: string[] = [];
  if (engines.includes("groq-whisper")) notes.push("Transcribed by server speech recognition (Whisper).");
  if (engines.includes("typed")) notes.push("Some answers were typed (speech recognition unavailable).");
  if (avgConf !== null && avgConf < 0.6) notes.push(`Low recognition confidence (${avgConf.toFixed(2)}): expect misheard words.`);
  return notes.length ? notes.join(" ") : null;
}

/** Atomic claim: compare-and-swap on the previous lease value, so only one runner wins. */
async function claim(admin: SupabaseClient, id: string) {
  const { data: cur } = await admin
    .from("interviews")
    .select("id, status, evaluation_status, evaluation_lease_until, evaluation_not_before, evaluation_attempts, evaluation_started_at, evaluation_usage")
    .eq("id", id)
    .single();
  if (!cur || !["PENDING", "RUNNING"].includes(cur.evaluation_status)) return null;
  const now = Date.now();
  if (cur.evaluation_lease_until && new Date(cur.evaluation_lease_until).getTime() > now) return null; // another runner holds it
  if (cur.evaluation_not_before && new Date(cur.evaluation_not_before).getTime() > now) return null;
  let q = admin
    .from("interviews")
    .update({ evaluation_status: "RUNNING", evaluation_lease_until: new Date(now + LEASE_MS).toISOString(), evaluation_not_before: null })
    .eq("id", id);
  q = cur.evaluation_lease_until ? q.eq("evaluation_lease_until", cur.evaluation_lease_until) : q.is("evaluation_lease_until", null);
  const { data } = await q.select("id");
  return data?.length ? cur : null;
}

async function release(admin: SupabaseClient, id: string, patch: Record<string, unknown> = {}) {
  await admin.from("interviews").update({ evaluation_status: "PENDING", evaluation_lease_until: null, ...patch }).eq("id", id);
}

/**
 * One bounded unit of evaluation work (≤ budgetMs). Idempotent and resumable: questions already
 * evaluated are skipped, a lease prevents concurrent runners, and failures are retried with backoff.
 */
export async function runEvaluationStep(admin: SupabaseClient, interviewId: string, llm: LLMProvider, budgetMs = 40_000): Promise<StepResult> {
  const t0 = Date.now();
  const row = await claim(admin, interviewId);
  if (!row) return "busy";

  // Never share a minute with blueprint generation (Groq per-minute token limits on the smart tier).
  const { data: bp } = await admin.from("llm_activity").select("at").eq("key", "blueprint").maybeSingle();
  if (bp && Date.now() - new Date(bp.at).getTime() < BLUEPRINT_GAP_MS) {
    await release(admin, interviewId, { evaluation_not_before: new Date(new Date(bp.at).getTime() + BLUEPRINT_GAP_MS).toISOString() });
    return "deferred";
  }

  const usage: Usage = { calls: 0, prompt_tokens: 0, completion_tokens: 0, by_model: {}, ...(row.evaluation_usage as Partial<Usage>) };
  const onUsage = (u: { model: string; promptTokens: number; completionTokens: number }) => {
    usage.calls++;
    usage.prompt_tokens += u.promptTokens;
    usage.completion_tokens += u.completionTokens;
    usage.by_model[u.model] = (usage.by_model[u.model] ?? 0) + u.promptTokens + u.completionTokens;
  };

  try {
    await admin
      .from("interviews")
      .update({ evaluation_started_at: row.evaluation_started_at ?? new Date().toISOString(), evaluation_attempts: (row.evaluation_attempts ?? 0) + 1, evaluation_error: null })
      .eq("id", interviewId);
    const input = await loadEvaluationInput(admin, interviewId);
    const groups = groupQuestions(input);
    const job = { title: input.job.title, experience_level: input.interview.experience_level, required_skills: input.job.required_skills, analysis: input.job.analysis };

    // Not answered → 0 with a reason. No LLM call, nothing invented.
    for (const g of groups.filter((x) => x.primary.evaluation_status === "PENDING" && !x.allTranscript)) {
      const reason = g.primary.status === "SKIPPED" ? "Skipped by the candidate." : g.primary.status === "UNANSWERED" ? "No answer was given (silence/timeout)." : "Not asked or no answer recorded.";
      await admin
        .from("questions")
        .update({
          ai_score: 0,
          rubric_scores: (g.primary.rubric?.rubric_points ?? ["Answer"]).map((point) => ({ point, score: 0, justification: reason })),
          evidence_quotes: [],
          ai_summary: reason,
          strengths: [],
          gaps: [],
          evaluation_status: "NOT_ANSWERED",
          evaluation_flags: [],
        })
        .eq("id", g.primary.id);
      g.primary.evaluation_status = "NOT_ANSWERED";
    }

    // Answered questions in batches of ≤ 5.
    while (true) {
      const pending = groups.filter((g) => g.primary.evaluation_status === "PENDING").slice(0, BATCH_SIZE);
      if (!pending.length) break;
      if (Date.now() - t0 > budgetMs) {
        await admin.from("interviews").update({ evaluation_usage: usage }).eq("id", interviewId);
        await release(admin, interviewId);
        return "more";
      }
      const evalQs: EvalQuestion[] = pending.map((g) => ({
        id: g.primary.id,
        text: g.primary.text,
        category: g.primary.category,
        rubric: g.primary.rubric ?? {},
        transcript: g.primary.transcript ?? "",
        followUps: g.followUps.map((f) => ({ text: f.text, transcript: f.transcript ?? "" })),
        transcriptNote: transcriptNote(input.interview.stt_engines, g.avgConf),
      }));
      const res = await llm.generateJSON({
        task: "evaluation_batch",
        system: EVALUATOR_SYSTEM,
        prompt: batchPrompt(job, input.resume, evalQs),
        schema: batchEvalSchema,
        temperature: 0.1,
        maxOutputTokens: 6000,
        reasoning: "medium",
        onUsage,
      });
      for (const g of pending) {
        let ev: QuestionEval | undefined = res.evaluations.find((e) => e.question_id === g.primary.id);
        let quotes = (ev?.evidence_quotes ?? []).filter((q) => quoteInTranscript(q.quote, g.allTranscript));
        if (!ev || quotes.length < (ev.evidence_quotes.length || 1)) {
          // Missing evaluation or a quote that isn't in the transcript: re-ask this question once.
          const bad = (ev?.evidence_quotes ?? []).filter((q) => !quoteInTranscript(q.quote, g.allTranscript)).map((q) => `"${q.quote}"`);
          const retry = await llm.generateJSON({
            task: "evaluation_retry",
            system: EVALUATOR_SYSTEM,
            prompt: batchPrompt(job, input.resume, [evalQs.find((q) => q.id === g.primary.id)!], bad.length ? `These evidence quotes are not in the transcript: ${bad.join(", ")}. Copy quotes character-for-character from the answer.` : "Return the evaluation for this question."),
            schema: batchEvalSchema,
            temperature: 0,
            maxOutputTokens: 3000,
            reasoning: "medium",
            onUsage,
          });
          ev = retry.evaluations[0] ?? ev;
          quotes = (ev?.evidence_quotes ?? []).filter((q) => quoteInTranscript(q.quote, g.allTranscript));
        }
        if (!ev) continue; // stays PENDING; retried on the next step
        const flags: string[] = [];
        const note = transcriptNote(input.interview.stt_engines, g.avgConf);
        if (g.avgConf !== null && g.avgConf < 0.6) flags.push("LOW_TRANSCRIPT_CONFIDENCE");
        if (note?.includes("typed")) flags.push("TYPED_ANSWERS");
        if (ev.manipulation_attempt) flags.push("INSTRUCTION_IN_ANSWER");
        if (quotes.length < ev.evidence_quotes.length) flags.push("UNVERIFIED_QUOTES_REMOVED");
        await admin
          .from("questions")
          .update({
            ai_score: Math.round(ev.overall_score * 100) / 100,
            rubric_scores: ev.rubric_scores,
            evidence_quotes: quotes.map((q) => ({ ...q, start_ms: quoteStartMs(q.quote, g.segments) })),
            ai_summary: ev.summary,
            strengths: ev.strengths,
            gaps: ev.gaps,
            evaluation_status: quotes.length ? "DONE" : "NEEDS_REVIEW",
            evaluation_flags: flags,
          })
          .eq("id", g.primary.id);
        g.primary.evaluation_status = quotes.length ? "DONE" : "NEEDS_REVIEW";
      }
    }

    // Overall synthesis from the per-question results (still no proctoring data).
    const { data: scored } = await admin
      .from("questions")
      .select("id, primary_index, text, ai_score, ai_summary, strengths, gaps, evaluation_status, evaluation_flags")
      .eq("interview_id", interviewId)
      .eq("follow_up_index", 0)
      .order("primary_index");
    const overall = await llm.generateJSON({
      task: "evaluation_overall",
      system: `${EVALUATOR_SYSTEM}\nCommunication means clarity and structure of the explanations (did the candidate explain their reasoning understandably), never accent, fluency or pace.`,
      prompt: overallPrompt(job, input.resume, scored),
      schema: overallEvalSchema,
      temperature: 0.1,
      maxOutputTokens: 3000,
      reasoning: "medium",
      onUsage,
    });
    const scores = (scored ?? []).map((q) => Number(q.ai_score ?? 0));
    const overallScore = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : 0;
    await admin
      .from("interviews")
      .update({
        overall_score: overallScore,
        competency_scores: overall.competencies,
        evaluation_summary: {
          summary: overall.summary,
          strengths: overall.strengths,
          gaps: overall.gaps,
          further_areas: overall.further_areas,
          resume_consistency: overall.resume_consistency,
          confidence: overall.confidence,
          confidence_reason: overall.confidence_reason,
          needs_review: (scored ?? []).filter((q) => q.evaluation_status === "NEEDS_REVIEW").length,
        },
        evaluation_status: "DONE",
        evaluation_lease_until: null,
        evaluation_finished_at: new Date().toISOString(),
        evaluation_usage: usage,
        ...(row.status === "COMPLETED" ? { status: "EVALUATED" } : {}),
      })
      .eq("id", interviewId);
    return "done";
  } catch (e) {
    const attempts = (row.evaluation_attempts ?? 0) + 1;
    const message = (e as Error).message.slice(0, 500);
    console.error("[evaluation]", interviewId, message);
    if (attempts >= 4) {
      await admin.from("interviews").update({ evaluation_status: "FAILED", evaluation_error: message, evaluation_lease_until: null, evaluation_usage: usage }).eq("id", interviewId);
      return "failed";
    }
    await release(admin, interviewId, { evaluation_error: message, evaluation_usage: usage, evaluation_not_before: new Date(Date.now() + 30_000 * attempts).toISOString() });
    return "more";
  }
}
