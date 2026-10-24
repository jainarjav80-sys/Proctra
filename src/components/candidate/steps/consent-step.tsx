"use client";

import { useState } from "react";
import { candidateFetch, type CandidateSession } from "../api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

export function ConsentStep({ token, session, onDone }: { token: string; session: CandidateSession; onDone: () => void }) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const required = session.consentItems.filter((i) => i.required);
  const ready = required.every((i) => checked.has(i.scope));

  async function submit() {
    setPending(true);
    setError(null);
    try {
      await candidateFetch(token, "consent", { body: { scopes: [...checked], policyVersion: session.policyVersion } });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Welcome, {session.candidateName.split(" ")[0]}</h1>
        <p className="mt-1 text-muted-foreground">
          {session.jobTitle} · {session.questionCount} questions · about {session.durationMinutes} minutes · up to{" "}
          {Math.round(session.responseTimeLimitSec / 60)} min per answer
        </p>
      </div>
      <section className="rounded-lg border bg-card p-4 text-sm">
        <h2 className="mb-2 font-medium">How it works</h2>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>An AI interviewer reads each question aloud. Answer out loud; your camera stays on throughout.</li>
          <li>Pause or press &quot;I&apos;ve finished&quot; when you&apos;re done. Say &quot;repeat&quot; or &quot;skip&quot; whenever you like.</li>
          <li>Stay in fullscreen, keep to one display, and don&apos;t use notes, other people, devices or AI assistants.</li>
          <li>If your connection drops, your progress is saved. Reopen this link to continue.</li>
        </ul>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Your consent</h2>
        {session.consentItems.map((item) => (
          <label key={item.scope} className="flex cursor-pointer gap-3 rounded-lg border bg-card p-3 text-sm">
            <Checkbox
              checked={checked.has(item.scope)}
              onCheckedChange={(v) =>
                setChecked((prev) => {
                  const next = new Set(prev);
                  if (v) next.add(item.scope);
                  else next.delete(item.scope);
                  return next;
                })
              }
              aria-label={item.title}
            />
            <span>
              <span className="font-medium">
                {item.title}
                {item.required ? "" : " (optional)"}
              </span>
              <span className="block text-muted-foreground">{item.detail}</span>
            </span>
          </label>
        ))}
        <p className="text-xs text-muted-foreground">
          Consent version {session.policyVersion}. If you don&apos;t agree, close this page and let the recruiter know; nothing is
          recorded before you agree.
        </p>
      </section>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div>
        <Button size="lg" disabled={!ready || pending} onClick={submit}>
          {pending ? "Saving…" : "I agree, continue"}
        </Button>
      </div>
    </div>
  );
}
