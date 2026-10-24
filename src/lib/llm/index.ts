import "server-only";
import { z } from "zod";
import { FallbackProvider } from "./fallback";
import { GroqProvider } from "./groq";
import { LLMError, type LLMProvider } from "./types";

export type { JsonRequest, LLMProvider } from "./types";
export { LLMError } from "./types";

/**
 * Two tiers, both on Groq, each an explicit fallback chain across *different models*, because
 * Groq rate limits are per model, so a 429 or outage on one doesn't stop the interview.
 *  - fast:  live interview turns (follow-up decisions). Small model, low reasoning, no waiting on 429.
 *  - smart: JD/resume extraction, blueprint, evaluation. Large model; may wait out a short 429.
 */
export type LLMTier = "fast" | "smart";

const llmEnv = z.object({
  GROQ_API_KEY: z.string().optional(),
  GROQ_FAST_MODEL: z.string().default("openai/gpt-oss-20b"),
  GROQ_SMART_MODEL: z.string().default("openai/gpt-oss-120b"),
  GROQ_FALLBACK_MODEL: z.string().default("qwen/qwen3.8-27b"),
});

export function modelChain(tier: LLMTier, source: NodeJS.ProcessEnv = process.env): string[] {
  const e = llmEnv.parse(source);
  const chain =
    tier === "fast"
      ? [e.GROQ_FAST_MODEL, e.GROQ_FALLBACK_MODEL, e.GROQ_SMART_MODEL]
      : [e.GROQ_SMART_MODEL, e.GROQ_FALLBACK_MODEL, e.GROQ_FAST_MODEL];
  return [...new Set(chain.filter(Boolean))];
}

export function buildLLM(tier: LLMTier, source: NodeJS.ProcessEnv = process.env): LLMProvider {
  const key = llmEnv.parse(source).GROQ_API_KEY;
  if (!key) throw new LLMError("GROQ_API_KEY is not set", "groq", "config");
  const opts =
    tier === "fast"
      ? { maxRateLimitWaitMs: 0, reasoning: "low" as const }
      : { maxRateLimitWaitMs: 20_000, reasoning: "medium" as const };
  return new FallbackProvider(modelChain(tier, source).map((m) => new GroqProvider(key, m, opts)));
}

const instances: Partial<Record<LLMTier, LLMProvider>> = {};

/** `llm()` = smart tier (offline work); `llm("fast")` for anything on the live interview path. */
export function llm(tier: LLMTier = "smart"): LLMProvider {
  return (instances[tier] ??= buildLLM(tier));
}
