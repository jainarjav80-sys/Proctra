#!/usr/bin/env node
// One complete interview on the real candidate stage in snap Chromium (or Brave):
// sign-in → consent → camera/mic (synthetic face passes the one-face gate) → sound check →
// phone pairing in a second tab → screen share → all questions spoken → spoken answers →
// follow-up → barge-in ("can you repeat") → completion → camera/screen/phone recordings uploaded.
// The page's microphone is a WebAudio track the test "speaks" into at chosen moments.
// Usage: node --env-file=.env.local scripts/e2e-full-interview.mjs [baseUrl] [--keep]
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { createClient } from "@supabase/supabase-js";

const base = process.argv.find((a) => a.startsWith("http")) ?? "http://localhost:3123";
const KEEP = process.argv.includes("--keep"); // keep the candidate account + interview for P5
const FORCE_KOKORO = process.argv.includes("--force-kokoro"); // block the Orpheus route → measures the Kokoro path
const exe = [process.env.BROWSER, "/snap/bin/chromium", "/snap/bin/brave"].filter(Boolean).find(existsSync);
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const wav = (n) => readFileSync(`tests/fixtures/interview/${n}.wav`).toString("base64");
const CLIPS = { q1: wav("q1-answer"), q1f: wav("q1-followup"), repeat: wav("repeat"), q2: wav("q2-answer"), q3: wav("q3-answer") };
const results = [];
const check = (name, pass, detail = "") => results.push({ name, pass: Boolean(pass), detail });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const poll = { polling: 250 };
const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${m}`);

const email = `full-${Date.now()}@proctra.test`;
const password = `Full-${Date.now()}!`;
const seeded = JSON.parse(execFileSync(process.execPath, ["--env-file=.env.local", "scripts/seed-demo-interview.mjs", "--questions", "3"], { env: { ...process.env, DEMO_CANDIDATE_EMAIL: email } }).toString());
const { data: u } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { account_type: "candidate", full_name: "Priya Raman" } });

const FAKE_MIC = `(() => {
  let ctx, dest;
  const ensure = () => {
    if (!ctx) {
      ctx = new AudioContext();
      dest = ctx.createMediaStreamDestination();
      // A real mic always carries a noise floor; without it the recorder's audio track has holes.
      const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const ch = noise.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * 0.002;
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      src.connect(dest);
      src.start();
    }
    if (ctx.state === "suspended") ctx.resume();
    return { ctx, dest };
  };
  // Wall-clock times at which interviewer audio actually started playing (Orpheus and Kokoro both use <audio>).
  window.__audioStarts = [];
  window.__audioLog = [];
  window.__trace = true;
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    if (this.tagName === "AUDIO") {
      this.addEventListener("playing", () => window.__audioStarts.push(Date.now()), { once: true });
      if (window.__trace) {
        const t0 = Date.now();
        window.__audioLog.push(["play", t0]);
        this.addEventListener("error", () => window.__audioLog.push(["error", Date.now()]), { once: true });
      }
    }
    return play.call(this).catch((e) => {
      window.__audioLog?.push(["reject:" + e.name, Date.now()]);
      throw e;
    });
  };
  window.__mic = {
    ensure,
    async say(b64) {
      const { ctx, dest } = ensure();
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const buf = await ctx.decodeAudioData(bytes.buffer);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(dest);
      src.start();
      return new Promise((r) => (src.onended = r));
    },
  };
  const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (c = {}) => {
    const out = new MediaStream();
    if (c.video) (await orig({ video: c.video, audio: false })).getVideoTracks().forEach((t) => out.addTrack(t));
    if (c.audio) out.addTrack(ensure().dest.stream.getAudioTracks()[0].clone());
    return out;
  };
})();`;

async function clickText(page, text, timeout = 30000) {
  await page.waitForFunction(
    (t) => [...document.querySelectorAll("button")].some((b) => b.textContent.includes(t) && !b.disabled && Object.keys(b).some((k) => k.startsWith("__reactProps"))),
    { timeout, ...poll },
    text,
  );
  await page.evaluate((t) => [...document.querySelectorAll("button")].find((b) => b.textContent.includes(t) && !b.disabled).click(), text);
}
const say = (page, clip) => page.evaluate((b) => window.__mic.say(b), CLIPS[clip]);
const bodyText = (page) => page.evaluate(() => document.body.innerText);

let browser;
const interviewId = seeded.interviewId;
try {
  browser = await puppeteer.launch({
    executablePath: exe,
    headless: "new",
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-video-capture=${path.resolve("tests/fixtures/face.y4m")}`,
      "--auto-select-desktop-capture-source=Entire screen",
      "--autoplay-policy=no-user-gesture-required",
      "--no-first-run",
    ],
  });
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(FAKE_MIC);
  const net = []; // [kind, startMs, endMs] for STT and turn requests → splits the gap into its parts
  const pending = new Map();
  page.on("request", (q) => {
    const k = /\/api\/candidate\/(stt|interview\/turn)/.exec(q.url())?.[1];
    if (k) pending.set(q, [k, Date.now()]);
  });
  const done = (q) => {
    const p = pending.get(q);
    if (!p) return;
    net.push([p[0], p[1], Date.now()]);
    pending.delete(q);
  };
  page.on("requestfinished", done);
  page.on("requestfailed", done);
  if (FORCE_KOKORO) {
    await page.setRequestInterception(true);
    page.on("request", (r) => (r.url().includes("/api/candidate/tts") ? r.abort("failed") : r.continue()));
  }
  page.on("pageerror", (e) => log(`page error: ${e.message.slice(0, 160)}`));
  page.on("console", (m) => m.type() === "error" && log(`console: ${m.text().slice(0, 160)}`));

  // Sign-in via the invite link.
  await page.goto(`${base}${new URL(seeded.url).pathname}`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => location.pathname === "/", { timeout: 20000, ...poll });
  await page.type("#password", password);
  await page.click("button[type=submit]");
  await page.waitForFunction(() => location.pathname.startsWith("/interview/"), { timeout: 30000, ...poll });
  log("signed in");

  // Consent.
  await page.waitForSelector('button[role="checkbox"]', { timeout: 30000 });
  for (const box of await page.$$('button[role="checkbox"]')) await box.click();
  await clickText(page, "I agree");

  // Camera & mic + speech probe + face gate.
  await clickText(page, "Allow camera");
  await clickText(page, "Start speech test");
  await sleep(600);
  void say(page, "repeat");
  await page.waitForSelector('[data-testid="speech-heard"]', { timeout: 45000 });
  await page.waitForFunction(() => /One face/.test(document.querySelector('[data-testid="face-check"]')?.textContent ?? ""), { timeout: 30000, ...poll });
  await clickText(page, "Continue");
  log("devices ok");

  // Sound check.
  await clickText(page, "Play sample", 240000);
  await page.waitForSelector('[data-testid="heard-yes"]', { timeout: 120000 });
  const ttsEngine = await page.$eval('[data-testid="tts-engine"]', (el) => el.textContent);
  await page.click('[data-testid="heard-yes"]');
  log(`sound ok (${ttsEngine})`);

  // Phone camera in a second tab.
  await page.waitForSelector('[data-testid="pair-qr"]', { timeout: 30000 });
  const pairUrl = await page.$eval('[data-testid="pair-qr"]', (el) => el.getAttribute("data-url"));
  const phone = await browser.newPage();
  await phone.goto(`${base}${new URL(pairUrl).pathname}`, { waitUntil: "networkidle0" });
  await clickText(phone, "Start camera");
  await page.bringToFront();
  await page.waitForFunction(() => /Phone connected/.test(document.querySelector('[data-testid="phone-status"]')?.textContent ?? ""), { timeout: 30000, ...poll });
  await clickText(page, "Continue");
  log("phone paired");

  // Screen: displays, entire-screen share, fullscreen + start.
  await clickText(page, "Check my displays").catch(() => {});
  await clickText(page, "Share entire screen");
  await page.waitForSelector('[data-testid="screen-ok"]', { timeout: 20000 });
  await clickText(page, "start interview");
  log("interview started");

  // Interview loop: answer each question when it's our turn; interrupt Q2 once.
  const seen = new Set();
  const answerEnds = []; // [key, wall ms when the spoken answer finished]
  const phases = [];
  let lastPhase = "";
  let bargedIn = false;
  const deadline = Date.now() + 9 * 60_000;
  while (Date.now() < deadline) {
    const text = await bodyText(page);
    if (/Interview complete/.test(text)) break;
    const m = /Question (\d+) of (\d+)( · follow-up)?/.exec(text);
    const key = m ? `${m[1]}${m[3] ? "f" : ""}` : null;
    if (key === "2" && !bargedIn && /Interviewer is speaking/.test(text)) {
      bargedIn = true;
      log("barging in during Q2");
      await say(page, "repeat");
      await page.waitForFunction(() => /Go ahead/.test(document.body.innerText), { timeout: 10000, ...poll }).catch(() => log("no 'Go ahead' seen"));
      continue;
    }
    const phase = /Interviewer is speaking|Your turn|Thinking|Submitting|Processing/i.exec(text)?.[0] ?? "?";
    if (phase !== lastPhase) {
      phases.push([phase, Date.now()]);
      lastPhase = phase;
    }
    if (key && !seen.has(key) && /Your turn/.test(text)) {
      seen.add(key);
      const clip = key === "1" ? "q1" : key === "1f" ? "q1f" : key === "2" ? "q2" : key === "3" ? "q3" : "q2";
      log(`answering ${key}`);
      await say(page, clip);
      answerEnds.push([key, Date.now()]);
    }
    await sleep(400);
  }
  check(`interview reached "Interview complete" (${((Date.now() - t0) / 1000).toFixed(0)} s total, TTS: ${ttsEngine})`, /Interview complete/.test(await bodyText(page)));
  check(`every question was asked and answered by voice (${[...seen].join(", ")})`, ["1", "2", "3"].every((k) => seen.has(k)));
  check("barge-in during Q2 happened", bargedIn);

  // Answer end → first interviewer audio. Includes the fixed 5 s end-of-answer silence wait.
  const starts = await page.evaluate(() => window.__audioStarts);
  const gaps = answerEnds
    .map(([k, end]) => [k, (starts.find((s) => s > end) ?? NaN) - end])
    .filter(([, g]) => Number.isFinite(g));
  for (const [k, end] of answerEnds) {
    const next = starts.find((x) => x > end) ?? Infinity;
    const parts = net.filter(([, a]) => a >= end && a < next).map(([n, a, b]) => `${n === "stt" ? "stt" : "turn"} +${((a - end) / 1000).toFixed(1)}s (${((b - a) / 1000).toFixed(2)} s)`);
    log(`after ${k}: ${parts.join(", ")} → audio +${((next - end) / 1000).toFixed(1)}s`);
  }
  const alog = await page.evaluate(() => window.__audioLog);
  for (const [k, end] of answerEnds) {
    const until = answerEnds.find(([, e]) => e > end)?.[1] ?? Infinity;
    const ev = [...alog.filter(([, t]) => t > end && t < until).map(([n, t]) => `${n}@${((t - end) / 1000).toFixed(1)}`), ...phases.filter(([, t]) => t > end && t < until).map(([n, t]) => `[${n}]@${((t - end) / 1000).toFixed(1)}`)];
    log(`trace ${k}: ${ev.slice(0, 14).join(" ")}`);
  }
  for (const [k, g] of gaps) log(`gap after ${k}: ${(g / 1000).toFixed(2)} s total, ${((g - 5000) / 1000).toFixed(2)} s after the 5 s silence wait`);
  if (gaps.length) {
    const proc = gaps.map(([, g]) => g - 5000).sort((a, b) => a - b);
    log(`processing gap (${FORCE_KOKORO ? "kokoro" : ttsEngine}): median ${(proc[Math.floor(proc.length / 2)] / 1000).toFixed(2)} s, max ${(proc.at(-1) / 1000).toFixed(2)} s`);
  }

  await sleep(12000); // final recorder chunks + uploads
  await phone.close();
  await sleep(3000);

  // Server-side verification.
  const { data: iv } = await admin.from("interviews").select("status, preflight, fsm_state").eq("id", interviewId).single();
  const { data: qs } = await admin.from("questions").select("primary_index, follow_up_index, status, transcript, barge_in_count").eq("interview_id", interviewId).order("primary_index").order("follow_up_index");
  const { data: chunks } = await admin.from("recording_chunks").select("track, path").eq("interview_id", interviewId);
  const { data: evs } = await admin.from("proctoring_events").select("event_type").eq("interview_id", interviewId);
  check("interview COMPLETED in the DB (EVALUATED once the background evaluation finishes)", ["COMPLETED", "EVALUATED"].includes(iv.status), iv.status);
  check(`TTS/STT engines recorded (tts=${iv.preflight.tts_engine}, stt=${iv.preflight.stt_engine})`, iv.preflight.tts_engine && iv.preflight.stt_engine);
  const primaries = qs.filter((q) => q.follow_up_index === 0);
  check("all 3 primary questions COMPLETED with transcripts", primaries.length === 3 && primaries.every((q) => q.status === "COMPLETED" && (q.transcript ?? "").length > 20), JSON.stringify(primaries.map((q) => [q.status, (q.transcript ?? "").slice(0, 40)])));
  const followUps = qs.filter((q) => q.follow_up_index > 0);
  check(`follow-up asked and answered (${followUps.length})`, followUps.length >= 1 && followUps.every((q) => (q.transcript ?? "").length > 10), JSON.stringify(followUps));
  check("barge-in recorded on Q2", (qs.find((q) => q.primary_index === 2 && q.follow_up_index === 0)?.barge_in_count ?? 0) >= 1);
  const byTrack = (t) => chunks.filter((c) => c.track === t).length;
  check(`recordings uploaded: camera ${byTrack("PRIMARY")}, screen ${byTrack("SCREEN")}, phone ${byTrack("SECONDARY")} chunks`, byTrack("PRIMARY") > 0 && byTrack("SCREEN") > 0 && byTrack("SECONDARY") > 0);
  // Chunks of one session concatenate (in path order) into a valid WebM: header must lead.
  const firstTwo = [...new Set(chunks.filter((c) => c.track === "PRIMARY").map((c) => c.path))].sort().slice(0, 2).map((path) => ({ path }));
  const parts = [];
  for (const c of firstTwo) parts.push(Buffer.from(await (await admin.storage.from("recordings").download(c.path)).data.arrayBuffer()));
  const head = Buffer.concat(parts);
  check(`camera recording starts with a WebM header when chunks are joined in order (${head.length} bytes)`, head.subarray(0, 4).toString("hex") === "1a45dfa3");
  check(`proctoring events logged (${evs.length}: ${[...new Set(evs.map((e) => e.event_type))].join(", ")})`, evs.length >= 0);
  if (KEEP) writeFileSync(".last-full-interview.json", JSON.stringify({ interviewId, email, password }, null, 2));
} catch (e) {
  check("run completed", false, e.message.split("\n")[0]);
  try {
    const p = (await browser.pages()).find((x) => x.url().includes("/interview/"));
    if (p) console.log("--- page:", (await bodyText(p)).replace(/\s+/g, " ").slice(0, 400));
  } catch {}
} finally {
  await browser?.close();
  if (!KEEP) await admin.auth.admin.deleteUser(u.user.id);
}
for (const x of results) console.log(`${x.pass ? "PASS" : "FAIL"}  ${x.name}${x.detail && !x.pass ? `  (${x.detail.slice(0, 300)})` : ""}`);
const failed = results.filter((x) => !x.pass).length;
console.log(failed ? `\n${failed} check(s) failed` : `\nAll ${results.length} checks passed (interview ${interviewId})`);
process.exit(failed ? 1 : 0);
