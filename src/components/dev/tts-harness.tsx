"use client";

import { useState } from "react";
import { BrowserTTS } from "@/lib/speech/browser-tts";
import { loadKokoro } from "@/lib/speech/kokoro-tts";
import { SentenceSpeaker } from "@/lib/speech/sentence-speaker";
import { getTts } from "@/lib/speech/tts";
import type { TtsEngine } from "@/lib/speech/types";

type Log = { t: number; event: string; index?: number; detail?: string };
declare global {
  interface Window {
    __tts?: { log: Log[]; speaker: SentenceSpeaker | null; engine: TtsEngine | null; probe: unknown; play: (from?: number) => Promise<string>; interrupt: () => void };
  }
}

export const HARNESS_SENTENCES = [
  "Thank you for joining today.",
  "How do you make a Kafka consumer idempotent when the same payment event can be delivered more than once?",
  "Take your time to answer.",
];

/** Picks the engine exactly like onboarding (browser voice only if a real utterance starts, else Kokoro). */
export function TtsHarness() {
  const [status, setStatus] = useState("idle");
  async function init() {
    const log: Log[] = [];
    const t0 = performance.now();
    const at = () => Math.round(performance.now() - t0);
    setStatus("probing");
    const probe = await BrowserTTS.probe();
    let engine: TtsEngine = probe.ok ? "speech-synthesis" : "kokoro";
    if (engine === "kokoro") {
      setStatus("loading kokoro");
      await loadKokoro();
    }
    // Instrument real playback: audio elements' play/ended events and speechSynthesis start/end.
    const origPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      this.addEventListener("playing", () => log.push({ t: at(), event: "audio-playing" }), { once: true });
      this.addEventListener("ended", () => log.push({ t: at(), event: "audio-ended" }), { once: true });
      this.addEventListener("pause", () => !this.ended && log.push({ t: at(), event: "audio-paused" }), { once: true });
      return origPlay.call(this);
    };
    const speaker = new SentenceSpeaker(getTts(engine), {
      onSentenceStart: (i) => log.push({ t: at(), event: "sentence-start", index: i }),
      onSentenceEnd: (i) => log.push({ t: at(), event: "sentence-end", index: i }),
      onProblem: (m) => m && log.push({ t: at(), event: "problem", detail: m }),
    });
    engine = speaker.tts.name;
    window.__tts = {
      log,
      speaker,
      engine,
      probe,
      play: async (from = 0) => {
        const r = await speaker.play(HARNESS_SENTENCES, from);
        log.push({ t: at(), event: `play-${r}` });
        return r;
      },
      interrupt: () => {
        log.push({ t: at(), event: "interrupt", index: speaker.index });
        speaker.interrupt();
      },
    };
    setStatus(`ready:${engine}`);
  }
  return (
    <main className="p-6">
      <button data-testid="init" onClick={init} className="rounded border px-3 py-1">
        Init audio
      </button>
      <p data-testid="status">{status}</p>
    </main>
  );
}
