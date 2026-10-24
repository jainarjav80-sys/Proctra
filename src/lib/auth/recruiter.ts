import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Data-access-layer entry point: the verified recruiter, or a redirect to /login. */
export async function requireRecruiter() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect("/login");
  return { supabase, user: { id: claims.sub, email: typeof claims.email === "string" ? claims.email : "" } };
}
