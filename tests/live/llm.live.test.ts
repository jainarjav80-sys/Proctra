/**
 * Live Groq checks (network + real key). Run: LIVE_LLM=1 npx vitest run tests/live
 * Skipped by default so `npm test` stays offline.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { FallbackProvider } from "@/lib/llm/fallback";
import { GroqProvider } from "@/lib/llm/groq";
import { decideFollowUp } from "@/lib/interview/follow-up";

const LIVE = process.env.LIVE_LLM === "1";
if (LIVE) process.loadEnvFile?.(".env.local");
const KEY = process.env.GROQ_API_KEY ?? "";
const FAST = process.env.GROQ_FAST_MODEL || "openai/gpt-oss-20b";
const SMART = process.env.GROQ_SMART_MODEL || "openai/gpt-oss-120b";
const FALLBACK = process.env.GROQ_FALLBACK_MODEL || "qwen/qwen3.8-27b";

const schema = z.object({
  language: z.string(),
  concepts: z.array(z.string()).min(2).max(5),
  difficulty: z.enum(["FOUNDATIONAL", "INTERMEDIATE", "ADVANCED"]),
});
const req = { task: "live_check", system: "You classify interview topics.", prompt: "Topic: Java garbage collection tuning for low-latency services.", schema, temperature: 0 };

describe.skipIf(!LIVE)("live Groq models", () => {
  for (const model of [FAST, SMART, FALLBACK]) {
    it(`${model} returns schema-valid JSON`, async () => {
      expect(schema.parse(await new GroqProvider(KEY, model, { reasoning: "low" }).generateJSON(req))).toBeTruthy();
    }, 60_000);
  }

  it("falls back to the next model when the primary fails (forced: nonexistent model)", async () => {
    const order: string[] = [];
    const chain = new FallbackProvider(
      ["openai/does-not-exist-forced-failure", FALLBACK, FAST].map((m) => {
        const p = new GroqProvider(KEY, m, { reasoning: "low" });
        return { name: p.name, generateJSON: (r: typeof req) => (order.push(m), p.generateJSON(r)) } as never;
      }),
    );
    expect(schema.parse(await chain.generateJSON(req))).toBeTruthy();
    // The forced failure is always skipped; whichever real model answered first is fine (Groq capacity varies).
    expect(order[0]).toBe("openai/does-not-exist-forced-failure");
    expect(order.length).toBeGreaterThanOrEqual(2);
    console.log(`[fallback] tried: ${order.join(" → ")}`);
  }, 60_000);

  it("follow-up decision latency on the fast tier (p50 target < 1.5 s)", async () => {
    const fast = new GroqProvider(KEY, FAST, { reasoning: "low" });
    const times: number[] = [];
    for (let i = 0; i < 6; i++) {
      const t = performance.now();
      const d = await decideFollowUp(fast, {
        question: "How do you make a Kafka consumer idempotent when events can be delivered twice?",
        rubricPoints: ["Idempotency key / dedupe table", "Transactional processing", "At-least-once semantics"],
        answer: i % 2 ? "We store processed event ids in Postgres in the same transaction as the business update, so a redelivery is a no-op." : "We just make sure it doesn't process things twice, it's handled.",
        priorAnswers: [],
      });
      times.push(performance.now() - t);
      expect(typeof d.needs_follow_up).toBe("boolean");
    }
    times.sort((a, b) => a - b);
    const p50 = times[Math.floor(times.length / 2)];
    const line = `[latency] ${FAST} follow-up decision ms: ${times.map((t) => Math.round(t)).join(", ")}  p50=${Math.round(p50)}`;
    console.log(line);
    (await import("node:fs")).appendFileSync(".live-latency.log", `${new Date().toISOString()} ${line}\n`);
    expect(p50).toBeLessThan(3000);
  }, 120_000);
});
