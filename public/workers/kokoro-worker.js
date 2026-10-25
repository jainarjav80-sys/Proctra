// Kokoro-82M TTS in a dedicated worker. ONNX inference blocks whichever thread runs it; on the page's
// main thread that froze audio start-up, VAD (barge-in) and proctoring for seconds per sentence.
// Messages in: { id, text|null, voice }. Out: { progress } | { id, ready } | { id, blob } | { id, error }.
import { KokoroTTS } from "/vendor/kokoro/kokoro.web.js";

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
let model = null;

self.onmessage = async ({ data: { id, text, voice } }) => {
  try {
    model ??= KokoroTTS.from_pretrained(MODEL_ID, {
      dtype: "q4",
      device: "wasm",
      progress_callback: (p) => self.postMessage({ progress: { status: p.status, file: p.file, loaded: p.loaded, total: p.total, progress: p.progress } }),
    }).catch((e) => {
      model = null;
      throw e;
    });
    const m = await model;
    if (text === null) return self.postMessage({ id, ready: true, isolated: self.crossOriginIsolated });
    const audio = await m.generate(text, { voice });
    self.postMessage({ id, blob: audio.toBlob() });
  } catch (e) {
    self.postMessage({ id, error: String(e?.message ?? e) });
  }
};
