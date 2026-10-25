import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ORG_ROLES, homeFor, roleFromClaims, type AccountRole } from "@/lib/auth/roles";

/** Data-access-layer entry point for org pages: a verified org member, or a redirect. RLS scopes data to the org. */
export async function requireRecruiter() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect("/");
  const role = roleFromClaims(claims);
  if (!role || !ORG_ROLES.includes(role)) redirect(homeFor(role));
  const orgId = (claims.app_metadata as { org_id?: string } | undefined)?.org_id ?? null;
  return {
    supabase,
    user: { id: claims.sub, email: typeof claims.email === "string" ? claims.email : "", role: role as AccountRole, orgId },
  };
}

/** Candidate pages: a verified candidate account, or a redirect. */
export async function requireCandidateUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect("/");
  const role = roleFromClaims(claims);
  if (role !== "CANDIDATE") redirect(homeFor(role));
  return { supabase, user: { id: claims.sub, email: typeof claims.email === "string" ? claims.email : "" } };
}
