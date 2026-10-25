#!/usr/bin/env node
// Kokoro generation speed in a cross-origin-isolated page: time per text length → real-time factor.
// Usage: node scripts/bench-kokoro.mjs [baseUrl] [--with-proctoring]
//   --with-proctoring also runs /dev/proctor-harness (MediaPipe + COCO-SSD on a fake camera) in another tab.
import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";

const base = process.argv.find((a) => a.startsWith("http")) ?? "http://localhost:3123";
const TEXTS = [
  "Thank you.",
  "Thank you. Question 2.",
  "How do you make a Kafka consumer idempotent,",
  "How do you make a Kafka consumer idempotent when the same payment event can be delivered more than once?",
];
const WITH_PROCTORING = process.argv.includes("--with-proctoring");
const browser = await puppeteer.launch({
  executablePath: [process.env.BROWSER, "/snap/bin/chromium", "/snap/bin/brave"].filter(Boolean).find(existsSync),
  headless: "new",
  args: ["--no-first-run", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
});
try {
  if (WITH_PROCTORING) {
    const p = await browser.newPage();
    await p.goto(`${base}/dev/proctor-harness`, { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 15000)); // models loaded and detecting
  }
  const page = await browser.newPage();
  await page.goto(`${base}/dev/tts-harness`, { waitUntil: "networkidle0" });
  const res = await page.evaluate(async (texts) => {
    // Same worker the interview uses (public/workers/kokoro-worker.js).
    const w = new Worker("/workers/kokoro-worker.js", { type: "module" });
    let seq = 0;
    const call = (text) =>
      new Promise((resolve, reject) => {
        const id = seq++;
        const on = ({ data }) => {
          if (data.id !== id) return;
          w.removeEventListener("message", on);
          data.error ? reject(new Error(data.error)) : resolve(data);
        };
        w.addEventListener("message", on);
        w.postMessage({ id, text, voice: "af_heart" });
      });
    const ready = await call(null);
    await call("Warm up.");
    const out = [];
    for (const t of texts) {
      const t0 = performance.now();
      const { blob } = await call(t);
      const genMs = performance.now() - t0;
      const buf = await new AudioContext().decodeAudioData(await blob.arrayBuffer());
      out.push({ chars: t.length, genMs: Math.round(genMs), audioMs: Math.round(buf.duration * 1000) });
    }
    return { isolated: ready.isolated, threads: navigator.hardwareConcurrency, out };
  }, TEXTS);
  console.log(`worker crossOriginIsolated=${res.isolated} cores=${res.threads} proctoring=${WITH_PROCTORING}`);
  for (const r of res.out) console.log(`${String(r.chars).padStart(4)} chars: gen ${r.genMs} ms for ${r.audioMs} ms audio (RTF ${(r.genMs / r.audioMs).toFixed(2)})`);
} finally {
  await browser.close();
}
