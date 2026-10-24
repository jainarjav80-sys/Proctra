/** P3 smoke: interview FSM rules: intents, follow-up budget and the time guardrail. */
import { describe, expect, it } from "vitest";
import { canAskFollowUp, classifyIntent, decideTurn, timeIsUp, unallocatedBufferSec } from "@/lib/interview/fsm";

const base = { repeats: 0, clarifies: 0, followUpIndex: 0 };

describe("P3 smoke: interview state machine", () => {
  it("classifies short meta requests but not long answers that mention them", () => {
    expect(classifyIntent("can you repeat the question please")).toBe("REPEAT");
    expect(classifyIntent("skip this one")).toBe("SKIP");
    expect(classifyIntent("honestly I don't know")).toBe("DONT_KNOW");
    expect(classifyIntent("")).toBe("EMPTY");
    expect(
      classifyIntent("We decided to move on from the monolith by carving out the payments service first and putting Kafka between them"),
    ).toBe("ANSWER");
  });

  it("routes turns without the LLM wherever possible", () => {
    expect(decideTurn({ kind: "SKIP", transcript: "", avgConfidence: null, state: base, followUpAllowed: true })).toMatchObject({ type: "ADVANCE", status: "SKIPPED" });
    expect(decideTurn({ kind: "NO_RESPONSE", transcript: "", avgConfidence: null, state: base, followUpAllowed: true })).toMatchObject({ type: "ADVANCE", status: "UNANSWERED" });
    expect(decideTurn({ kind: "ANSWER", transcript: "repeat that", avgConfidence: 0.9, state: { ...base, repeats: 2 }, followUpAllowed: true }).type).toBe("ADVANCE");
    expect(decideTurn({ kind: "ANSWER", transcript: "a long enough mumbled answer here", avgConfidence: 0.3, state: base, followUpAllowed: true }).type).toBe("CLARIFY");
    const answer = "I used the outbox pattern so the payment row and the event are written in one transaction";
    expect(decideTurn({ kind: "ANSWER", transcript: answer, avgConfidence: 0.9, state: base, followUpAllowed: true }).type).toBe("FOLLOW_UP_CHECK");
    expect(decideTurn({ kind: "ANSWER", transcript: answer, avgConfidence: 0.9, state: base, followUpAllowed: false })).toMatchObject({ type: "ADVANCE", status: "COMPLETED" });
  });

  it("caps follow-ups and suppresses them when time is short (TRD-T02)", () => {
    const cfg = { durationMinutes: 30, responseTimeLimitSec: 180, totalPrimary: 10, maxFollowUps: 1 };
    // Q1 early: plenty of buffer → allowed once, then capped.
    expect(canAskFollowUp({ ...cfg, elapsedMs: 60_000, primaryIndex: 1, followUpIndex: 0 })).toBe(true);
    expect(canAskFollowUp({ ...cfg, elapsedMs: 60_000, primaryIndex: 1, followUpIndex: 1 })).toBe(false);
    // Q9 with < 90 s unallocated → suppressed so Q10 still fits.
    const late = { ...cfg, elapsedMs: (30 * 60 - 150) * 1000, primaryIndex: 9, followUpIndex: 0 };
    expect(unallocatedBufferSec(late)).toBeLessThan(90);
    expect(canAskFollowUp(late)).toBe(false);
    expect(timeIsUp({ durationMinutes: 30, elapsedMs: 30 * 60 * 1000 })).toBe(true);
  });
});
