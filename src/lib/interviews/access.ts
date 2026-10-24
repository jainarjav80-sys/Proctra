import "server-only";
import { requireRecruiter } from "@/lib/auth/recruiter";

/**
 * Loads an interview the signed-in recruiter owns (RLS enforces ownership).
 * Throws a readable error so server actions can surface it.
 */
export async function ownedInterview(interviewId: string) {
  const { supabase, user } = await requireRecruiter();
  const { data: interview, error } = await supabase
    .from("interviews")
    .select("*, jobs(*)")
    .eq("id", interviewId)
    .single();
  if (error || !interview) throw new Error("Interview not found");
  return { supabase, user, interview };
}

export function assertEditable(interview: { blueprint_approved_at: string | null }) {
  if (interview.blueprint_approved_at) {
    throw new Error("The blueprint is approved and locked. Unlock it to make changes.");
  }
}

/** Wraps an action body so thrown errors come back as `{ error }` instead of crashing the page. */
export async function attempt<T extends object>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (e) {
    // redirect()/notFound() throw control-flow errors that must propagate.
    if (e && typeof e === "object" && "digest" in e) throw e;
    console.error("[action]", e);
    return { error: e instanceof Error ? e.message : "Something went wrong" };
  }
}
