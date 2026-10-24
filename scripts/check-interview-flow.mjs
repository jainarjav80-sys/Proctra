#!/usr/bin/env node
// Drives a seeded interview through the real candidate API (no browser): consent → preflight → start →
// answer (may trigger an LLM follow-up) → repeat → duplicate turn (idempotency) → stale turn (409) →
// skip → no response, then checks statuses and transcripts in the DB.
// Usage: node --env-file=.env.local scripts/check-interview-flow.mjs <token> [baseUrl]
import { createClient } from "@supabase/supabase-js";

const [token, base = "http://localhost:3123"] = process.argv.slice(2);
if (!token) throw new Error("Pass a candidate token (from seed-demo-interview.mjs)");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const results = [];
const check = (name, pass, detail = "") => results.push({ name, pass, detail });

async function call(path, body, method = "POST") {
  const res = await fetch(`${base}/api/candidate/${path}`, {
    method,
    headers: { "content-type": "application/json", "x-proctra-token": token },
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
  });
  return { status: res.status, json: await res.json() };
}
const turn = (version, kind, transcript = "", turnId = crypto.randomUUID()) =>
  call("interview/turn", { turnId, version, kind, transcript, avgConfidence: transcript ? 0.92 : null, segments: [] });

const session = await call("session", null, "GET");
check("session loads with candidate-safe fields", session.status === 200 && !("rubric" in session.json), JSON.stringify(session.json).slice(0, 120));
const bad = await fetch(`${base}/api/candidate/session`, { headers: { "x-proctra-token": token.slice(0, -3) + "abc" } });
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

const ivId = session.json && (await admin.from("interviews").select("id, status, fsm_state").eq("candidate_email", "priya.raman@proctra.test").order("created_at", { ascending: false }).limit(1).single()).data;
const { data: qs } = await admin.from("questions").select("primary_index, follow_up_index, status, transcript").eq("interview_id", ivId.id).order("primary_index").order("follow_up_index");
const st = (p, f = 0) => qs.find((q) => q.primary_index === p && q.follow_up_index === f)?.status;
check("interview marked COMPLETED", ivId.status === "COMPLETED");
check("Q1 COMPLETED with transcript", st(1) === "COMPLETED" && qs.find((q) => q.primary_index === 1).transcript?.includes("FinFlow"));
check("Q2 SKIPPED", st(2) === "SKIPPED");
check("Q3 UNANSWERED", st(3) === "UNANSWERED");
const { count } = await admin.from("transcript_segments").select("id", { count: "exact", head: true }).eq("interview_id", ivId.id);
check("transcript segments stored (agent + candidate)", (count ?? 0) >= 6, `${count} segments`);

for (const x of results) console.log(`${x.pass ? "PASS" : "FAIL"}  ${x.name}${x.detail && !x.pass ? `  (${x.detail})` : ""}`);
const failed = results.filter((x) => !x.pass).length;
console.log(failed ? `\n${failed} check(s) failed` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
