"use client";

import { BrowserTTS } from "./browser-tts";
import { KokoroTTS } from "./kokoro-tts";
import { OrpheusTTS } from "./orpheus-tts";
import type { TextToSpeech, TtsEngine } from "./types";

/** Engine instances are shared so a model loaded during onboarding is reused in the interview. */
const instances: Partial<Record<TtsEngine, TextToSpeech>> = {};

let candidateToken = "";
/** The Orpheus engine calls a candidate-authenticated route; set the invite token once. */
export function setTtsToken(token: string) {
  candidateToken = token;
}

export function getTts(engine: TtsEngine): TextToSpeech {
  return (instances[engine] ??= engine === "kokoro" ? new KokoroTTS() : engine === "orpheus" ? new OrpheusTTS(candidateToken) : new BrowserTTS());
}

/** Order to try: the browser's own voice (zero download), Groq Orpheus (fast, 100 req/day), Kokoro (on-device). */
export const TTS_CHAIN: TtsEngine[] = ["speech-synthesis", "orpheus", "kokoro"];

export function nextEngine(after: TtsEngine): TtsEngine | null {
  return TTS_CHAIN[TTS_CHAIN.indexOf(after) + 1] ?? null;
}
