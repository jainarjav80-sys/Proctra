/**
 * Server-authoritative interview state machine: pure rules, no I/O (engine.ts does persistence).
 * Primary questions Q1..QN are fixed by the approved blueprint; follow-ups are sub-indexed (Qi.1, Qi.2)
 * and never add primary questions, so the interview can't grow past its configuration.
 */

export type PauseReason = "SCREEN_SHARE_STOPPED" | "PHONE_CAMERA_LOST";

export type QuestionStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED" | "UNANSWERED";

export interface FsmState {
  version: number;
  phase: "IN_QUESTION" | "COMPLETED";
  totalPrimary: number;
  primaryIndex: number; // 1-based
  followUpIndex: number; // 0 = primary
  questionId: string;
  questionAskedAtMs: number; // relative to interview start
  repeats: number; // repeat requests on the current question
  clarifies: number; // "audio unclear" re-asks on the current question
  /** Policy pause (screen share stopped / required phone camera lost). Paused time isn't billed. */
  paused?: { reason: PauseReason; atMs: number } | null;
  pausedTotalMs?: number;
  /** Completed pauses, for the review timeline (wall ms since start; clockMs = interview clock). */
  pauses?: { reason: PauseReason; clockMs: number; wallStartMs: number; wallEndMs: number }[];
  /** Idempotency: the last processed turn and the response it produced. */
  lastTurnId?: string;
  lastResponse?: unknown;
}

export type Intent = "REPEAT" | "SKIP" | "DONT_KNOW" | "EMPTY" | "ANSWER";

const REPEAT_RE = /\b(repeat( (that|the question|it))?|say (that|it) again|come again|could you (please )?repeat|pardon)\b/i;
const SKIP_RE = /\b(skip( (this|that|it|the question))?|next question|move on|pass on this|i('?d| would) like to pass)\b/i;
const DONT_KNOW_RE = /\b(i (really )?(do not|don'?t) know|no idea|not sure (about|how)|i'?m not familiar|never (used|worked with)|i have no experience)\b/i;

export function wordCount(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

/** Deterministic meta-intent detection. Only short utterances count as commands, so a long answer
 *  that happens to contain "move on" is still treated as an answer. */
export function classifyIntent(transcript: string): Intent {
  const words = wordCount(transcript);
  if (words === 0) return "EMPTY";
  if (words <= 12 && REPEAT_RE.test(transcript)) return "REPEAT";
  if (words <= 12 && SKIP_RE.test(transcript)) return "SKIP";
  if (words <= 20 && DONT_KNOW_RE.test(transcript)) return "DONT_KNOW";
  return "ANSWER";
}

export interface BudgetInput {
  durationMinutes: number;
  responseTimeLimitSec: number;
  elapsedMs: number;
  primaryIndex: number;
  totalPrimary: number;
}

/** Expected seconds per remaining primary question (TTS ask + typical answer). */
export function expectedSecondsPerQuestion(responseTimeLimitSec: number) {
  return 20 + Math.min(120, Math.round(responseTimeLimitSec * (2 / 3)));
}

/** Seconds left after reserving time for every remaining primary question. */
export function unallocatedBufferSec(b: BudgetInput) {
  const remainingSec = b.durationMinutes * 60 - b.elapsedMs / 1000;
  const remainingPrimary = b.totalPrimary - b.primaryIndex;
  return remainingSec - remainingPrimary * expectedSecondsPerQuestion(b.responseTimeLimitSec);
}

export const FOLLOW_UP_BUFFER_SEC = 90;

export function canAskFollowUp(input: BudgetInput & { followUpIndex: number; maxFollowUps: number }) {
  return input.followUpIndex < input.maxFollowUps && unallocatedBufferSec(input) > FOLLOW_UP_BUFFER_SEC;
}

export function timeIsUp(b: Pick<BudgetInput, "durationMinutes" | "elapsedMs">) {
  return b.elapsedMs >= b.durationMinutes * 60 * 1000;
}

export const MAX_REPEATS = 2;
export const MAX_CLARIFIES = 1;
export const LOW_CONFIDENCE = 0.45;

export type TurnKind = "ANSWER" | "NO_RESPONSE" | "SKIP" | "REPEAT";

export type Decision =
  | { type: "REPEAT"; say: string }
  | { type: "CLARIFY"; say: string }
  | { type: "FOLLOW_UP_CHECK" } // engine asks the LLM, then calls decideAfterFollowUpCheck
  | { type: "ADVANCE"; status: QuestionStatus; say: string };

/**
 * First-pass decision for a turn. Everything that can be decided without an LLM is decided here,
 * which keeps live LLM calls (and free-tier quota) to genuine answers with follow-up budget left.
 */
export function decideTurn(input: {
  kind: TurnKind;
  transcript: string;
  avgConfidence: number | null;
  state: Pick<FsmState, "repeats" | "clarifies" | "followUpIndex">;
  followUpAllowed: boolean;
}): Decision {
  const { kind, transcript, state } = input;
  const intent = kind === "ANSWER" ? classifyIntent(transcript) : null;

  if ((kind === "REPEAT" || intent === "REPEAT") && state.repeats < MAX_REPEATS) {
    return { type: "REPEAT", say: "Of course. Here's the question again." };
  }
  if (kind === "SKIP" || intent === "SKIP") {
    return { type: "ADVANCE", status: "SKIPPED", say: "No problem, let's move on." };
  }
  if (kind === "NO_RESPONSE" || intent === "EMPTY" || intent === "REPEAT") {
    // A follow-up with no reply leaves the primary answer intact, so it isn't "unanswered".
    return state.followUpIndex > 0
      ? { type: "ADVANCE", status: "COMPLETED", say: "That's fine, let's continue." }
      : { type: "ADVANCE", status: "UNANSWERED", say: "Let's move on to the next question." };
  }
  if (intent === "DONT_KNOW") {
    return { type: "ADVANCE", status: "COMPLETED", say: "Thanks for being upfront. Let's continue." };
  }
  if (
    input.avgConfidence !== null &&
    input.avgConfidence > 0 &&
    input.avgConfidence < LOW_CONFIDENCE &&
    state.clarifies < MAX_CLARIFIES
  ) {
    return { type: "CLARIFY", say: "Sorry, your audio broke up a little. Could you repeat that last part?" };
  }
  if (input.followUpAllowed) return { type: "FOLLOW_UP_CHECK" };
  return { type: "ADVANCE", status: "COMPLETED", say: "Thank you." };
}
