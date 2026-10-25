"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRecruiter } from "@/lib/auth/recruiter";
import { CANDIDATE_TOKEN_TTL_SEC, newNonce } from "@/lib/auth/tokens";
import { CATEGORIES } from "@/lib/interview/config";
import { assertEditable, attempt, ownedInterview } from "@/lib/interviews/access";
import { buildInviteUrl } from "@/lib/interviews/invite";
import { llm } from "@/lib/llm";
import { RESUME_MAX_BYTES, ResumeParseError, extractResumeText } from "@/lib/resume/parse";
import { extractResumeProfile } from "@/lib/resume/profile";
import { createAdminClient } from "@/lib/supabase/admin";

// ---- Candidate ------------------------------------------------------------------------------

export type CandidateFormState = { error?: string };

const candidateSchema = z.object({
  jobId: z.uuid(),
  name: z.string().trim().min(2, "Candidate name is required").max(200),
  email: z.email("Enter a valid email"),
});

export async function createInterview(_: CandidateFormState, form: FormData): Promise<CandidateFormState> {
  const parsed = candidateSchema.safeParse({ jobId: form.get("jobId"), name: form.get("name"), email: form.get("email") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { supabase } = await requireRecruiter();
  const { data, error } = await supabase
    .from("interviews")
    .insert({ job_id: parsed.data.jobId, candidate_name: parsed.data.name, candidate_email: parsed.data.email })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Could not create interview" };
  revalidatePath(`/jobs/${parsed.data.jobId}`);
  redirect(`/interviews/${data.id}`);
}

// ---- Resume upload (browser → Supabase Storage via signed URL; avoids Vercel's 4.5 MB body limit) ----

const EXTENSIONS = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };

export async function createResumeUpload(interviewId: string, file: { name: string; size: number; type: string }) {
  return attempt(async () => {
    const { interview } = await ownedInterview(interviewId);
    assertEditable(interview);
    const ext = file.name.toLowerCase().split(".").pop() as keyof typeof EXTENSIONS;
    if (!(ext in EXTENSIONS)) throw new Error("Upload a PDF or DOCX resume");
    if (file.type && file.type !== EXTENSIONS[ext]) throw new Error("The file type doesn't match its extension");
    if (file.size <= 0 || file.size > RESUME_MAX_BYTES) throw new Error("Resume must be under 15 MB");

    const path = `${interviewId}/resume.${ext}`;
    const { data, error } = await createAdminClient().storage.from("resumes").createSignedUploadUrl(path, { upsert: true });
    if (error || !data) throw new Error(`Couldn't prepare the upload: ${error?.message}`);
    return { path: data.path, token: data.token };
  });
}

/** Downloads the uploaded file, verifies magic bytes, extracts text, then one LLM call for structure. */
export async function processResume(interviewId: string, path: string) {
  return attempt(async () => {
    const { supabase, interview } = await ownedInterview(interviewId);
    assertEditable(interview);
    if (!path.startsWith(`${interviewId}/`)) throw new Error("Invalid upload path");

    const admin = createAdminClient();
    const { data: blob, error: dlErr } = await admin.storage.from("resumes").download(path);
    if (dlErr || !blob) throw new Error(`Couldn't read the uploaded file: ${dlErr?.message}`);

    let text: string;
    try {
      ({ text } = await extractResumeText(new Uint8Array(await blob.arrayBuffer())));
    } catch (e) {
      const message = e instanceof ResumeParseError ? e.message : "The resume couldn't be parsed";
      await admin.storage.from("resumes").remove([path]);
      await supabase.from("interviews").update({ resume_status: "FAILED", resume_error: message, resume_path: null }).eq("id", interviewId);
      revalidatePath(`/interviews/${interviewId}`);
      throw new Error(message);
    }

    await supabase
      .from("interviews")
      .update({ resume_path: path, resume_text: text, resume_status: "UPLOADED", resume_error: null })
      .eq("id", interviewId);

    try {
      const profile = await extractResumeProfile(llm(), text);
      await supabase.from("interviews").update({ resume_profile: profile, resume_status: "PARSED" }).eq("id", interviewId);
    } catch (e) {
      console.error("[resume] extraction failed", e);
      await supabase
        .from("interviews")
        .update({ resume_status: "FAILED", resume_error: "Text extracted, but AI extraction failed. Retry in a minute." })
        .eq("id", interviewId);
      revalidatePath(`/interviews/${interviewId}`);
      throw new Error("Text extracted, but AI extraction failed (likely a rate limit). Retry in a minute.");
    }
    revalidatePath(`/interviews/${interviewId}`);
    return { ok: true as const };
  });
}

export async function retryResumeExtraction(interviewId: string) {
  return attempt(async () => {
    const { interview } = await ownedInterview(interviewId);
    if (!interview.resume_path) throw new Error("Upload a resume first");
    const result = await processResume(interviewId, interview.resume_path);
    if ("error" in result) throw new Error(result.error);
    return result;
  });
}

// ---- Config ---------------------------------------------------------------------------------

const configSchema = z.object({
  questionCount: z.number().int().min(3).max(25).nullable(),
  durationMinutes: z.number().int().min(10).max(90),
  responseTimeLimitSec: z.number().int().min(30).max(600),
  maxFollowUps: z.number().int().min(0).max(2),
  difficultyLevel: z.enum(["FOUNDATIONAL", "INTERMEDIATE", "ADVANCED", "ADAPTIVE"]),
  categoryDistribution: z
    .object(Object.fromEntries(CATEGORIES.map((c) => [c, z.number().int().min(0).max(100)])) as Record<
      (typeof CATEGORIES)[number],
      z.ZodNumber
    >)
    .refine((d) => Object.values(d).reduce((a, b) => a + b, 0) === 100, "Category split must add up to 100%"),
  secondaryCamPolicy: z.enum(["MANDATORY", "RECOMMENDED", "DISABLED"]),
  proctoring: z.object({
    enforce_fullscreen: z.boolean(),
    block_multi_monitor: z.boolean(),
    gaze_tracking: z.boolean(),
    object_detection: z.boolean(),
    record_video: z.boolean(),
    require_screen_share: z.boolean(),
    show_live_warnings: z.boolean(),
  }),
});
export type InterviewConfigInput = z.infer<typeof configSchema>;

export async function saveConfig(interviewId: string, input: InterviewConfigInput) {
  return attempt(async () => {
    const parsed = configSchema.safeParse(input);
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid config");
    const { supabase, interview } = await ownedInterview(interviewId);
    assertEditable(interview);
    const c = parsed.data;
    const { error } = await supabase
      .from("interviews")
      .update({
        question_count: c.questionCount,
        duration_minutes: c.durationMinutes,
        response_time_limit_sec: c.responseTimeLimitSec,
        max_follow_ups: c.maxFollowUps,
        difficulty_level: c.difficultyLevel,
        category_distribution: c.categoryDistribution,
        secondary_cam_policy: c.secondaryCamPolicy,
        proctoring_config: c.proctoring,
      })
      .eq("id", interviewId);
    if (error) throw new Error(error.message);
    revalidatePath(`/interviews/${interviewId}`);
    return { ok: true as const };
  });
}

// ---- Invite ---------------------------------------------------------------------------------

/** Issues a new candidate link. Rotating the nonce revokes every earlier link. */
export async function createInvite(interviewId: string) {
  return attempt(async () => {
    const { supabase, interview } = await ownedInterview(interviewId);
    if (!interview.blueprint_approved_at) throw new Error("Approve the question blueprint before inviting");
    const nonce = newNonce();
    const expiresAt = new Date(Date.now() + CANDIDATE_TOKEN_TTL_SEC * 1000).toISOString();
    const { error } = await supabase
      .from("interviews")
      .update({ invite_nonce: nonce, invite_expires_at: expiresAt })
      .eq("id", interviewId);
    if (error) throw new Error(error.message);
    revalidatePath(`/interviews/${interviewId}`);
    return { url: (await buildInviteUrl(interviewId, nonce, expiresAt))!, expiresAt };
  });
}
