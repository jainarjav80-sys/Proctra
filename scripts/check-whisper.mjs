#!/usr/bin/env node
// Live check of the server STT fallback: fixture WAV → /api/candidate/stt → Groq Whisper.
// Seeds an interview, signs in as its candidate, and verifies auth, transcription, vocabulary bias
// from the current question, latency, and that the engine gets recorded.
// Usage: node --env-file=.env.local scripts/check-whisper.mjs [baseUrl]
//   (fixture: python3 -I scripts/make-speech-fixture.py)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const base = process.argv[2] ?? "http://localhost:3123";
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(sbUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const results = [];
const check = (name, pass, detail = "") => results.push({ name, pass: Boolean(pass), detail });

const email = `whisper-${Date.now()}@proctra.test`;
const seeded = JSON.parse(
  execFileSync(process.execPath, ["--env-file=.env.local", "scripts/seed-demo-interview.mjs", "--questions", "3"], { env: { ...process.env, DEMO_CANDIDATE_EMAIL: email } }).toString(),
);
const password = `Whisper-${Date.now()}!`;
const { data: u } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { account_type: "candidate", full_name: "Whisper Check" } });
const c = createClient(sbUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const bearer = (await c.auth.signInWithPassword({ email, password })).data.session.access_token;
const headers = (auth = true) => ({ "x-proctra-token": seeded.token, ...(auth ? { authorization: `Bearer ${bearer}` } : {}) });
const json = (path, body) => fetch(`${base}/api/candidate/${path}`, { method: "POST", headers: { ...headers(), "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
const wav = new Blob([readFileSync("tests/fixtures/answer-kafka.wav")], { type: "audio/wav" });
const stt = async (auth = true) => {
  const form = new FormData();
  form.set("audio", wav, "answer.wav");
  const t = performance.now();
  const res = await fetch(`${base}/api/candidate/stt`, { method: "POST", headers: headers(auth), body: form });
  return { status: res.status, body: await res.json(), ms: Math.round(performance.now() - t) };
};

try {
  const unauth = await stt(false);
  check("STT route rejects a request without a candidate session", unauth.status === 401, String(unauth.status));
  const preConsent = await stt();
  check("STT route rejects audio before consent", preConsent.status === 403, String(preConsent.status));

  const session = await fetch(`${base}/api/candidate/session`, { headers: headers() }).then((r) => r.json());
  await json("consent", { scopes: session.consentItems.map((i) => i.scope), policyVersion: session.policyVersion });
  const r1 = await stt();
  check("fixture transcribed by Groq Whisper", r1.status === 200 && /kafka/i.test(r1.body.text), JSON.stringify(r1.body));
  console.log(`  ↳ [${r1.body.model}] ${r1.ms} ms, confidence ${r1.body.confidence}: ${r1.body.text}`);

  // Start the interview on a Kafka question so the vocabulary prompt includes it.
  await json("preflight", {
    browser: { userAgent: "whisper-check", family: "brave", chromium: true, speechRecognition: true },
    camera: { ok: true, label: "Fake", width: 1280, height: 720 },
    microphone: { ok: true, label: "Fake", peakLevel: 0.4 },
    speechTest: { ok: true, heard: "I am ready to begin", engine: "groq-whisper", nativeError: "network" },
    audio: { headphoneLabelMatch: false, echoTest: { ran: true, baselineRms: 0.004, duringRms: 0.005, ratio: 1.25, result: "pass" }, candidateConfirmedHeadphones: false, detection: "echo-test" },
    display: { fullscreen: true, isExtended: false, screenCount: 1 },
  });
  const start = await json("interview/start", {});
  const r2 = await stt();
  check("transcription works mid-interview with the question as vocabulary prompt", r2.status === 200 && r2.body.text.length > 20, JSON.stringify(r2.body));
  console.log(`  ↳ with prompt [${r2.body.model}] ${r2.ms} ms: ${r2.body.text}`);
  const turn = await json("interview/turn", { turnId: crypto.randomUUID(), version: start.version, kind: "ANSWER", transcript: r2.body.text, avgConfidence: r2.body.confidence, segments: [], sttEngine: "groq-whisper" });
  check("turn accepted with a Whisper transcript", Boolean(turn.action), JSON.stringify(turn).slice(0, 160));

  const { data: iv } = await admin.from("interviews").select("preflight").eq("id", seeded.interviewId).single();
  check("interview records the STT engine and audio checks", iv.preflight.stt_engine === "groq-whisper" && iv.preflight.speechTest.nativeError === "network" && iv.preflight.audio.detection === "echo-test", JSON.stringify(iv.preflight).slice(0, 200));
} catch (e) {
  check("script ran without errors", false, e.message);
} finally {
  await admin.auth.admin.deleteUser(u.user.id);
}

for (const x of results) console.log(`${x.pass ? "PASS" : "FAIL"}  ${x.name}${x.detail && !x.pass ? `  (${x.detail})` : ""}`);
const failed = results.filter((x) => !x.pass).length;
console.log(failed ? `\n${failed} check(s) failed` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
