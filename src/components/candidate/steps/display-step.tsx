"use client";

import { useState } from "react";
import { candidateFetch, type CandidateSession } from "../api";
import type { BrowserSupport } from "./browser-gate";
import type { DeviceResult } from "./device-step";
import type { AudioResult } from "./audio-step";
import { screenShareInfo, shareEntireScreen } from "@/lib/proctoring/edge/screen-share";
import { Button } from "@/components/ui/button";

type ScreenDetails = { screens: unknown[] };

/** Reads display topology. getScreenDetails() needs a permission prompt; isExtended works without one. */
export async function readDisplayTopology(askPermission: boolean) {
  const isExtended = (window.screen as Screen & { isExtended?: boolean }).isExtended ?? null;
  let screenCount: number | null = null;
  const w = window as Window & { getScreenDetails?: () => Promise<ScreenDetails> };
  if (askPermission && w.getScreenDetails) {
    try {
      screenCount = (await w.getScreenDetails()).screens.length;
    } catch {
      screenCount = null; // permission denied: fall back to isExtended
    }
  }
  return { isExtended, screenCount };
}

export function DisplayStep({
  token,
  session,
  support,
  devices,
  audio,
  phonePaired,
  onDone,
}: {
  token: string;
  session: CandidateSession;
  support: BrowserSupport;
  devices: DeviceResult;
  audio: AudioResult;
  phonePaired: boolean;
  onDone: (screen: MediaStream | null) => void;
}) {
  const needFullscreen = session.proctoring.enforce_fullscreen !== false;
  const blockMulti = session.proctoring.block_multi_monitor !== false;
  const needScreen = session.proctoring.require_screen_share !== false;
  const [screen, setScreen] = useState<MediaStream | null>(null);

  async function share() {
    setError(null);
    try {
      screen?.getTracks().forEach((t) => t.stop());
      setScreen(await shareEntireScreen());
    } catch (e) {
      const err = e as DOMException;
      setError(err.name === "NotAllowedError" ? "Screen sharing was cancelled. It's required for this interview." : err.message);
    }
  }
  const [topology, setTopology] = useState<{ isExtended: boolean | null; screenCount: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const multi = Boolean(topology && (topology.isExtended || (topology.screenCount ?? 1) > 1));

  async function check() {
    setError(null);
    setTopology(await readDisplayTopology(blockMulti));
  }

  async function begin() {
    setPending(true);
    setError(null);
    try {
      const t = topology ?? (await readDisplayTopology(false));
      if (blockMulti && (t.isExtended || (t.screenCount ?? 1) > 1)) {
        setTopology(t);
        throw new Error("More than one display is connected. Disconnect or disable extra monitors, then check again.");
      }
      if (needScreen && !screen) throw new Error("Share your entire screen first.");
      if (needFullscreen && !document.fullscreenElement) await document.documentElement.requestFullscreen();
      await candidateFetch(token, "preflight", {
        body: {
          browser: { userAgent: support.userAgent.slice(0, 500), family: support.info.family, chromium: support.info.chromium, speechRecognition: support.speechApi },
          ...devices,
          audio: { ...devices.audio, echoTest: audio.echoTest, detection: devices.audio.detection === "none" && audio.echoTest.ran && audio.echoTest.result === "pass" ? "echo-test" : devices.audio.detection },
          tts: audio.tts,
          screenShare: screen ? screenShareInfo(screen) : null,
          secondaryCamera: { paired: phonePaired },
          display: { fullscreen: Boolean(document.fullscreenElement), isExtended: t.isExtended, screenCount: t.screenCount },
        },
      });
      onDone(screen);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">Display check</h1>
        <p className="text-muted-foreground">
          {blockMulti ? "Use a single screen. " : ""}
          {needFullscreen ? "The interview runs in fullscreen; leaving it is logged for the recruiter." : ""}
        </p>
      </div>
      {blockMulti ? (
        <div className="flex flex-col gap-2 rounded-lg border bg-card p-4 text-sm">
          <p>Chrome may ask to “manage windows on all your displays”. Allow it so we can confirm you&apos;re using one screen.</p>
          <Button size="sm" variant="outline" className="self-start" onClick={check}>
            Check my displays
          </Button>
          {topology ? (
            multi ? (
              <p className="text-danger">
                {topology.screenCount ? `${topology.screenCount} displays` : "An extended display"} detected. Disconnect extra monitors and check
                again.
              </p>
            ) : (
              <p className="text-success">Single display confirmed.</p>
            )
          ) : null}
        </div>
      ) : null}
      {needScreen ? (
        <div className="flex flex-col gap-2 rounded-lg border bg-card p-4 text-sm">
          <p>Share your <strong>entire screen</strong>. It&apos;s recorded for the recruiter, and stopping it pauses the interview.</p>
          <Button size="sm" variant={screen ? "outline" : "default"} className="self-start" onClick={share} data-testid="share-screen">
            {screen ? "Share again" : "Share entire screen"}
          </Button>
          {screen ? <p className="text-success" data-testid="screen-ok">✓ Entire screen shared ({screenShareInfo(screen).width}×{screenShareInfo(screen).height})</p> : null}
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div>
        <Button size="lg" onClick={begin} disabled={pending || (blockMulti && (!topology || multi)) || (needScreen && !screen)}>
          {pending ? "Starting…" : needFullscreen ? "Enter fullscreen & start interview" : "Start interview"}
        </Button>
      </div>
    </div>
  );
}
