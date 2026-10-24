"use client";

import { useEffect, useRef, useState } from "react";
import { WebSpeechSTT } from "@/lib/speech/web-speech-stt";
import { Button } from "@/components/ui/button";

export interface DeviceResult {
  camera: { ok: boolean; label: string | null; width: number | null; height: number | null };
  microphone: { ok: boolean; label: string | null; peakLevel: number };
  speechTest: { ok: boolean; heard: string };
}

/** Camera preview, mic level meter and a short speech-recognition test. Keeps the stream for the interview. */
export function DeviceStep({ onDone }: { onDone: (stream: MediaStream, result: DeviceResult) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const peak = useRef(0);
  const [heard, setHeard] = useState("");
  const [listening, setListening] = useState(false);

  async function enable() {
    setError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      setStream(s);
    } catch (e) {
      const name = (e as DOMException).name;
      setError(
        name === "NotAllowedError"
          ? "Camera/microphone permission was blocked. Click the camera icon in the address bar, allow access, and try again."
          : name === "NotFoundError"
            ? "No camera or microphone was found. Connect one and try again."
            : `Couldn't start your camera or microphone (${name}). Close other apps using them and try again.`,
      );
    }
  }

  // Preview + level meter.
  useEffect(() => {
    if (!stream) return;
    if (video.current) video.current.srcObject = stream;
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    let raf = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += ((v - 128) / 128) ** 2;
      const rms = Math.min(1, Math.sqrt(sum / data.length) * 4);
      peak.current = Math.max(peak.current, rms);
      setLevel(rms);
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      void ctx.close();
    };
  }, [stream]);

  function speechTest() {
    const stt = new WebSpeechSTT();
    setListening(true);
    setHeard("");
    const off = stt.onResult((r) => {
      setHeard(r.text);
      if (r.isFinal && r.text.trim()) {
        stt.stop();
        setListening(false);
        off();
      }
    });
    stt.onError((m) => {
      setListening(false);
      setError(m === "network" ? "Speech recognition needs an internet connection." : `Speech recognition error: ${m}`);
    });
    stt.start();
    setTimeout(() => {
      stt.stop();
      setListening(false);
    }, 10000);
  }

  const vTrack = stream?.getVideoTracks()[0];
  const aTrack = stream?.getAudioTracks()[0];
  const settings = vTrack?.getSettings();
  const ok = Boolean(stream) && heard.trim().length > 0;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">Camera & microphone check</h1>
        <p className="text-muted-foreground">Make sure your face is well lit and centred, and that we can hear you.</p>
      </div>
      {!stream ? (
        <Button size="lg" onClick={enable} className="self-start">
          Allow camera & microphone
        </Button>
      ) : (
        <div className="grid gap-4 md:grid-cols-[1fr_260px]">
          <video ref={video} autoPlay muted playsInline className="aspect-video w-full rounded-xl bg-black object-cover [transform:scaleX(-1)]" />
          <div className="flex flex-col gap-4 text-sm">
            <div>
              <p className="font-medium">Camera</p>
              <p className="text-muted-foreground">{vTrack?.label || "Camera"}</p>
              <p className="font-mono text-xs text-muted-foreground">
                {settings?.width}×{settings?.height}
              </p>
            </div>
            <div>
              <p className="font-medium">Microphone level</p>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted" aria-label="Microphone level">
                <div className="h-full bg-success transition-[width]" style={{ width: `${Math.round(level * 100)}%` }} />
              </div>
              <p className="mt-1 text-muted-foreground">{aTrack?.label || "Microphone"}</p>
            </div>
            <div>
              <p className="font-medium">Speech test</p>
              <p className="text-muted-foreground">Click below and say “I am ready to begin”.</p>
              <Button size="sm" variant="outline" className="mt-2" onClick={speechTest} disabled={listening}>
                {listening ? "Listening…" : heard ? "Test again" : "Start speech test"}
              </Button>
              {heard ? <p className="mt-2 rounded bg-muted p-2">“{heard}”</p> : null}
            </div>
          </div>
        </div>
      )}
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
              microphone: { ok: Boolean(aTrack), label: aTrack?.label ?? null, peakLevel: Math.round(peak.current * 100) / 100 },
              speechTest: { ok: true, heard: heard.slice(0, 300) },
            })
          }
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
