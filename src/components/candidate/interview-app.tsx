"use client";

import { useEffect, useState } from "react";
import { candidateFetch, type CandidateSession } from "./api";
import { BrowserGate, useBrowserSupport } from "./steps/browser-gate";
import { ConsentStep } from "./steps/consent-step";
import { DeviceStep, type DeviceResult } from "./steps/device-step";
import { DisplayStep } from "./steps/display-step";
import { InterviewStage } from "./interview-stage";

type Step = "consent" | "devices" | "display" | "interview";
const STEPS: { id: Step; label: string }[] = [
  { id: "consent", label: "Consent" },
  { id: "devices", label: "Camera & mic" },
  { id: "display", label: "Display" },
  { id: "interview", label: "Interview" },
];

/**
 * Candidate flow: browser gate → consent → devices → display → interview. After a refresh, consent is
 * remembered server-side, but the camera must be re-granted, so a resumed candidate restarts at devices.
 */
export function InterviewApp({ token }: { token: string }) {
  const support = useBrowserSupport();
  const [session, setSession] = useState<CandidateSession | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("consent");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [devices, setDevices] = useState<DeviceResult | null>(null);

  useEffect(() => {
    candidateFetch<CandidateSession>(token, "session")
      .then((s) => {
        setSession(s);
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

  return (
    <BrowserGate support={support}>
      {step === "interview" && stream ? (
        <InterviewStage token={token} session={session} stream={stream} />
      ) : (
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
          <ol className="flex gap-2 text-xs text-muted-foreground" aria-label="Progress">
            {STEPS.map((s, i) => (
              <li key={s.id} className={`flex items-center gap-2 ${s.id === step ? "font-semibold text-foreground" : ""}`}>
                <span className="flex size-5 items-center justify-center rounded-full border">{i + 1}</span>
                {s.label}
                {i < STEPS.length - 1 ? <span aria-hidden>›</span> : null}
              </li>
            ))}
          </ol>
          {step === "consent" ? <ConsentStep token={token} session={session} onDone={() => setStep("devices")} /> : null}
          {step === "devices" ? (
            <DeviceStep
              onDone={(s, r) => {
                setStream(s);
                setDevices(r);
                setStep("display");
              }}
            />
          ) : null}
          {step === "display" && devices && support ? (
            <DisplayStep token={token} session={session} support={support} devices={devices} onDone={() => setStep("interview")} />
          ) : null}
        </div>
      )}
    </BrowserGate>
  );
}
