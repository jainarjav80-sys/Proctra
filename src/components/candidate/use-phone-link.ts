"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { DesktopLink, type LinkStatus } from "@/lib/companion/rtc";
import { candidateFetch } from "./api";

interface Pairing {
  url: string;
  qr: string;
  expiresAt: number;
}

/**
 * Desktop side of phone pairing. `pair()` issues a fresh single-use QR (300 s) and listens on its
 * channel; calling it again (expiry or reconnect) replaces the previous pairing.
 */
export function usePhoneLink(token: string) {
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [status, setStatus] = useState<LinkStatus | "idle">("idle");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const link = useRef<DesktopLink | null>(null);

  const pair = useCallback(async () => {
    setError(null);
    try {
      const p = await candidateFetch<{ url: string; expiresAt: string; channel: string; iceServers: RTCIceServer[] }>(token, "pair", { body: {} });
      link.current?.close();
      const l = new DesktopLink(p.channel, p.iceServers, (s, st) => {
        setStatus(s);
        setStream(st);
      });
      link.current = l;
      await l.start();
      setStatus((prev) => (prev === "connected" ? prev : "waiting"));
      setPairing({ url: p.url, qr: await QRCode.toDataURL(p.url, { margin: 1, width: 240, errorCorrectionLevel: "M" }), expiresAt: new Date(p.expiresAt).getTime() });
    } catch (e) {
      setError((e as Error).message);
    }
  }, [token]);

  useEffect(() => () => link.current?.close(), []);

  return { pairing, status, stream, error, pair, connected: status === "connected" };
}
