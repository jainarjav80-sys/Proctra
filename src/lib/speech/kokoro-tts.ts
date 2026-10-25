"use client";

import { TtsError, type TextToSpeech } from "./types";

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
const VOICE = "af_heart";

interface RawAudio {
  audio: Float32Array;
  sampling_rate: number;
  toBlob(): Blob;
}
interface KokoroModel {
  generate(text: string, opts: { voice: string; speed?: number }): Promise<RawAudio>;
}
export interface LoadProgress {
  loadedMB: number;
  totalMB: number;
  pct: number;
}

let modelPromise: Promise<KokoroModel> | null = null;

/**
 * Kokoro-82M (Apache-2.0) neural TTS running entirely in the browser via ONNX Runtime WASM.
 * q4 weights (~90 MB, cached by the browser after the first load). On a cross-origin-isolated
 * page (COOP/COEP set for /interview) ORT runs multi-threaded: ~0.7× real time measured on
 * Chromium/Linux, so generating the next sentence while one plays keeps speech continuous.
 */
export function loadKokoro(onProgress?: (p: LoadProgress) => void): Promise<KokoroModel> {
  modelPromise ??= (async () => {
    // Served from public/vendor (self-contained web bundle); imported at runtime, not bundled.
    const mod = (await new Function("u", "return import(u)")("/vendor/kokoro/kokoro.web.js")) as {
      KokoroTTS: { from_pretrained(id: string, o: object): Promise<KokoroModel> };
    };
    return mod.KokoroTTS.from_pretrained(MODEL_ID, {
      dtype: "q4",
      device: "wasm",
      progress_callback: (e: { status: string; file?: string; loaded?: number; total?: number; progress?: number }) => {
        if (e.status === "progress" && e.file?.endsWith(".onnx") && e.total) {
          onProgress?.({ loadedMB: Math.round((e.loaded ?? 0) / 1e6), totalMB: Math.round(e.total / 1e6), pct: Math.round(e.progress ?? 0) });
        }
      },
    });
  })().catch((e) => {
    modelPromise = null; // allow a retry
    throw e;
  });
  return modelPromise;
}

export class KokoroTTS implements TextToSpeech {
  readonly name = "kokoro" as const;
  private audio: HTMLAudioElement | null = null;
  private cache = new Map<string, Promise<Blob>>();
  private pendingResolve: (() => void) | null = null;
  private playing = false;

  get supported() {
    return typeof window !== "undefined" && typeof WebAssembly !== "undefined";
  }

  get speaking() {
    return this.playing;
  }

  private synth(text: string): Promise<Blob> {
    let p = this.cache.get(text);
    if (!p) {
      p = loadKokoro().then((m) => m.generate(text, { voice: VOICE })).then((a) => a.toBlob());
      this.cache.set(text, p);
      p.catch(() => this.cache.delete(text));
      if (this.cache.size > 30) this.cache.delete(this.cache.keys().next().value!);
    }
    return p;
  }

  prefetch(text: string) {
    void this.synth(text).catch(() => {});
  }

  // Word-boundary callbacks (SpeakOptions) aren't available from Kokoro; captions show the full sentence.
  async speak(text: string): Promise<void> {
    this.cancel();
    let blob: Blob;
    try {
      blob = await this.synth(text);
    } catch (e) {
      throw new TtsError(`Kokoro synthesis failed: ${(e as Error).message}`);
    }
    const url = URL.createObjectURL(blob);
    const el = new Audio(url);
    this.audio = el;
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        URL.revokeObjectURL(url);
        if (this.audio === el) this.audio = null;
        this.playing = false;
        if (this.pendingResolve === done) this.pendingResolve = null;
      };
      const done = () => (cleanup(), resolve());
      el.onended = done;
      el.onerror = () => (cleanup(), reject(new TtsError("audio playback failed")));
      this.pendingResolve = done;
      el.play()
        .then(() => (this.playing = true))
        .catch((e: DOMException) => {
          cleanup();
          reject(new TtsError(e.name === "NotAllowedError" ? "autoplay blocked: needs a click first" : `playback failed: ${e.message}`));
        });
    });
  }

  cancel() {
    this.audio?.pause();
    this.pendingResolve?.();
  }
}
