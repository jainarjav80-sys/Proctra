import "server-only";
import { TokenError, verifyToken } from "@/lib/auth/tokens";
import { createAdminClient } from "@/lib/supabase/admin";

export const CANDIDATE_TOKEN_HEADER = "x-proctra-token";

export class CandidateAuthError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 403 | 404 | 410,
  ) {
    super(message);
  }
}

/**
 * Verifies a candidate invite token: signature, expiry, and that its nonce is still the interview's
 * current invite (rotating or unlocking revokes old links). Returns the service-role client, scoped
 * by the caller to this one interview.
 */
export async function requireCandidate(token: string | null | undefined) {
  if (!token) throw new CandidateAuthError("Missing interview link token", 401);
  let claims: { interviewId: string; nonce?: string };
  try {
    claims = await verifyToken("candidate", token);
  } catch (e) {
    if (e instanceof TokenError && e.reason === "expired") throw new CandidateAuthError("This interview link has expired", 410);
    throw new CandidateAuthError("This interview link is invalid", 401);
  }
  const admin = createAdminClient();
  const { data: interview, error } = await admin
    .from("interviews")
    .select("*, jobs(title)")
    .eq("id", claims.interviewId)
    .maybeSingle();
  if (error || !interview) throw new CandidateAuthError("Interview not found", 404);
  if (!interview.invite_nonce || interview.invite_nonce !== claims.nonce) {
    throw new CandidateAuthError("This interview link has been replaced or revoked. Ask the recruiter for a new one.", 410);
  }
  if (!interview.blueprint_approved_at) throw new CandidateAuthError("This interview isn't ready yet", 403);
  return { admin, interview };
}

export type CandidateInterview = Awaited<ReturnType<typeof requireCandidate>>["interview"];

/** JSON response helper for candidate route handlers. */
export function candidateError(e: unknown) {
  if (e instanceof CandidateAuthError) return Response.json({ error: e.message }, { status: e.status });
  console.error("[candidate]", e);
  return Response.json({ error: e instanceof Error ? e.message : "Something went wrong" }, { status: 500 });
}
