import { z } from "zod";
import { CANDIDATE_TOKEN_HEADER, candidateError, requireCandidate } from "@/lib/candidate/session";

const body = z.object({
  track: z.enum(["PRIMARY", "SECONDARY", "SCREEN"]),
  index: z.number().int().min(0).max(2000),
  startedMs: z.number().int().min(0),
});

/**
 * Issues a signed upload URL for one MediaRecorder chunk (browser uploads straight to Storage, so
 * Vercel's 4.5 MB body limit never applies) and records the chunk. Requires recording consent.
 */
export async function POST(req: Request) {
  try {
    const { admin, interview } = await requireCandidate(req.headers.get(CANDIDATE_TOKEN_HEADER), req);
    const scopes = (interview.consent as { scopes?: string[] } | null)?.scopes ?? [];
    if (!scopes.includes("AUDIO_VIDEO_RECORDING") || interview.proctoring_config?.record_video === false) {
      return Response.json({ error: "Recording is not enabled for this interview" }, { status: 403 });
    }
    if (!["IN_PROGRESS", "PAUSED"].includes(interview.status)) return Response.json({ error: "The interview isn't running" }, { status: 409 });
    const parsed = body.safeParse(await req.json());
    if (!parsed.success) return Response.json({ error: "Invalid chunk" }, { status: 400 });
    const { track, index, startedMs } = parsed.data;
    const path = `${interview.id}/${track.toLowerCase()}/${String(index).padStart(5, "0")}.webm`;
    const { data, error } = await admin.storage.from("recordings").createSignedUploadUrl(path, { upsert: true });
    if (error || !data) throw new Error(error?.message ?? "Couldn't sign upload");
    await admin.from("recording_chunks").upsert({ interview_id: interview.id, track, chunk_index: index, path, started_ms: startedMs }, { onConflict: "interview_id,track,chunk_index" });
    return Response.json({ path: data.path, token: data.token });
  } catch (e) {
    return candidateError(e);
  }
}
