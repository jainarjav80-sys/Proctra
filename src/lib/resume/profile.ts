import { z } from "zod";
import type { LLMProvider } from "@/lib/llm/types";
import { UNTRUSTED_DATA_RULE, untrusted } from "@/lib/llm/prompt";

export const resumeProfileSchema = z.object({
  headline: z.string().describe("One-line professional summary"),
  total_years_experience: z.number().min(0).max(60),
  skills: z
    .array(
      z.object({
        name: z.string(),
        category: z.enum(["LANGUAGE", "FRAMEWORK", "CLOUD", "DATABASE", "TOOL", "SOFT_SKILL", "OTHER"]),
        evidence: z.string().describe("Where on the resume it appears (role or project), or 'listed only'"),
      }),
    )
    .max(40),
  experience: z
    .array(
      z.object({
        company: z.string(),
        title: z.string(),
        start: z.string().describe("YYYY-MM or YYYY, empty if unknown"),
        end: z.string().describe("YYYY-MM, YYYY, 'present', or empty"),
        highlights: z.array(z.string()).max(6),
      }),
    )
    .max(15),
  projects: z
    .array(z.object({ name: z.string(), tech_stack: z.array(z.string()).max(12), summary: z.string() }))
    .max(10),
  education: z.array(z.object({ degree: z.string(), institution: z.string(), year: z.string() })).max(6),
  certifications: z.array(z.string()).max(15),
});
export type ResumeProfile = z.infer<typeof resumeProfileSchema>;

const SYSTEM = `You extract structured data from a candidate resume for an interview system.
Copy facts exactly as written. Never infer skills that aren't on the resume. Use empty strings or empty arrays for missing data.
Do not include contact details (email, phone, address).
${UNTRUSTED_DATA_RULE}`;

export async function extractResumeProfile(llm: LLMProvider, resumeText: string): Promise<ResumeProfile> {
  return llm.generateJSON({
    task: "resume_extraction",
    system: SYSTEM,
    prompt: `${untrusted("resume", resumeText)}\n\nExtract the resume into the JSON structure.`,
    schema: resumeProfileSchema,
    temperature: 0.1,
  });
}
