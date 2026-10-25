"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WebSpeechSTT } from "@/lib/speech/web-speech-stt";
import { WhisperSTT } from "@/lib/speech/whisper-stt";
import { mapSttError } from "@/lib/speech/stt-errors";
import { headphoneLabelMatch, meterLevel, realInputs, resolveInputLabel, smoothLevel, type DeviceLike, type EchoTestResult } from "@/lib/speech/audio-checks";
import type { SpeechToText, SttEngine } from "@/lib/speech/types";
import { FaceTracker } from "@/lib/proctoring/edge/vision";
import { transcribeAudio } from "../api";
import type { BrowserSupport } from "./browser-gate";
import { NativeSelect } from "@/components/forms/native-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

export interface DeviceResult {
  camera: { ok: boolean; label: string | null; width: number | null; height: number | null };
  microphone: { ok: boolean; label: string | null; peakLevel: number };
  speechTest: { ok: boolean; heard: string; engine: SttEngine; nativeError: string | null };
  faceCheck: { status: "passed" | "unavailable"; faces: number };
  audio: {
    headphoneLabelMatch: boolean;
    echoTest: (EchoTestResult & { ran: true }) | { ran: false };
    candidateConfirmedHeadphones: boolean;
    detection: "labels" | "echo-test" | "candidate-confirmed" | "none";
  };
}

const VIDEO = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };
const AUDIO = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

/**
 * Camera preview, mic picker + level meter, a real speech-recognition probe (falls back to server
 * Whisper when the browser's engine has no backend), and an echo test for barge-in reliability.
 */
export function DeviceStep({ token, support, onDone }: { token: string; support: BrowserSupport; onDone: (stream: MediaStream, result: DeviceResult) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const peak = useRef(0);
  const [devices, setDevices] = useState<DeviceLike[]>([]);
  const [engine, setEngine] = useState<SttEngine>(support.preferredEngine);
  const [nativeError, setNativeError] = useState<string | null>(null);
  const [heard, setHeard] = useState("");
  const [probe, setProbe] = useState<"idle" | "listening" | "transcribing">("idle");
  const [confirmedHeadphones, setConfirmedHeadphones] = useState(false);
  const [faceStatus, setFaceStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [faces, setFaces] = useState<number | null>(null);
  const [faceStable, setFaceStable] = useState(false);

  async function open(audioDeviceId?: string) {
    setError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: VIDEO,
        audio: audioDeviceId ? { ...AUDIO, deviceId: { exact: audioDeviceId } } : AUDIO,
      });
      stream?.getTracks().forEach((t) => t.stop());
      setStream(s);
      setDevices((await navigator.mediaDevices.enumerateDevices()).map((d) => ({ deviceId: d.deviceId, groupId: d.groupId, kind: d.kind, label: d.label })));
    } catch (e) {
      const name = (e as DOMException).name;
      setError(
        name === "NotAllowedError"
          ? "Camera/microphone permission was blocked. Click the camera icon in the address bar, allow access, and try again."
          : name === "NotFoundError" || name === "OverconstrainedError"
            ? "That camera or microphone wasn't found. Connect one (or pick another) and try again."
            : `Couldn't start your camera or microphone (${name}). Close other apps using them and try again.`,
      );
    }
  }

  // Preview + dB-scaled level meter.
  useEffect(() => {
    if (!stream) return;
    if (video.current) video.current.srcObject = stream;
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    let raf = 0;
    let shown = 0;
    const tick = () => {
      analyser.getFloatTimeDomainData(buf);
      let s = 0;
      for (const v of buf) s += v * v;
      const lvl = meterLevel(Math.sqrt(s / buf.length));
      shown = smoothLevel(shown, lvl);
      peak.current = Math.max(peak.current, lvl);
      setLevel(shown);
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      void ctx.close();
    };
  }, [stream]);

  const runProbeRef = useRef<((e: SttEngine) => void) | null>(null);

  // Face gate: exactly one face, held for 1.5 s, before continuing (MediaPipe, runs locally).
  useEffect(() => {
    if (!stream || !video.current) return;
    let tracker: FaceTracker | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let oneSince = 0;
    let alive = true;
    FaceTracker.create()
      .then((t) => {
        if (!alive) return t.close();
        tracker = t;
        setFaceStatus("ready");
        timer = setInterval(() => {
          const f = video.current && tracker?.detect(video.current, performance.now());
          if (!f) return;
          setFaces(f.faces);
          if (f.faces === 1) {
            oneSince ||= performance.now();
            if (performance.now() - oneSince >= 1500) setFaceStable(true);
          } else {
            oneSince = 0;
            setFaceStable(false);
          }
        }, 250);
      })
      .catch(() => alive && setFaceStatus("unavailable"));
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
      tracker?.close();
    };
  }, [stream]);

  const finishProbe = useCallback((stt: SpeechToText, text: string) => {
    stt.stop();
    setHeard(text);
    setProbe("idle");
  }, []);

  /** Starts recognition for real and requires an actual transcript (not just "API exists"). */
  const runProbe = useCallback(
    (which: SttEngine) => {
      setError(null);
      setHeard("");
      setProbe("listening");
      const stt: SpeechToText = which === "web-speech" ? new WebSpeechSTT() : new WhisperSTT((blob) => transcribeAudio(token, blob));
      let done = false;
      const timeout = setTimeout(async () => {
        if (done) return;
        if (which === "groq-whisper") {
          setProbe("transcribing");
          await stt.flush();
        }
        if (done) return;
        done = true;
        stt.stop();
        setProbe("idle");
        setError(mapSttError("no-speech", navigator.onLine).message);
      }, 10_000);
      stt.onResult((r) => {
        if (r.isFinal && r.text.trim().split(/\s+/).length >= 2 && !done) {
          done = true;
          clearTimeout(timeout);
          finishProbe(stt, r.text);
        } else if (!r.isFinal && which === "web-speech") setHeard(r.text);
      });
      stt.onError((code) => {
        if (done) return;
        const info = which === "web-speech" ? mapSttError(code, navigator.onLine) : null;
        if (info && info.kind === "transient") return; // no-speech/aborted: keep waiting for the timeout
        done = true;
        clearTimeout(timeout);
        stt.stop();
        setProbe("idle");
        if (info?.useServerFallback) {
          // e.g. Brave/Vivaldi: API exists but has no backend → switch to server Whisper and re-probe.
          setNativeError(code);
          setEngine("groq-whisper");
          setError(info.message);
          setTimeout(() => runProbeRef.current?.("groq-whisper"), 300);
          return;
        }
        setError(info ? info.message : code === "server-busy" ? "The speech service is busy. Try again in a few seconds." : "Proctra's speech service couldn't process the audio. Try again.");
      });
      stt.start();
    },
    [finishProbe, token],
  );

  useEffect(() => {
    runProbeRef.current = runProbe;
  }, [runProbe]);

  const vTrack = stream?.getVideoTracks()[0];
  const aTrack = stream?.getAudioTracks()[0];
  const settings = vTrack?.getSettings();
  const inputs = realInputs(devices);
  const currentInput = aTrack?.getSettings().deviceId;
  const inputLabel = aTrack ? resolveInputLabel(aTrack.label, currentInput, devices) : "";
  const labelsSayHeadphones = headphoneLabelMatch(devices);
  const headphonesOk = labelsSayHeadphones || confirmedHeadphones;
  const faceOk = faceStatus === "unavailable" || faceStable;
  const ok = Boolean(stream) && heard.trim().split(/\s+/).length >= 2 && faceOk;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">Camera & microphone check</h1>
        <p className="text-muted-foreground">Make sure your face is well lit and centred, and that we can hear you.</p>
      </div>
      {!stream ? (
        <Button size="lg" onClick={() => open()} className="self-start">
          Allow camera & microphone
        </Button>
      ) : (
        <div className="grid gap-4 md:grid-cols-[1fr_280px]">
          <video ref={video} autoPlay muted playsInline className="aspect-video w-full rounded-xl bg-black object-cover [transform:scaleX(-1)]" />
          <div className="flex flex-col gap-4 text-sm">
            <div>
              <p className="font-medium">Camera</p>
              <p className="text-muted-foreground">{vTrack?.label || "Camera"}</p>
              <p className="font-mono text-xs text-muted-foreground">
                {settings?.width}×{settings?.height}
              </p>
              <p data-testid="face-check" className={`mt-1 ${faceStatus === "ready" && !faceStable ? "text-warning" : faceStable ? "text-success" : "text-muted-foreground"}`}>
                {faceStatus === "loading"
                  ? "Checking framing…"
                  : faceStatus === "unavailable"
                    ? "Face check unavailable on this device."
                    : faces === 0
                      ? "We can't see your face. Centre yourself and improve the lighting."
                      : faces !== null && faces > 1
                        ? `${faces} faces in view. Only you should be in the frame. Ask others to step out.`
                        : faceStable
                          ? "✓ One face, well framed."
                          : "Hold still for a moment…"}
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <p className="font-medium">Microphone</p>
              {inputs.length > 1 ? (
                <NativeSelect aria-label="Microphone" data-testid="mic-name" value={inputs.some((d) => d.deviceId === currentInput) ? currentInput : ""} onChange={(e) => open(e.target.value)}>
                  {!inputs.some((d) => d.deviceId === currentInput) ? <option value="">{inputLabel}</option> : null}
                  {inputs.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || "Microphone"}
                    </option>
                  ))}
                </NativeSelect>
              ) : (
                <p className="text-muted-foreground" data-testid="mic-name">
                  {inputLabel}
                </p>
              )}
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted" role="meter" aria-label="Microphone level" aria-valuenow={Math.round(level * 100)} aria-valuemin={0} aria-valuemax={100}>
                <div className={`h-full transition-[width] duration-75 ${level > 0.85 ? "bg-warning" : "bg-success"}`} style={{ width: `${Math.round(level * 100)}%` }} />
              </div>
              <p className="text-xs text-muted-foreground">Speak normally: the bar should reach about half way.</p>
            </div>
            <div>
              <p className="font-medium">Speech test</p>
              <p className="text-muted-foreground">Click below and say “I am ready to begin”.</p>
              <Button size="sm" variant="outline" className="mt-2" onClick={() => runProbe(engine)} disabled={probe !== "idle"}>
                {probe === "listening" ? "Listening…" : probe === "transcribing" ? "Transcribing…" : heard ? "Test again" : "Start speech test"}
              </Button>
              {heard ? (
                <p className="mt-2 rounded bg-muted p-2" data-testid="speech-heard">
                  “{heard}”
                </p>
              ) : null}
              <p className="mt-1 text-xs text-muted-foreground" data-testid="speech-engine">
                Engine: {engine === "web-speech" ? `${support.info.label} speech recognition` : "Proctra speech service (Whisper)"}
              </p>
            </div>
          </div>
        </div>
      )}

      {stream ? (
        <div className={`flex flex-col gap-2 rounded-md border p-3 text-sm ${headphonesOk ? "text-muted-foreground" : "border-warning bg-warning-soft text-slate-900"}`}>
          <p>
            {labelsSayHeadphones
              ? "Headphones detected. "
              : "Headphones are recommended so the interviewer's voice doesn't echo into your mic (you'll test this on the next step). "}
            You can interrupt the interviewer at any time just by speaking.
          </p>
          {!labelsSayHeadphones ? (
            <label className="flex items-center gap-2">
              <Checkbox checked={confirmedHeadphones} onCheckedChange={(v) => setConfirmedHeadphones(Boolean(v))} />
              I&apos;m using headphones
            </label>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div>
        <Button
          size="lg"
          disabled={!ok}
          onClick={() =>
            stream &&
            onDone(stream, {
              camera: { ok: Boolean(vTrack), label: vTrack?.label ?? null, width: settings?.width ?? null, height: settings?.height ?? null },
              microphone: { ok: Boolean(aTrack), label: inputLabel || null, peakLevel: Math.round(peak.current * 100) / 100 },
              speechTest: { ok: true, heard: heard.slice(0, 300), engine, nativeError },
              faceCheck: { status: faceStatus === "unavailable" ? "unavailable" : "passed", faces: faces ?? 0 },
              audio: {
                headphoneLabelMatch: labelsSayHeadphones,
                echoTest: { ran: false }, // filled in by the audio step, which uses the real TTS engine
                candidateConfirmedHeadphones: confirmedHeadphones,
                detection: labelsSayHeadphones ? "labels" : confirmedHeadphones ? "candidate-confirmed" : "none",
              },
            })
          }
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
