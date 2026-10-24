import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_ECHO_THRESHOLD, DEFAULT_MAX_BARGE_INS, questionEchoSimilarity } from "./question-echo";

interface BargeIn { sentenceIndex: number; sentenceCount: number; atMs: number; utterance: string }

const ECHO_BENIGN = [
  "Candidates often restate a question aloud while thinking or to check they understood it.",
  "Reading the on-screen caption back is common for non-native speakers.",
];
const BARGE_BENIGN = [
  "Echo from speakers (no headphones) can register as an interruption.",
  "Some candidates naturally start answering before a question finishes.",
];

/**
 * Stores barge-ins on the question and logs OBSERVED proctoring events:
 *  - QUESTION_READ_ALOUD (MEDIUM): an utterance during/just after the question, or the first ~15 s
 *    of the answer, closely matches the question text (once per question);
 *  - EXCESSIVE_BARGE_IN (LOW): total barge-ins exceed the configured limit (once per interview).
 * These live only in proctoring_events; the evaluation step never reads that table.
 */
export async function recordSpeechSignals(
  admin: SupabaseClient,
  interview: { id: string; proctoring_config?: Record<string, unknown> | null },
  question: { id: string; text: string },
  input: { bargeIns: BargeIn[]; openingText: string; atMs: number },
) {
  const cfg = interview.proctoring_config ?? {};
  const threshold = typeof cfg.question_echo_threshold === "number" ? cfg.question_echo_threshold : DEFAULT_ECHO_THRESHOLD;
  const maxBargeIns = typeof cfg.max_barge_ins === "number" ? cfg.max_barge_ins : DEFAULT_MAX_BARGE_INS;

  if (input.bargeIns.length) {
    const { data: q } = await admin.from("questions").select("barge_in_count, barge_ins").eq("id", question.id).single();
    await admin
      .from("questions")
      .update({
        barge_in_count: (q?.barge_in_count ?? 0) + input.bargeIns.length,
        barge_ins: [...((q?.barge_ins as BargeIn[] | null) ?? []), ...input.bargeIns].slice(-50),
      })
      .eq("id", question.id);
  }

  // Question echo: best match across barge-in utterances and the opening of the answer.
  const candidates = [...input.bargeIns.map((b) => ({ text: b.utterance, atMs: b.atMs, during: true })), { text: input.openingText, atMs: input.atMs, during: false }];
  let best: { text: string; atMs: number; during: boolean; score: number; coverage: number; run: number } | null = null;
  for (const c of candidates) {
    const r = questionEchoSimilarity(question.text, c.text);
    if (r.eligible && (!best || r.score > best.score)) best = { ...c, ...r };
  }
  if (best && best.score >= threshold) {
    const { count } = await admin
      .from("proctoring_events")
      .select("id", { count: "exact", head: true })
      .eq("question_id", question.id)
      .eq("event_type", "QUESTION_READ_ALOUD");
    if (!count) {
      await admin.from("proctoring_events").insert({
        interview_id: interview.id,
        question_id: question.id,
        tier: "OBSERVED_EVENT",
        source: "AUDIO",
        event_type: "QUESTION_READ_ALOUD",
        severity: "MEDIUM",
        confidence: Math.min(1, best.score),
        start_ms: best.atMs,
        description: `Candidate's speech closely matched the question text (similarity ${best.score.toFixed(2)}, ${best.during ? "while the question was being read" : "at the start of the answer"}).`,
        benign_explanations: ECHO_BENIGN,
        telemetry: { similarity: best.score, coverage: best.coverage, run: best.run, threshold, snippet: best.text.slice(0, 280) },
      });
    }
  }

  if (input.bargeIns.length) {
    const { data: all } = await admin.from("questions").select("barge_in_count").eq("interview_id", interview.id);
    const total = (all ?? []).reduce((s, r) => s + (r.barge_in_count ?? 0), 0);
    if (total > maxBargeIns) {
      const { count } = await admin
        .from("proctoring_events")
        .select("id", { count: "exact", head: true })
        .eq("interview_id", interview.id)
        .eq("event_type", "EXCESSIVE_BARGE_IN");
      if (!count) {
        await admin.from("proctoring_events").insert({
          interview_id: interview.id,
          question_id: question.id,
          tier: "OBSERVED_EVENT",
          source: "AUDIO",
          event_type: "EXCESSIVE_BARGE_IN",
          severity: "LOW",
          start_ms: input.atMs,
          description: `Candidate interrupted the interviewer ${total} times (limit ${maxBargeIns}).`,
          benign_explanations: BARGE_BENIGN,
          telemetry: { total_barge_ins: total, limit: maxBargeIns },
        });
      }
    }
  }
}
