"use client";

import { loadKokoro } from "./kokoro-tts";
import { getTts, nextEngine } from "./tts";
import type { TextToSpeech } from "./types";

export type PlayResult = "done" | "interrupted";

export interface SpeakerHooks {
  /** A sentence is about to play (used for VAD echo calibration and test instrumentation). */
  onSentenceStart?: (index: number, text: string) => void;
  onSentenceEnd?: (index: number) => void;
  /** User-facing problem (engine switched, or audio unavailable → captions only). */
  onProblem?: (message: string | null) => void;
  /** The speaker failed over to another engine (recorded on the interview). */
  onEngineChange?: (engine: import("./types").TtsEngine) => void;
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

  /** Fails over along the engine chain (browser voice → Orpheus → Kokoro) and retries the sentence. */
  private async recover(sentence: string, token: number) {
    let next = nextEngine(this.tts.name);
    while (next) {
      this.hooks.onProblem?.(this.tts.name === "orpheus" ? null : "The voice stopped working. Switching to a backup voice…");
      try {
        if (next === "kokoro") await loadKokoro();
        this.tts = getTts(next);
        if (token === this.token) await this.tts.speak(sentence);
        this.hooks.onProblem?.(null);
        this.hooks.onEngineChange?.(next);
        return;
      } catch {
        next = nextEngine(next);
      }
    }
    this.hooks.onProblem?.("Audio isn't available right now. Please read the question on screen.");
  }
}
