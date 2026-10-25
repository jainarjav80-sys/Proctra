import "server-only";
import { headers } from "next/headers";

/** This request's public origin (scheme + host), e.g. for server-to-server calls back into the app. */
export async function requestOrigin(): Promise<string> {
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}
