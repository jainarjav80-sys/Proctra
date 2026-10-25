import { z } from "zod";
import { TokenError, signToken, verifyToken } from "@/lib/auth/tokens";
import { iceServers, pairingChannel } from "@/lib/companion/server";
import { createAdminClient } from "@/lib/supabase/admin";

const body = z.object({ token: z.string().min(20).max(2000) });

/**
 * Phone side of pairing. Verifies the QR's pair JWT and atomically consumes its nonce, so a QR can
 * be used once and only within 300 s (replays get 410). Returns only what the phone needs to
 * stream: the signalling channel and ICE servers. No interview, question or candidate data.
 */
export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid pairing request" }, { status: 400 });
  let claims: { interviewId: string; nonce?: string };
  try {
    claims = await verifyToken("pair", parsed.data.token);
  } catch (e) {
    const expired = e instanceof TokenError && e.reason === "expired";
    return Response.json({ error: expired ? "This QR code has expired. Show a new one on your computer." : "This pairing link is invalid." }, { status: expired ? 410 : 401 });
  }
  if (!claims.nonce) return Response.json({ error: "This pairing link is invalid." }, { status: 401 });
  const admin = createAdminClient();
  const { data: consumed } = await admin
    .from("pair_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("nonce", claims.nonce)
    .eq("interview_id", claims.interviewId)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("nonce");
  if (!consumed?.length) {
    return Response.json({ error: "This QR code was already used or has expired. Show a new one on your computer." }, { status: 410 });
  }
  // The companion token only lets this phone upload its own camera chunks for this interview.
  const companionToken = await signToken("companion", claims.interviewId, { nonce: claims.nonce });
  return Response.json({ channel: pairingChannel(claims.interviewId, claims.nonce), iceServers: iceServers(), companionToken });
}
