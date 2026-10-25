import { z } from "zod";
import { CANDIDATE_TOKEN_HEADER, candidateError, requireCandidate } from "@/lib/candidate/session";
import { signChunkUpload } from "@/lib/recording/chunks";

const body = z.object({
  track: z.enum(["PRIMARY", "SCREEN"]),
  session: z.uuid(),
  startedMs: z.number().int().min(0),
});

/**
 * Signed upload URL for one MediaRecorder chunk from the candidate's computer (camera or screen).
 * The browser uploads straight to Storage, so Vercel's 4.5 MB body limit never applies.
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
    return Response.json(await signChunkUpload(admin, interview.id, parsed.data.track, parsed.data.session, parsed.data.startedMs));
  } catch (e) {
    return candidateError(e);
  }
}
