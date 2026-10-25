#!/usr/bin/env node
// E2E onboarding in real installed browsers with the speech fixture as the microphone:
// sign in as the invited candidate → consent → camera/mic → speech test (expects automatic switch
// to Whisper where native recognition has no backend) → mic meter moves → device name resolved.
// Usage: node --env-file=.env.local scripts/e2e-onboarding.mjs [baseUrl]
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { createClient } from "@supabase/supabase-js";

const base = process.argv[2] ?? "http://localhost:3123";
const audio = path.resolve("tests/fixtures/answer-kafka.wav");
const shots = path.resolve(".e2e-shots");
// FAKE_VIDEO=tests/fixtures/face.y4m → camera shows a face, so the one-face gate should pass.
const FACE = process.env.FAKE_VIDEO ? path.resolve(process.env.FAKE_VIDEO) : null;
mkdirSync(shots, { recursive: true });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const BROWSERS = [
  ["brave", "/snap/bin/brave"],
  ["chromium", "/snap/bin/chromium"],
  ["chrome", "/usr/bin/google-chrome"],
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;

for (const [name, exe] of BROWSERS) {
  if (!existsSync(exe)) {
    console.log(`\n== ${name}: not installed, skipped`);
    continue;
  }
  const email = `e2e-${name}-${Date.now()}@proctra.test`;
  const password = `E2e-${Date.now()}!`;
  const seeded = JSON.parse(execFileSync(process.execPath, ["--env-file=.env.local", "scripts/seed-demo-interview.mjs", "--questions", "3"], { env: { ...process.env, DEMO_CANDIDATE_EMAIL: email } }).toString());
  const { data: u } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { account_type: "candidate", full_name: "E2E Candidate" } });
  const link = new URL(seeded.url).pathname;
  const log = [];
  const step = (msg, ok = true) => {
    log.push(`${ok ? "PASS" : "FAIL"}  ${msg}`);
    if (!ok) failures++;
  };
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: exe,
      headless: "new",
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        `--use-file-for-fake-audio-capture=${audio}`,
        ...(FACE ? [`--use-file-for-fake-video-capture=${FACE}`] : []),
        "--autoplay-policy=no-user-gesture-required",
        "--no-first-run",
      ],
    });
    const page = await browser.newPage();
    page.setDefaultTimeout(20000);

    await page.goto(`${base}${link}`);
    await page.waitForFunction(() => location.pathname === "/login");
    step("invite link without a session redirects to sign-in", true);
    const prefilled = await page.$eval("#email", (el) => el.value);
    step("invited email is prefilled from the token", prefilled === email);
    await page.type("#password", password);
    await page.click("button[type=submit]");
    await page.waitForFunction((p) => location.pathname === p, {}, link);
    step("signed in and returned to the interview link", true);

    await page.waitForSelector("button[aria-label]");
    for (const box of await page.$$('button[role="checkbox"]')) await box.click();
    await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.includes("I agree"))?.click());
    await page.waitForFunction(() => document.body.innerText.includes("Camera & microphone check"));
    step("consent recorded → device step", true);

    await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Allow camera"))?.click());
    await page.waitForSelector('[role="meter"]');
    const levels = [];
    for (let i = 0; i < 12; i++) {
      levels.push(await page.$eval('[role="meter"]', (el) => Number(el.getAttribute("aria-valuenow"))));
      await sleep(250);
    }
    step(`mic meter responds to speech (aria-valuenow samples ${levels.join(",")})`, Math.max(...levels) >= 20);
    const micLabel = await page.$eval('[data-testid="mic-name"]', (el) => (el.tagName === "SELECT" ? el.options[el.selectedIndex]?.text : el.textContent) ?? "");
    step(`mic shown as "${micLabel}" (not bare "Default")`, micLabel && micLabel !== "Default");

    await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.includes("speech test"))?.click());
    await page.waitForSelector('[data-testid="speech-heard"]', { timeout: 45000 }).catch(() => {});
    const text = await page.evaluate(() => document.body.innerText);
    const heard = (await page.$eval('[data-testid="speech-heard"]', (el) => el.textContent).catch(() => "")).replace(/[“”]/g, "");
    const engine = await page.$eval('[data-testid="speech-engine"]', (el) => el.textContent.replace("Engine: ", "")).catch(() => "");
    step(`speech probe produced a real transcript via "${engine}": "${heard.slice(0, 70)}"`, heard.split(/\s+/).length >= 2);
    step("no misleading 'needs internet' message", !/needs an internet connection/i.test(text));
    await page.screenshot({ path: `${shots}/${name}-device-step.png`, fullPage: true });
    // Fake camera = test pattern with no face, so the one-face gate (bug #4) must keep Continue locked.
    await page.waitForFunction(() => !/Checking framing/.test(document.querySelector('[data-testid="face-check"]')?.textContent ?? "Checking framing"), { timeout: 30000, polling: 250 }).catch(() => {});
    const faceText = await page.$eval('[data-testid="face-check"]', (el) => el.textContent).catch(() => "");
    if (FACE) await page.waitForFunction(() => /One face/.test(document.querySelector('[data-testid="face-check"]')?.textContent ?? ""), { timeout: 20000, polling: 250 }).catch(() => {});
    const faceNow = await page.$eval('[data-testid="face-check"]', (el) => el.textContent).catch(() => "");
    step(`face check ran on-device (MediaPipe): "${faceNow}"`, FACE ? /One face/.test(faceNow) : /can't see your face/.test(faceText));
    const continueEnabled = await page.evaluate(() => !([...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Continue")?.disabled ?? true));
    step(FACE ? "Continue unlocks with exactly one face in view" : "Continue stays locked until exactly one face is in view", FACE ? continueEnabled : !continueEnabled);
  } catch (e) {
    step(`run aborted: ${e.message.split("\n")[0]}`, false);
  } finally {
    await browser?.close();
    await admin.auth.admin.deleteUser(u.user.id);
  }
  console.log(`\n== ${name}\n${log.join("\n")}`);
}
console.log(failures ? `\n${failures} check(s) failed` : "\nAll browser checks passed");
process.exit(failures ? 1 : 0);
