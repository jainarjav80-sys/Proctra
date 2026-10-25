"use client";

import { useEffect, useRef, useState } from "react";
import { PhoneLink, type LinkStatus } from "@/lib/companion/rtc";
import { Button } from "@/components/ui/button";

type Phase = "intro" | "pairing" | "live" | "error";

/**
 * Phone side: consume the single-use QR token, open the back camera (no audio), keep the screen
 * awake, and stream to the candidate's computer. Nothing is stored on the phone.
 */
export function PhoneCompanion({ token }: { token: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const link = useRef<PhoneLink | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>("intro");
  const [status, setStatus] = useState<LinkStatus>("waiting");
  const [error, setError] = useState<string | null>(null);
  const [awake, setAwake] = useState<boolean | null>(null);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible" && phase === "live") void link.current?.hello(); // re-offer after the phone wakes
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [phase]);

  useEffect(
    () => () => {
      link.current?.close();
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  async function begin() {
    setPhase("pairing");
    setError(null);
    try {
      const res = await fetch("/api/companion/handshake", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Pairing failed");
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 15, max: 24 } },
        audio: false,
      });
      stream.current = s;
      if (video.current) video.current.srcObject = s;
      try {
        await (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<unknown> } }).wakeLock?.request("screen");
        setAwake(true);
      } catch {
        setAwake(false);
      }
      const l = new PhoneLink(body.channel, body.iceServers, s, setStatus);
      link.current = l;
      await l.start();
      setPhase("live");
    } catch (e) {
      const err = e as DOMException;
      setError(err.name === "NotAllowedError" ? "Camera permission was blocked. Allow camera access for this site in your browser settings, then reload." : err.message);
      setPhase("error");
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <h1 className="text-xl font-semibold">Phone workspace camera</h1>
      {phase === "intro" ? (
        <>
          <p className="text-sm text-muted-foreground">
            This phone will stream a side view of your desk to your interview. Only video is sent (no audio), and nothing is saved on this phone.
          </p>
          <Button size="lg" onClick={begin}>
            Start camera
          </Button>
        </>
      ) : null}
      <video ref={video} autoPlay muted playsInline className={`aspect-[3/4] w-full rounded-xl bg-black object-cover ${phase === "live" || phase === "pairing" ? "" : "hidden"}`} />
      {phase === "live" ? (
        <>
          <p data-testid="companion-status" className={`text-center font-medium ${status === "connected" ? "text-success" : "text-warning"}`}>
            {status === "connected" ? "✓ Connected to your interview" : status === "disconnected" ? "Connection lost. Keep this page open; reconnecting…" : "Connecting to your computer…"}
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Place the phone 1–1.5 m away, beside or behind you at about 45°.</li>
            <li>Make sure the view shows you, your hands, your desk and your computer screen.</li>
            <li>Keep this page open and the phone plugged in{awake === false ? ". Your browser can't keep the screen on, so turn off auto-lock for the interview" : ""}.</li>
          </ul>
        </>
      ) : null}
      {phase === "error" ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
