"use client";

import { judgeEcho, type EchoTestResult } from "./audio-checks";
import type { TextToSpeech } from "./types";

const AUDIO = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

async function averageRms(analyser: AnalyserNode, ms: number) {
  const buf = new Float32Array(analyser.fftSize);
  const end = performance.now() + ms;
  let sum = 0;
  let n = 0;
  while (performance.now() < end) {
    analyser.getFloatTimeDomainData(buf);
    let s = 0;
    for (const v of buf) s += v * v;
    sum += Math.sqrt(s / buf.length);
    n++;
    await new Promise((r) => setTimeout(r, 50));
  }
  return n ? sum / n : 0;
}

/**
 * Plays a phrase with the interview's actual TTS engine and measures how much reaches the
 * echo-cancelled mic: the signal that decides whether barge-in will see false interruptions.
 */
export async function runEchoTest(tts: TextToSpeech, deviceId?: string): Promise<EchoTestResult> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: deviceId ? { ...AUDIO, deviceId: { exact: deviceId } } : AUDIO });
  const ctx = new AudioContext();
  try {
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const baseline = await averageRms(analyser, 800);
    const speaking = tts.speak("This is a short audio test. Please stay quiet for a moment.");
    await new Promise((r) => setTimeout(r, 400));
    const during = await averageRms(analyser, 1800);
    await speaking;
    return judgeEcho(baseline, during);
  } finally {
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close();
  }
}
