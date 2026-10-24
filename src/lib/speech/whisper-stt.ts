"use client";

import { EnergyVAD } from "./energy-vad";
import type { SpeechToText, SttResult } from "./types";

export type UploadFn = (audio: Blob) => Promise<{ text: string; confidence: number | null }>;

const MAX_SEGMENT_MS = 25_000; // cut long monologues so each upload stays small and fast
const INTERIM_EVERY_MS = 400;

/**
 * Server-side speech recognition (Groq Whisper) for browsers without a Web Speech backend.
 * Records continuously; when the VAD hears speech end, the segment is uploaded and returned as one
 * final result. Segments with no detected speech are discarded (prevents Whisper hallucinating on
 * silence). While speech is ongoing it emits "…" interim results so silence timers behave exactly
 * as they do with Web Speech.
 */
export class WhisperSTT implements SpeechToText {
  readonly name = "groq-whisper" as const;
  private stream: MediaStream | null = null;
  private vad: EnergyVAD | null = null;
  private recorder: MediaRecorder | null = null;
  /** Each recorder gets its own buffer: a stopping recorder still delivers its last chunk after the
   *  next one has started, and mixing them corrupts the WebM container. */
  private chunksByRecorder = new WeakMap<MediaRecorder, Blob[]>();
  private segmentHadSpeech = false;
  private segmentStartedAt = 0;
  private interimTimer: ReturnType<typeof setInterval> | null = null;
  private pending = new Set<Promise<void>>();
  private active = false;
  private resultCbs = new Set<(r: SttResult) => void>();
  private errorCbs = new Set<(c: string) => void>();
  private offVad: (() => void) | null = null;

  constructor(private readonly upload: UploadFn) {}

  get supported() {
    return typeof window !== "undefined" && typeof MediaRecorder !== "undefined";
  }

  private mime() {
    for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]) if (MediaRecorder.isTypeSupported(m)) return m;
    return "";
  }

  private async ensureCapture() {
    if (this.stream) return;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    this.vad = new EnergyVAD();
    await this.vad.start(this.stream);
    this.offVad = this.vad.on((e) => {
      if (!this.active) return;
      if (e === "start") {
        this.segmentHadSpeech = true;
        this.startInterim();
      } else {
        this.stopInterim();
        void this.cut();
      }
    });
  }

  private startRecorder() {
    if (!this.stream) return;
    const type = this.mime();
    const rec = new MediaRecorder(this.stream, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    this.chunksByRecorder.set(rec, chunks);
    this.segmentHadSpeech = Boolean(this.vad?.isSpeaking);
    this.segmentStartedAt = performance.now();
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.start(1000);
    this.recorder = rec;
  }

  private startInterim() {
    this.stopInterim();
    this.interimTimer = setInterval(() => {
      this.emit({ text: "…", isFinal: false, confidence: 0, at: performance.now() });
      if (performance.now() - this.segmentStartedAt > MAX_SEGMENT_MS) void this.cut();
    }, INTERIM_EVERY_MS);
  }

  private stopInterim() {
    if (this.interimTimer) clearInterval(this.interimTimer);
    this.interimTimer = null;
  }

  /** Ends the current segment, uploads it if it contained speech, and starts a new one. */
  private cut(restart = true): Promise<void> {
    const rec = this.recorder;
    if (!rec || rec.state === "inactive") return Promise.resolve();
    const hadSpeech = this.segmentHadSpeech;
    const done = new Promise<void>((resolve) => {
      rec.onstop = async () => {
        const blob = new Blob(this.chunksByRecorder.get(rec) ?? [], { type: rec.mimeType || "audio/webm" });
        this.chunksByRecorder.delete(rec);
        if (hadSpeech && blob.size > 2000) {
          try {
            const { text, confidence } = await this.upload(blob);
            if (text.trim()) this.emit({ text: text.trim(), isFinal: true, confidence: confidence ?? 0, at: performance.now() });
          } catch (e) {
            this.errorCbs.forEach((cb) => cb((e as Error).message.includes("busy") ? "server-busy" : "server-error"));
          }
        }
        resolve();
      };
    });
    rec.stop();
    this.recorder = null;
    if (restart && this.active) this.startRecorder();
    const tracked = done.finally(() => this.pending.delete(tracked));
    this.pending.add(tracked);
    return tracked;
  }

  private emit(r: SttResult) {
    this.resultCbs.forEach((cb) => cb(r));
  }

  start() {
    if (this.active) return;
    this.active = true;
    void this.ensureCapture()
      .then(() => {
        if (!this.vad) return;
        this.vad.armed = true;
        if (this.active && !this.recorder) this.startRecorder();
      })
      .catch((e: DOMException) => {
        this.active = false;
        this.errorCbs.forEach((cb) => cb(e.name === "NotAllowedError" ? "not-allowed" : "audio-capture"));
      });
  }

  stop() {
    this.active = false;
    this.stopInterim();
    if (this.vad) this.vad.armed = false;
    void this.cut(false);
  }

  async flush() {
    if (this.recorder && this.segmentHadSpeech) await this.cut(this.active);
    await Promise.all([...this.pending]);
  }

  /** Releases the microphone (call when the interview ends). */
  dispose() {
    this.stop();
    this.offVad?.();
    this.vad?.stop();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  onResult(cb: (r: SttResult) => void) {
    this.resultCbs.add(cb);
    return () => void this.resultCbs.delete(cb);
  }

  onError(cb: (c: string) => void) {
    this.errorCbs.add(cb);
    return () => void this.errorCbs.delete(cb);
  }
}
