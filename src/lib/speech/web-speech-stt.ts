"use client";

import type { SpeechToText, SttResult } from "./types";

// Minimal typings for the (prefixed) Web Speech API, which lib.dom does not include.
interface RecognitionAlternative { transcript: string; confidence: number }
interface RecognitionResult { isFinal: boolean; 0: RecognitionAlternative }
interface RecognitionEvent { resultIndex: number; results: ArrayLike<RecognitionResult> }
interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function ctor(): RecognitionCtor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

const FATAL = new Set(["not-allowed", "service-not-allowed", "audio-capture", "network", "language-not-supported"]);

/**
 * Chrome/Edge Web Speech recognition. Chrome ends a session after silence or ~60 s, so this
 * restarts automatically while active. Audio is processed by the browser vendor's service.
 */
export class WebSpeechSTT implements SpeechToText {
  readonly name = "web-speech" as const;
  private rec: Recognition | null = null;
  private active = false;
  private resultCbs = new Set<(r: SttResult) => void>();
  private errorCbs = new Set<(m: string) => void>();

  constructor(private readonly lang = "en-US") {}

  get supported() {
    return Boolean(ctor());
  }

  start() {
    const C = ctor();
    if (!C) {
      this.errorCbs.forEach((cb) => cb("Speech recognition is not supported in this browser"));
      return;
    }
    this.active = true;
    if (this.rec) return;
    const rec = new C();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = this.lang;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const alt = r[0];
        const result: SttResult = { text: alt.transcript, isFinal: r.isFinal, confidence: alt.confidence, at: performance.now() };
        this.resultCbs.forEach((cb) => cb(result));
      }
    };
    rec.onerror = (e) => {
      if (FATAL.has(e.error)) {
        this.active = false;
        this.errorCbs.forEach((cb) => cb(e.error));
      }
      // "no-speech" / "aborted" fall through to onend and restart.
    };
    rec.onend = () => {
      this.rec = null;
      if (this.active) this.start();
    };
    this.rec = rec;
    try {
      rec.start();
    } catch {
      // start() throws if already started; onend will reconcile.
    }
  }

  stop() {
    this.active = false;
    this.rec?.stop();
    this.rec = null;
  }

  onResult(cb: (r: SttResult) => void) {
    this.resultCbs.add(cb);
    return () => void this.resultCbs.delete(cb);
  }

  /** Chrome delivers the last final result shortly after speech stops; give it a moment. */
  async flush() {
    await new Promise((r) => setTimeout(r, 350));
  }

  onError(cb: (m: string) => void) {
    this.errorCbs.add(cb);
    return () => void this.errorCbs.delete(cb);
  }
}
