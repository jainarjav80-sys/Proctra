import "server-only";
import { TokenError, verifyToken } from "@/lib/auth/tokens";
import { roleFromClaims } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const CANDIDATE_TOKEN_HEADER = "x-proctra-token";

export class CandidateAuthError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 403 | 404 | 410,
    public readonly code: "LINK" | "SIGN_IN" | "WRONG_ACCOUNT" | "NOT_READY" = "LINK",
  ) {
    super(message);
  }
}

/** The signed-in Supabase user: Authorization bearer (scripts) or the session cookie (browser). */
async function currentUser(req?: Request) {
  const bearer = req?.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  const { data, error } = bearer ? await createAdminClient().auth.getUser(bearer) : await (await createClient()).auth.getUser();
  return error ? null : data.user;
}

/**
 * Verifies a candidate's access to one interview:
 *  1. invite token: signature, expiry, and nonce = the interview's current invite (old links revoked);
 *  2. signed in as a CANDIDATE account whose confirmed email matches the invitation.
 * Errors never reveal whose invitation it is.
 */
export async function requireCandidate(token: string | null | undefined, req?: Request) {
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
  if (!interview.blueprint_approved_at) throw new CandidateAuthError("This interview isn't ready yet", 403, "NOT_READY");

  const user = await currentUser(req);
  if (!user) throw new CandidateAuthError("Sign in with your candidate account to open this interview", 401, "SIGN_IN");
  if (roleFromClaims({ app_metadata: user.app_metadata }) !== "CANDIDATE" || !user.email_confirmed_at) {
    throw new CandidateAuthError("Interviews can only be opened from a confirmed candidate account.", 403, "WRONG_ACCOUNT");
  }
  if ((user.email ?? "").toLowerCase() !== String(interview.candidate_email).toLowerCase()) {
    throw new CandidateAuthError(
      "This interview link belongs to a different candidate account. Sign out, then sign in with the email address the invitation was sent to.",
      403,
      "WRONG_ACCOUNT",
    );
  }
  return { admin, interview, user };
}

export type CandidateInterview = Awaited<ReturnType<typeof requireCandidate>>["interview"];

/** JSON response helper for candidate route handlers. */
export function candidateError(e: unknown) {
  if (e instanceof CandidateAuthError) return Response.json({ error: e.message, code: e.code }, { status: e.status });
  console.error("[candidate]", e);
  return Response.json({ error: e instanceof Error ? e.message : "Something went wrong" }, { status: 500 });
}
