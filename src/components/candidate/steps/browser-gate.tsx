"use client";

import { useEffect, useState } from "react";
import { detectBrowser, readBrowserSignals, type BrowserInfo } from "@/lib/browser/detect";
import type { SttEngine } from "@/lib/speech/types";

export interface BrowserSupport {
  info: BrowserInfo;
  speechApi: boolean;
  mediaDevices: boolean;
  mediaRecorder: boolean;
  fullscreen: boolean;
  /** screen.isExtended or getScreenDetails() exists (needed to enforce a single display). */
  windowManagement: boolean;
  userAgent: string;
  /** Engine to try first: native Web Speech only where it has a real backend. */
  preferredEngine: SttEngine;
}

export function useBrowserSupport(): BrowserSupport | null {
  const [support, setSupport] = useState<BrowserSupport | null>(null);
  useEffect(() => {
    let alive = true;
    void readBrowserSignals().then((signals) => {
      if (!alive) return;
      const info = detectBrowser(signals);
      const w = window as unknown as Record<string, unknown>;
      const speechApi = Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
      setSupport({
        info,
        speechApi,
        mediaDevices: Boolean(navigator.mediaDevices?.getUserMedia),
        mediaRecorder: typeof MediaRecorder !== "undefined",
        fullscreen: Boolean(document.documentElement.requestFullscreen),
        windowManagement: "getScreenDetails" in window || typeof (screen as Screen & { isExtended?: boolean }).isExtended === "boolean",
        userAgent: navigator.userAgent,
        preferredEngine: info.nativeSpeech && speechApi ? "web-speech" : "groq-whisper",
      });
    });
    return () => {
      alive = false;
    };
  }, []);
  return support;
}

/** Why this browser can't run a proctored interview, or null if it can. */
export function blockReason(s: BrowserSupport, needSingleDisplay: boolean): string | null {
  if (!s.info.chromium) return "Proctored interviews need Google Chrome or Microsoft Edge (or another Chromium-based browser).";
  if (!s.mediaDevices) return "Camera and microphone access isn't available. The page must be opened over HTTPS.";
  if (!s.mediaRecorder) return "This browser can't record audio, which the interview needs.";
  if (needSingleDisplay && !s.windowManagement) {
    return `${s.info.label} blocks the display check used to confirm you're on a single screen. Please use Google Chrome or Microsoft Edge.`;
  }
  return null;
}

/**
 * Gate before onboarding. Chrome/Edge use their built-in speech recognition. Other Chromium browsers
 * (Brave, Opera, Vivaldi, Arc) are allowed with Proctra's server speech recognition, as long as the
 * proctoring APIs still work in them. Firefox and Safari are blocked: no Window Management API.
 */
export function BrowserGate({ support, needSingleDisplay, children }: { support: BrowserSupport | null; needSingleDisplay: boolean; children: React.ReactNode }) {
  if (!support) return <p className="text-center text-muted-foreground">Checking your browser…</p>;
  const reason = blockReason(support, needSingleDisplay);
  if (!reason) return <>{children}</>;
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 rounded-xl border bg-card p-8 text-center">
      <h1 className="text-xl font-semibold">Please switch browsers</h1>
      <p className="text-muted-foreground">{reason}</p>
      <ul className="text-left text-sm text-muted-foreground">
        <li>{support.info.chromium ? "✓" : "✗"} Chromium-based browser (detected: {support.info.label})</li>
        <li>{support.mediaDevices ? "✓" : "✗"} Camera and microphone access</li>
        <li>{support.mediaRecorder ? "✓" : "✗"} Audio recording</li>
        {needSingleDisplay ? <li>{support.windowManagement ? "✓" : "✗"} Display check (Window Management API)</li> : null}
      </ul>
      <p className="text-sm">Copy this page&apos;s link and open it in Chrome or Edge.</p>
    </div>
  );
}
