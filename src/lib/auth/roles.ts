/** Account roles. Assigned server-side at sign-up and read from the JWT's app_metadata (not user-editable). */

export type AccountRole = "ORG_ADMIN" | "RECRUITER" | "CANDIDATE";

export const ORG_ROLES: AccountRole[] = ["ORG_ADMIN", "RECRUITER"];

export function roleFromClaims(claims: Record<string, unknown> | null | undefined): AccountRole | null {
  const meta = claims?.app_metadata as { role?: unknown } | undefined;
  const role = meta?.role;
  return role === "ORG_ADMIN" || role === "RECRUITER" || role === "CANDIDATE" ? role : null;
}

export function homeFor(role: AccountRole | null): string {
  if (role === "CANDIDATE") return "/candidate";
  if (role === "ORG_ADMIN" || role === "RECRUITER") return "/dashboard";
  return "/";
}

/** Same-site relative redirect targets only. */
export function safeNext(value: unknown): string | null {
  const v = typeof value === "string" ? value : "";
  return v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : null;
}
