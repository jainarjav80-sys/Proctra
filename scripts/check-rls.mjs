#!/usr/bin/env node
// Live isolation check for the org/candidate account model. Creates throwaway accounts:
//   A1 = admin of org A, A2 = recruiter who joined org A by invite code, B1 = admin of org B,
//   C1 = candidate invited by org A, C2 = another candidate.
// Verifies same-org sharing and every cross-boundary denial, then deletes everything it created.
// Also checks the P5 surface: private recordings/snapshots buckets, the service-role-only
// evaluation_input() RPC, override/decision writes, and (if the app is running) the review page,
// CSV export and evaluation-status routes over HTTP with each account's session cookie.
// Usage: node --env-file=.env.local scripts/check-rls.mjs [appBaseUrl, default http://localhost:3123]
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
let ivId = "none";
const appBase = process.argv.find((a) => a.startsWith("http")) ?? "http://localhost:3123";
const projectRef = new URL(url).hostname.split(".")[0];

/** @supabase/ssr cookie for a signed-in client: "base64-" + base64url(session JSON), chunked at 3180. */
async function sessionCookie(client) {
  const { data } = await client.auth.getSession();
  const value = `base64-${Buffer.from(JSON.stringify(data.session)).toString("base64url")}`;
  const name = `sb-${projectRef}-auth-token`;
  if (value.length <= 3180) return `${name}=${value}`;
  return value.match(/.{1,3180}/g).map((c, i) => `${name}.${i}=${c}`).join("; ");
}
async function httpStatus(path, client) {
  const headers = client ? { cookie: await sessionCookie(client) } : {};
  const res = await fetch(`${appBase}${path}`, { headers, redirect: "manual" });
  const body = res.status === 200 ? await res.text() : "";
  return { status: res.status, body };
}

async function account(tag, metadata) {
  const email = `rls-${tag}-${stamp}@proctra.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: metadata });
  if (error) throw new Error(`${tag}: ${error.message}`);
  userIds.push(data.user.id);
  // The createUser response predates the sign-up trigger; read the stored app_metadata.
  const { data: stored } = await admin.auth.admin.getUserById(data.user.id);
  data.user.app_metadata = stored.user.app_metadata;
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
  ivId = iv.id;
  await a1.client.from("questions").insert({ interview_id: iv.id, primary_index: 1, category: "TECHNICAL", difficulty: "ADVANCED", text: "Secret question text" });
  await admin.from("proctoring_events").insert({ interview_id: iv.id, tier: "OBSERVED_EVENT", source: "BROWSER", event_type: "OBS_TAB_HIDDEN", severity: "LOW", start_ms: 1, description: "rls" });
  await admin.from("transcript_segments").insert({ interview_id: iv.id, speaker: "CANDIDATE", text: "secret answer", start_ms: 1 });
  await admin.from("interviews").update({ overall_score: 4.2 }).eq("id", iv.id);

  const TABLES = ["jobs", "interviews", "questions", "proctoring_events", "transcript_segments", "recording_chunks", "score_overrides", "pair_tokens", "llm_activity"];

  // P5 fixtures: a recording chunk, a snapshot and an evaluation result for org A's interview.
  const recPath = `${iv.id}/primary/rls-session/00000.webm`;
  const snapPath = `${iv.id}/rls-snapshot.jpg`;
  await admin.storage.from("recordings").upload(recPath, new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])]), { contentType: "video/webm", upsert: true });
  await admin.storage.from("snapshots").upload(snapPath, new Blob([new Uint8Array([0xff, 0xd8, 0xff])]), { contentType: "image/jpeg", upsert: true });
  await admin.from("recording_chunks").insert({ interview_id: iv.id, track: "PRIMARY", chunk_index: 0, path: recPath, started_ms: 0 });
  await admin.from("interviews").update({ status: "EVALUATED", evaluation_status: "DONE", completed_at: new Date().toISOString(), started_at: new Date(Date.now() - 600_000).toISOString() }).eq("id", iv.id);

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

  // P5: private media, evaluation input, review routes.
  for (const [label, client] of [["owning-org admin A1", a1.client], ["cross-org B1", b1.client], ["candidate C1", c1.client], ["anonymous", anon]]) {
    const { data: rec } = await client.storage.from("recordings").download(recPath);
    const { data: snap } = await client.storage.from("snapshots").download(snapPath);
    const { data: signedRec } = await client.storage.from("recordings").createSignedUrl(recPath, 60);
    const { data: signedSnap } = await client.storage.from("snapshots").createSignedUrl(snapPath, 60);
    check(`${label} cannot read or sign recordings/snapshots directly (server-signed URLs only)`, !rec && !snap && !signedRec && !signedSnap);
    const { data: evalIn, error: evalErr } = await client.rpc("evaluation_input", { iid: iv.id });
    check(`${label} cannot call evaluation_input()`, evalErr && !evalIn, JSON.stringify(evalIn)?.slice(0, 80));
  }
  const { data: q1 } = await admin.from("questions").select("id").eq("interview_id", iv.id).limit(1).single();
  const { error: crossOverride } = await b1.client.from("score_overrides").insert({ interview_id: iv.id, question_id: q1.id, old_score: 4, new_score: 10, reason: "cross-org" });
  check("B1 cannot add a score override to org A's interview", crossOverride);
  const { error: candOverride } = await c1.client.from("score_overrides").insert({ interview_id: iv.id, question_id: q1.id, old_score: 4, new_score: 10, reason: "candidate" });
  check("candidate cannot add a score override", candOverride);
  const { data: crossDecision } = await b1.client.from("interviews").update({ recruiter_decision: "ADVANCE" }).eq("id", iv.id).select();
  const { data: candDecision } = await c1.client.from("interviews").update({ recruiter_decision: "ADVANCE" }).eq("id", iv.id).select();
  check("B1 and the candidate cannot set the hiring decision", (crossDecision ?? []).length === 0 && (candDecision ?? []).length === 0);

  const reachable = await fetch(`${appBase}/api/health`).then(() => true, () => false);
  if (reachable) {
    const routes = [`/dashboard/interviews/${iv.id}`, `/api/recruiter/interviews/${iv.id}/scores.csv`, `/api/recruiter/interviews/${iv.id}/evaluation`];
    for (const path of routes) {
      const own = await httpStatus(path, a1.client);
      check(`owning org gets 200 from ${path.replace(iv.id, ":id")}`, own.status === 200, `${own.status}`);
      for (const [label, client] of [["cross-org B1", b1.client], ["candidate C1", c1.client], ["anonymous", null]]) {
        const r2 = await httpStatus(path, client);
        check(`${label} is refused ${path.replace(iv.id, ":id")} (${r2.status})`, r2.status !== 200 && !r2.body.includes("Cand One"), `${r2.status}`);
      }
    }
    const page = await httpStatus(`/dashboard/interviews/${iv.id}`, a1.client);
    check("review page HTML carries no long-lived storage URLs (signed URLs expire ≤ 15 min)", !/\/object\/public\//.test(page.body));
  } else {
    check(`HTTP route checks skipped: app not reachable at ${appBase}`, true);
  }

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
  await admin.storage.from("recordings").remove([`${ivId}/primary/rls-session/00000.webm`]).catch(() => {});
  await admin.storage.from("snapshots").remove([`${ivId}/rls-snapshot.jpg`]).catch(() => {});
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (orgIds.size) await admin.from("organizations").delete().in("id", [...orgIds]);
}

for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.detail && !r.pass ? `  (${r.detail})` : ""}`);
const failed = results.filter((r) => !r.pass).length;
console.log(failed ? `\n${failed} check(s) failed` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
