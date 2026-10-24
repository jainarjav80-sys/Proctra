"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { homeFor, roleFromClaims, safeNext, type AccountRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string };

const credentials = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const signupSchema = credentials.extend({
  accountType: z.enum(["organization", "candidate"]),
  fullName: z.string().trim().min(2, "Enter your full name").max(120),
  orgMode: z.enum(["create", "join"]).optional(),
  orgName: z.string().trim().max(120).optional(),
  inviteCode: z.string().trim().max(20).optional(),
});

/** Where to go after auth: `next` if this role may open it, else the role's home. */
function destination(role: AccountRole | null, next: string | null) {
  if (next) {
    const candidatePath = next.startsWith("/interview/") || next.startsWith("/candidate");
    const orgPath = ["/dashboard", "/jobs", "/interviews"].some((p) => next.startsWith(p));
    if ((candidatePath && role === "CANDIDATE") || (orgPath && role !== "CANDIDATE" && role) || (!candidatePath && !orgPath)) return next;
  }
  return homeFor(role);
}

async function currentRole(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.auth.getClaims();
  return roleFromClaims(data?.claims);
}

export async function login(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: error.message };
  redirect(destination(await currentRole(supabase), safeNext(form.get("next"))));
}

export async function signup(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = signupSchema.safeParse({
    email: form.get("email"),
    password: form.get("password"),
    accountType: form.get("accountType"),
    fullName: form.get("fullName"),
    orgMode: form.get("orgMode") || undefined,
    orgName: form.get("orgName") || undefined,
    inviteCode: form.get("inviteCode") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const d = parsed.data;
  const supabase = await createClient();

  // Metadata is validated again by the DB trigger, which is what actually assigns the role.
  const data: Record<string, string> = { account_type: d.accountType, full_name: d.fullName };
  if (d.accountType === "organization") {
    if (d.orgMode === "join") {
      if (!d.inviteCode) return { error: "Enter your organization's invite code" };
      const { data: orgName } = await supabase.rpc("org_name_for_invite_code", { code: d.inviteCode });
      if (!orgName) return { error: "That invite code isn't valid. Ask your organization admin for the current code." };
      data.org_invite_code = d.inviteCode;
    } else {
      if (!d.orgName || d.orgName.length < 2) return { error: "Enter your organization's name" };
      data.org_name = d.orgName;
    }
  }

  const { data: res, error } = await supabase.auth.signUp({ email: d.email, password: d.password, options: { data } });
  if (error) return { error: error.message.includes("Database error") ? "Sign-up failed. Check your details and try again." : error.message };
  if (!res.session) return { message: "Check your inbox to confirm your email, then sign in." };
  // The role is assigned by a DB trigger during sign-up; refresh so the session JWT definitely carries it.
  await supabase.auth.refreshSession();
  redirect(destination(await currentRole(supabase), safeNext(form.get("next"))));
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
