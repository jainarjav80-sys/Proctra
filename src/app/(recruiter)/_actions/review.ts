"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRecruiter } from "@/lib/auth/recruiter";
import { queueEvaluation } from "@/lib/evaluation/schedule";
import { requestOrigin } from "@/lib/http/origin";
import { isFinished } from "@/lib/interview/status";
import { createAdminClient } from "@/lib/supabase/admin";

type Result = { ok: true } | { error: string };

const overrideSchema = z.object({
  score: z.number().min(0).max(10),
  reason: z.string().trim().min(5, "Give a reason (at least 5 characters)").max(500),
});

/** Append-only override: the AI score stays visible; who/when/why is recorded in score_overrides. */
export async function overrideScore(interviewId: string, questionId: string, input: { score: number; reason: string }): Promise<Result> {
  const parsed = overrideSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid override" };
  const { supabase, user } = await requireRecruiter();
  const { data: q } = await supabase.from("questions").select("id, ai_score, override_score").eq("id", questionId).eq("interview_id", interviewId).maybeSingle();
  if (!q) return { error: "Question not found" };
  const { error } = await supabase.from("score_overrides").insert({
    interview_id: interviewId,
    question_id: questionId,
    old_score: q.override_score ?? q.ai_score,
    new_score: parsed.data.score,
    reason: parsed.data.reason,
    recruiter_email: user.email,
  });
  if (error) return { error: error.message };
  const { error: upErr } = await supabase
    .from("questions")
    .update({ override_score: parsed.data.score, override_reason: parsed.data.reason, overridden_at: new Date().toISOString() })
    .eq("id", questionId);
  if (upErr) return { error: upErr.message };
  revalidatePath(`/dashboard/interviews/${interviewId}`);
  return { ok: true };
}

const decisionSchema = z.object({
  decision: z.enum(["PENDING", "ADVANCE", "HOLD", "REJECT"]),
  notes: z.string().max(5000),
});

/** The hiring decision is made only here, by a recruiter. The AI never sets it. */
export async function saveDecision(interviewId: string, input: { decision: string; notes: string }): Promise<Result> {
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid decision" };
  const { supabase, user } = await requireRecruiter();
  const { error } = await supabase
    .from("interviews")
    .update({
      recruiter_decision: parsed.data.decision,
      recruiter_notes: parsed.data.notes,
      decided_at: parsed.data.decision === "PENDING" ? null : new Date().toISOString(),
      decided_by: parsed.data.decision === "PENDING" ? null : user.id,
      decided_by_email: parsed.data.decision === "PENDING" ? null : user.email,
    })
    .eq("id", interviewId);
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/interviews/${interviewId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function rerunEvaluation(interviewId: string): Promise<Result> {
  const { supabase } = await requireRecruiter();
  const { data: iv } = await supabase.from("interviews").select("id, status").eq("id", interviewId).maybeSingle();
  if (!iv) return { error: "Interview not found" };
  if (!isFinished(iv.status)) return { error: "The interview isn't finished yet" };
  await queueEvaluation(createAdminClient(), interviewId, await requestOrigin(), { rerun: true });
  revalidatePath(`/dashboard/interviews/${interviewId}`);
  return { ok: true };
}
