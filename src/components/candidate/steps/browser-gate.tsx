"use client";

import { useSyncExternalStore } from "react";

export interface BrowserSupport {
  chromium: boolean;
  speechRecognition: boolean;
  mediaDevices: boolean;
  fullscreen: boolean;
  userAgent: string;
}

function detect(): BrowserSupport {
  const nav = navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } };
  const brands = nav.userAgentData?.brands?.map((b) => b.brand) ?? [];
  const w = window as unknown as Record<string, unknown>;
  return {
    // Chrome and Edge expose the "Chromium" brand; Firefox/Safari have no userAgentData.
    chromium: brands.some((b) => /Chromium|Google Chrome|Microsoft Edge/.test(b)),
    speechRecognition: Boolean(w.SpeechRecognition || w.webkitSpeechRecognition),
    mediaDevices: Boolean(navigator.mediaDevices?.getUserMedia),
    fullscreen: Boolean(document.documentElement.requestFullscreen),
    userAgent: navigator.userAgent,
  };
}

let cached: BrowserSupport | null = null;
const snapshot = () => (cached ??= detect());
const subscribe = () => () => {};

export function useBrowserSupport(): BrowserSupport | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}

/** Blocks non-Chromium browsers: multi-monitor detection and speech recognition need Chrome/Edge. */
export function BrowserGate({ support, children }: { support: BrowserSupport | null; children: React.ReactNode }) {
  if (!support) return null;
  const ok = support.chromium && support.speechRecognition && support.mediaDevices;
  if (ok) return <>{children}</>;
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 rounded-xl border bg-card p-8 text-center">
      <h1 className="text-xl font-semibold">Please switch to Chrome or Edge</h1>
      <p className="text-muted-foreground">
        This interview uses speech recognition and display checks that only work in a current version of Google Chrome or
        Microsoft Edge on a desktop or laptop computer.
      </p>
      <ul className="text-left text-sm text-muted-foreground">
        <li>{support.chromium ? "✓" : "✗"} Chrome or Edge browser</li>
        <li>{support.speechRecognition ? "✓" : "✗"} Speech recognition</li>
        <li>{support.mediaDevices ? "✓" : "✗"} Camera and microphone access (requires HTTPS)</li>
      </ul>
      <p className="text-sm">Copy this page&apos;s link and open it in Chrome or Edge.</p>
    </div>
  );
}
