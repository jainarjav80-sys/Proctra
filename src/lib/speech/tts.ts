"use client";

import { BrowserTTS } from "./browser-tts";
import { KokoroTTS } from "./kokoro-tts";
import type { TextToSpeech, TtsEngine } from "./types";

/** Engine instances are shared so a model loaded during onboarding is reused in the interview. */
const instances: Partial<Record<TtsEngine, TextToSpeech>> = {};

export function getTts(engine: TtsEngine): TextToSpeech {
  return (instances[engine] ??= engine === "kokoro" ? new KokoroTTS() : new BrowserTTS());
}

/** Order to try: the browser's own voice first (zero download), then in-browser Kokoro. */
export const TTS_CHAIN: TtsEngine[] = ["speech-synthesis", "kokoro"];
