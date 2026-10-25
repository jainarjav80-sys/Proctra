import "server-only";
import { notFound } from "next/navigation";
import { requireRecruiter } from "@/lib/auth/recruiter";
import { createAdminClient } from "@/lib/supabase/admin";
import { clockToWall, type Pause } from "./timeline";

export type TrackName = "PRIMARY" | "SCREEN" | "SECONDARY";
export interface RecordingSession {
  id: string;
  track: TrackName;
  startMs: number; // wall ms since interview start
  urls: string[]; // chunk URLs in recording order
}
export interface TimelineMarker {
  atMs: number; // wall ms
  kind: "QUESTION" | "ANSWER" | "OBSERVED" | "SUSPICION" | "WARNING";
  label: string;
  refId?: string;
}

const RECORDING_URL_TTL = 15 * 60;
const SNAPSHOT_URL_TTL = 5 * 60;

/**
 * Everything the recruiter review page needs. Ownership is enforced by RLS on the recruiter's own
 * client (another org gets notFound); only then are short-lived signed URLs minted for recordings
 * and snapshots with the service role.
 */
export async function loadReview(interviewId: string) {
  const { supabase, user } = await requireRecruiter();
  const { data: interview } = await supabase.from("interviews").select("*, jobs(id, title)").eq("id", interviewId).maybeSingle();
  if (!interview) notFound();

  const [{ data: questions }, { data: overrides }, { data: events }, { data: chunks }, { data: segments }] = await Promise.all([
    supabase.from("questions").select("*").eq("interview_id", interviewId).order("primary_index").order("follow_up_index"),
    supabase.from("score_overrides").select("*").eq("interview_id", interviewId).order("created_at"),
    supabase.from("proctoring_events").select("*").eq("interview_id", interviewId).order("start_ms"),
    supabase.from("recording_chunks").select("track, path, started_ms").eq("interview_id", interviewId),
    supabase.from("transcript_segments").select("question_id, speaker, text, start_ms").eq("interview_id", interviewId).order("start_ms"),
  ]);

  const admin = createAdminClient();
  const fsm = (interview.fsm_state ?? {}) as { pauses?: Pause[]; pausedTotalMs?: number };
  const pauses = fsm.pauses ?? [];

  // Recording sessions: chunks grouped by recorder session, in path (= recording) order.
  const sessionsMap = new Map<string, { track: TrackName; startMs: number; paths: string[] }>();
  for (const c of chunks ?? []) {
    const session = c.path.split("/")[2] ?? "default";
    const s = sessionsMap.get(session) ?? { track: c.track as TrackName, startMs: Number(c.started_ms ?? 0), paths: [] };
    s.paths.push(c.path);
    s.startMs = Math.min(s.startMs, Number(c.started_ms ?? s.startMs));
    sessionsMap.set(session, s);
  }
  const allPaths = [...sessionsMap.values()].flatMap((s) => s.paths);
  const signed = new Map<string, string>();
  for (let i = 0; i < allPaths.length; i += 100) {
    const { data } = await admin.storage.from("recordings").createSignedUrls(allPaths.slice(i, i + 100), RECORDING_URL_TTL);
    for (const d of data ?? []) if (d.signedUrl && d.path) signed.set(d.path, d.signedUrl);
  }
  const sessions: RecordingSession[] = [...sessionsMap.entries()]
    .map(([id, s]) => ({ id, track: s.track, startMs: s.startMs, urls: s.paths.sort().map((p) => signed.get(p)).filter((u): u is string => Boolean(u)) }))
    .filter((s) => s.urls.length)
    .sort((a, b) => a.startMs - b.startMs);

  const snapPaths = (events ?? []).map((e) => e.snapshot_path).filter((p): p is string => Boolean(p));
  const snapshots = new Map<string, string>();
  if (snapPaths.length) {
    const { data } = await admin.storage.from("snapshots").createSignedUrls(snapPaths, SNAPSHOT_URL_TTL);
    for (const d of data ?? []) if (d.signedUrl && d.path) snapshots.set(d.path, d.signedUrl);
  }

  const startedAt = interview.started_at ? new Date(interview.started_at).getTime() : null;
  const endedAt = interview.completed_at ? new Date(interview.completed_at).getTime() : null;
  const wallDurationMs = startedAt && endedAt ? endedAt - startedAt : Math.max(0, ...(segments ?? []).map((s) => clockToWall(Number(s.start_ms), pauses) + 10_000));
  const durationMs = Math.max(0, wallDurationMs - (fsm.pausedTotalMs ?? 0)); // excludes paused time

  const markers: TimelineMarker[] = [
    ...(segments ?? []).map((s) => ({
      atMs: clockToWall(Number(s.start_ms), pauses),
      kind: (s.speaker === "AGENT" ? "QUESTION" : "ANSWER") as TimelineMarker["kind"],
      label: s.text.slice(0, 120),
      refId: s.question_id ?? undefined,
    })),
    ...(events ?? []).map((e) => ({
      atMs: clockToWall(Number(e.start_ms), pauses),
      kind: (e.event_type === "CANDIDATE_WARNING_SHOWN" ? "WARNING" : e.tier === "INFERRED_SUSPICION" ? "SUSPICION" : "OBSERVED") as TimelineMarker["kind"],
      label: `${e.event_type}: ${e.description}`,
      refId: e.id,
    })),
  ].sort((a, b) => a.atMs - b.atMs);

  return {
    user,
    interview,
    questions: questions ?? [],
    overrides: overrides ?? [],
    events: (events ?? []).map((e) => ({ ...e, snapshotUrl: e.snapshot_path ? (snapshots.get(e.snapshot_path) ?? null) : null, wallMs: clockToWall(Number(e.start_ms), pauses) })),
    sessions,
    markers,
    pauses,
    wallDurationMs,
    durationMs,
  };
}

export type ReviewData = Awaited<ReturnType<typeof loadReview>>;
