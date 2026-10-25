/** Bug-fix smoke: browser detection (brands, not UA), STT error mapping, audio-check helpers. */
import { describe, expect, it } from "vitest";
import { detectBrowser } from "@/lib/browser/detect";
import { mapSttError } from "@/lib/speech/stt-errors";
import { headphoneLabelMatch, judgeEcho, meterLevel, realInputs, resolveInputLabel } from "@/lib/speech/audio-checks";

const b = (...brands: string[]) => brands.map((brand) => ({ brand }));

describe("browser detection", () => {
  it("identifies Chrome and Edge as having native speech", () => {
    expect(detectBrowser({ brands: b("Chromium", "Google Chrome", "Not=A?Brand") })).toMatchObject({ family: "chrome", nativeSpeech: true });
    expect(detectBrowser({ brands: b("Chromium", "Microsoft Edge", "Not=A?Brand") })).toMatchObject({ family: "edge", nativeSpeech: true });
  });

  it("identifies Brave even though it sends Chrome brands/UA, and gives it no native speech", () => {
    expect(detectBrowser({ brands: b("Chromium", "Google Chrome"), isBrave: true })).toMatchObject({ family: "brave", nativeSpeech: false });
    expect(detectBrowser({ brands: b("Chromium", "Brave", "Not.A/Brand") })).toMatchObject({ family: "brave", nativeSpeech: false });
  });

  it("identifies Opera, Arc, Vivaldi/plain Chromium and non-Chromium", () => {
    expect(detectBrowser({ brands: b("Chromium", "Opera") }).family).toBe("opera");
    expect(detectBrowser({ brands: b("Chromium", "Google Chrome"), arcPalette: true }).family).toBe("arc");
    expect(detectBrowser({ brands: b("Chromium", "Not_A Brand") })).toMatchObject({ family: "chromium", nativeSpeech: false });
    expect(detectBrowser({})).toMatchObject({ family: "non-chromium", chromium: false });
  });
});

describe("speech-recognition error mapping", () => {
  it("only blames the network when the browser is actually offline", () => {
    expect(mapSttError("network", true)).toMatchObject({ kind: "service", useServerFallback: true });
    expect(mapSttError("network", true).message).not.toMatch(/internet/i);
    expect(mapSttError("network", false)).toMatchObject({ kind: "offline", useServerFallback: false });
    expect(mapSttError("network", false).message).toMatch(/offline/i);
  });

  it("maps every code to its real cause", () => {
    expect(mapSttError("not-allowed", true)).toMatchObject({ kind: "permission", useServerFallback: false, fatal: true });
    expect(mapSttError("service-not-allowed", true)).toMatchObject({ kind: "service", useServerFallback: true });
    expect(mapSttError("audio-capture", true)).toMatchObject({ kind: "device", useServerFallback: false });
    expect(mapSttError("language-not-supported", true)).toMatchObject({ kind: "language", useServerFallback: true });
    expect(mapSttError("no-speech", true)).toMatchObject({ kind: "transient", fatal: false });
    expect(mapSttError("aborted", true)).toMatchObject({ kind: "transient", fatal: false });
    expect(mapSttError("something-new", true)).toMatchObject({ useServerFallback: true });
  });
});

describe("audio checks", () => {
  it("scales the meter in dB so normal speech moves the bar", () => {
    expect(meterLevel(0)).toBe(0);
    expect(meterLevel(0.001)).toBe(0); // −60 dBFS: silence
    expect(meterLevel(0.03)).toBeGreaterThan(0.45); // ≈ −30 dBFS: normal speech ≈ half way
    expect(meterLevel(0.5)).toBe(1);
  });

  it("names the real microphone instead of 'Default'", () => {
    const devices = [
      { deviceId: "default", groupId: "g1", kind: "audioinput", label: "Default" },
      { deviceId: "abc", groupId: "g1", kind: "audioinput", label: "Built-in Audio Analog Stereo" },
      { deviceId: "out", groupId: "g2", kind: "audiooutput", label: "WH-1000XM4" },
    ];
    expect(resolveInputLabel("Default", "default", devices)).toBe("Built-in Audio Analog Stereo");
    expect(resolveInputLabel("Default - USB Mic", "x", devices)).toBe("USB Mic");
    expect(realInputs(devices)).toHaveLength(1);
  });

  it("matches headphones on input or output labels", () => {
    expect(headphoneLabelMatch([{ deviceId: "o", groupId: "", kind: "audiooutput", label: "Bluetooth Headset (AirPods Pro)" }])).toBe(true);
    expect(headphoneLabelMatch([{ deviceId: "o", groupId: "", kind: "audiooutput", label: "Built-in Speakers" }])).toBe(false);
  });

  it("judges echo pickup", () => {
    expect(judgeEcho(0.004, 0.006).result).toBe("pass"); // headphones: mic barely changes
    expect(judgeEcho(0.004, 0.08).result).toBe("warn"); // speakers: interviewer clearly audible
  });
});

describe("Whisper prompt-echo filter", () => {
  it("drops output that just repeats the vocabulary prompt, keeps real answers", async () => {
    const { isPromptEcho } = await import("@/lib/speech/groq-whisper");
    const prompt = "How do you make a Kafka consumer idempotent? In my answer I talk about Java, Kafka, PostgreSQL.";
    expect(isPromptEcho("Kafka, PostgreSQL. Kafka, PostgreSQL.", prompt)).toBe(true);
    expect(isPromptEcho("We store processed event ids in Postgres in the same transaction as the ledger update.", prompt)).toBe(false);
    expect(isPromptEcho("", prompt)).toBe(false);
  });
});
