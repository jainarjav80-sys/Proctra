import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CandidateInterview } from "@/lib/candidate/session";
import { llm } from "@/lib/llm";
import { decideFollowUp } from "./follow-up";
import { canAskFollowUp, decideTurn, timeIsUp, type FsmState, type QuestionStatus } from "./fsm";

/** What the client should do next. The client never decides interview flow itself. */
export type InterviewAction =
  | { type: "ASK"; say: string; question: ClientQuestion; resumed?: boolean }
  | { type: "LISTEN"; say: string; question: ClientQuestion } // keep answering the same question (unclear audio)
  | { type: "END"; say: string };

export interface ClientQuestion {
  id: string;
  text: string;
  primaryIndex: number;
  followUpIndex: number;
  total: number;
  category: string;
  answerLimitSec: number;
}

export interface TurnResponse {
  version: number;
  startedAt: string;
  durationMinutes: number;
  action: InterviewAction;
}

export const turnSchema = z.object({
  turnId: z.string().min(8).max(64),
  version: z.number().int().min(1),
  kind: z.enum(["ANSWER", "NO_RESPONSE", "SKIP", "REPEAT"]),
  transcript: z.string().max(20000).default(""),
  avgConfidence: z.number().min(0).max(1).nullable().default(null),
  segments: z
    .array(z.object({ text: z.string().max(5000), startMs: z.number().int().min(0), endMs: z.number().int().min(0), confidence: z.number().nullable() }))
    .max(200)
    .default([]),
});
export type TurnInput = z.infer<typeof turnSchema>;

export class TurnConflictError extends Error {}

type Admin = SupabaseClient;
interface QuestionRow {
  id: string;
  parent_id: string | null;
  primary_index: number;
  follow_up_index: number;
  category: string;
  difficulty: string;
  text: string;
  rubric: { rubric_points?: string[] } | null;
  status: QuestionStatus;
  transcript: string | null;
}

const QUESTION_COLS = "id, parent_id, primary_index, follow_up_index, category, difficulty, text, rubric, status, transcript";

function clientQuestion(q: QuestionRow, total: number, interview: CandidateInterview): ClientQuestion {
  return {
    id: q.id,
    text: q.text,
    primaryIndex: q.primary_index,
    followUpIndex: q.follow_up_index,
    total,
    category: q.category,
    answerLimitSec: interview.response_time_limit_sec,
  };
}

async function loadQuestion(admin: Admin, id: string) {
  const { data, error } = await admin.from("questions").select(QUESTION_COLS).eq("id", id).single();
  if (error || !data) throw new Error("Question not found");
  return data as QuestionRow;
}

async function primaryAt(admin: Admin, interviewId: string, primaryIndex: number) {
  const { data } = await admin
    .from("questions")
    .select(QUESTION_COLS)
    .eq("interview_id", interviewId)
    .eq("primary_index", primaryIndex)
    .eq("follow_up_index", 0)
    .maybeSingle();
  return (data as QuestionRow | null) ?? null;
}

function elapsedMs(interview: CandidateInterview) {
  return interview.started_at ? Date.now() - new Date(interview.started_at).getTime() : 0;
}

async function logAgent(admin: Admin, interviewId: string, questionId: string | null, text: string, atMs: number) {
  if (!text.trim()) return;
  await admin.from("transcript_segments").insert({ interview_id: interviewId, question_id: questionId, speaker: "AGENT", text, start_ms: atMs });
}

function firstName(full: string) {
  return full.trim().split(/\s+/)[0] ?? "";
}

/** Persists the new FSM state only if nobody else advanced it first (optimistic concurrency). */
async function commit(admin: Admin, interview: CandidateInterview, prev: FsmState | null, next: FsmState, patch: Record<string, unknown> = {}) {
  let q = admin.from("interviews").update({ fsm_state: next, ...patch }).eq("id", interview.id);
  q = prev ? q.eq("fsm_state->>version", String(prev.version)) : q.is("fsm_state", null);
  const { data, error } = await q.select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new TurnConflictError("The interview advanced in another tab. Resyncing…");
}

function response(interview: CandidateInterview, state: FsmState, startedAt: string, action: InterviewAction): TurnResponse {
  return { version: state.version, startedAt, durationMinutes: interview.duration_minutes, action };
}

/** Starts the interview, or resumes it at the current question after a refresh/reconnect. */
export async function startOrResume(admin: Admin, interview: CandidateInterview): Promise<TurnResponse> {
  const existing = interview.fsm_state as FsmState | null;
  if (existing && interview.started_at) {
    if (existing.phase === "COMPLETED") {
      return response(interview, existing, interview.started_at, { type: "END", say: "This interview is already complete. Thank you!" });
    }
    const q = await loadQuestion(admin, existing.questionId);
    return response(interview, existing, interview.started_at, {
      type: "ASK",
      resumed: true,
      say: `Welcome back. We were on question ${existing.primaryIndex}. Here it is again.`,
      question: clientQuestion(q, existing.totalPrimary, interview),
    });
  }

  const { count } = await admin
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("interview_id", interview.id)
    .eq("follow_up_index", 0);
  const total = count ?? 0;
  const first = await primaryAt(admin, interview.id, 1);
  if (!first || total === 0) throw new Error("This interview has no questions");

  const startedAt = new Date().toISOString();
  const state: FsmState = {
    version: 1,
    phase: "IN_QUESTION",
    totalPrimary: total,
    primaryIndex: 1,
    followUpIndex: 0,
    questionId: first.id,
    questionAskedAtMs: 0,
    repeats: 0,
    clarifies: 0,
  };
  await commit(admin, interview, null, state, { status: "IN_PROGRESS", started_at: startedAt });
  await admin.from("questions").update({ status: "IN_PROGRESS", asked_at_ms: 0 }).eq("id", first.id);
  const job = (interview.jobs as { title: string } | null)?.title ?? "this role";
  const say = `Hi ${firstName(interview.candidate_name)}, I'm Proctra, your interviewer for the ${job} position. I'll ask ${total} questions. Take your time, answer out loud, and press "I've finished" or simply pause when you're done. You can say "repeat" or "skip" at any point. Let's begin with question one.`;
  await logAgent(admin, interview.id, first.id, `${say} ${first.text}`, 0);
  return response(interview, state, startedAt, { type: "ASK", say, question: clientQuestion(first, total, interview) });
}

/** Applies one candidate turn and returns the next action. Idempotent per turnId. */
export async function processTurn(admin: Admin, interview: CandidateInterview, input: TurnInput): Promise<TurnResponse> {
  const state = interview.fsm_state as FsmState | null;
  if (!state || !interview.started_at) throw new Error("The interview hasn't started");
  const startedAt = interview.started_at as string;
  if (input.turnId === state.lastTurnId && state.lastResponse) return state.lastResponse as TurnResponse;
  if (state.phase === "COMPLETED") return response(interview, state, startedAt, { type: "END", say: "This interview is already complete." });
  if (input.version !== state.version) throw new TurnConflictError("Out-of-date turn. Resyncing…");

  const now = elapsedMs(interview);
  const current = await loadQuestion(admin, state.questionId);

  // Record what the candidate said, even for meta requests, so the transcript is complete.
  const spoken = input.transcript.trim();
  if (spoken) {
    const combined = current.transcript ? `${current.transcript}\n${spoken}` : spoken;
    await admin.from("questions").update({ transcript: combined }).eq("id", current.id);
    current.transcript = combined;
    const segs = input.segments.length
      ? input.segments.filter((s) => s.text.trim())
      : [{ text: spoken, startMs: Math.max(0, now - 1000), endMs: now, confidence: input.avgConfidence }];
    if (segs.length) {
      await admin.from("transcript_segments").insert(
        segs.map((s) => ({
          interview_id: interview.id,
          question_id: current.id,
          speaker: "CANDIDATE",
          text: s.text.trim(),
          start_ms: s.startMs,
          end_ms: s.endMs,
          confidence: s.confidence,
        })),
      );
    }
  }

  const budget = {
    durationMinutes: interview.duration_minutes,
    responseTimeLimitSec: interview.response_time_limit_sec,
    elapsedMs: now,
    primaryIndex: state.primaryIndex,
    totalPrimary: state.totalPrimary,
  };
  const followUpAllowed =
    !timeIsUp(budget) && canAskFollowUp({ ...budget, followUpIndex: state.followUpIndex, maxFollowUps: interview.max_follow_ups });
  const decision = decideTurn({ kind: input.kind, transcript: spoken, avgConfidence: input.avgConfidence, state, followUpAllowed });

  const finish = async (next: FsmState, action: InterviewAction, patch: Record<string, unknown> = {}) => {
    const withMeta: FsmState = { ...next, version: state.version + 1, lastTurnId: input.turnId };
    const res = response(interview, withMeta, startedAt, action);
    withMeta.lastResponse = res;
    await commit(admin, interview, state, withMeta, patch);
    return res;
  };

  if (decision.type === "REPEAT") {
    await logAgent(admin, interview.id, current.id, `${decision.say} ${current.text}`, now);
    return finish({ ...state, repeats: state.repeats + 1 }, { type: "ASK", say: decision.say, question: clientQuestion(current, state.totalPrimary, interview) });
  }
  if (decision.type === "CLARIFY") {
    await logAgent(admin, interview.id, current.id, decision.say, now);
    return finish({ ...state, clarifies: state.clarifies + 1 }, { type: "LISTEN", say: decision.say, question: clientQuestion(current, state.totalPrimary, interview) });
  }

  let status: QuestionStatus = decision.type === "ADVANCE" ? decision.status : "COMPLETED";
  let say = decision.type === "ADVANCE" ? decision.say : "Thank you.";

  if (decision.type === "FOLLOW_UP_CHECK") {
    try {
      const { data: prior } = await admin
        .from("questions")
        .select("text, transcript")
        .eq("interview_id", interview.id)
        .not("transcript", "is", null)
        .neq("id", current.id)
        .order("primary_index", { ascending: false })
        .limit(3);
      const fu = await decideFollowUp(llm(), {
        question: current.text,
        rubricPoints: current.rubric?.rubric_points ?? [],
        answer: current.transcript ?? spoken,
        priorAnswers: (prior ?? []).reverse().map((p) => ({ question: p.text, answer: (p.transcript ?? "").slice(0, 600) })),
        signal: AbortSignal.timeout(8000),
      });
      if (fu.needs_follow_up && fu.follow_up_question) {
        const parentId = current.parent_id ?? current.id;
        const { data: created, error } = await admin
          .from("questions")
          .insert({
            interview_id: interview.id,
            parent_id: parentId,
            primary_index: state.primaryIndex,
            follow_up_index: state.followUpIndex + 1,
            source: "AI_GENERATED",
            category: current.category,
            difficulty: current.difficulty,
            target_skills: [],
            text: fu.follow_up_question.trim(),
            rubric: { rationale: fu.rationale },
            status: "IN_PROGRESS",
            asked_at_ms: now,
          })
          .select(QUESTION_COLS)
          .single();
        if (error || !created) throw new Error(error?.message ?? "Couldn't store follow-up");
        await admin.from("questions").update({ status: "COMPLETED", ended_at_ms: now }).eq("id", current.id);
        await logAgent(admin, interview.id, created.id, created.text, now);
        return finish(
          { ...state, followUpIndex: state.followUpIndex + 1, questionId: created.id, questionAskedAtMs: now, repeats: 0, clarifies: 0 },
          { type: "ASK", say: "", question: clientQuestion(created as QuestionRow, state.totalPrimary, interview) },
        );
      }
    } catch (e) {
      // LLM down, slow or rate-limited: advance deterministically rather than stall the interview.
      console.warn("[interview] follow-up check failed, advancing", (e as Error).message);
    }
    status = "COMPLETED";
    say = "Thank you.";
  }

  // Advance to the next primary question (or finish). A follow-up's status never changes its primary's.
  await admin.from("questions").update({ status, ended_at_ms: now }).eq("id", current.id);

  const nextIndex = state.primaryIndex + 1;
  const next = nextIndex <= state.totalPrimary && !timeIsUp(budget) ? await primaryAt(admin, interview.id, nextIndex) : null;
  if (!next) {
    const closing = timeIsUp(budget) && nextIndex <= state.totalPrimary
      ? "We've reached the end of our time. Thank you very much for your answers. The recruiter will review the interview and be in touch."
      : `${say} That was the last question. Thank you, ${firstName(interview.candidate_name)}. The recruiter will review your interview and be in touch.`;
    await logAgent(admin, interview.id, null, closing, now);
    return finish({ ...state, phase: "COMPLETED" }, { type: "END", say: closing }, { status: "COMPLETED", completed_at: new Date().toISOString() });
  }

  await admin.from("questions").update({ status: "IN_PROGRESS", asked_at_ms: now }).eq("id", next.id);
  const lead = nextIndex === state.totalPrimary ? `${say} Here's the final question.` : `${say} Question ${nextIndex}.`;
  await logAgent(admin, interview.id, next.id, `${lead} ${next.text}`, now);
  return finish(
    { ...state, primaryIndex: nextIndex, followUpIndex: 0, questionId: next.id, questionAskedAtMs: now, repeats: 0, clarifies: 0 },
    { type: "ASK", say: lead, question: clientQuestion(next, state.totalPrimary, interview) },
  );
}
