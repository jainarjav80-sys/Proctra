#!/usr/bin/env node
// Copies MediaPipe's WASM runtime from node_modules into public/ so it's served same-origin
// (no third-party CDN at runtime). Runs automatically before dev/build.
import { cpSync, existsSync, mkdirSync } from "node:fs";
const src = "node_modules/@mediapipe/tasks-vision/wasm";
const dest = "public/vendor/mediapipe/wasm";
if (!existsSync(src)) throw new Error("Run npm install first");
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
