#!/usr/bin/env node
// Copies browser runtimes from node_modules into public/vendor so they're served same-origin:
//  - MediaPipe Tasks Vision WASM (face landmarks)
//  - kokoro-js self-contained web bundle (in-browser neural TTS fallback)
// Runs automatically before dev/build.
import { cpSync, existsSync, mkdirSync } from "node:fs";
const copies = [
  ["node_modules/@mediapipe/tasks-vision/wasm", "public/vendor/mediapipe/wasm"],
  ["node_modules/kokoro-js/dist/kokoro.web.js", "public/vendor/kokoro/kokoro.web.js"],
];
for (const [src, dest] of copies) {
  if (!existsSync(src)) throw new Error(`Missing ${src}: run npm install first`);
  mkdirSync(dest.endsWith(".js") ? dest.slice(0, dest.lastIndexOf("/")) : dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
}
