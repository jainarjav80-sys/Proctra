"use client";

import type { InterviewAction } from "@/lib/interview/engine";
import type { ConsentItem } from "@/lib/candidate/consent";

export interface CandidateSession {
  candidateName: string;
  jobTitle: string;
  questionCount: number;
  durationMinutes: number;
  responseTimeLimitSec: number;
  secondaryCamPolicy: "MANDATORY" | "RECOMMENDED" | "DISABLED";
  proctoring: Partial<Record<"enforce_fullscreen" | "block_multi_monitor" | "gaze_tracking" | "object_detection" | "record_video", boolean>>;
  status: string;
  consented: boolean;
  consentScopes: string[];
  preflightDone: boolean;
  policyVersion: string;
  consentItems: (ConsentItem & { required: boolean })[];
}

export interface TurnResponse {
  version: number;
  startedAt: string;
  durationMinutes: number;
  action: InterviewAction;
  conflict?: boolean;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message);
  }
}

/** Calls a candidate API route with the invite token. */
export async function candidateFetch<T>(token: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api/candidate/${path}`, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: { "content-type": "application/json", "x-proctra-token": token },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok && !(res.status === 409 && json?.conflict)) {
    throw new ApiError((json as { error?: string }).error ?? `Request failed (${res.status})`, res.status, json);
  }
  return json as T;
}

/**
 * Retries through network drops (fetch TypeError / 5xx) with backoff so a flaky connection pauses the
 * interview instead of losing the answer. Turns are idempotent server-side (turnId), so resending is safe.
 */
export async function withReconnect<T>(fn: () => Promise<T>, onRetry: (attempt: number) => void, maxWaitMs = 5 * 60_000): Promise<T> {
  const started = Date.now();
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const retriable = !(e instanceof ApiError) || e.status >= 500;
      if (!retriable || Date.now() - started > maxWaitMs) throw e;
      onRetry(attempt + 1);
      await new Promise((r) => setTimeout(r, Math.min(8000, 1000 * 2 ** attempt)));
    }
  }
}

/** Uploads one VAD-cut audio segment for server-side (Whisper) transcription. */
export async function transcribeAudio(token: string, audio: Blob): Promise<{ text: string; confidence: number | null }> {
  const form = new FormData();
  form.set("audio", audio, audio.type.includes("ogg") ? "segment.ogg" : "segment.webm");
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch("/api/candidate/stt", { method: "POST", headers: { "x-proctra-token": token }, body: form });
    const json = await res.json().catch(() => ({}));
    if (res.ok) return json as { text: string; confidence: number | null };
    if (res.status !== 503 || attempt === 2) throw new ApiError((json as { error?: string }).error ?? `Transcription failed (${res.status})`, res.status, json);
    await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
  }
  throw new ApiError("Speech service busy", 503);
}
