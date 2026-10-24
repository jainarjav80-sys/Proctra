import "server-only";
import { z } from "zod";
import { FallbackProvider } from "./fallback";
import { GeminiProvider } from "./gemini";
import { GroqProvider } from "./groq";
import type { LLMProvider } from "./types";

export type { JsonRequest, LLMProvider } from "./types";
export { LLMError } from "./types";

// Only the LLM variables, so the LLM works (and can be tested) without the rest of the app configured.
const llmEnv = z.object({
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default("openai/gpt-oss-120b"),
});

/** Builds the provider chain from env: Gemini (primary) → Groq (fallback), whichever keys exist. */
export function buildLLM(source: NodeJS.ProcessEnv = process.env): LLMProvider {
  const e = llmEnv.parse(source);
  const providers: LLMProvider[] = [];
  if (e.GEMINI_API_KEY) providers.push(new GeminiProvider(e.GEMINI_API_KEY, e.GEMINI_MODEL));
  if (e.GROQ_API_KEY) providers.push(new GroqProvider(e.GROQ_API_KEY, e.GROQ_MODEL));
  return new FallbackProvider(providers);
}

let instance: LLMProvider | undefined;

export function llm(): LLMProvider {
  instance ??= buildLLM();
  return instance;
}
