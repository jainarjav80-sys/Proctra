import { z } from "zod";
import { CATEGORIES } from "@/lib/interview/config";

export const DIFFICULTIES = ["FOUNDATIONAL", "INTERMEDIATE", "ADVANCED"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const questionDraftSchema = z.object({
  category: z.enum(CATEGORIES),
  target_skill: z.string().min(1).max(80),
  difficulty: z.enum(DIFFICULTIES),
  text: z.string().min(15).max(600).describe("The question exactly as the interviewer will speak it"),
  rubric_points: z.array(z.string().min(3)).min(2).max(6).describe("Key points a strong answer covers"),
  expected_answer_outline: z.string().min(10).max(1200),
  red_flags: z.array(z.string()).max(4).describe("Misconceptions or warning signs"),
});
export type QuestionDraft = z.infer<typeof questionDraftSchema>;

export const blueprintResponseSchema = z.object({
  questions: z.array(questionDraftSchema).min(1).max(40),
});

export const singleQuestionResponseSchema = z.object({ question: questionDraftSchema });

/** Shape persisted in questions.rubric. */
export interface StoredRubric {
  rubric_points: string[];
  expected_answer_outline: string;
  red_flags: string[];
}

export function toStoredRubric(q: Pick<QuestionDraft, "rubric_points" | "expected_answer_outline" | "red_flags">): StoredRubric {
  return {
    rubric_points: q.rubric_points,
    expected_answer_outline: q.expected_answer_outline,
    red_flags: q.red_flags,
  };
}
