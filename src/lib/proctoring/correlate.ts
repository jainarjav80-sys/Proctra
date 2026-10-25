/**
 * Tier-2 rules: promote patterns of OBSERVED events to INFERRED suspicions. Pure: given all
 * observed events of an interview and the suspicions already raised, returns new ones to create.
 * Every suspicion carries benign explanations and contributing event ids; nothing affects scores.
 */
import type { Severity } from "./events";

export interface ObservedRow {
  id: string;
  event_type: string;
  question_id: string | null;
  start_ms: number;
  end_ms: number | null;
}

export interface SuspicionDraft {
  rule: string;
  event_type: string;
  severity: Severity;
  confidence: number;
  question_id: string | null;
  start_ms: number;
  end_ms: number | null;
  description: string;
  benign_explanations: string[];
  contributing_event_ids: string[];
}

const dur = (e: ObservedRow) => (e.end_ms ?? e.start_ms) - e.start_ms;
const byQuestion = (events: ObservedRow[], types: string[]) => {
  const m = new Map<string | null, ObservedRow[]>();
  for (const e of events) if (types.includes(e.event_type)) m.set(e.question_id, [...(m.get(e.question_id) ?? []), e]);
  return m;
};

export function correlate(events: ObservedRow[], existing: { event_type: string; question_id: string | null }[]): SuspicionDraft[] {
  const out: SuspicionDraft[] = [];
  const raised = new Set(existing.map((s) => `${s.event_type}|${s.question_id ?? "*"}`));
  const add = (d: SuspicionDraft, perInterview = false) => {
    const key = `${d.event_type}|${perInterview ? "*" : (d.question_id ?? "*")}`;
    if (raised.has(key)) return;
    raised.add(key);
    out.push(d);
  };

  // External lookup: a long tab switch, or repeated focus loss within one question.
  for (const [qid, evs] of byQuestion(events, ["TAB_HIDDEN", "WINDOW_BLUR"])) {
    const long = evs.filter((e) => e.event_type === "TAB_HIDDEN" && dur(e) > 3000);
    if (long.length || evs.length >= 2) {
      const longest = Math.max(...evs.map(dur));
      add({
        rule: "external_lookup_v1",
        event_type: "INF_UNAUTHORIZED_EXTERNAL_LOOKUP",
        severity: longest > 10_000 ? "HIGH" : "MEDIUM",
        confidence: longest > 10_000 || evs.length >= 3 ? 0.8 : 0.55,
        question_id: qid,
        start_ms: Math.min(...evs.map((e) => e.start_ms)),
        end_ms: Math.max(...evs.map((e) => e.end_ms ?? e.start_ms)),
        description: `Left the interview window ${evs.length}× during this question (longest ${(longest / 1000).toFixed(1)} s).`,
        benign_explanations: ["Operating-system notifications or popups can take focus.", "Accidental Alt+Tab while thinking."],
        contributing_event_ids: evs.map((e) => e.id),
      });
    }
  }

  // Left the station: a long absence, or repeated absences within one question.
  for (const [qid, evs] of byQuestion(events, ["FACE_ABSENT"])) {
    if (evs.some((e) => dur(e) > 10_000) || evs.length >= 3) {
      add({
        rule: "left_station_v1",
        event_type: "INF_CANDIDATE_LEFT_STATION",
        severity: "MEDIUM",
        confidence: 0.7,
        question_id: qid,
        start_ms: Math.min(...evs.map((e) => e.start_ms)),
        end_ms: Math.max(...evs.map((e) => e.end_ms ?? e.start_ms)),
        description: `Candidate was out of camera view ${evs.length}× (longest ${(Math.max(...evs.map(dur)) / 1000).toFixed(1)} s).`,
        benign_explanations: ["Adjusting posture or the camera angle.", "Stepping away briefly for water or a noise."],
        contributing_event_ids: evs.map((e) => e.id),
      });
    }
  }

  // Another person present for a sustained time (either camera).
  for (const e of events.filter((x) => (x.event_type === "MULTIPLE_FACES" || x.event_type === "EXTRA_PERSON") && dur(x) > 4000)) {
    add({
      rule: "person_in_room_v1",
      event_type: "INF_UNAUTHORIZED_PERSON_IN_ROOM",
      severity: "HIGH",
      confidence: 0.75,
      question_id: e.question_id,
      start_ms: e.start_ms,
      end_ms: e.end_ms,
      description: `Another person was visible for ${(dur(e) / 1000).toFixed(1)} s.`,
      benign_explanations: ["Someone in a shared home walked through the frame.", "A photo or poster detected as a face."],
      contributing_event_ids: [e.id],
    });
  }

  // Phone seen while looking away within 10 s.
  const gazes = events.filter((e) => e.event_type === "GAZE_AWAY");
  for (const p of events.filter((e) => e.event_type === "PHONE_IN_VIEW")) {
    const near = gazes.filter((g) => Math.abs(g.start_ms - p.start_ms) <= 10_000);
    if (near.length) {
      add({
        rule: "device_use_v1",
        event_type: "INF_DEVICE_ASSISTANCE",
        severity: "MEDIUM",
        confidence: 0.6,
        question_id: p.question_id,
        start_ms: Math.min(p.start_ms, ...near.map((g) => g.start_ms)),
        end_ms: p.end_ms,
        description: "A phone was in view while the candidate looked away from the screen.",
        benign_explanations: ["The paired companion phone itself may be in view.", "Glancing at the time on a phone."],
        contributing_event_ids: [p.id, ...near.map((g) => g.id)],
      });
    }
  }

  // Repeated sustained gaze-away within one question (low confidence: webcam gaze is approximate).
  for (const [qid, evs] of byQuestion(events, ["GAZE_AWAY"])) {
    if (evs.length >= 3) {
      add({
        rule: "offscreen_reading_v1",
        event_type: "INF_OFFSCREEN_READING",
        severity: "LOW",
        confidence: 0.4,
        question_id: qid,
        start_ms: Math.min(...evs.map((e) => e.start_ms)),
        end_ms: Math.max(...evs.map((e) => e.end_ms ?? e.start_ms)),
        description: `Looked away from the screen for 4 s or more, ${evs.length}× during this question.`,
        benign_explanations: ["Many people look away to think; this is a weak signal.", "Webcam gaze estimates are approximate, especially with glasses."],
        contributing_event_ids: evs.map((e) => e.id),
      });
    }
  }

  // Extra display mid-interview (once per interview).
  const ext = events.find((e) => e.event_type === "EXTENDED_DISPLAY");
  if (ext) {
    add(
      {
        rule: "multi_screen_v1",
        event_type: "INF_MULTI_SCREEN_ASSISTANCE",
        severity: "HIGH",
        confidence: 0.8,
        question_id: ext.question_id,
        start_ms: ext.start_ms,
        end_ms: ext.end_ms,
        description: "An additional display was connected during the interview.",
        benign_explanations: ["A docked monitor or projector the candidate forgot about."],
        contributing_event_ids: [ext.id],
      },
      true,
    );
  }
  return out;
}
