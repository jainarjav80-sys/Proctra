#!/usr/bin/env node
// Barge-in + question-read-aloud check through the real turn API with fake transcripts.
// Seeds its own interview (via seed-demo-interview.mjs with a throwaway candidate email), signs in
// as that candidate, and verifies: barge-ins stored per question, QUESTION_READ_ALOUD logged for a
// verbatim read (not for a paraphrase), EXCESSIVE_BARGE_IN once past the limit, events carry benign
// explanations and are OBSERVED tier.
// Usage: node --env-file=.env.local scripts/check-speech-signals.mjs [baseUrl]
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const base = process.argv[2] ?? "http://localhost:3123";
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(sbUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const results = [];
const check = (name, pass, detail = "") => results.push({ name, pass: Boolean(pass), detail });

const email = `speech-${Date.now()}@proctra.test`;
const seeded = JSON.parse(
  execFileSync(process.execPath, ["--env-file=.env.local", "scripts/seed-demo-interview.mjs", "--questions", "3"], {
    env: { ...process.env, DEMO_CANDIDATE_EMAIL: email },
  }).toString(),
);
const password = `Speech-${Date.now()}!`;
const { data: u, error: uErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { account_type: "candidate", full_name: "Speech Check" } });
if (uErr) throw uErr;
const client = createClient(sbUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const bearer = (await client.auth.signInWithPassword({ email, password })).data.session.access_token;

async function call(path, body, method = "POST") {
  const res = await fetch(`${base}/api/candidate/${path}`, {
    method,
    headers: { "content-type": "application/json", "x-proctra-token": seeded.token, authorization: `Bearer ${bearer}` },
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
  });
  return { status: res.status, json: await res.json() };
}
const turn = (version, extra) => call("interview/turn", { turnId: crypto.randomUUID(), version, kind: "ANSWER", avgConfidence: 0.9, segments: [], ...extra });

try {
  const session = await call("session", null, "GET");
  await call("consent", { scopes: session.json.consentItems.map((c) => c.scope), policyVersion: session.json.policyVersion });
  await call("preflight", {
    browser: { userAgent: "live-check", family: "chrome", chromium: true, speechRecognition: true },
    camera: { ok: true, label: "Fake", width: 1280, height: 720 },
    microphone: { ok: true, label: "Fake", peakLevel: 0.4 },
    speechTest: { ok: true, heard: "I am ready to begin", engine: "web-speech", nativeError: null },
    faceCheck: { status: "passed", faces: 1 },
    audio: { headphoneLabelMatch: true, echoTest: { ran: false }, candidateConfirmedHeadphones: false, detection: "labels" },
    tts: { engine: "kokoro", browserProbe: { ok: false, voices: 0, english: 0, voice: null, reason: "no English voice installed" }, heardConfirmed: true, kokoroLoadMs: 9000 },
    secondaryCamera: { paired: false },
    display: { fullscreen: true, isExtended: false, screenCount: 1 },
    screenShare: { surface: "monitor", width: 1920, height: 1080 },
  });
  let r = await call("interview/start");
  const q1 = r.json.action.question;

  // Q1: candidate barges in twice and reads the question back verbatim at the start of the answer.
  r = await turn(r.json.version, {
    transcript: `${q1.text} well, we started with the capture flow and moved it out behind Kafka.`,
    openingText: q1.text,
    bargeIns: [
      { sentenceIndex: 1, sentenceCount: 3, atMs: 4000, utterance: "sorry, the payments one?" },
      { sentenceIndex: 2, sentenceCount: 3, atMs: 7000, utterance: q1.text },
    ],
  });
  check("turn with barge-ins accepted", r.status === 200, JSON.stringify(r.json).slice(0, 160));
  let action = r.json.action;
  if (action.question?.followUpIndex > 0) {
    r = await turn(r.json.version, { kind: "SKIP" });
    action = r.json.action;
  }
  const q2 = action.question;

  // Q2: a paraphrase must not be flagged; 4 more barge-ins push the total to 6 (> default limit 5).
  r = await turn(r.json.version, {
    transcript: "So you're asking how I'd stop duplicates if Kafka redelivers a message. We use an outbox.",
    openingText: "So you're asking how I'd stop duplicates if Kafka redelivers a message.",
    bargeIns: [0, 1, 2, 3].map((i) => ({ sentenceIndex: i % 2, sentenceCount: 2, atMs: 20000 + i * 1000, utterance: "uh-huh" })),
  });
  check("second turn accepted", r.status === 200);

  const { data: qs } = await admin.from("questions").select("id, primary_index, follow_up_index, barge_in_count, barge_ins").eq("interview_id", seeded.interviewId).eq("follow_up_index", 0).order("primary_index");
  const q1row = qs.find((q) => q.id === q1.id);
  const q2row = qs.find((q) => q.id === q2.id);
  check("Q1 stores 2 barge-ins with sentence index and utterance", q1row?.barge_in_count === 2 && q1row.barge_ins[0].sentenceIndex === 1 && q1row.barge_ins[1].utterance.length > 10, JSON.stringify(q1row?.barge_ins));
  check("Q2 stores 4 barge-ins", q2row?.barge_in_count === 4, String(q2row?.barge_in_count));

  const { data: events } = await admin.from("proctoring_events").select("*").eq("interview_id", seeded.interviewId);
  const echo = events.filter((e) => e.event_type === "QUESTION_READ_ALOUD");
  check("QUESTION_READ_ALOUD logged exactly once, on Q1 (verbatim)", echo.length === 1 && echo[0].question_id === q1.id, JSON.stringify(echo.map((e) => e.question_id)));
  check("read-aloud event is OBSERVED, MEDIUM, with similarity score, snippet and benign explanation", echo[0]?.tier === "OBSERVED_EVENT" && echo[0]?.severity === "MEDIUM" && echo[0]?.telemetry?.similarity >= 0.6 && echo[0]?.telemetry?.snippet && echo[0]?.benign_explanations?.length > 0, JSON.stringify(echo[0]?.telemetry));
  check("paraphrase on Q2 not flagged", !echo.some((e) => e.question_id === q2.id));
  const excess = events.filter((e) => e.event_type === "EXCESSIVE_BARGE_IN");
  check("EXCESSIVE_BARGE_IN logged once when total (6) exceeds limit (5)", excess.length === 1 && excess[0].telemetry.total_barge_ins === 6 && excess[0].benign_explanations.length > 0, JSON.stringify(excess.map((e) => e.telemetry)));

  const { data: iv } = await admin.from("interviews").select("overall_score, competency_scores").eq("id", seeded.interviewId).single();
  check("no score was touched by proctoring signals", iv.overall_score === null && iv.competency_scores === null);
} catch (e) {
  check("script ran without errors", false, e.message);
} finally {
  await admin.auth.admin.deleteUser(u.user.id);
}

for (const x of results) console.log(`${x.pass ? "PASS" : "FAIL"}  ${x.name}${x.detail && !x.pass ? `  (${x.detail})` : ""}`);
const failed = results.filter((x) => !x.pass).length;
console.log(failed ? `\n${failed} check(s) failed` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
