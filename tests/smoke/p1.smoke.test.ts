import { describe, expect, it } from "vitest";
import { z } from "zod";
import { signToken, verifyToken, TokenError, newNonce } from "@/lib/auth/tokens";
import { allocateCategories, checkTimingFit, resolveQuestionCount } from "@/lib/interview/config";
import { FallbackProvider } from "@/lib/llm/fallback";
import { LLMError, type LLMProvider } from "@/lib/llm/types";
import { parseAndValidate } from "@/lib/llm/json";

const secret = "test-secret-test-secret-test-secret-123";

describe("P1 smoke", () => {
  it("signs and verifies candidate and pair tokens, rejecting wrong type and expiry", async () => {
    const t = await signToken("candidate", "iv-1", { secret });
    await expect(verifyToken("candidate", t, { secret })).resolves.toMatchObject({ interviewId: "iv-1" });
    await expect(verifyToken("pair", t, { secret })).rejects.toMatchObject({ reason: "wrong_type" });

    const nonce = newNonce();
    const p = await signToken("pair", "iv-1", { secret, nonce });
    await expect(verifyToken("pair", p, { secret })).resolves.toEqual({ interviewId: "iv-1", nonce });

    const expired = await signToken("pair", "iv-1", { secret, ttlSec: -1 });
    await expect(verifyToken("pair", expired, { secret })).rejects.toBeInstanceOf(TokenError);
    await expect(verifyToken("candidate", t, { secret: secret + "x" })).rejects.toMatchObject({ reason: "invalid" });
  });

  it("defaults to 10 questions split 4/2/2/2 and flags configs that cannot fit", () => {
    expect(resolveQuestionCount(null)).toBe(10);
    expect(resolveQuestionCount(7)).toBe(7);
    expect(allocateCategories(10)).toEqual({ TECHNICAL: 4, BEHAVIORAL: 2, EXPERIENCE: 2, SCENARIO: 2 });
    expect(Object.values(allocateCategories(7)).reduce((a, b) => a + b)).toBe(7);
    const tight = checkTimingFit({ questionCount: null, durationMinutes: 10, responseTimeLimitSec: 180, maxFollowUps: 1 });
    expect(tight.fits).toBe(false);
    expect(tight.warnings.length).toBe(1);
  });

  it("falls back to the next LLM provider when the first fails or returns invalid JSON", async () => {
    const schema = z.object({ ok: z.boolean() });
    const broken: LLMProvider = {
      name: "broken",
      generateJSON: async (r) => parseAndValidate("not json", r.schema, "broken"),
    };
    const working: LLMProvider = { name: "working", generateJSON: async (r) => r.schema.parse({ ok: true }) };
    const llm = new FallbackProvider([broken, working]);
    await expect(llm.generateJSON({ task: "t", system: "", prompt: "", schema })).resolves.toEqual({ ok: true });
    await expect(new FallbackProvider([broken]).generateJSON({ task: "t", system: "", prompt: "", schema })).rejects.toBeInstanceOf(LLMError);
  });
});
