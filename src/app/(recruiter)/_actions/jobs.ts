"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRecruiter } from "@/lib/auth/recruiter";
import { llm } from "@/lib/llm";
import {
  EXPERIENCE_LEVELS,
  analyzeJob,
  jdAnalysisHash,
  mergeSkills,
  skillSchema,
  type JobInput,
} from "@/lib/jobs/analysis";

export type JobFormState = { error?: string; warning?: string };

const jobFormSchema = z.object({
  id: z.uuid().optional(),
  title: z.string().trim().min(2, "Title is required").max(255),
  description: z.string().trim().min(50, "Job description must be at least 50 characters").max(15000),
  experienceLevel: z.enum(EXPERIENCE_LEVELS),
  skills: z.array(skillSchema).max(40),
});

function parseForm(form: FormData) {
  let skills: unknown = [];
  try {
    skills = JSON.parse(String(form.get("skills") ?? "[]"));
  } catch {
    skills = [];
  }
  return jobFormSchema.safeParse({
    id: form.get("id") || undefined,
    title: form.get("title"),
    description: form.get("description"),
    experienceLevel: form.get("experienceLevel"),
    skills,
  });
}

/** Runs JD analysis only if the cache key changed; recruiter skills win on merge. */
async function refreshAnalysis(jobId: string, input: JobInput, cachedHash: string | null) {
  const hash = jdAnalysisHash(input);
  if (hash === cachedHash) return null;
  const { supabase } = await requireRecruiter();
  try {
    const analysis = await analyzeJob(llm(), input);
    const { error } = await supabase
      .from("jobs")
      .update({ jd_analysis: analysis, jd_analysis_hash: hash, required_skills: mergeSkills(input.skills, analysis.skills) })
      .eq("id", jobId);
    if (error) return `Saved, but the analysis couldn't be stored: ${error.message}`;
    return null;
  } catch (e) {
    console.error("[jobs] analysis failed", e);
    return "Job saved, but the AI analysis failed (likely an LLM rate limit). Use “Re-run analysis” in a minute.";
  }
}

export async function saveJob(_: JobFormState, form: FormData): Promise<JobFormState> {
  const parsed = parseForm(form);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { supabase } = await requireRecruiter();
  const { id, title, description, experienceLevel, skills } = parsed.data;
  const row = { title, description, experience_level: experienceLevel, required_skills: skills };

  let jobId = id;
  let cachedHash: string | null = null;
  if (id) {
    const { data: existing, error } = await supabase.from("jobs").select("jd_analysis_hash").eq("id", id).single();
    if (error || !existing) return { error: "Job not found" };
    cachedHash = existing.jd_analysis_hash;
    const { error: upErr } = await supabase.from("jobs").update(row).eq("id", id);
    if (upErr) return { error: upErr.message };
  } else {
    const { data, error } = await supabase.from("jobs").insert(row).select("id").single();
    if (error || !data) return { error: error?.message ?? "Could not create job" };
    jobId = data.id;
  }

  const warning = await refreshAnalysis(jobId!, { title, description, experienceLevel, skills }, cachedHash);
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs");
  if (warning) return { warning };
  redirect(`/jobs/${jobId}`);
}

export async function reanalyzeJob(jobId: string): Promise<JobFormState> {
  const { supabase } = await requireRecruiter();
  const { data: job, error } = await supabase
    .from("jobs")
    .select("title, description, experience_level, required_skills")
    .eq("id", jobId)
    .single();
  if (error || !job) return { error: "Job not found" };
  const warning = await refreshAnalysis(
    jobId,
    {
      title: job.title,
      description: job.description,
      experienceLevel: job.experience_level,
      skills: z.array(skillSchema).parse(job.required_skills),
    },
    null, // force
  );
  revalidatePath(`/jobs/${jobId}`);
  return warning ? { error: warning } : {};
}
