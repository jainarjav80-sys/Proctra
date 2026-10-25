#!/usr/bin/env node
// Real WebRTC check in Chromium: phone page (fake camera) ⇄ desktop link via Supabase Realtime
// signalling. Verifies video frames arrive, heartbeat-based disconnect detection, and re-pairing.
// Usage: node --env-file=.env.local scripts/e2e-phone-pairing.mjs [baseUrl]
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { createClient } from "@supabase/supabase-js";

const base = process.argv[2] ?? "http://localhost:3123";
const exe = ["/usr/bin/google-chrome", "/snap/bin/chromium", "/snap/bin/brave"].find(existsSync);
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const results = [];
const check = (name, pass, detail = "") => results.push({ name, pass: Boolean(pass), detail });

const email = `pair-${Date.now()}@proctra.test`;
const seeded = JSON.parse(execFileSync(process.execPath, ["--env-file=.env.local", "scripts/seed-demo-interview.mjs", "--questions", "3"], { env: { ...process.env, DEMO_CANDIDATE_EMAIL: email } }).toString());
const password = `Pair-${Date.now()}!`;
const { data: u } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { account_type: "candidate", full_name: "Pair Check" } });
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const bearer = (await c.auth.signInWithPassword({ email, password })).data.session.access_token;
const api = (path, body) => fetch(`${base}/api/candidate/${path}`, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", "x-proctra-token": seeded.token, authorization: `Bearer ${bearer}` }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());

/** Dev builds compile routes on first hit; click only once React has hydrated (the button reacts). */
async function clickWhenHydrated(page, label) {
  for (let i = 0; i < 20; i++) {
    const clicked = await page.evaluate((l) => {
      const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes(l));
      if (!b) return false;
      const key = Object.keys(b).find((k) => k.startsWith("__reactProps"));
      if (!key) return false; // not hydrated yet
      b.click();
      return true;
    }, label);
    if (clicked) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`"${label}" never became interactive`);
}

let browser;
const pages = {};
const logs = [];
try {
  const session = await api("session");
  await api("consent", { scopes: session.consentItems.map((i) => i.scope), policyVersion: session.policyVersion });
  const pair = await api("pair", {});
  browser = await puppeteer.launch({ executablePath: exe, headless: "new", args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--no-first-run"] });
  const desktop = await browser.newPage();
  pages.desktop = desktop;
  desktop.on("console", (m) => /error|warn/.test(m.type()) && logs.push(`desktop ${m.type()}: ${m.text()}`));
  await desktop.goto(`${base}/dev/pair-harness?channel=${pair.channel}&ice=${encodeURIComponent(JSON.stringify(pair.iceServers))}`);
  await desktop.waitForFunction(() => document.querySelector('[data-testid="harness-status"]')?.textContent === "waiting", { timeout: 20000, polling: 250 });

  const phone = await browser.newPage();
  pages.phone = phone;
  phone.on("console", (m) => /error|warn/.test(m.type()) && logs.push(`phone ${m.type()}: ${m.text()}`));
  await phone.goto(new URL(pair.url).pathname.replace(/^/, base), { waitUntil: "networkidle0" });
  await clickWhenHydrated(phone, "Start camera");
  const t0 = Date.now();
  await desktop.waitForFunction(() => document.querySelector('[data-testid="harness-status"]')?.textContent === "connected", { timeout: 30000, polling: 250 });
  const pairMs = Date.now() - t0;
  check(`phone connected to desktop over WebRTC (${pairMs} ms from "Start camera")`, true);
  await desktop.waitForFunction(() => document.querySelector('[data-testid="harness-video"]')?.videoWidth > 0, { timeout: 15000, polling: 250 });
  const dims = await desktop.$eval('[data-testid="harness-video"]', (v) => `${v.videoWidth}x${v.videoHeight}`);
  check(`desktop receives phone video frames (${dims})`, true);
  const phoneStatus = await phone.$eval('[data-testid="companion-status"]', (el) => el.textContent);
  check(`phone shows connected ("${phoneStatus}")`, /Connected/.test(phoneStatus));

  const t1 = Date.now();
  await phone.close();
  await desktop.waitForFunction(() => document.querySelector('[data-testid="harness-status"]')?.textContent === "disconnected", { timeout: 10000, polling: 250 });
  check(`phone closed → desktop detects disconnect in ${Date.now() - t1} ms (target ≤ 3.5 s)`, Date.now() - t1 <= 3500);

  const replay = await browser.newPage();
  await replay.goto(new URL(pair.url).pathname.replace(/^/, base), { waitUntil: "networkidle0" });
  await clickWhenHydrated(replay, "Start camera");
  await replay.waitForSelector('[role="alert"]', { timeout: 15000, polling: 250 });
  const msg = await replay.$eval('[role="alert"]', (el) => el.textContent);
  check(`reusing the same QR is refused ("${msg.slice(0, 60)}…")`, /already used|expired/i.test(msg));
} catch (e) {
  check("run completed", false, e.message.split("\n")[0]);
  for (const [name, pg] of Object.entries(pages)) {
    const text = await pg.evaluate(() => document.body.innerText).catch(() => "(closed)");
    console.log(`--- ${name}: ${text.replace(/\s+/g, " ").slice(0, 200)}`);
  }
  console.log(logs.slice(0, 10).join("\n"));
} finally {
  await browser?.close();
  await admin.auth.admin.deleteUser(u.user.id);
}
for (const x of results) console.log(`${x.pass ? "PASS" : "FAIL"}  ${x.name}${x.detail && !x.pass ? `  (${x.detail})` : ""}`);
const failed = results.filter((x) => !x.pass).length;
console.log(failed ? `\n${failed} check(s) failed` : `\nAll ${results.length} checks passed (${exe})`);
process.exit(failed ? 1 : 0);
