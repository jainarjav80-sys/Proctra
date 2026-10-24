"use server";

import { revalidatePath } from "next/cache";
import { requireRecruiter } from "@/lib/auth/recruiter";

/** Admin-only (enforced in the DB function): replaces the org's colleague invite code. */
export async function rotateInviteCode(): Promise<{ code: string } | { error: string }> {
  const { supabase } = await requireRecruiter();
  const { data, error } = await supabase.rpc("rotate_org_invite_code");
  if (error || typeof data !== "string") return { error: error?.message ?? "Couldn't rotate the code" };
  revalidatePath("/dashboard");
  return { code: data };
}
