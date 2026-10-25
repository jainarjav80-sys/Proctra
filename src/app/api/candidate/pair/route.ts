import { CANDIDATE_TOKEN_HEADER, candidateError, requireCandidate } from "@/lib/candidate/session";
import { PAIR_TOKEN_TTL_SEC, newNonce, signToken } from "@/lib/auth/tokens";
import { env } from "@/lib/config/env";
import { iceServers, pairingChannel } from "@/lib/companion/server";

/** Issues a single-use, 300 s phone-pairing link for the QR code, plus this pairing's channel. */
export async function POST(req: Request) {
  try {
    const { admin, interview } = await requireCandidate(req.headers.get(CANDIDATE_TOKEN_HEADER), req);
    const scopes = (interview.consent as { scopes?: string[] } | null)?.scopes ?? [];
    if (interview.secondary_cam_policy === "DISABLED" || !scopes.includes("SECONDARY_CAMERA")) {
      return Response.json({ error: "The phone camera isn't enabled for this interview" }, { status: 403 });
    }
    if (["COMPLETED", "EVALUATING", "EVALUATED"].includes(interview.status)) return Response.json({ error: "The interview is over" }, { status: 409 });
    const nonce = newNonce();
    const expiresAt = new Date(Date.now() + PAIR_TOKEN_TTL_SEC * 1000);
    const { error } = await admin.from("pair_tokens").insert({ nonce, interview_id: interview.id, expires_at: expiresAt.toISOString() });
    if (error) throw new Error(error.message);
    const token = await signToken("pair", interview.id, { nonce });
    return Response.json({
      url: `${env().NEXT_PUBLIC_APP_URL}/m/${token}`,
      expiresAt: expiresAt.toISOString(),
      channel: pairingChannel(interview.id, nonce),
      iceServers: iceServers(),
    });
  } catch (e) {
    return candidateError(e);
  }
}
