import "server-only";
import { signToken } from "@/lib/auth/tokens";
import { env } from "@/lib/config/env";

/**
 * Rebuilds the candidate link from the stored nonce, keeping the expiry that was issued, so the
 * token itself never has to be stored. Returns null once expired.
 */
export async function buildInviteUrl(interviewId: string, nonce: string, expiresAt: string) {
  const ttlSec = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
  if (ttlSec <= 0) return null;
  const token = await signToken("candidate", interviewId, { nonce, ttlSec });
  return `${env().NEXT_PUBLIC_APP_URL}/interview/${token}`;
}
