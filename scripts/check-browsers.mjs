#!/usr/bin/env node
// Probes real installed browsers for the signals the candidate gate relies on: UA-CH brands,
// navigator.brave, Web Speech behaviour (actual error code), Window Management API, MediaRecorder.
// Usage: node scripts/check-browsers.mjs [baseUrl]   (needs the dev server for a secure origin)
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { detectBrowser } from "../src/lib/browser/detect.ts";
import { mapSttError } from "../src/lib/speech/stt-errors.ts";

const base = process.argv[2] ?? "http://localhost:3123";
const BROWSERS = [
  ["Brave", ["/snap/bin/brave", "/usr/bin/brave-browser"]],
  ["Chromium", ["/snap/bin/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser"]],
  ["Google Chrome", ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable"]],
];

for (const [name, paths] of BROWSERS) {
  const exe = paths.find((p) => existsSync(p));
  if (!exe) {
    console.log(`\n== ${name}: not installed, skipped`);
    continue;
  }
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: exe,
      headless: "new",
      args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--no-first-run", "--no-default-browser-check"],
    });
    const page = await browser.newPage();
    await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
    const probe = await page.evaluate(async () => {
      const brands = navigator.userAgentData?.brands ?? null;
      let isBrave = false;
      try { isBrave = Boolean(await navigator.brave?.isBrave?.()); } catch {}
      const arcPalette = Boolean(getComputedStyle(document.documentElement).getPropertyValue("--arc-palette-title").trim());
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      const speech = await new Promise((resolve) => {
        if (!SR) return resolve({ api: false });
        const r = new SR();
        const t = setTimeout(() => resolve({ api: true, outcome: "no event in 8s" }), 8000);
        r.onerror = (e) => { clearTimeout(t); resolve({ api: true, outcome: `error:${e.error}` }); };
        r.onresult = () => { clearTimeout(t); resolve({ api: true, outcome: "result" }); };
        r.onend = () => { clearTimeout(t); resolve({ api: true, outcome: "ended without result" }); };
        try { r.start(); } catch (e) { resolve({ api: true, outcome: `throw:${e.message}` }); }
      });
      let recorder = false;
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        recorder = typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/webm;codecs=opus");
        s.getTracks().forEach((t) => t.stop());
      } catch {}
      return {
        ua: navigator.userAgent,
        brands, isBrave, arcPalette, speech, recorder, online: navigator.onLine,
        isExtendedType: typeof screen.isExtended,
        getScreenDetails: "getScreenDetails" in window,
        fullscreen: Boolean(document.documentElement.requestFullscreen),
      };
    });
    const info = detectBrowser({ brands: probe.brands ?? undefined, isBrave: probe.isBrave, arcPalette: probe.arcPalette });
    const code = probe.speech.outcome?.startsWith("error:") ? probe.speech.outcome.slice(6) : null;
    console.log(`\n== ${name} (${exe})`);
    console.log(`  brands: ${JSON.stringify(probe.brands?.map((b) => b.brand))}  navigator.brave.isBrave(): ${probe.isBrave}`);
    console.log(`  UA string claims: ${/Chrome\//.test(probe.ua) ? "Chrome" : "?"}  → detected family: ${info.family}, nativeSpeech: ${info.nativeSpeech}`);
    console.log(`  SpeechRecognition API: ${probe.speech.api}, real outcome: ${probe.speech.outcome}${code ? `  → mapped: ${JSON.stringify(mapSttError(code, probe.online))}` : ""}`);
    console.log(`  Window Management: screen.isExtended=${probe.isExtendedType}, getScreenDetails=${probe.getScreenDetails}; fullscreen=${probe.fullscreen}; MediaRecorder(opus)=${probe.recorder}`);
    console.log(`  → gate decision: ${!info.chromium ? "BLOCK" : !(probe.getScreenDetails || probe.isExtendedType === "boolean") ? "BLOCK (no Window Management)" : `ALLOW with ${info.nativeSpeech ? "web-speech" : "groq-whisper"}`}`);
  } catch (e) {
    console.log(`\n== ${name}: launch/probe failed: ${e.message.split("\n")[0]}`);
  } finally {
    await browser?.close();
  }
}
