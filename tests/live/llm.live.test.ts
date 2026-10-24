/**
 * Live provider checks (network + real keys). Run with: LIVE_LLM=1 npx vitest run tests/live
 * Skipped by default so `npm test` stays offline.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { FallbackProvider } from "@/lib/llm/fallback";
import { GeminiProvider } from "@/lib/llm/gemini";
import { GroqProvider } from "@/lib/llm/groq";

const LIVE = process.env.LIVE_LLM === "1";
if (LIVE) process.loadEnvFile?.(".env.local");

const schema = z.object({
  language: z.string(),
  concepts: z.array(z.string()).min(2).max(5),
  difficulty: z.enum(["FOUNDATIONAL", "INTERMEDIATE", "ADVANCED"]),
});
const req = {
  task: "live_check",
  system: "You classify interview topics.",
  prompt: "Topic: Java garbage collection tuning for low-latency services.",
  schema,
  temperature: 0,
};

describe.skipIf(!LIVE)("live LLM providers", () => {
  it.skipIf(!process.env.GEMINI_API_KEY)("Gemini returns schema-valid structured output", async () => {
    const out = await new GeminiProvider(process.env.GEMINI_API_KEY!, process.env.GEMINI_MODEL || "gemini-2.5-flash").generateJSON(req);
    expect(schema.parse(out)).toBeTruthy();
  }, 60_000);

  it.skipIf(!process.env.GROQ_API_KEY)("Groq returns schema-valid JSON", async () => {
    const out = await new GroqProvider(process.env.GROQ_API_KEY!, process.env.GROQ_MODEL || "openai/gpt-oss-120b").generateJSON(req);
    expect(schema.parse(out)).toBeTruthy();
  }, 60_000);

  it.skipIf(!process.env.GROQ_API_KEY)("falls back to Groq when Gemini fails (forced bad key)", async () => {
    const chain = new FallbackProvider([
      new GeminiProvider("invalid-key-forced-failure", "gemini-2.5-flash"),
      new GroqProvider(process.env.GROQ_API_KEY!, process.env.GROQ_MODEL || "openai/gpt-oss-120b"),
    ]);
    const out = await chain.generateJSON(req);
    expect(schema.parse(out)).toBeTruthy();
  }, 60_000);
});
