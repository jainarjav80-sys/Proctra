"use client";

import { useEffect, useState } from "react";
import { BrowserTTS } from "@/lib/speech/browser-tts";
import { loadKokoro, type LoadProgress } from "@/lib/speech/kokoro-tts";
import { runEchoTest } from "@/lib/speech/echo-test";
import { getTts } from "@/lib/speech/tts";
import type { EchoTestResult } from "@/lib/speech/audio-checks";
import type { TtsEngine } from "@/lib/speech/types";
import { Button } from "@/components/ui/button";

export interface AudioResult {
  tts: {
    engine: TtsEngine;
    browserProbe: { ok: boolean; voices: number; english: number; voice: string | null; reason: string | null };
    heardConfirmed: true;
    kokoroLoadMs: number | null;
  };
  echoTest: (EchoTestResult & { ran: true }) | { ran: false };
}

const SAMPLE = "Hello, I'm your interviewer. If you can hear me clearly, press yes.";

/**
 * "Can you hear the interviewer?": picks a TTS engine that actually produces sound here, plays a
 * sample on click (satisfies autoplay rules), and only continues once the candidate confirms.
 */
export function AudioStep({ micDeviceId, onDone }: { micDeviceId?: string; onDone: (r: AudioResult) => void }) {
  const [probe, setProbe] = useState<AudioResult["tts"]["browserProbe"] | null>(null);
  const [engine, setEngine] = useState<TtsEngine | null>(null);
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [kokoroMs, setKokoroMs] = useState<number | null>(null);
  const [phase, setPhase] = useState<"checking" | "loading" | "ready" | "playing" | "asked" | "failed">("checking");
  const [played, setPlayed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [echo, setEcho] = useState<EchoTestResult | null>(null);
  const [echoRunning, setEchoRunning] = useState(false);

  async function switchToKokoro() {
    setEngine("kokoro");
    setPhase("loading");
    const t0 = performance.now();
    try {
      await loadKokoro(setProgress);
      setKokoroMs(Math.round(performance.now() - t0));
      setPhase("ready");
    } catch (e) {
      setError(`The interviewer voice couldn't be loaded (${(e as Error).message}). Check your connection and reload.`);
      setPhase("failed");
    }
  }

  useEffect(() => {
    let alive = true;
    void BrowserTTS.probe().then((p) => {
      if (!alive) return;
      setProbe(p);
      if (p.ok) {
        setEngine("speech-synthesis");
        setPhase("ready");
      } else void switchToKokoro();
    });
    return () => {
      alive = false;
    };
  }, []);

  async function play() {
    if (!engine) return;
    setError(null);
    setPhase("playing");
    try {
      await getTts(engine).speak(SAMPLE);
      setPlayed(true);
      setPhase("asked");
    } catch (e) {
      // This engine can't make sound here: fall through to the next one.
      if (engine === "speech-synthesis") {
        setError("Your browser's built-in voice failed. Loading Proctra's voice instead…");
        await switchToKokoro();
      } else {
        setError(`Audio playback failed (${(e as Error).message}).`);
        setPhase("failed");
      }
    }
  }

  async function notHeard() {
    if (engine === "speech-synthesis") {
      setError("Trying Proctra's own interviewer voice instead…");
      setPlayed(false);
      await switchToKokoro();
    } else {
      setPhase("failed");
      setError(null);
    }
  }

  async function echoTest() {
    if (!engine) return;
    setEchoRunning(true);
    try {
      setEcho(await runEchoTest(getTts(engine), micDeviceId));
    } catch {
      setError("The echo test couldn't access your microphone.");
    } finally {
      setEchoRunning(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">Can you hear the interviewer?</h1>
        <p className="text-muted-foreground">Turn your volume up, then play the sample. Questions are also shown as captions.</p>
      </div>

      {phase === "checking" ? <p className="text-muted-foreground">Checking audio…</p> : null}
      {phase === "loading" ? (
        <div className="flex flex-col gap-2" aria-live="polite">
          <p className="text-sm">Loading the interviewer voice (one-time download{progress ? `, ${progress.loadedMB} of ${progress.totalMB} MB` : ""})…</p>
          <div className="h-2 w-full max-w-md overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={progress?.pct ?? 0} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-primary transition-[width]" style={{ width: `${progress?.pct ?? 0}%` }} />
          </div>
        </div>
      ) : null}

      {phase !== "checking" && phase !== "loading" && phase !== "failed" ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={play} disabled={phase === "playing"} data-testid="play-sample">
            {phase === "playing" ? "Playing…" : played ? "Play again" : "Play sample"}
          </Button>
          {phase === "asked" ? (
            <>
              <span className="text-sm">Did you hear it?</span>
              <Button
                data-testid="heard-yes"
                onClick={() =>
                  onDone({
                    tts: { engine: engine!, browserProbe: probe!, heardConfirmed: true, kokoroLoadMs: kokoroMs },
                    echoTest: echo ? { ...echo, ran: true } : { ran: false },
                  })
                }
              >
                Yes, I heard it
              </Button>
              <Button variant="outline" onClick={notHeard} data-testid="heard-no">
                No
              </Button>
            </>
          ) : null}
        </div>
      ) : null}
      {engine ? (
        <p className="text-xs text-muted-foreground" data-testid="tts-engine">
          Voice: {engine === "speech-synthesis" ? `your browser's voice (${probe?.voice})` : "Proctra neural voice (runs on this device)"}
        </p>
      ) : null}

      {played ? (
        <div className={`flex flex-col gap-2 rounded-md border p-3 text-sm ${echo?.result === "warn" ? "border-warning bg-warning-soft text-slate-900" : "text-muted-foreground"}`}>
          <p>
            {echo?.result === "pass"
              ? "Echo test passed: your microphone barely picks up the interviewer."
              : echo?.result === "warn"
                ? "Your microphone picks up the interviewer from your speakers, which may be mistaken for you interrupting. Headphones are recommended."
                : "Optional: run an echo test to check whether the interviewer's voice leaks into your microphone."}
          </p>
          <Button size="sm" variant="outline" className="self-start" onClick={echoTest} disabled={echoRunning}>
            {echoRunning ? "Testing… stay quiet" : echo ? "Run echo test again" : "Run echo test"}
          </Button>
        </div>
      ) : null}

      {phase === "failed" ? (
        <div role="alert" className="flex flex-col gap-2 rounded-md border border-danger bg-danger-soft p-4 text-sm text-slate-900">
          <p className="font-medium">We couldn&apos;t play audio on this device.</p>
          <ul className="list-disc pl-5">
            <li>Check the system volume and that the right speaker/headphones are selected.</li>
            <li>Make sure this tab isn&apos;t muted (right-click the tab → Unmute site).</li>
            <li>Try Google Chrome or Microsoft Edge, then reopen your interview link.</li>
          </ul>
          <Button size="sm" variant="outline" className="self-start" onClick={() => location.reload()}>
            Try again
          </Button>
        </div>
      ) : null}
      {error ? <p className="text-sm text-warning">{error}</p> : null}
    </div>
  );
}
