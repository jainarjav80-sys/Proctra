"use client";

import { loadKokoro } from "./kokoro-tts";
import { getTts } from "./tts";
import type { TextToSpeech } from "./types";

export type PlayResult = "done" | "interrupted";

export interface SpeakerHooks {
  /** A sentence is about to play (used for VAD echo calibration and test instrumentation). */
  onSentenceStart?: (index: number, text: string) => void;
  onSentenceEnd?: (index: number) => void;
  /** User-facing problem (engine switched, or audio unavailable → captions only). */
  onProblem?: (message: string | null) => void;
}

/**
 * Plays text sentence by sentence through the current TTS engine, so speech can be stopped
 * instantly (barge-in) and resumed from the interrupted sentence. Prefetches the next sentence
 * while one plays. If the browser voice fails mid-interview it switches to Kokoro and retries;
 * if no engine works, it carries on silently (captions show the text).
 */
export class SentenceSpeaker {
  private token = 0;
  index = 0;
  sentences: string[] = [];

  constructor(
    public tts: TextToSpeech,
    private readonly hooks: SpeakerHooks = {},
  ) {}

  get speaking() {
    return this.tts.speaking;
  }

  /** Stops playback now; a pending play() resolves "interrupted". */
  interrupt() {
    this.token++;
    this.tts.cancel();
  }

  async play(sentences: string[], from = 0): Promise<PlayResult> {
    const token = ++this.token;
    this.tts.cancel();
    this.sentences = sentences;
    for (let i = from; i < sentences.length; i++) {
      if (token !== this.token) return "interrupted";
      this.index = i;
      if (sentences[i + 1]) this.tts.prefetch?.(sentences[i + 1]);
      this.hooks.onSentenceStart?.(i, sentences[i]);
      try {
        await this.tts.speak(sentences[i]);
      } catch {
        await this.recover(sentences[i], token);
      }
      if (token !== this.token) return "interrupted";
      this.hooks.onSentenceEnd?.(i);
    }
    return token === this.token ? "done" : "interrupted";
  }

  private async recover(sentence: string, token: number) {
    if (this.tts.name === "speech-synthesis") {
      this.hooks.onProblem?.("The browser voice stopped working. Switching to Proctra's voice…");
      try {
        await loadKokoro();
        this.tts = getTts("kokoro");
        if (token === this.token) await this.tts.speak(sentence);
        this.hooks.onProblem?.(null);
        return;
      } catch {
        /* fall through */
      }
    }
    this.hooks.onProblem?.("Audio isn't available right now. Please read the question on screen.");
  }
}
