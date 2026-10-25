import "server-only";
import { createHmac } from "node:crypto";
import { env } from "@/lib/config/env";

/** Per-pairing signalling channel: unguessable without the pair nonce, new for every QR code. */
export function pairingChannel(interviewId: string, nonce: string): string {
  return createHmac("sha256", env().TOKEN_SECRET).update(`pair:${interviewId}:${nonce}`).digest("hex").slice(0, 40);
}

/** STUN always; TURN only if configured (optional free relay for strict NATs). */
export function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
  if (process.env.TURN_URL) servers.push({ urls: process.env.TURN_URL, username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL });
  return servers;
}
