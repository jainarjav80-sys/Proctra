#!/usr/bin/env node
// Real-browser checks for interviewer audio, barge-in/resume, candidate warnings, screen share and
// recording size. Usage: node --env-file=.env.local scripts/e2e-audio-warnings.mjs [baseUrl]
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { createClient } from "@supabase/supabase-js";

const base = process.argv[2] ?? "http://localhost:3123";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const BROWSERS = [["brave", "/snap/bin/brave"], ["chromium", "/snap/bin/chromium"], ["chrome", "/usr/bin/google-chrome"]].filter(([, p]) => existsSync(p));
const ARGS = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required", "--auto-select-desktop-capture-source=Entire screen", "--no-first-run"];
const results = [];
const check = (name, pass, detail = "") => results.push({ name, pass: Boolean(pass), detail });
const poll = { polling: 250 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clickWhenHydrated = async (page, testid) => {
  for (let i = 0; i < 40; i++) {
    const ok = await page.evaluate((id) => {
      const b = document.querySelector(`[data-testid="${id}"]`);
      if (!b || !Object.keys(b).some((k) => k.startsWith("__reactProps"))) return false;
      b.click();
      return true;
    }, testid);
    if (ok) return;
    await sleep(500);
  }
  throw new Error(`${testid} never became interactive`);
};

for (const [name, exe] of BROWSERS) {
  const browser = await puppeteer.launch({ executablePath: exe, headless: "new", args: ARGS });
  try {
    // ---- A. interviewer audio: engine choice, 3 sentences, barge-in, resume ----------------------
    const page = await browser.newPage();
    await page.goto(`${base}/dev/tts-harness`, { waitUntil: "networkidle0" });
    await clickWhenHydrated(page, "init");
    await page.waitForFunction(() => document.querySelector('[data-testid="status"]')?.textContent.startsWith("ready"), { timeout: 240000, ...poll });
    const info = await page.evaluate(() => ({ engine: window.__tts.engine, probe: window.__tts.probe, isolated: self.crossOriginIsolated }));
    check(`[${name}] engine chosen: ${info.engine} (speechSynthesis probe: ${info.probe.voices} voices, ${info.probe.english} English, reason: ${info.probe.reason ?? "ok"}; crossOriginIsolated=${info.isolated})`, Boolean(info.engine));

    const full = await page.evaluate(async () => {
      const r = await window.__tts.play(0);
      await new Promise((res) => setTimeout(res, 300)); // last 'ended' listener runs after play() settles
      return { r, log: window.__tts.log.map((l) => `${l.event}${l.index ?? ""}`) };
    });
    const ended = full.log.filter((e) => e === "audio-ended").length;
    const ends = [0, 1, 2].every((i) => full.log.includes(`sentence-end${i}`));
    check(`[${name}] 3 sentences played to completion (${ended} audio 'ended' events)`, full.r === "done" && ends && (info.engine !== "kokoro" || ended === 3), full.log.join(" "));

    await page.evaluate(() => (window.__tts.log.length = 0));
    await page.evaluate(() => void window.__tts.play(0));
    await page.waitForFunction(() => window.__tts.log.some((l) => l.event === "sentence-start" && l.index === 1) && window.__tts.log.filter((l) => l.event === "audio-playing").length >= 2, { timeout: 60000, ...poll });
    await sleep(700);
    await page.evaluate(() => window.__tts.interrupt());
    await page.waitForFunction(() => window.__tts.log.some((l) => l.event === "play-interrupted"), { timeout: 10000, ...poll });
    const cut = await page.evaluate(() => ({ log: window.__tts.log.map((l) => `${l.event}${l.index ?? ""}`), index: window.__tts.speaker.index }));
    const stopMs = await page.evaluate(() => {
      const i = window.__tts.log.find((l) => l.event === "interrupt");
      const p = window.__tts.log.find((l) => l.event === "audio-paused" && l.t >= i.t);
      return p ? p.t - i.t : null;
    });
    check(`[${name}] barge-in stops audio mid-sentence ${cut.index} (paused ${stopMs ?? "n/a"} ms after interrupt)`, cut.index === 1 && !cut.log.includes("sentence-end1") && (info.engine !== "kokoro" || stopMs !== null), cut.log.join(" "));

    await page.evaluate(() => (window.__tts.log.length = 0));
    const resumed = await page.evaluate(async (from) => {
      const r = await window.__tts.play(from);
      return { r, log: window.__tts.log.map((l) => `${l.event}${l.index ?? ""}`) };
    }, cut.index);
    check(`[${name}] resume restarts at the interrupted sentence and finishes`, resumed.r === "done" && resumed.log[0] === "sentence-start1" && resumed.log.includes("sentence-end2") && !resumed.log.includes("sentence-start0"), resumed.log.join(" "));

    // ---- C. full-monitor screen share ------------------------------------------------------------
    const share = await page.evaluate(async () => {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: "monitor", frameRate: { ideal: 5, max: 5 } }, audio: false });
      const st = s.getVideoTracks()[0].getSettings();
      s.getTracks().forEach((t) => t.stop());
      return { surface: st.displaySurface, w: st.width, h: st.height, fps: st.frameRate };
    }).catch((e) => ({ error: e.message }));
    check(`[${name}] entire-screen share returns displaySurface="monitor" (${JSON.stringify(share)})`, share.surface === "monitor");

    // ---- D. recording size with all three streams at the configured bitrates ---------------------
    if (name === BROWSERS[0][0]) {
      const sizes = await page.evaluate(async () => {
        const cam = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: true });
        const phone = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, frameRate: 15 } });
        const screen = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: "monitor", frameRate: { ideal: 5, max: 5 } } });
        const run = (stream, video, audio) =>
          new Promise((resolve) => {
            let bytes = 0;
            const rec = new MediaRecorder(stream, { mimeType: audio ? "video/webm;codecs=vp8,opus" : "video/webm;codecs=vp8", videoBitsPerSecond: video, ...(audio ? { audioBitsPerSecond: audio } : {}) });
            rec.ondataavailable = (e) => (bytes += e.data.size);
            rec.onstop = () => resolve(bytes);
            rec.start(5000);
            setTimeout(() => rec.stop(), 30000);
          });
        const [p, s, ph] = await Promise.all([run(cam, 300000, 32000), run(screen, 200000, 0), run(phone, 120000, 0)]);
        [cam, phone, screen].forEach((x) => x.getTracks().forEach((t) => t.stop()));
        return { primary: p, screen: s, phone: ph };
      });
      const per30 = (b) => Math.round(((b * 60) / 1e6) * 10) / 10; // 30 s sample × 60 = 30 min
      const total = per30(sizes.primary + sizes.screen + sizes.phone);
      check(`[${name}] measured storage per 30 min: camera ${per30(sizes.primary)} MB + screen ${per30(sizes.screen)} MB + phone ${per30(sizes.phone)} MB = ${total} MB (cap math: 147 MB)`, total <= 150);
    }
    await page.close();

    // ---- B. candidate warning toast for no face (fake camera = no face) ---------------------------
    const email = `warn-${name}-${Date.now()}@proctra.test`;
    const password = `Warn-${Date.now()}!`;
    const seeded = JSON.parse(execFileSync(process.execPath, ["--env-file=.env.local", "scripts/seed-demo-interview.mjs", "--questions", "3"], { env: { ...process.env, DEMO_CANDIDATE_EMAIL: email } }).toString());
    const { data: u } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { account_type: "candidate", full_name: "Warn Check" } });
    try {
      const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
      const bearer = (await sb.auth.signInWithPassword({ email, password })).data.session.access_token;
      const hdr = { "content-type": "application/json", "x-proctra-token": seeded.token, authorization: `Bearer ${bearer}` };
      const sess = await fetch(`${base}/api/candidate/session`, { headers: hdr }).then((r) => r.json());
      await fetch(`${base}/api/candidate/consent`, { method: "POST", headers: hdr, body: JSON.stringify({ scopes: sess.consentItems.map((i) => i.scope), policyVersion: sess.policyVersion }) });

      const w = await browser.newPage();
      await w.goto(`${base}/login`, { waitUntil: "networkidle0" });
      await clickWhenHydrated(w, "account-candidate").catch(() => {});
      await w.type("#email", email);
      await w.type("#password", password);
      await w.click("button[type=submit]");
      await w.waitForFunction(() => location.pathname === "/candidate", { timeout: 20000, ...poll });
      await w.goto(`${base}/dev/proctor-harness?token=${encodeURIComponent(seeded.token)}`, { waitUntil: "networkidle0" });
      const t0 = Date.now();
      await w.waitForFunction(() => document.body.innerText.includes("Please keep your face in view"), { timeout: 60000, ...poll });
      check(`[${name}] no-face warning toast shown to candidate (${Date.now() - t0} ms after start, incl. model load)`, true);
      await sleep(4000); // let the warning event flush
      await clickWhenHydrated(w, "stop"); // stop → open FACE_ABSENT interval is flushed
      await sleep(4000);
      const { data: evs } = await admin.from("proctoring_events").select("event_type, telemetry").eq("interview_id", seeded.interviewId);
      const shown = evs.find((e) => e.event_type === "CANDIDATE_WARNING_SHOWN" && e.telemetry.trigger_type === "FACE_ABSENT");
      const face = evs.find((e) => e.event_type === "FACE_ABSENT");
      check(`[${name}] warning logged as CANDIDATE_WARNING_SHOWN with the FACE_ABSENT event's id`, shown && face && shown.telemetry.trigger_client_id === face.telemetry.client_id, JSON.stringify(evs.map((e) => e.event_type)));
      await w.close();
    } finally {
      await admin.auth.admin.deleteUser(u.user.id);
    }
  } catch (e) {
    check(`[${name}] run completed`, false, e.message.split("\n")[0]);
  } finally {
    await browser.close();
  }
}
for (const x of results) console.log(`${x.pass ? "PASS" : "FAIL"}  ${x.name}${x.detail && !x.pass ? `  (${x.detail.slice(0, 400)})` : ""}`);
const failed = results.filter((x) => !x.pass).length;
console.log(failed ? `\n${failed} check(s) failed` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
