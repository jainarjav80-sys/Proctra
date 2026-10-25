"use client";

import { useEffect, useRef, useState } from "react";
import type { usePhoneLink } from "../use-phone-link";
import { Button } from "@/components/ui/button";

type Link = ReturnType<typeof usePhoneLink>;

/** QR code + live preview for the optional/required phone workspace camera. */
export function PhoneQr({ link }: { link: Link }) {
  const preview = useRef<HTMLVideoElement>(null);
  const [now, setNow] = useState(() => Date.now());
  const { pairing, pair, status, stream, connected } = link;

  useEffect(() => {
    if (!pairing && status === "idle") void pair();
  }, [pairing, pair, status]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    // Expired and not yet scanned: issue a new QR automatically.
    if (pairing && !connected && status === "waiting" && now > pairing.expiresAt) void pair();
  }, [now, pairing, connected, status, pair]);
  useEffect(() => {
    if (preview.current) preview.current.srcObject = stream;
  }, [stream]);

  const left = pairing ? Math.max(0, Math.round((pairing.expiresAt - now) / 1000)) : 0;
  return (
    <div className="grid gap-6 md:grid-cols-[260px_1fr]">
      <div className="flex flex-col items-center gap-2">
        {connected ? (
          <video ref={preview} autoPlay muted playsInline className="aspect-[3/4] w-56 rounded-xl border-2 border-success bg-black object-cover" aria-label="Phone camera preview" />
        ) : pairing ? (
          // eslint-disable-next-line @next/next/no-img-element -- generated data URL
          <img src={pairing.qr} alt="QR code to connect your phone" className="size-60 rounded-xl bg-white p-2" data-testid="pair-qr" data-url={pairing.url} />
        ) : (
          <div className="flex size-60 items-center justify-center rounded-xl border text-sm text-muted-foreground">Preparing QR code…</div>
        )}
        <p className={`text-sm font-medium ${connected ? "text-success" : "text-warning"}`} data-testid="phone-status">
          {connected ? "✓ Phone connected" : status === "connecting" ? "Connecting…" : status === "disconnected" ? "Phone disconnected" : "Awaiting scan…"}
        </p>
        {!connected && pairing ? <p className="font-mono text-xs text-muted-foreground">QR expires in {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</p> : null}
        {link.error ? <p className="text-sm text-danger">{link.error}</p> : null}
      </div>
      <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
        <li>Open your phone&apos;s camera app and scan the code. No app install is needed.</li>
        <li>Allow camera access in the page that opens. Use the back camera; audio is never recorded.</li>
        <li>Prop the phone 1–1.5 m away, beside or behind you at about 45°, so it shows you, your hands, your desk and this screen.</li>
        <li>Plug the phone in and keep the page open: the screen stays awake automatically.</li>
        {status === "disconnected" ? (
          <li>
            Lost the connection? <Button size="xs" variant="outline" onClick={() => void pair()}>Show a new QR code</Button>
          </li>
        ) : null}
      </ol>
    </div>
  );
}

export function PhoneStep({ link, required, onDone }: { link: Link; required: boolean; onDone: (paired: boolean) => void }) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">Connect your phone camera</h1>
        <p className="text-muted-foreground">
          Your phone gives a side view of your workspace. {required ? "This interview requires it." : "It's recommended but optional."}
        </p>
      </div>
      <PhoneQr link={link} />
      <div className="flex gap-2">
        <Button size="lg" disabled={!link.connected} onClick={() => onDone(true)}>
          Continue
        </Button>
        {!required ? (
          <Button size="lg" variant="outline" onClick={() => onDone(false)}>
            Skip, continue without phone
          </Button>
        ) : null}
      </div>
    </div>
  );
}
