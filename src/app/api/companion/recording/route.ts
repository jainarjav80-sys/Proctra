import { z } from "zod";
import { verifyToken } from "@/lib/auth/tokens";
import { signChunkUpload } from "@/lib/recording/chunks";
import { createAdminClient } from "@/lib/supabase/admin";

const body = z.object({ session: z.uuid(), seq: z.number().int().min(0).max(100_000) });

/**
 * Phone camera chunk upload URL. Auth: the companion token from the pairing handshake. Chunks are
 * accepted only while the interview runs (409 before start, so the phone restarts its recorder and
 * the first accepted chunk carries the WebM header). Timestamps come from the server's clock.
 */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  let interviewId: string;
  try {
    ({ interviewId } = await verifyToken("companion", auth ?? ""));
  } catch {
    return Response.json({ error: "Invalid companion token" }, { status: 401 });
  }
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid chunk" }, { status: 400 });
  const admin = createAdminClient();
  const { data: iv } = await admin
    .from("interviews")
    .select("id, status, started_at, consent, proctoring_config, fsm_state")
    .eq("id", interviewId)
    .single();
  if (!iv) return Response.json({ error: "Interview not found" }, { status: 404 });
  const scopes = (iv.consent as { scopes?: string[] } | null)?.scopes ?? [];
  if (!scopes.includes("SECONDARY_CAMERA") || iv.proctoring_config?.record_video === false) {
    return Response.json({ error: "Phone recording is not enabled" }, { status: 403 });
  }
  if (!["IN_PROGRESS", "PAUSED"].includes(iv.status) || !iv.started_at) return Response.json({ error: "The interview hasn't started", notStarted: true }, { status: 409 });
  // Wall-clock offset (same basis as the review timeline); only the session's first chunk sets it.
  const startedMs = Math.max(0, Date.now() - new Date(iv.started_at).getTime() - 10_000);
  return Response.json(await signChunkUpload(admin, interviewId, "SECONDARY", parsed.data.session, startedMs, parsed.data.seq));
}
