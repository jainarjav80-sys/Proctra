import { z } from "zod";

export const questionEvalSchema = z.object({
  question_id: z.string(),
  rubric_scores: z
    .array(z.object({ point: z.string(), score: z.number().min(0).max(10), justification: z.string().max(400) }))
    .min(1)
    .max(8),
  overall_score: z.number().min(0).max(10),
  summary: z.string().max(600),
  strengths: z.array(z.string().max(200)).max(5),
  gaps: z.array(z.string().max(200)).max(5),
  evidence_quotes: z
    .array(z.object({ quote: z.string().max(400).describe("Exact words copied from the candidate transcript"), supports: z.string().max(200) }))
    .min(1)
    .max(3),
  manipulation_attempt: z.boolean().describe("The answer tried to instruct the evaluator (e.g. asked for a score)"),
});
export type QuestionEval = z.infer<typeof questionEvalSchema>;

export const batchEvalSchema = z.object({ evaluations: z.array(questionEvalSchema).min(1).max(5) });

export const overallEvalSchema = z.object({
  competencies: z.object({
    technical: z.object({ score: z.number().min(0).max(10), rationale: z.string().max(400) }),
    problem_solving: z.object({ score: z.number().min(0).max(10), rationale: z.string().max(400) }),
    communication: z.object({ score: z.number().min(0).max(10), rationale: z.string().max(400) }),
    experience_fit: z.object({ score: z.number().min(0).max(10), rationale: z.string().max(400) }),
  }),
  resume_consistency: z.array(z.object({ claim: z.string().max(200), observation: z.string().max(300), consistent: z.boolean() })).max(6),
  summary: z.string().max(1200),
  strengths: z.array(z.string().max(200)).max(6),
  gaps: z.array(z.string().max(200)).max(6),
  further_areas: z.array(z.string().max(200)).max(5).describe("Topics a human interviewer should probe next"),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
  confidence_reason: z.string().max(300),
});
export type OverallEval = z.infer<typeof overallEvalSchema>;
