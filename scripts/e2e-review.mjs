#!/usr/bin/env node
// Recruiter review page in snap Chromium (or Brave): signs in as the demo recruiter (session cookie),
// opens /dashboard/interviews/:id, checks scores + evidence quotes, then on the Recording tab checks
// that every stream's chunks were stitched into one gapless buffer, that Play advances all players
// in sync, and that seeking (timeline, proctoring event, evidence quote) moves every player together.
// Usage: node --env-file=.env.local scripts/e2e-review.mjs [interviewId] [baseUrl]
//   interviewId defaults to the one kept by `e2e-full-interview.mjs --keep` (.last-full-interview.json).
import { existsSync, readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { createClient } from "@supabase/supabase-js";

const env = process.env;
const base = process.argv.find((a) => a.startsWith("http")) ?? "http://localhost:3123";
const interviewId = process.argv.find((a) => /^[0-9a-f-]{36}$/.test(a)) ?? JSON.parse(readFileSync(".last-full-interview.json", "utf8")).interviewId;
const exe = [env.BROWSER, "/snap/bin/chromium", "/snap/bin/brave"].filter(Boolean).find(existsSync);
const results = [];
const check = (name, pass, detail = "") => results.push({ name, pass: Boolean(pass), detail });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const poll = { polling: 250 };

// Demo recruiter session → @supabase/ssr cookie (base64url JSON, chunked at 3180 chars).
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: auth, error: authErr } = await sb.auth.signInWithPassword({ email: env.DEMO_RECRUITER_EMAIL || "demo.recruiter@proctra.test", password: env.DEMO_RECRUITER_PASSWORD });
if (authErr) throw new Error(`demo recruiter sign-in: ${authErr.message} (run scripts/create-demo-recruiter.mjs)`);
const name = `sb-${new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
const value = `base64-${Buffer.from(JSON.stringify(auth.session)).toString("base64url")}`;
const cookies = (value.length <= 3180 ? [[name, value]] : value.match(/.{1,3180}/g).map((c, i) => [`${name}.${i}`, c])).map(([n, v]) => ({ name: n, value: v, url: base }));

/** Per player: currentTime, the session's start on the master timeline, buffered ranges, active flag. */
const players = (page) =>
  page.$$eval("video[data-testid^=player-]", (vs) =>
    vs.map((v) => ({
      track: v.dataset.testid.replace("player-", ""),
      start: Number(v.dataset.sessionStart),
      t: v.currentTime,
      paused: v.paused,
      active: v.dataset.active,
      ranges: Array.from({ length: v.buffered.length }, (_, i) => [v.buffered.start(i), v.buffered.end(i)]),
    })),
  );
const masterMs = async (page) => {
  const txt = await page.$eval('[data-testid="player-time"]', (el) => el.textContent);
  const [m, s] = txt.split("/")[0].trim().split(":").map(Number);
  return (m * 60 + s) * 1000;
};
/** Every active player should sit at (master − sessionStart); allows the 1 s display rounding + drift. */
async function inSync(page, label) {
  const ms = await masterMs(page);
  const ps = (await players(page)).filter((p) => p.active === "1");
  const off = ps.map((p) => Math.abs(p.t - (ms - p.start) / 1000));
  check(`${label}: ${ps.length} active players aligned to the master clock (max off ${Math.max(0, ...off).toFixed(2)} s)`, ps.length >= 1 && off.every((o) => o < 1.6), JSON.stringify(ps.map((p) => [p.track, p.t.toFixed(2), p.start])));
  return ms;
}

let browser;
try {
  browser = await puppeteer.launch({ executablePath: exe, headless: "new", args: ["--no-first-run", "--autoplay-policy=no-user-gesture-required"] });
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.log(`page error: ${e.message.slice(0, 160)}`));
  await browser.setCookie(...cookies);
  await page.goto(`${base}/dashboard/interviews/${interviewId}`, { waitUntil: "networkidle2", timeout: 90000 });

  // Header + scores.
  const meta = await page.$eval('[data-testid="review-meta"]', (el) => el.textContent).catch(() => "");
  check(`header shows date/duration/engines (${meta.slice(0, 90)})`, /min|s\b/.test(meta));
  const evalStatus = await page.$eval('[data-testid="eval-status"]', (el) => el.textContent).catch(() => "?");
  const overall = await page.$eval('[data-testid="overall-score"]', (el) => el.textContent).catch(() => "");
  check(`evaluation ${evalStatus.trim()} with an overall score (${overall.trim()})`, /\d/.test(overall));
  const cards = await page.$$('[data-testid^="question-card-"]');
  const quotes = await page.$$eval('[data-testid="evidence-quote"]', (els) => els.map((e) => e.textContent));
  check(`${cards.length} question cards, ${quotes.length} evidence quotes highlighted in transcripts`, cards.length >= 3 && quotes.length >= 1);

  // Recording tab: all chunks stitched into one buffer per session.
  await page.click('[data-testid="tab-recording"]');
  await page.waitForFunction(() => [...document.querySelectorAll("video[data-testid^=player-]")].every((v) => v.dataset.loaded === "1"), { timeout: 90000, ...poll });
  const ps = await players(page);
  for (const track of ["PRIMARY", "SCREEN", "SECONDARY"]) {
    const mine = ps.filter((p) => p.track === track);
    const span = mine.map((p) => (p.ranges.at(-1)?.[1] ?? 0) - (p.ranges[0]?.[0] ?? 0));
    check(`${track}: ${mine.length} session(s), each one gapless buffered range (${span.map((s) => `${s.toFixed(0)} s`).join(", ") || "none"})`, mine.length >= 1 && mine.every((p) => p.ranges.length === 1 && p.ranges[0][1] > 5), JSON.stringify(mine.map((p) => p.ranges.map((r) => r.map((x) => x.toFixed(1))))));
  }

  // Play: master clock and players advance together.
  await page.click('[data-testid="player-toggle"]');
  await sleep(4000);
  const t1 = await inSync(page, "after 4 s of playback");
  check(`master clock advanced (${(t1 / 1000).toFixed(0)} s)`, t1 >= 3000);
  const playing = (await players(page)).filter((p) => p.active === "1" && !p.paused).length;
  check(`active players are playing (${playing})`, playing >= 1);
  await page.click('[data-testid="player-toggle"]');

  // Seek via the timeline slider to the middle.
  const max = await page.$eval('input[aria-label="Seek"]', (el) => Number(el.max));
  await page.$eval('input[aria-label="Seek"]', (el, v) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(el, String(v));
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, Math.round(max / 2));
  await sleep(1200);
  const t2 = await inSync(page, "after timeline seek to the middle");
  check(`timeline seek moved the master clock to ~50% (${(t2 / 1000).toFixed(0)} s of ${(max / 1000).toFixed(0)} s)`, Math.abs(t2 - max / 2) < 2500);

  // Seek from a proctoring event (Proctoring tab → switches to Recording).
  await page.click('[data-testid="tab-proctoring"]');
  const label = await page.$eval('[data-testid="proctoring-label"]', (el) => el.textContent).catch(() => "");
  check("proctoring tab labelled as observations for human review, not used in scoring", /not used in scoring/i.test(label));
  const ev = await page.$('[data-testid^="event-seek-"]');
  if (ev) {
    const before = await masterMs(page);
    await ev.click();
    await sleep(1200);
    const onRecording = await page.$eval('[data-testid="synced-player"]', (el) => el.offsetParent !== null);
    const t3 = await inSync(page, "after clicking a proctoring event");
    check(`event click opened the Recording tab and seeked (${(before / 1000).toFixed(0)} s → ${(t3 / 1000).toFixed(0)} s)`, onRecording && t3 !== before);
  } else check("no proctoring events to seek from (skipped)", true);

  // Seek from an evidence quote (Scores tab).
  await page.click('[data-testid="tab-scores"]');
  const quote = await page.$('[data-testid="evidence-quote"]');
  if (quote) {
    const before = await masterMs(page);
    await quote.click();
    await sleep(1200);
    const t4 = await inSync(page, "after clicking an evidence quote");
    check(`quote click seeked the recording (${(before / 1000).toFixed(0)} s → ${(t4 / 1000).toFixed(0)} s)`, t4 !== before);
  }

  // CSV export.
  const csv = await page.evaluate(async (id) => (await fetch(`/api/recruiter/interviews/${id}/scores.csv`)).text(), interviewId);
  check(`CSV export has a header and one row per question (${csv.trim().split("\n").length - 1} rows)`, /question/i.test(csv.split("\n")[0]) && csv.trim().split("\n").length >= 4);
} catch (e) {
  check("run completed", false, e.message);
} finally {
  await browser?.close();
}

for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.detail && !r.pass ? `  (${r.detail})` : ""}`);
const failed = results.filter((r) => !r.pass).length;
console.log(failed ? `\n${failed} check(s) failed (interview ${interviewId})` : `\nAll ${results.length} checks passed (interview ${interviewId})`);
process.exit(failed ? 1 : 0);
