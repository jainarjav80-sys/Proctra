"use client";

import { TtsError, type SpeakOptions, type TextToSpeech } from "./types";

/** Waits for the voice list (it is empty until "voiceschanged" fires in Chromium). */
export function loadVoices(timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return Promise.resolve([]);
  const now = window.speechSynthesis.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => resolve(window.speechSynthesis.getVoices());
    const t = setTimeout(done, timeoutMs);
    window.speechSynthesis.addEventListener("voiceschanged", () => (clearTimeout(t), done()), { once: true });
  });
}

function pickVoice(voices: SpeechSynthesisVoice[], lang: string) {
  const en = voices.filter((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
  // Prefer the higher-quality network voices Chrome/Edge expose ("Google …", "Microsoft … Online").
  return en.find((v) => /Google|Online|Natural/i.test(v.name)) ?? en.find((v) => v.lang === lang) ?? en[0] ?? null;
}

/**
 * speechSynthesis-backed interviewer voice. Only usable when a real English voice exists: on Linux
 * snap browsers (Brave, Chromium) speech-dispatcher is sandboxed away and getVoices() is empty, so
 * every utterance fails with "synthesis-failed". speak() now rejects in that case instead of
 * silently resolving, which is what made the interviewer mute.
 */
export class BrowserTTS implements TextToSpeech {
  readonly name = "speech-synthesis" as const;
  private voice: SpeechSynthesisVoice | null = null;
  /** Held so Chrome can't garbage-collect an utterance mid-sentence (which drops its events). */
  private current: SpeechSynthesisUtterance | null = null;
  private pendingResolve: (() => void) | null = null;

  constructor(private readonly lang = "en-US") {
    if (this.supported) void loadVoices().then((v) => (this.voice = pickVoice(v, this.lang)));
  }

  get supported() {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  get speaking() {
    return this.supported && window.speechSynthesis.speaking;
  }

  /** Real capability check: an English voice exists AND a quiet test utterance actually starts. */
  static async probe(lang = "en-US"): Promise<{ ok: boolean; voices: number; english: number; voice: string | null; reason: string | null }> {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return { ok: false, voices: 0, english: 0, voice: null, reason: "speechSynthesis not supported" };
    const voices = await loadVoices();
    const voice = pickVoice(voices, lang);
    const english = voices.filter((v) => v.lang.toLowerCase().startsWith("en")).length;
    if (!voice) return { ok: false, voices: voices.length, english, voice: null, reason: "no English voice installed" };
    const started = await new Promise<string | null>((resolve) => {
      const u = new SpeechSynthesisUtterance("Audio check.");
      u.voice = voice;
      u.volume = 0.05;
      (window as unknown as { __proctraProbe?: SpeechSynthesisUtterance }).__proctraProbe = u;
      const t = setTimeout(() => resolve("utterance never started"), 2500);
      u.onstart = () => (clearTimeout(t), resolve(null));
      u.onerror = (e) => (clearTimeout(t), resolve(`utterance error: ${e.error}`));
      window.speechSynthesis.speak(u);
    });
    window.speechSynthesis.cancel();
    return { ok: !started, voices: voices.length, english, voice: voice.name, reason: started };
  }

  async speak(text: string, opts: SpeakOptions = {}): Promise<void> {
    if (!this.supported) throw new TtsError("speechSynthesis not supported");
    if (!this.voice) this.voice = pickVoice(await loadVoices(), this.lang);
    if (!this.voice) throw new TtsError("no English voice available");
    this.cancel();
    // Chrome drops an utterance queued in the same tick as cancel(); yield once first.
    await new Promise((r) => setTimeout(r, 0));
    return new Promise((resolve, reject) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = this.lang;
      u.voice = this.voice;
      u.rate = 1;
      this.current = u;
      u.onboundary = (e) => opts.onBoundary?.(e.charIndex);
      const finish = (err?: string) => {
        if (this.current === u) this.current = null;
        if (this.pendingResolve === done) this.pendingResolve = null;
        if (err) reject(new TtsError(err));
        else resolve();
      };
      const done = () => finish();
      u.onend = done;
      // "interrupted"/"canceled" come from our own cancel() (barge-in), not failures.
      u.onerror = (e) => (e.error === "interrupted" || e.error === "canceled" ? done() : finish(`speech failed: ${e.error}`));
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
