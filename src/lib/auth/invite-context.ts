import "server-only";
import { verifyToken } from "@/lib/auth/tokens";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * When an auth page is reached from an interview link (next=/interview/<token>), returns the invited
 * email so the form can prefill it. Only for a valid, current invite token; otherwise null.
 */
export async function inviteContext(next: string | null): Promise<{ email: string } | null> {
  const m = next?.match(/^\/interview\/([^/?#]+)/);
  if (!m) return null;
  try {
    const { interviewId, nonce } = await verifyToken("candidate", decodeURIComponent(m[1]));
    const { data } = await createAdminClient()
      .from("interviews")
      .select("candidate_email, invite_nonce")
      .eq("id", interviewId)
      .maybeSingle();
    if (!data || data.invite_nonce !== nonce) return null;
    return { email: data.candidate_email };
  } catch {
    return null;
  }
}
