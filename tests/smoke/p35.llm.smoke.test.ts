/** P3.5 smoke: Groq 429 handling (retry-after honoured, then fallback to another model). Offline. */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { FallbackProvider } from "@/lib/llm/fallback";
import { GroqProvider, parseRetryAfterMs } from "@/lib/llm/groq";
import { modelChain } from "@/lib/llm";

const schema = z.object({ ok: z.boolean() });
const req = { task: "t", system: "s", prompt: "p", schema };
const ok = () => new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200 });
const limited = (retryAfter: string) => new Response("{}", { status: 429, headers: { "retry-after": retryAfter } });

describe("P3.5 smoke: Groq rate limits and fallback", () => {
  it("parses retry-after and Groq reset headers", () => {
    expect(parseRetryAfterMs(new Headers({ "retry-after": "2" }))).toBe(2000);
    expect(parseRetryAfterMs(new Headers({ "x-ratelimit-reset-tokens": "1m26.4s" }))).toBe(86_400);
    expect(parseRetryAfterMs(new Headers({ "x-ratelimit-reset-tokens": "600ms" }))).toBe(600);
  });

  it("waits out a short 429 on the same model when allowed", async () => {
    const calls: string[] = [];
    const fetchImpl = (async () => (calls.push("x"), calls.length === 1 ? limited("0.05") : ok())) as typeof fetch;
    const p = new GroqProvider("k", "m", { maxRateLimitWaitMs: 1000, fetchImpl });
    await expect(p.generateJSON(req)).resolves.toEqual({ ok: true });
    expect(calls).toHaveLength(2);
  });

  it("does not wait on the fast tier: a 429 falls straight through to the next model", async () => {
    const seen: string[] = [];
    const mk = (model: string, res: () => Response) =>
      new GroqProvider("k", model, { maxRateLimitWaitMs: 0, fetchImpl: (async () => (seen.push(model), res())) as typeof fetch });
    const chain = new FallbackProvider([mk("fast", () => limited("30")), mk("fallback", ok)]);
    const t = Date.now();
    await expect(chain.generateJSON(req)).resolves.toEqual({ ok: true });
    expect(seen).toEqual(["fast", "fallback"]);
    expect(Date.now() - t).toBeLessThan(500);
  });

  it("uses three distinct models per tier", () => {
    const env = { GROQ_API_KEY: "k" } as unknown as NodeJS.ProcessEnv;
    expect(modelChain("fast", env)).toEqual(["openai/gpt-oss-20b", "qwen/qwen3.8-27b", "openai/gpt-oss-120b"]);
    expect(modelChain("smart", env)).toEqual(["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"]);
  });
});
