import "server-only";
import { SignJWT, jwtVerify, errors } from "jose";
import { env } from "@/lib/config/env";

/**
 * Proctra-issued tokens (HS256). Candidates and the companion phone never get Supabase sessions.
 *  - candidate: invite link → access to one interview. Valid for the invite window.
 *  - pair: QR code → companion phone handshake. 300 s and single use (nonce consumed in DB).
 */
export type TokenType = "candidate" | "pair";

export const CANDIDATE_TOKEN_TTL_SEC = 7 * 24 * 3600;
export const PAIR_TOKEN_TTL_SEC = 300;

const ISSUER = "proctra";

export class TokenError extends Error {
  constructor(public readonly reason: "expired" | "invalid" | "wrong_type") {
    super(`Token ${reason}`);
  }
}

function key(secret?: string) {
  return new TextEncoder().encode(secret ?? env().TOKEN_SECRET);
}

export async function signToken(
  type: TokenType,
  interviewId: string,
  opts: { ttlSec?: number; nonce?: string; secret?: string } = {},
): Promise<string> {
  const ttl = opts.ttlSec ?? (type === "pair" ? PAIR_TOKEN_TTL_SEC : CANDIDATE_TOKEN_TTL_SEC);
  return new SignJWT({ typ: type, ...(opts.nonce ? { nonce: opts.nonce } : {}) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(type)
    .setSubject(interviewId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttl)
    .sign(key(opts.secret));
}

export async function verifyToken(
  type: TokenType,
  token: string,
  opts: { secret?: string } = {},
): Promise<{ interviewId: string; nonce?: string }> {
  try {
    const { payload } = await jwtVerify(token, key(opts.secret), {
      issuer: ISSUER,
      audience: type,
      algorithms: ["HS256"],
    });
    if (payload.typ !== type || typeof payload.sub !== "string") throw new TokenError("wrong_type");
    return { interviewId: payload.sub, nonce: typeof payload.nonce === "string" ? payload.nonce : undefined };
  } catch (e) {
    if (e instanceof TokenError) throw e;
    if (e instanceof errors.JWTExpired) throw new TokenError("expired");
    if (e instanceof errors.JWTClaimValidationFailed && e.claim === "aud") throw new TokenError("wrong_type");
    throw new TokenError("invalid");
  }
}

/** Random URL-safe nonce for single-use pair tokens. */
export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Buffer.from(bytes).toString("base64url");
}
