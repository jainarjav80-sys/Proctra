import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type RecordingTrack = "PRIMARY" | "SECONDARY" | "SCREEN";

/**
 * Signs an upload URL for the next chunk of one recorder session and records it. The index is
 * assigned server-side (max + 1 per track) so a reconnecting phone or re-shared screen can't
 * collide; the session id in the path groups chunks that concatenate into one WebM file.
 */
export async function signChunkUpload(admin: SupabaseClient, interviewId: string, track: RecordingTrack, session: string, startedMs: number) {
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
    const path = `${interviewId}/${track.toLowerCase()}/${session}/${String(index).padStart(5, "0")}.webm`;
    const { error: insErr } = await admin.from("recording_chunks").insert({ interview_id: interviewId, track, chunk_index: index, path, started_ms: startedMs });
    if (insErr) continue; // index taken by a concurrent upload: try the next one
    const { data, error } = await admin.storage.from("recordings").createSignedUploadUrl(path, { upsert: true });
    if (error || !data) throw new Error(error?.message ?? "Couldn't sign upload");
    return { path: data.path, token: data.token, index };
  }
  throw new Error("Couldn't allocate a chunk index");
}
