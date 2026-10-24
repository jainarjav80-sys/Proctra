import { createHash } from "node:crypto";
import { z } from "zod";
import type { LLMProvider } from "@/lib/llm/types";
import { UNTRUSTED_DATA_RULE, context, untrusted } from "@/lib/llm/prompt";

export const EXPERIENCE_LEVELS = ["INTERN", "ENTRY", "MID", "SENIOR", "STAFF"] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

export const skillSchema = z.object({
  name: z.string().min(1).max(80),
  mandatory: z.boolean(),
  source: z.enum(["RECRUITER", "AI"]).default("RECRUITER"),
});
export type JobSkill = z.infer<typeof skillSchema>;

export const jdAnalysisSchema = z.object({
  summary: z.string().describe("Two-sentence summary of the role"),
  seniority: z.enum(EXPERIENCE_LEVELS),
  competencies: z.array(z.string()).max(12).describe("Core competencies the role needs"),
  responsibilities: z.array(z.string()).max(12),
  skills: z
    .array(z.object({ name: z.string(), mandatory: z.boolean() }))
    .max(25)
    .describe("Technical and soft skills explicitly required or clearly implied"),
});
export type JdAnalysis = z.infer<typeof jdAnalysisSchema>;

export interface JobInput {
  title: string;
  description: string;
  experienceLevel: ExperienceLevel;
  skills: JobSkill[];
}

/** Cache key: re-analyse only when the JD text, title, level or recruiter skills change. */
export function jdAnalysisHash(job: JobInput): string {
  const skills = job.skills
    .filter((s) => s.source === "RECRUITER")
    .map((s) => `${s.name.toLowerCase()}:${s.mandatory}`)
    .sort();
  return createHash("sha256")
    .update(JSON.stringify([job.title, job.description, job.experienceLevel, skills]))
    .digest("hex");
}

const SYSTEM = `You are a senior technical recruiter analysing a job description for an AI interviewer.
Extract only what the job description states or clearly implies. Do not invent requirements.
${UNTRUSTED_DATA_RULE}`;

export async function analyzeJob(llm: LLMProvider, job: JobInput): Promise<JdAnalysis> {
  return llm.generateJSON({
    task: "jd_analysis",
    system: SYSTEM,
    prompt: [
      context("recruiter_settings", {
        title: job.title,
        experience_level: job.experienceLevel,
        recruiter_skills: job.skills.filter((s) => s.source === "RECRUITER"),
      }),
      untrusted("job_description", job.description),
      "Analyse the job description and return the JSON.",
    ].join("\n\n"),
    schema: jdAnalysisSchema,
    temperature: 0.2,
  });
}

/** Recruiter-entered skills win: AI skills are added only when the recruiter didn't list them. */
export function mergeSkills(recruiter: JobSkill[], ai: JdAnalysis["skills"]): JobSkill[] {
  const merged: JobSkill[] = recruiter.filter((s) => s.source === "RECRUITER");
  const seen = new Set(merged.map((s) => s.name.trim().toLowerCase()));
  for (const s of ai) {
    const key = s.name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push({ name: s.name.trim(), mandatory: s.mandatory, source: "AI" });
  }
  return merged;
}
