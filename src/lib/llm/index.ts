import "server-only";
import { env } from "@/lib/config/env";
import { FallbackProvider } from "./fallback";
import { GeminiProvider } from "./gemini";
import { GroqProvider } from "./groq";
import type { LLMProvider } from "./types";

export type { JsonRequest, LLMProvider } from "./types";
export { LLMError } from "./types";

let instance: LLMProvider | undefined;

/** Gemini (primary) → Groq (fallback), whichever keys are configured. */
export function llm(): LLMProvider {
  if (instance) return instance;
  const e = env();
  const providers: LLMProvider[] = [];
  if (e.GEMINI_API_KEY) providers.push(new GeminiProvider(e.GEMINI_API_KEY, e.GEMINI_MODEL));
  if (e.GROQ_API_KEY) providers.push(new GroqProvider(e.GROQ_API_KEY, e.GROQ_MODEL));
  instance = new FallbackProvider(providers);
  return instance;
}
