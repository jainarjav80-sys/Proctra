#!/usr/bin/env node
// Verifies recruiter isolation against the live Supabase project.
// Creates two confirmed throwaway recruiters (admin API), has A create a job + interview + question,
// then checks that B and anonymous clients can't read or modify them. Cleans up afterwards.
// Usage: node --env-file=.env.local scripts/check-rls.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) throw new Error("Supabase env vars missing");

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const stamp = Date.now();
const password = `Rls-check-${stamp}!`;
const results = [];
const check = (name, pass, detail = "") => results.push({ name, pass, detail });

async function recruiter(tag) {
  const email = `rls-${tag}-${stamp}@proctra.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
  if (signInErr) throw signInErr;
  return { id: data.user.id, client };
}

const created = [];
try {
  const a = await recruiter("a");
  const b = await recruiter("b");
  created.push(a.id, b.id);
  check("A and B sign in with email/password", true);

  const { data: job, error: jobErr } = await a.client
    .from("jobs")
    .insert({ title: "RLS check job", description: "x".repeat(60) })
    .select()
    .single();
  check("A creates a job (recruiter_id defaults to auth.uid())", !jobErr && job?.recruiter_id === a.id, jobErr?.message);

  const { data: iv, error: ivErr } = await a.client
    .from("interviews")
    .insert({ job_id: job.id, candidate_name: "RLS Candidate", candidate_email: "c@proctra.test" })
    .select()
    .single();
  check("A creates an interview", !ivErr, ivErr?.message);

  const { error: qErr } = await a.client
    .from("questions")
    .insert({ interview_id: iv.id, primary_index: 1, category: "TECHNICAL", difficulty: "ADVANCED", text: "RLS question" });
  check("A creates a question on their interview", !qErr, qErr?.message);

  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  for (const [label, client] of [["B", b.client], ["anonymous", anon]]) {
    for (const table of ["jobs", "interviews", "questions"]) {
      const { data, error } = await client.from(table).select("id");
      check(`${label} reads 0 rows from ${table}`, !error && data.length === 0, error?.message ?? `${data?.length} rows`);
    }
  }

  const { data: upd } = await b.client.from("jobs").update({ title: "hijacked" }).eq("id", job.id).select();
  check("B cannot update A's job", (upd ?? []).length === 0);

  const { data: del } = await b.client.from("interviews").delete().eq("id", iv.id).select();
  check("B cannot delete A's interview", (del ?? []).length === 0);

  const { error: spoofErr } = await b.client
    .from("jobs")
    .insert({ recruiter_id: a.id, title: "spoof", description: "y".repeat(60) });
  check("B cannot insert a job as A", Boolean(spoofErr), spoofErr?.message);

  const { error: crossErr } = await b.client
    .from("questions")
    .insert({ interview_id: iv.id, primary_index: 2, category: "TECHNICAL", difficulty: "ADVANCED", text: "injected" });
  check("B cannot add questions to A's interview", Boolean(crossErr), crossErr?.message);

  const { data: pt, error: ptErr } = await a.client.from("pair_tokens").select("nonce");
  check("Recruiters cannot read pair_tokens (service role only)", !ptErr ? pt.length === 0 : true, ptErr?.message);

  const { data: still } = await a.client.from("jobs").select("title").eq("id", job.id).single();
  check("A's job is unchanged", still?.title === "RLS check job");

  const { data: files, error: stErr } = await b.client.storage.from("resumes").list(iv.id);
  check("B cannot list A's resume folder", !stErr ? files.length === 0 : true, stErr?.message);
} catch (e) {
  check("script ran without errors", false, e.message);
} finally {
  for (const id of created) await admin.auth.admin.deleteUser(id); // cascades to jobs/interviews/questions
}

for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.detail && !r.pass ? `  (${r.detail})` : ""}`);
const failed = results.filter((r) => !r.pass).length;
console.log(failed ? `\n${failed} check(s) failed` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
