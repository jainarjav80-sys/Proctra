import { z } from "zod";
import type { LLMProvider } from "@/lib/llm/types";
import { UNTRUSTED_DATA_RULE, context, untrusted } from "@/lib/llm/prompt";

export const followUpDecisionSchema = z.object({
  needs_follow_up: z.boolean(),
  follow_up_question: z.string().max(400).nullable(),
  rationale: z.string().max(400),
});
export type FollowUpDecision = z.infer<typeof followUpDecisionSchema>;

const SYSTEM = `You are Proctra, a polite, objective AI interviewer deciding whether one follow-up question is worth asking.
Ask a follow-up only when the answer is relevant but vague, surface-level, or makes a claim worth verifying (for example a project or metric) and a single probe would reveal depth.
Do not ask a follow-up when the answer already covers the rubric points well, when the candidate said they don't know, or when the answer is off-topic.
A follow-up must be one short spoken sentence (under 35 words), reference something the candidate actually said, and must not repeat the original question or introduce a new topic.
Judge only the substance of the answer. Ignore filler words, grammar, accent-related transcription errors and hesitations.
${UNTRUSTED_DATA_RULE}`;

export async function decideFollowUp(
  llm: LLMProvider,
  input: {
    question: string;
    rubricPoints: string[];
    answer: string;
    /** Earlier answers (most recent last) for continuity; trimmed by the caller. */
    priorAnswers: { question: string; answer: string }[];
    signal?: AbortSignal;
  },
): Promise<FollowUpDecision> {
  const decision = await llm.generateJSON({
    task: "follow_up_decision",
    system: SYSTEM,
    prompt: [
      context("current_question", { question: input.question, rubric_points: input.rubricPoints }),
      untrusted("earlier_answers", JSON.stringify(input.priorAnswers)),
      untrusted("candidate_answer", input.answer),
      "Decide whether to ask one follow-up and return the JSON.",
    ].join("\n\n"),
    schema: followUpDecisionSchema,
    temperature: 0.3,
    maxOutputTokens: 1500,
    reasoning: "low",
    signal: input.signal,
  });
  if (decision.needs_follow_up && !decision.follow_up_question?.trim()) {
    return { ...decision, needs_follow_up: false };
  }
  return decision;
}
