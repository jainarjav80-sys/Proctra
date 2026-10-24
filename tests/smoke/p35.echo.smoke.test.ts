/** P3.5 smoke: question-echo similarity on fixtures (threshold 0.6). */
import { describe, expect, it } from "vitest";
import { DEFAULT_ECHO_THRESHOLD, longestCommonRun, questionEchoSimilarity, words } from "@/lib/proctoring/question-echo";
import { splitSentences } from "@/lib/speech/sentences";

const Q = "How do you make a Kafka consumer idempotent when the same payment event can be delivered more than once?";

const FIXTURES = {
  verbatim: "How do you make a Kafka consumer idempotent when the same payment event can be delivered more than once",
  verbatimWithFiller: "um so how do you make a Kafka consumer idempotent when the same payment event can be delivered more than once hmm",
  paraphrase: "So basically you're asking how I'd stop duplicates if Kafka redelivers a message to my service",
  unrelated: "At FinFlow we stored processed event ids in Postgres within the same transaction as the ledger update",
  shortRepeatRequest: "can you repeat that",
};

describe("P3.5 smoke: question-echo similarity", () => {
  const score = (u: string) => questionEchoSimilarity(Q, u);

  it("flags a verbatim read-aloud (with or without filler words)", () => {
    expect(score(FIXTURES.verbatim).score).toBeGreaterThanOrEqual(0.95);
    expect(score(FIXTURES.verbatimWithFiller).score).toBeGreaterThanOrEqual(DEFAULT_ECHO_THRESHOLD);
  });

  it("does not flag a paraphrase or an unrelated answer", () => {
    expect(score(FIXTURES.paraphrase).score).toBeLessThan(DEFAULT_ECHO_THRESHOLD);
    expect(score(FIXTURES.unrelated).score).toBeLessThan(DEFAULT_ECHO_THRESHOLD);
  });

  it("ignores short meta requests like 'can you repeat that'", () => {
    const r = score(FIXTURES.shortRepeatRequest);
    expect(r.eligible).toBe(false);
    expect(r.score).toBe(0);
  });

  it("helpers: word normalisation, common run, sentence split", () => {
    expect(words("Kafka's consumer, idempotent!")).toEqual(["kafkas", "consumer", "idempotent"]);
    expect(longestCommonRun(["a", "b", "c", "d"], ["x", "b", "c", "y"])).toBe(2);
    expect(splitSentences("Thank you. Question 2. How do you scale Kafka? Explain.")).toEqual(["Thank you.", "Question 2.", "How do you scale Kafka?", "Explain."]);
  });

  it("prints the fixture scores for calibration", () => {
    for (const [name, u] of Object.entries(FIXTURES)) console.log(`[echo] ${name}: ${JSON.stringify(score(u))}`);
  });
});
