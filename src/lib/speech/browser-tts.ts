"use client";

import type { SpeakOptions, TextToSpeech } from "./types";

/** speechSynthesis-backed interviewer voice. */
export class BrowserTTS implements TextToSpeech {
  readonly name = "speech-synthesis";
  private voice: SpeechSynthesisVoice | null = null;
  private pendingResolve: (() => void) | null = null;

  constructor(private readonly lang = "en-US") {
    if (this.supported) {
      this.pickVoice();
      window.speechSynthesis.addEventListener("voiceschanged", () => this.pickVoice());
    }
  }

  get supported() {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  get speaking() {
    return this.supported && window.speechSynthesis.speaking;
  }

  private pickVoice() {
    const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith(this.lang.slice(0, 2)));
    // Prefer the higher-quality network voices Chrome/Edge expose ("Google …", "Microsoft … Online").
    this.voice = voices.find((v) => /Google|Online|Natural/i.test(v.name)) ?? voices[0] ?? null;
  }

  speak(text: string, opts: SpeakOptions = {}): Promise<void> {
    if (!this.supported) return Promise.reject(new Error("speechSynthesis not supported"));
    this.cancel();
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = this.lang;
      if (this.voice) u.voice = this.voice;
      u.rate = 1;
      u.onboundary = (e) => opts.onBoundary?.(e.charIndex);
      const done = () => {
        if (this.pendingResolve === done) this.pendingResolve = null;
        resolve();
      };
      u.onend = done;
      u.onerror = done;
      this.pendingResolve = done;
      window.speechSynthesis.speak(u);
    });
  }

  cancel() {
    if (!this.supported) return;
    window.speechSynthesis.cancel();
    this.pendingResolve?.();
  }
}
