"use client";

import { useCallback, useEffect, useState } from "react";
import { shareEntireScreen } from "@/lib/proctoring/edge/screen-share";
import type { PauseReason } from "@/lib/interview/fsm";
import { AudioStep, type AudioResult } from "./steps/audio-step";
import { candidateFetch, type CandidateSession } from "./api";
import { BrowserGate, useBrowserSupport } from "./steps/browser-gate";
import { ConsentStep } from "./steps/consent-step";
import { DeviceStep, type DeviceResult } from "./steps/device-step";
import { DisplayStep } from "./steps/display-step";
import { PhoneQr, PhoneStep } from "./steps/phone-step";
import { InterviewStage } from "./interview-stage";
import { usePhoneLink } from "./use-phone-link";
import { Button } from "@/components/ui/button";

type Step = "consent" | "devices" | "audio" | "phone" | "display" | "interview";
const LABELS: Record<Step, string> = { consent: "Consent", devices: "Camera & mic", audio: "Sound", phone: "Phone camera", display: "Screen", interview: "Interview" };

/**
 * Candidate flow: browser gate → consent → devices → phone camera (if enabled and consented) →
 * display → interview. After a refresh, consent is remembered server-side, but cameras must be
 * re-granted, so a resumed candidate restarts at devices.
 */
export function InterviewApp({ token }: { token: string }) {
  const support = useBrowserSupport();
  const [session, setSession] = useState<CandidateSession | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("consent");
  const [scopes, setScopes] = useState<string[]>([]);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [devices, setDevices] = useState<DeviceResult | null>(null);
  const [phoneUsed, setPhoneUsed] = useState(false);
  const [phoneHelp, setPhoneHelp] = useState(false);
  const [audio, setAudio] = useState<AudioResult | null>(null);
  const [screen, setScreen] = useState<MediaStream | null>(null);
  const [screenLost, setScreenLost] = useState(false);
  const [reshareError, setReshareError] = useState<string | null>(null);
  const phone = usePhoneLink(token);
  const onScreenShareEnded = useCallback(() => setScreenLost(true), []);

  async function reshare() {
    setReshareError(null);
    try {
      const s = await shareEntireScreen();
      screen?.getTracks().forEach((t) => t.stop());
      setScreen(s);
      setScreenLost(false);
    } catch (e) {
      setReshareError((e as Error).message);
    }
  }

  useEffect(() => {
    candidateFetch<CandidateSession>(token, "session")
      .then((s) => {
        setSession(s);
        setScopes(s.consentScopes);
        if (s.consented) setStep("devices");
      })
      .catch((e) => setLoadError((e as Error).message));
  }, [token]);

  if (loadError) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border bg-card p-8 text-center">
        <h1 className="text-xl font-semibold">We couldn&apos;t open this interview</h1>
        <p className="mt-2 text-muted-foreground">{loadError}</p>
      </div>
    );
  }
  if (!session) return <p className="text-center text-muted-foreground">Loading your interview…</p>;
  if (session.status === "COMPLETED" || session.status === "EVALUATING" || session.status === "EVALUATED") {
    return (
      <div className="mx-auto max-w-lg rounded-xl border bg-card p-8 text-center">
        <h1 className="text-xl font-semibold">This interview is complete</h1>
        <p className="mt-2 text-muted-foreground">Thank you. The recruiter will be in touch.</p>
      </div>
    );
  }

  const phoneEnabled = session.secondaryCamPolicy !== "DISABLED" && scopes.includes("SECONDARY_CAMERA");
  const phoneRequired = session.secondaryCamPolicy === "MANDATORY";
  const steps: Step[] = ["consent", "devices", "audio", ...(phoneEnabled ? (["phone"] as Step[]) : []), "display", "interview"];
  // Policy pauses: screen share stopped, or a *required* phone camera dropped (until re-paired).
  const pause: PauseReason | null = screenLost ? "SCREEN_SHARE_STOPPED" : phoneRequired && phoneUsed && !phone.connected ? "PHONE_CAMERA_LOST" : null;

  return (
    <BrowserGate support={support} needSingleDisplay={session.proctoring.block_multi_monitor !== false}>
      {step === "interview" && stream && devices && audio ? (
        <>
          <InterviewStage
            token={token}
            session={session}
            stream={stream}
            engine={devices.speechTest.engine}
            ttsEngine={audio.tts.engine}
            screen={screen}
            pause={pause}
            onScreenShareEnded={onScreenShareEnded}
            secondary={phoneUsed ? { stream: phone.stream, connected: phone.connected, onReconnectHelp: () => setPhoneHelp(true) } : null}
          />
          {pause ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6" role="dialog" aria-modal="true" aria-label="Interview paused" data-testid="pause-dialog">
              <div className="flex max-w-2xl flex-col gap-4 rounded-xl border bg-card p-6">
                <h2 className="text-lg font-semibold">Interview paused</h2>
                {pause === "SCREEN_SHARE_STOPPED" ? (
                  <>
                    <p className="text-sm text-muted-foreground">Screen sharing stopped. Share your entire screen again to continue. The timer is paused, and you&apos;ll resume on the same question.</p>
                    <Button className="self-start" onClick={reshare} data-testid="reshare">
                      Share entire screen
                    </Button>
                    {reshareError ? <p className="text-sm text-danger">{reshareError}</p> : null}
                  </>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">Your phone camera disconnected, and this interview requires it. Reconnect your phone to continue; the timer is paused.</p>
                    <PhoneQr link={phone} />
                  </>
                )}
              </div>
            </div>
          ) : null}
          {phoneHelp && !pause ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6" role="dialog" aria-modal="true" aria-label="Reconnect phone">
              <div className="flex max-w-2xl flex-col gap-4 rounded-xl border bg-card p-6">
                <h2 className="text-lg font-semibold">Reconnect your phone camera</h2>
                <PhoneQr link={phone} />
                <Button className="self-end" onClick={() => setPhoneHelp(false)}>
                  {phone.connected ? "Done" : "Close"}
                </Button>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
          <ol className="flex flex-wrap gap-2 text-xs text-muted-foreground" aria-label="Progress">
            {steps.map((s, i) => (
              <li key={s} className={`flex items-center gap-2 ${s === step ? "font-semibold text-foreground" : ""}`}>
                <span className="flex size-5 items-center justify-center rounded-full border">{i + 1}</span>
                {LABELS[s]}
                {i < steps.length - 1 ? <span aria-hidden>›</span> : null}
              </li>
            ))}
          </ol>
          {step === "consent" ? (
            <ConsentStep
              token={token}
              session={session}
              onDone={(granted) => {
                setScopes(granted);
                setStep("devices");
              }}
            />
          ) : null}
          {step === "devices" && support ? (
            <DeviceStep
              token={token}
              support={support}
              onDone={(s, r) => {
                setStream(s);
                setDevices(r);
                setStep("audio");
              }}
            />
          ) : null}
          {step === "audio" ? (
            <AudioStep
              token={token}
              micDeviceId={stream?.getAudioTracks()[0]?.getSettings().deviceId}
              onDone={(r) => {
                setAudio(r);
                setStep(phoneEnabled ? "phone" : "display");
              }}
            />
          ) : null}
          {step === "phone" ? (
            <PhoneStep
              link={phone}
              required={phoneRequired}
              onDone={(paired) => {
                setPhoneUsed(paired);
                setStep("display");
              }}
            />
          ) : null}
          {step === "display" && devices && audio && support ? (
            <DisplayStep
              token={token}
              session={session}
              support={support}
              devices={devices}
              audio={audio}
              phonePaired={phoneUsed}
              onDone={(s) => {
                setScreen(s);
                setStep("interview");
              }}
            />
          ) : null}
        </div>
      )}
    </BrowserGate>
  );
}
