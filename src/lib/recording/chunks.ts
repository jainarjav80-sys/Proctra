import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type RecordingTrack = "PRIMARY" | "SECONDARY" | "SCREEN";

/**
 * Signs an upload URL for the next chunk of one recorder session and records it. The index is
 * assigned server-side (max + 1 per track) so a reconnecting phone or re-shared screen can't
 * collide; the session id in the path groups chunks that concatenate into one WebM file.
 */
/**
 * started_ms holds the SESSION's start (wall ms since interview start): the first chunk's value is
 * kept for the whole session, so the review player can place the stitched video on the timeline.
 */
export async function signChunkUpload(admin: SupabaseClient, interviewId: string, track: RecordingTrack, session: string, startedMs: number, seq: number) {
  const prefix = `${interviewId}/${track.toLowerCase()}/${session}/`;
  const { data: first } = await admin.from("recording_chunks").select("started_ms").eq("interview_id", interviewId).like("path", `${prefix}%`).order("path").limit(1).maybeSingle();
  if (first?.started_ms !== null && first?.started_ms !== undefined) startedMs = Number(first.started_ms);
  const { data: last } = await admin
    .from("recording_chunks")
    .select("chunk_index")
    .eq("interview_id", interviewId)
    .eq("track", track)
    .order("chunk_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  for (let attempt = 0; attempt < 3; attempt++) {
    const index = (last?.chunk_index ?? -1) + 1 + attempt;
    // Path order (session/seq) is the playback order; chunk_index only keeps rows unique.
    const path = `${interviewId}/${track.toLowerCase()}/${session}/${String(seq).padStart(5, "0")}.webm`;
    const { error: insErr } = await admin.from("recording_chunks").insert({ interview_id: interviewId, track, chunk_index: index, path, started_ms: startedMs });
    if (insErr) continue; // index taken by a concurrent upload: try the next one
    const { data, error } = await admin.storage.from("recordings").createSignedUploadUrl(path, { upsert: true });
    if (error || !data) throw new Error(error?.message ?? "Couldn't sign upload");
    return { path: data.path, token: data.token, index };
  }
  throw new Error("Couldn't allocate a chunk index");
}
