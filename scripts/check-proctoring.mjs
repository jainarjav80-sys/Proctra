#!/usr/bin/env node
// Live check of the proctoring pipeline: events API → observed rows (+snapshot in Storage) →
// Tier-2 suspicions, idempotency, auth, and phone pairing tokens (single use, 300 s).
// Usage: node --env-file=.env.local scripts/check-proctoring.mjs [baseUrl]
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const base = process.argv[2] ?? "http://localhost:3123";
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(sbUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const results = [];
const check = (name, pass, detail = "") => results.push({ name, pass: Boolean(pass), detail });
const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

const email = `proctor-${Date.now()}@proctra.test`;
const seeded = JSON.parse(execFileSync(process.execPath, ["--env-file=.env.local", "scripts/seed-demo-interview.mjs", "--questions", "3"], { env: { ...process.env, DEMO_CANDIDATE_EMAIL: email } }).toString());
const password = `Proctor-${Date.now()}!`;
const { data: u } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { account_type: "candidate", full_name: "Proctor Check" } });
const c = createClient(sbUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const bearer = (await c.auth.signInWithPassword({ email, password })).data.session.access_token;
const call = async (path, body, auth = true) => {
  const res = await fetch(`${base}/api/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", "x-proctra-token": seeded.token, ...(auth ? { authorization: `Bearer ${bearer}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
};
const event = (type, startMs, endMs, extra = {}) => ({ clientId: crypto.randomUUID(), type, source: "BROWSER", severity: "MEDIUM", startMs, endMs, confidence: 1, description: `${type} test`, telemetry: {}, ...extra });

try {
  const unauth = await call("candidate/proctoring/events", { events: [event("TAB_HIDDEN", 0, 4000)] }, false);
  check("events API rejects requests without the candidate session", unauth.status === 401);

  const session = await call("candidate/session");
  await call("candidate/consent", { scopes: session.json.consentItems.map((i) => i.scope), policyVersion: session.json.policyVersion });
  await call("candidate/preflight", {
    browser: { userAgent: "proctor-check", family: "chrome", chromium: true, speechRecognition: true },
    camera: { ok: true, label: "Fake", width: 1280, height: 720 },
    microphone: { ok: true, label: "Fake", peakLevel: 0.4 },
    speechTest: { ok: true, heard: "ready to begin", engine: "web-speech", nativeError: null },
    faceCheck: { status: "passed", faces: 1 },
    audio: { headphoneLabelMatch: true, echoTest: { ran: false }, candidateConfirmedHeadphones: false, detection: "labels" },
    secondaryCamera: { paired: false },
    display: { fullscreen: true, isExtended: false, screenCount: 1 },
    screenShare: { surface: "monitor", width: 1920, height: 1080 },
  });
  const start = await call("candidate/interview/start", {});
  const q1 = start.json.action.question.id;

  const tab = event("TAB_HIDDEN", 12000, 16500, { snapshot: JPEG });
  const r1 = await call("candidate/proctoring/events", { events: [tab, event("WINDOW_BLUR", 20000, 20800, { severity: "LOW" })] });
  check("observed events stored", r1.status === 200 && r1.json.stored === 2, JSON.stringify(r1.json));
  check("Tier-2 suspicion raised for a 4.5 s tab switch", r1.json.suspicions >= 1, JSON.stringify(r1.json));
  const again = await call("candidate/proctoring/events", { events: [tab] });
  check("retried batch is idempotent (dedupe by clientId)", again.json.stored === 0 && again.json.duplicates === 1, JSON.stringify(again.json));
  const r2 = await call("candidate/proctoring/events", { events: [event("MULTIPLE_FACES", 30000, 35500, { source: "PRIMARY_CAM", snapshot: JPEG })] });
  check("sustained second face → person-in-room suspicion", r2.json.suspicions === 1, JSON.stringify(r2.json));
  const bad = await call("candidate/proctoring/events", { events: [{ ...event("NOT_A_TYPE", 0, 1) }] });
  check("unknown event types are rejected", bad.status === 400);

  const { data: rows } = await admin.from("proctoring_events").select("*").eq("interview_id", seeded.interviewId).order("start_ms");
  const obs = rows.filter((r) => r.tier === "OBSERVED_EVENT");
  const inf = rows.filter((r) => r.tier === "INFERRED_SUSPICION");
  check("observed rows carry the active question, benign explanations and client id", obs.every((r) => r.question_id === q1 && r.benign_explanations.length && r.telemetry.client_id), JSON.stringify(obs.map((r) => r.question_id)));
  const tabRow = obs.find((r) => r.event_type === "TAB_HIDDEN");
  const { data: file } = tabRow?.snapshot_path ? await admin.storage.from("snapshots").download(tabRow.snapshot_path) : { data: null };
  check("snapshot uploaded to private storage", file && file.size > 100, tabRow?.snapshot_path ?? "no path");
  check("suspicions are INFERRED with rule, contributing events and benign explanations", inf.length === 2 && inf.every((r) => r.telemetry.rule && r.contributing_event_ids.length && r.benign_explanations.length), JSON.stringify(inf.map((r) => r.event_type)));
  const { data: iv } = await admin.from("interviews").select("overall_score, status").eq("id", seeded.interviewId).single();
  check("proctoring never changes scores or ends the interview", iv.overall_score === null && iv.status === "IN_PROGRESS");

  // Phone pairing tokens.
  const pair = await call("candidate/pair", {});
  check("pair token issued with QR url, channel and ICE servers", pair.status === 200 && pair.json.url.includes("/m/") && pair.json.channel.length === 40 && pair.json.iceServers.length, JSON.stringify(pair.json).slice(0, 120));
  const pairJwt = decodeURIComponent(new URL(pair.json.url).pathname.split("/m/")[1]);
  const h1 = await fetch(`${base}/api/companion/handshake`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: pairJwt }) }).then(async (r) => ({ status: r.status, json: await r.json() }));
  check("phone handshake consumes the token and returns the same channel", h1.status === 200 && h1.json.channel === pair.json.channel, JSON.stringify(h1));
  check("handshake returns only channel, ICE servers and an upload-only companion token (no interview data)", Object.keys(h1.json).sort().join(",") === "channel,companionToken,iceServers");
  const pc = await fetch(`${base}/api/companion/recording`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${h1.json.companionToken}` }, body: JSON.stringify({ session: crypto.randomUUID() }) }).then(async (r) => ({ status: r.status, json: await r.json() }));
  check("phone gets a signed upload URL for its chunks via the companion token", pc.status === 200 && pc.json.path.includes("/secondary/"), JSON.stringify(pc));
  const badPc = await fetch(`${base}/api/companion/recording`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${seeded.token}` }, body: JSON.stringify({ session: crypto.randomUUID() }) });
  check("candidate invite token can't be used as a companion token", badPc.status === 401);
  const pauseRes = await call("candidate/interview/pause", { reason: "SCREEN_SHARE_STOPPED" });
  const blocked = await call("candidate/interview/turn", { turnId: crypto.randomUUID(), version: 99, kind: "ANSWER", transcript: "x", avgConfidence: 0.9, segments: [] });
  check("pause → turns are refused while paused (423)", pauseRes.json.paused === "SCREEN_SHARE_STOPPED" && blocked.status === 423, JSON.stringify(blocked.json));
  await new Promise((r) => setTimeout(r, 1500));
  const resumed = await call("candidate/interview/resume", {});
  check("resume re-asks the same question and reports paused time", resumed.json.action?.question?.id === q1 && resumed.json.pausedMs >= 1000, JSON.stringify(resumed.json).slice(0, 200));
  const h2 = await fetch(`${base}/api/companion/handshake`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: pairJwt }) });
  check("replaying the QR token → 410 Gone", h2.status === 410);
  const forged = await fetch(`${base}/api/companion/handshake`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: pairJwt.slice(0, -4) + "AAAA" }) });
  check("forged pair token rejected", forged.status === 401);
  const pair2 = await call("candidate/pair", {});
  check("re-pairing issues a new channel", pair2.json.channel && pair2.json.channel !== pair.json.channel);
} catch (e) {
  check("script ran without errors", false, e.message);
} finally {
  await admin.auth.admin.deleteUser(u.user.id);
}
for (const x of results) console.log(`${x.pass ? "PASS" : "FAIL"}  ${x.name}${x.detail && !x.pass ? `  (${x.detail})` : ""}`);
const failed = results.filter((x) => !x.pass).length;
console.log(failed ? `\n${failed} check(s) failed` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
