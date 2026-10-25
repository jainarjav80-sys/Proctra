/**
 * Browser-voice path with a mocked speechSynthesis (this laptop's snap browsers have no voices, so
 * real hardware can't exercise it), plus failover order and speech chunking.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Handler = ((e?: { error?: string; charIndex?: number }) => void) | null;
class FakeUtterance {
  text: string;
  voice: unknown = null;
  lang = "";
  rate = 1;
  volume = 1;
  onstart: Handler = null;
  onend: Handler = null;
  onerror: Handler = null;
  onboundary: Handler = null;
  constructor(text: string) {
    this.text = text;
  }
}

function installSpeech(opts: { voices: { name: string; lang: string; localService: boolean }[]; behaviour: "ok" | "fail" }) {
  let current: FakeUtterance | null = null;
  const synth = {
    speaking: false,
    getVoices: () => opts.voices,
    addEventListener: vi.fn(),
    speak: vi.fn((u: FakeUtterance) => {
      current = u;
      synth.speaking = true;
      setTimeout(() => {
        if (current !== u) return;
        if (opts.behaviour === "fail") {
          synth.speaking = false;
          u.onerror?.({ error: "synthesis-failed" });
          return;
        }
        u.onstart?.();
        setTimeout(() => {
          if (current !== u) return;
          synth.speaking = false;
          u.onend?.();
        }, 20);
      }, 5);
    }),
    cancel: vi.fn(() => {
      const u = current;
      current = null;
      synth.speaking = false;
      u?.onerror?.({ error: "interrupted" });
    }),
  };
  vi.stubGlobal("window", { speechSynthesis: synth });
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
  return synth;
}

const VOICES = [
  { name: "Google US English", lang: "en-US", localService: false },
  { name: "espeak de", lang: "de-DE", localService: true },
];

describe("BrowserTTS with a mocked speechSynthesis", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it("probe passes only when an English voice exists and an utterance actually starts", async () => {
    installSpeech({ voices: VOICES, behaviour: "ok" });
    const { BrowserTTS } = await import("@/lib/speech/browser-tts");
    expect(await BrowserTTS.probe()).toMatchObject({ ok: true, voices: 2, english: 1, voice: "Google US English" });
  });

  it("probe fails with zero voices (snap Brave/Chromium on Linux) and when utterances error", async () => {
    installSpeech({ voices: [], behaviour: "ok" });
    let mod = await import("@/lib/speech/browser-tts");
    expect(await mod.BrowserTTS.probe()).toMatchObject({ ok: false, reason: "no English voice installed" });
    vi.resetModules();
    installSpeech({ voices: VOICES, behaviour: "fail" });
    mod = await import("@/lib/speech/browser-tts");
    expect((await mod.BrowserTTS.probe()).reason).toMatch(/synthesis-failed/);
  });

  it("speak resolves on end, rejects on synthesis failure (no more silent success), resolves on cancel", async () => {
    installSpeech({ voices: VOICES, behaviour: "ok" });
    const { BrowserTTS } = await import("@/lib/speech/browser-tts");
    const tts = new BrowserTTS();
    await expect(tts.speak("Hello there.")).resolves.toBeUndefined();
    const pending = tts.speak("A long question that gets interrupted.");
    await new Promise((r) => setTimeout(r, 8));
    tts.cancel(); // barge-in
    await expect(pending).resolves.toBeUndefined();

    vi.resetModules();
    installSpeech({ voices: VOICES, behaviour: "fail" });
    const failing = new (await import("@/lib/speech/browser-tts")).BrowserTTS();
    await expect(failing.speak("Hello.")).rejects.toThrow(/synthesis-failed/);
  });
});

describe("engine chain and chunking", () => {
  it("fails over browser voice → Orpheus → Kokoro", async () => {
    const { TTS_CHAIN, nextEngine } = await import("@/lib/speech/tts");
    expect(TTS_CHAIN).toEqual(["speech-synthesis", "orpheus", "kokoro"]);
    expect(nextEngine("speech-synthesis")).toBe("orpheus");
    expect(nextEngine("orpheus")).toBe("kokoro");
    expect(nextEngine("kokoro")).toBeNull();
  });

  it("merges tiny fragments so short clips don't burn quota or leave gaps", async () => {
    const { chunkForSpeech } = await import("@/lib/speech/sentences");
    expect(chunkForSpeech("Thank you. Question 3. How would you design an idempotent payment consumer for Kafka?")).toEqual([
      "Thank you. Question 3. How would you design an idempotent payment consumer for Kafka?",
    ]);
    expect(chunkForSpeech("Thank you.")).toEqual(["Thank you."]);
  });

  it("splits text into short pieces for Kokoro so the first audio is quick", async () => {
    const { speechPieces } = await import("@/lib/speech/sentences");
    const pieces = speechPieces("Thank you. Question 2. How do you make a Kafka consumer idempotent when the same payment event can be delivered more than once?");
    expect(pieces).toEqual(["Thank you.", "Question 2.", "How do you make a Kafka consumer idempotent", "when the same payment event can be delivered more than once?"]);
    expect(pieces.every((p) => p.length <= 70)).toBe(true);
    expect(speechPieces("Walk me through it, step by step, and tell me what you would monitor first in production.")[0]).toBe("Walk me through it, step by step,");
  });

  it("requests the current sentence before prefetching the next (on-device engines run one at a time)", async () => {
    const { SentenceSpeaker } = await import("@/lib/speech/sentence-speaker");
    const calls: string[] = [];
    const tts = {
      name: "kokoro" as const,
      supported: true,
      speaking: false,
      speak: async (t: string) => void calls.push(`speak:${t}`),
      prefetch: (t: string) => void calls.push(`prefetch:${t}`),
      cancel: () => {},
    };
    await new SentenceSpeaker(tts as never).play(["One.", "Two."]);
    expect(calls).toEqual(["speak:One.", "prefetch:Two.", "speak:Two."]);
  });
});
