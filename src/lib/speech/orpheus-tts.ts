"use client";

import { TtsError, type TextToSpeech } from "./types";

/**
 * Groq Orpheus voice through /api/candidate/tts (≈0.35 s to first byte, ~1.2 s for a sentence).
 * Fetches are prefetched/cached per sentence; rate limits surface as TtsError("rate_limit") so the
 * SentenceSpeaker can fail over to Kokoro mid-interview.
 */
export class OrpheusTTS implements TextToSpeech {
  readonly name = "orpheus" as const;
  private audio: HTMLAudioElement | null = null;
  private cache = new Map<string, Promise<Blob>>();
  private pendingResolve: (() => void) | null = null;
  private playing = false;
  remaining: number | null = null;

  constructor(private readonly token: string) {}

  get supported() {
    return typeof window !== "undefined";
  }

  get speaking() {
    return this.playing;
  }

  private fetchAudio(text: string): Promise<Blob> {
    let p = this.cache.get(text);
    if (!p) {
      p = fetch("/api/candidate/tts", {
        method: "POST",
        headers: { "content-type": "application/json", "x-proctra-token": this.token },
        body: JSON.stringify({ text }),
      }).then(async (res) => {
        const left = res.headers.get("x-tts-remaining");
        if (left) this.remaining = Number(left);
        if (res.status === 429) throw new TtsError("rate_limit");
        if (!res.ok) throw new TtsError(`voice service ${res.status}`);
        return res.blob();
      });
      this.cache.set(text, p);
      p.catch(() => this.cache.delete(text));
      if (this.cache.size > 30) this.cache.delete(this.cache.keys().next().value!);
    }
    return p;
  }

  prefetch(text: string) {
    void this.fetchAudio(text).catch(() => {});
  }

  async speak(text: string): Promise<void> {
    this.cancel();
    const blob = await this.fetchAudio(text);
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
        .catch((e: DOMException) => (cleanup(), reject(new TtsError(e.name === "NotAllowedError" ? "autoplay blocked" : e.message))));
    });
  }

  cancel() {
    this.audio?.pause();
    this.pendingResolve?.();
  }
}
