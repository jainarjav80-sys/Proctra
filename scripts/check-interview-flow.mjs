#!/usr/bin/env node
// Drives a seeded interview through the real candidate API (no browser): consent → preflight → start →
// answer (may trigger an LLM follow-up) → repeat → duplicate turn (idempotency) → stale turn (409) →
// skip → no response, then checks statuses and transcripts in the DB.
// The invite now requires a signed-in candidate whose email matches, so the script creates throwaway
// candidate accounts (the invited one and an impostor) and authenticates with a bearer token.
// Usage: node --env-file=.env.local scripts/check-interview-flow.mjs <token> [baseUrl]
import { createClient } from "@supabase/supabase-js";

const [token, base = "http://localhost:3123"] = process.argv.slice(2);
if (!token) throw new Error("Pass a candidate token (from seed-demo-interview.mjs)");
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(sbUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const results = [];
const check = (name, pass, detail = "") => results.push({ name, pass, detail });

const interviewId = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).sub;
const { data: ivRow } = await admin.from("interviews").select("candidate_email").eq("id", interviewId).single();
const created = [];
async function candidate(email) {
  const password = `Flow-${Date.now()}-${Math.random().toString(36).slice(2)}!`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { account_type: "candidate", full_name: "Flow Candidate" } });
  if (error) throw error;
  created.push(data.user.id);
  const c = createClient(sbUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s, error: e2 } = await c.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  return s.session.access_token;
}
let bearer = null;

async function call(path, body, method = "POST", auth = bearer) {
  const res = await fetch(`${base}/api/candidate/${path}`, {
    method,
    headers: { "content-type": "application/json", "x-proctra-token": token, ...(auth ? { authorization: `Bearer ${auth}` } : {}) },
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
  });
  return { status: res.status, json: await res.json() };
}

const noAuth = await call("session", null, "GET", null);
check("not signed in → 401 SIGN_IN", noAuth.status === 401 && noAuth.json.code === "SIGN_IN");
const impostor = await candidate(`flow-impostor-${Date.now()}@proctra.test`);
const wrong = await call("session", null, "GET", impostor);
check("signed in as a different candidate → 403, no interview data in the response", wrong.status === 403 && !JSON.stringify(wrong.json).includes(ivRow.candidate_email) && !("jobTitle" in wrong.json));
bearer = await candidate(ivRow.candidate_email);
const turn = (version, kind, transcript = "", turnId = crypto.randomUUID()) =>
  call("interview/turn", { turnId, version, kind, transcript, avgConfidence: transcript ? 0.92 : null, segments: [] });

const session = await call("session", null, "GET");
check("session loads with candidate-safe fields", session.status === 200 && !("rubric" in session.json), JSON.stringify(session.json).slice(0, 120));
const bad = await fetch(`${base}/api/candidate/session`, { headers: { "x-proctra-token": token.slice(0, -3) + "abc", authorization: `Bearer ${bearer}` } });
check("tampered token rejected", bad.status === 401);

const early = await call("interview/start");
check("start blocked before consent", early.status === 403);
const scopes = session.json.consentItems.map((c) => c.scope);
check("consent recorded", (await call("consent", { scopes, policyVersion: session.json.policyVersion })).status === 200);
const pre = await call("preflight", {
  browser: { userAgent: "flow-check", chromium: true, speechRecognition: true },
  camera: { ok: true, label: "Fake cam", width: 1280, height: 720 },
  microphone: { ok: true, label: "Fake mic", peakLevel: 0.4 },
  speechTest: { ok: true, heard: "I am ready to begin" },
  display: { fullscreen: true, isExtended: false, screenCount: 1 },
});
check("preflight recorded", pre.status === 200, JSON.stringify(pre.json));

let r = await call("interview/start");
check("interview starts on Q1", r.status === 200 && r.json.action.type === "ASK" && r.json.action.question.primaryIndex === 1, JSON.stringify(r.json).slice(0, 200));
const again = await call("interview/start");
check("start again resumes the same question", again.json.action.question?.id === r.json.action.question.id && again.json.action.resumed === true);

const answer =
  "At FinFlow we started with the capture flow because it had the clearest ownership and the most incidents. We wrapped it behind an API in the monolith first, then moved it out and published events to Kafka. It went well overall.";
const id1 = crypto.randomUUID();
const t0 = Date.now();
r = await turn(r.json.version, "ANSWER", answer, id1);
const followUpOrNext = r.json.action;
check(
  `substantive answer → ${followUpOrNext.type === "ASK" && followUpOrNext.question.followUpIndex === 1 ? "LLM follow-up" : "next question"} (${Date.now() - t0} ms)`,
  r.status === 200 && followUpOrNext.type === "ASK",
  JSON.stringify(r.json).slice(0, 200),
);
console.log("  ↳ agent:", followUpOrNext.say, "|", followUpOrNext.question?.text);

const dup = await turn(r.json.version - 1, "ANSWER", answer, id1);
check("duplicate turnId returns the same response (idempotent)", dup.status === 200 && dup.json.version === r.json.version);
const stale = await turn(r.json.version - 1, "ANSWER", "stale");
check("stale version → 409 with current state", stale.status === 409 && stale.json.conflict === true);

if (followUpOrNext.question.followUpIndex === 1) {
  r = await turn(r.json.version, "ANSWER", "We used an outbox table written in the same transaction, and a relay published it to Kafka.");
  check("follow-up answered → next primary (cap of 1 respected)", r.json.action.question?.followUpIndex === 0 && r.json.action.question?.primaryIndex === 2, JSON.stringify(r.json.action).slice(0, 160));
}
const q2 = r.json.action.question;
r = await turn(r.json.version, "REPEAT");
check("repeat request re-asks the same question", r.json.action.question?.id === q2.id);
r = await turn(r.json.version, "ANSWER", "skip this one");
check("spoken 'skip this one' → advances to Q3", r.json.action.question?.primaryIndex === 3);
r = await turn(r.json.version, "NO_RESPONSE");
check("silence on the last question → interview ends", r.json.action.type === "END", JSON.stringify(r.json.action).slice(0, 160));

const ivId = (await admin.from("interviews").select("id, status, fsm_state").eq("id", interviewId).single()).data;
const { data: qs } = await admin.from("questions").select("primary_index, follow_up_index, status, transcript").eq("interview_id", ivId.id).order("primary_index").order("follow_up_index");
const st = (p, f = 0) => qs.find((q) => q.primary_index === p && q.follow_up_index === f)?.status;
check("interview marked COMPLETED", ivId.status === "COMPLETED");
check("Q1 COMPLETED with transcript", st(1) === "COMPLETED" && qs.find((q) => q.primary_index === 1).transcript?.includes("FinFlow"));
check("Q2 SKIPPED", st(2) === "SKIPPED");
check("Q3 UNANSWERED", st(3) === "UNANSWERED");
const { count } = await admin.from("transcript_segments").select("id", { count: "exact", head: true }).eq("interview_id", ivId.id);
check("transcript segments stored (agent + candidate)", (count ?? 0) >= 6, `${count} segments`);

for (const id of created) await admin.auth.admin.deleteUser(id);
for (const x of results) console.log(`${x.pass ? "PASS" : "FAIL"}  ${x.name}${x.detail && !x.pass ? `  (${x.detail})` : ""}`);
const failed = results.filter((x) => !x.pass).length;
console.log(failed ? `\n${failed} check(s) failed` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
