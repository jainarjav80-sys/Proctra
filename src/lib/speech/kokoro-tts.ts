"use client";

import { FIXED_PHRASES, KOKORO_LEAD_INS, speechPieces } from "./sentences";
import { TtsError, type TextToSpeech } from "./types";

const VOICE = "af_heart";

interface KokoroModel {
  generate(text: string, opts: { voice: string }): Promise<Blob>;
}
export interface LoadProgress {
  loadedMB: number;
  totalMB: number;
  pct: number;
}

/** Pre-generated during onboarding and never evicted, so question lead-ins play instantly. */
const PINNED = new Set([...FIXED_PHRASES, ...KOKORO_LEAD_INS].flatMap((p) => speechPieces(p)));

let modelPromise: Promise<KokoroModel> | null = null;
const progressListeners = new Set<(p: LoadProgress) => void>();

/**
 * Kokoro-82M (Apache-2.0) neural TTS running entirely in the browser via ONNX Runtime WASM, inside a
 * dedicated worker (public/workers/kokoro-worker.js) so inference never blocks the page.
 * q4 weights (~90 MB, cached by the browser after the first load). On a cross-origin-isolated
 * page (COOP/COEP set for /interview) ORT runs multi-threaded: ~0.7× real time measured on
 * Chromium/Linux, so generating the next piece while one plays keeps speech continuous.
 */
export function loadKokoro(onProgress?: (p: LoadProgress) => void): Promise<KokoroModel> {
  if (onProgress) progressListeners.add(onProgress);
  modelPromise ??= new Promise<KokoroModel>((resolve, reject) => {
    const worker = new Worker("/workers/kokoro-worker.js", { type: "module" });
    const pending = new Map<number, { resolve: (b: Blob) => void; reject: (e: Error) => void }>();
    let seq = 0;
    const model: KokoroModel = {
      generate: (text, opts) =>
        new Promise((res, rej) => {
          const id = ++seq;
          pending.set(id, { resolve: res, reject: rej });
          worker.postMessage({ id, text, voice: opts.voice });
        }),
    };
    worker.onmessage = ({ data: d }) => {
      if (d.progress) {
        const e = d.progress as { status: string; file?: string; loaded?: number; total?: number; progress?: number };
        if (e.status === "progress" && e.file?.endsWith(".onnx") && e.total) {
          const p = { loadedMB: Math.round((e.loaded ?? 0) / 1e6), totalMB: Math.round(e.total / 1e6), pct: Math.round(e.progress ?? 0) };
          progressListeners.forEach((l) => l(p));
        }
        return;
      }
      if (d.id === 0) return d.error ? reject(new Error(d.error)) : resolve(model);
      const p = pending.get(d.id);
      pending.delete(d.id);
      if (d.error) p?.reject(new Error(d.error));
      else p?.resolve(d.blob as Blob);
    };
    worker.onerror = (e) => {
      reject(new Error(e.message || "Kokoro worker failed to start"));
      pending.forEach((p) => p.reject(new Error("Kokoro worker crashed")));
      pending.clear();
    };
    worker.postMessage({ id: 0, text: null }); // load the model
  }).catch((e) => {
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

  /**
   * Overlapping generate() calls interleave, so the first piece would only finish when all of them
   * do. Pieces are therefore generated one at a time; the piece about to be spoken jumps ahead of
   * prefetches.
   */
  private queue: { text: string; run: () => Promise<void> }[] = [];
  private busy = false;

  private synth(text: string, urgent = false): Promise<Blob> {
    let p = this.cache.get(text);
    if (!p) {
      p = new Promise<Blob>((resolve, reject) => {
        const run = () =>
          loadKokoro()
            .then((m) => m.generate(text, { voice: VOICE }))
            .then(resolve, reject);
        this.queue.push({ text, run });
      });
      this.cache.set(text, p);
      p.catch(() => this.cache.delete(text));
      if (this.cache.size > 30 + PINNED.size) {
        const old = [...this.cache.keys()].find((k) => !PINNED.has(k));
        if (old) this.cache.delete(old);
      }
    }
    if (urgent) {
      const i = this.queue.findIndex((q) => q.text === text);
      if (i > 0) this.queue.unshift(...this.queue.splice(i, 1));
    }
    this.pump();
    return p;
  }

  private pump() {
    if (this.busy) return;
    const next = this.queue.shift();
    if (!next) return;
    this.busy = true;
    void next.run().finally(() => {
      this.busy = false;
      this.pump();
    });
  }

  prefetch(text: string) {
    for (const part of speechPieces(text)) void this.synth(part).catch(() => {});
  }

  /**
   * Speaks short pieces (sentences, long ones split at clauses): generation time grows with length,
   * so the first piece is heard within ~1 s and later pieces are generated while earlier ones play.
   * The first piece is requested first, so it never queues behind a prefetch.
   * Word-boundary callbacks (SpeakOptions) aren't available from Kokoro; captions show the full sentence.
   */
  async speak(text: string): Promise<void> {
    const parts = speechPieces(text);
    const gen = ++this.generation;
    const first = this.speakOne(parts[0] ?? text);
    for (const p of parts.slice(1)) void this.synth(p).catch(() => {});
    await first;
    for (const p of parts.slice(1)) {
      if (gen !== this.generation) return; // cancelled between pieces
      await this.speakOne(p);
    }
  }

  private generation = 0;

  private async speakOne(text: string): Promise<void> {
    this.stopAudio();
    let blob: Blob;
    try {
      blob = await this.synth(text, true);
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

  private stopAudio() {
    this.audio?.pause();
    this.pendingResolve?.();
  }

  cancel() {
    this.generation++;
    this.stopAudio();
  }
}
