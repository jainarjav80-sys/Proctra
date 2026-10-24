#!/usr/bin/env node
// Live isolation check for the org/candidate account model. Creates throwaway accounts:
//   A1 = admin of org A, A2 = recruiter who joined org A by invite code, B1 = admin of org B,
//   C1 = candidate invited by org A, C2 = another candidate.
// Verifies same-org sharing and every cross-boundary denial, then deletes everything it created.
// Usage: node --env-file=.env.local scripts/check-rls.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const stamp = Date.now();
const password = `Rls-check-${stamp}!`;
const results = [];
const check = (name, pass, detail = "") => results.push({ name, pass: Boolean(pass), detail });
const userIds = [];
const orgIds = new Set();

async function account(tag, metadata) {
  const email = `rls-${tag}-${stamp}@proctra.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: metadata });
  if (error) throw new Error(`${tag}: ${error.message}`);
  userIds.push(data.user.id);
  if (data.user.app_metadata?.org_id) orgIds.add(data.user.app_metadata.org_id);
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw new Error(`${tag} sign-in: ${e2.message}`);
  return { id: data.user.id, email, client, role: data.user.app_metadata?.role, orgId: data.user.app_metadata?.org_id };
}
const rows = async (client, table) => {
  const { data, error } = await client.from(table).select("*");
  return error ? `error: ${error.message}` : data.length;
};

try {
  const a1 = await account("a1", { account_type: "organization", org_name: "RLS Org A", full_name: "Admin A" });
  check("org sign-up creates an org and makes the first user ORG_ADMIN", a1.role === "ORG_ADMIN" && a1.orgId);
  const { data: orgA } = await a1.client.from("organizations").select("invite_code").single();

  const a2 = await account("a2", { account_type: "organization", org_invite_code: orgA.invite_code.toLowerCase(), full_name: "Rec A", role: "ORG_ADMIN" });
  check("joining by invite code gives RECRUITER in the same org (role in metadata ignored)", a2.role === "RECRUITER" && a2.orgId === a1.orgId, `${a2.role} ${a2.orgId}`);
  const b1 = await account("b1", { account_type: "organization", org_name: "RLS Org B", full_name: "Admin B" });
  check("a second org is separate", b1.orgId && b1.orgId !== a1.orgId);
  const c1 = await account("c1", { account_type: "candidate", full_name: "Cand One" });
  const c2 = await account("c2", { account_type: "candidate", full_name: "Cand Two" });
  check("candidate sign-up gives CANDIDATE with no org", c1.role === "CANDIDATE" && !c1.orgId);

  const { error: badCode } = await admin.auth.admin.createUser({
    email: `rls-bad-${stamp}@proctra.test`, password, email_confirm: true,
    user_metadata: { account_type: "organization", org_invite_code: "NOT-A-CODE", full_name: "X" },
  });
  check("sign-up with an invalid invite code is rejected", badCode);
  const { error: badType } = await admin.auth.admin.createUser({
    email: `rls-bad2-${stamp}@proctra.test`, password, email_confirm: true, user_metadata: { account_type: "ORG_ADMIN", full_name: "X" },
  });
  check("sign-up with an invalid account_type is rejected", badType);

  // Org A data, created by A1.
  const { data: job, error: jobErr } = await a1.client.from("jobs").insert({ title: "RLS job", description: "x".repeat(60) }).select().single();
  check("A1 creates a job (org_id defaults to their org)", !jobErr && job.org_id === a1.orgId, jobErr?.message);
  const { data: iv } = await a1.client
    .from("interviews")
    .insert({ job_id: job.id, candidate_name: "Cand One", candidate_email: c1.email.toUpperCase(), blueprint_approved_at: new Date().toISOString(), status: "READY" })
    .select()
    .single();
  await a1.client.from("questions").insert({ interview_id: iv.id, primary_index: 1, category: "TECHNICAL", difficulty: "ADVANCED", text: "Secret question text" });
  await admin.from("proctoring_events").insert({ interview_id: iv.id, tier: "OBSERVED_EVENT", source: "BROWSER", event_type: "OBS_TAB_HIDDEN", severity: "LOW", start_ms: 1, description: "rls" });
  await admin.from("transcript_segments").insert({ interview_id: iv.id, speaker: "CANDIDATE", text: "secret answer", start_ms: 1 });
  await admin.from("interviews").update({ overall_score: 4.2 }).eq("id", iv.id);

  const TABLES = ["jobs", "interviews", "questions", "proctoring_events", "transcript_segments", "recording_chunks", "score_overrides", "pair_tokens"];

  // Same org: A2 sees everything A1 created.
  check("same-org recruiter A2 sees org A's job", (await rows(a2.client, "jobs")) === 1);
  check("same-org recruiter A2 sees org A's interview and question", (await rows(a2.client, "interviews")) === 1 && (await rows(a2.client, "questions")) === 1);

  // Cross-org, candidates and anonymous: zero rows everywhere.
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  for (const [label, client] of [["cross-org B1", b1.client], ["candidate C1", c1.client], ["candidate C2", c2.client], ["anonymous", anon]]) {
    const counts = await Promise.all(TABLES.map((t) => rows(client, t)));
    const leaks = TABLES.filter((t, i) => counts[i] !== 0);
    check(`${label} reads 0 rows from all ${TABLES.length} data tables`, leaks.length === 0, leaks.map((t) => `${t}=${counts[TABLES.indexOf(t)]}`).join(" "));
  }

  // Cross-org writes.
  const { data: upd } = await b1.client.from("jobs").update({ title: "hijacked" }).eq("id", job.id).select();
  check("B1 cannot update org A's job", (upd ?? []).length === 0);
  const { data: del } = await b1.client.from("interviews").delete().eq("id", iv.id).select();
  check("B1 cannot delete org A's interview", (del ?? []).length === 0);
  const { error: spoof } = await b1.client.from("jobs").insert({ org_id: a1.orgId, title: "spoof", description: "y".repeat(60) });
  check("B1 cannot insert a job into org A", spoof);
  const { error: crossQ } = await b1.client.from("questions").insert({ interview_id: iv.id, primary_index: 2, category: "TECHNICAL", difficulty: "ADVANCED", text: "injected" });
  check("B1 cannot add questions to org A's interview", crossQ);
  const { error: crossIv } = await b1.client.from("interviews").insert({ job_id: job.id, candidate_name: "x", candidate_email: "x@x.io" });
  check("B1 cannot attach an interview to org A's job", crossIv);
  const { data: files } = await b1.client.storage.from("resumes").list(iv.id);
  check("B1 cannot list org A's resume folder", (files ?? []).length === 0);

  // Candidates: no writes, no role changes, only their own safe dashboard rows.
  const { error: candJob } = await c1.client.from("jobs").insert({ title: "cand job", description: "z".repeat(60) });
  check("candidate cannot create jobs", candJob);
  const { data: profUpd } = await c1.client.from("profiles").update({ role: "ORG_ADMIN" }).eq("id", c1.id).select();
  const { data: c1prof } = await c1.client.from("profiles").select("role").eq("id", c1.id).single();
  check("candidate cannot change their role in profiles", (profUpd ?? []).length === 0 && c1prof?.role === "CANDIDATE", JSON.stringify(c1prof));
  await c1.client.auth.updateUser({ data: { role: "ORG_ADMIN", account_type: "organization" } });
  const { data: c1user } = await admin.auth.admin.getUserById(c1.id);
  check("editing user_metadata does not change the app_metadata role", c1user.user.app_metadata.role === "CANDIDATE");
  const { data: dash1, error: dashErr } = await c1.client.rpc("my_candidate_interviews");
  const leakedCols = Object.keys(dash1?.[0] ?? {}).filter((k) => /score|rubric|transcript|question|proctor|nonce|email|summary/i.test(k));
  check("C1's dashboard RPC returns exactly their invitation (email matched case-insensitively)", !dashErr && dash1?.length === 1 && dash1[0].id === iv.id, dashErr?.message ?? JSON.stringify(dash1));
  check("dashboard RPC exposes no scores, rubric, questions, transcripts, proctoring or invite nonce", dash1?.length === 1 && leakedCols.length === 0, leakedCols.join(","));
  const { data: dash2 } = await c2.client.rpc("my_candidate_interviews");
  check("another candidate's dashboard RPC returns nothing of C1's", (dash2 ?? []).length === 0);
  const { data: dashRec } = await a1.client.rpc("my_candidate_interviews");
  check("a recruiter gets no rows from the candidate RPC", (dashRec ?? []).length === 0);
  const { error: anonRpc } = await anon.rpc("my_candidate_interviews");
  check("anonymous cannot call the candidate RPC", anonRpc);

  // Org admin powers.
  const { error: recRotate } = await a2.client.rpc("rotate_org_invite_code");
  check("a recruiter (non-admin) cannot rotate the org invite code", recRotate);
  const { data: newCode, error: adminRotate } = await a1.client.rpc("rotate_org_invite_code");
  check("the org admin can rotate the invite code", !adminRotate && newCode && newCode !== orgA.invite_code);
  const { data: orgsSeen } = await b1.client.from("organizations").select("id");
  check("B1 sees only their own organization", orgsSeen?.length === 1 && orgsSeen[0].id === b1.orgId);
  const { error: orgUpd } = await a1.client.from("organizations").update({ name: "renamed" }).eq("id", a1.orgId);
  check("organizations are not directly writable by clients", orgUpd);
} catch (e) {
  check("script ran without errors", false, e.message);
} finally {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (orgIds.size) await admin.from("organizations").delete().in("id", [...orgIds]);
}

for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.detail && !r.pass ? `  (${r.detail})` : ""}`);
const failed = results.filter((r) => !r.pass).length;
console.log(failed ? `\n${failed} check(s) failed` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
