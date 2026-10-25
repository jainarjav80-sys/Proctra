/** P4 smoke: detector debouncing, head pose maths and Tier-2 correlation rules (offline). */
import { describe, expect, it } from "vitest";
import { DurationTracker, VIRTUAL_CAMERA_RE, headPose, meanLuma } from "@/lib/proctoring/edge/duration-tracker";
import { correlate, type ObservedRow } from "@/lib/proctoring/correlate";

describe("DurationTracker", () => {
  it("ignores blips shorter than the threshold (e.g. a 2.5 s thinking glance vs 4 s gaze rule)", () => {
    const t = new DurationTracker(4000);
    for (let ms = 0; ms <= 2500; ms += 200) expect(t.update(true, ms)).toBeNull();
    expect(t.update(false, 2700)).toBeNull();
    expect(t.isOpen).toBe(false);
  });

  it("opens after the threshold, survives one-frame flicker, closes after release", () => {
    const t = new DurationTracker(3000, 1000);
    let opened = false;
    for (let ms = 0; ms <= 4000; ms += 200) if (t.update(true, ms, 2) === "open") opened = true;
    expect(opened).toBe(true);
    expect(t.update(false, 4200)).toBeNull(); // flicker
    expect(t.update(true, 4400, 3)).toBeNull();
    expect(t.update(false, 5000)).toBeNull();
    const closed = t.update(false, 6100);
    expect(closed).toMatchObject({ startMs: 0, endMs: 5000, peak: 3 });
  });

  it("flushes an open interval at interview end", () => {
    const t = new DurationTracker(1000);
    t.update(true, 0);
    t.update(true, 1200);
    expect(t.flush(9000)).toMatchObject({ startMs: 0, endMs: 9000 });
  });
});

describe("vision helpers", () => {
  it("head pose from an identity matrix is straight ahead; yaw rotation is detected", () => {
    expect(headPose([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])).toEqual({ yaw: -0, pitch: 0 });
    const a = (40 * Math.PI) / 180; // rotate 40° about Y
    const m = [Math.cos(a), 0, -Math.sin(a), 0, 0, 1, 0, 0, Math.sin(a), 0, Math.cos(a), 0, 0, 0, 0, 1];
    expect(Math.round(Math.abs(headPose(m).yaw))).toBe(40);
  });

  it("luma and virtual-camera label checks", () => {
    expect(meanLuma(new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255]), 1)).toBe(0);
    expect(VIRTUAL_CAMERA_RE.test("OBS Virtual Camera")).toBe(true);
    expect(VIRTUAL_CAMERA_RE.test("Integrated Camera")).toBe(false);
  });
});

describe("correlate (Tier-2 rules)", () => {
  const ev = (id: string, type: string, start: number, end: number | null, q = "q1"): ObservedRow => ({ id, event_type: type, question_id: q, start_ms: start, end_ms: end });

  it("escalates a long tab switch, and repeated blurs, to external lookup", () => {
    const s = correlate([ev("a", "TAB_HIDDEN", 0, 4000)], []);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ event_type: "INF_UNAUTHORIZED_EXTERNAL_LOOKUP", severity: "MEDIUM", contributing_event_ids: ["a"] });
    expect(correlate([ev("a", "WINDOW_BLUR", 0, 600), ev("b", "WINDOW_BLUR", 9000, 9700)], [])[0].event_type).toBe("INF_UNAUTHORIZED_EXTERNAL_LOOKUP");
    expect(correlate([ev("a", "TAB_HIDDEN", 0, 900)], [])).toHaveLength(0); // one short switch: observed only
  });

  it("flags a sustained second person, not a brief passer-by", () => {
    expect(correlate([ev("a", "MULTIPLE_FACES", 0, 2500)], [])).toHaveLength(0);
    expect(correlate([ev("a", "MULTIPLE_FACES", 0, 5000)], [])[0]).toMatchObject({ event_type: "INF_UNAUTHORIZED_PERSON_IN_ROOM", severity: "HIGH" });
  });

  it("needs phone + gaze together for device assistance, and 3 gaze events for reading", () => {
    expect(correlate([ev("p", "PHONE_IN_VIEW", 10000, 13000)], [])).toHaveLength(0);
    expect(correlate([ev("p", "PHONE_IN_VIEW", 10000, 13000), ev("g", "GAZE_AWAY", 15000, 20000)], [])[0].event_type).toBe("INF_DEVICE_ASSISTANCE");
    const gazes = [ev("g1", "GAZE_AWAY", 0, 5000), ev("g2", "GAZE_AWAY", 30000, 35000), ev("g3", "GAZE_AWAY", 60000, 65000)];
    expect(correlate(gazes, [])[0]).toMatchObject({ event_type: "INF_OFFSCREEN_READING", severity: "LOW" });
  });

  it("never raises the same suspicion twice and always includes benign explanations", () => {
    const events = [ev("a", "TAB_HIDDEN", 0, 5000)];
    const first = correlate(events, []);
    expect(first.every((d) => d.benign_explanations.length > 0)).toBe(true);
    expect(correlate(events, first.map((d) => ({ event_type: d.event_type, question_id: d.question_id })))).toHaveLength(0);
  });
});
