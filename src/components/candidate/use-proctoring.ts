"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Proctor, type ProctorConfig } from "@/lib/proctoring/edge/proctor";
import { CANDIDATE_WARNINGS, WARNING_COOLDOWN_MS, type ClientEvent, type ObservedType } from "@/lib/proctoring/events";
import { createClient } from "@/lib/supabase/client";
import { candidateFetch } from "./api";

export const CHUNK_MS = 10_000;

/**
 * Bitrate budget: ≤150 MB per 30 min across all three streams (150 MB ≈ 667 kbit/s total).
 *   camera 300k video + 32k audio, screen 200k at 5 fps, phone 120k  →  652 kbit/s ≈ 147 MB / 30 min.
 * These are encoder caps; static scenes (screen, desk) usually come in well under them.
 */
export const BITRATES = {
  PRIMARY: { video: 300_000, audio: 32_000 },
  SCREEN: { video: 200_000, audio: 0 },
  SECONDARY: { video: 120_000, audio: 0 },
} as const;

type Track = keyof typeof BITRATES;
export type ChunkUploader = (track: Track, session: string, startedMs: number, blob: Blob, seq: number) => Promise<void>;

/** Thrown by an uploader when the server wants a fresh recorder session (e.g. interview not started). */
export class RestartRecording extends Error {}

/** Uploads via the candidate API (signed URL → Storage). */
export function candidateUploader(token: string): ChunkUploader {
  const supabase = createClient();
  return async (track, session, startedMs, blob, seq) => {
    const { path, token: uploadToken } = await candidateFetch<{ path: string; token: string }>(token, "recording", { body: { track, session, startedMs, seq } });
    const { error } = await supabase.storage.from("recordings").uploadToSignedUrl(path, uploadToken, blob, { contentType: "video/webm", upsert: true });
    if (error) throw error;
  };
}

/**
 * MediaRecorder → 10 s WebM chunks → Storage. Each recorder run is a "session": its first chunk
 * holds the WebM header, so chunks of one session concatenate into a playable file. A re-shared
 * screen or reconnected phone starts a new session.
 */
export class ChunkRecorder {
  private rec: MediaRecorder | null = null;
  private uploads: Promise<unknown>[] = [];
  private stream: MediaStream | null = null;
  session = crypto.randomUUID();
  bytes = 0;
  /** Order within the session, assigned when the chunk is produced (uploads may finish out of order). */
  private seq = 0;

  constructor(
    private readonly track: Track,
    private readonly upload: ChunkUploader,
    private readonly clock: () => number,
  ) {}

  start(stream: MediaStream) {
    this.stream = stream;
    const hasAudio = stream.getAudioTracks().length > 0;
    const type = (hasAudio ? ["video/webm;codecs=vp8,opus", "video/webm"] : ["video/webm;codecs=vp8", "video/webm"]).find((t) => MediaRecorder.isTypeSupported(t));
    const b = BITRATES[this.track];
    this.rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: b.video, ...(hasAudio ? { audioBitsPerSecond: b.audio || 32_000 } : {}) });
    this.rec.ondataavailable = (e) => {
      if (!e.data.size) return; // note: Chrome can emit a 1-byte first blob (split EBML header); keep it
      this.bytes += e.data.size;
      const seq = this.seq++;
      const startedMs = Math.max(0, this.clock() - CHUNK_MS);
      const job = (async () => {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            return await this.upload(this.track, this.session, startedMs, e.data, seq);
          } catch (err) {
            if (err instanceof RestartRecording) return this.restart();
            await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
          }
        }
      })();
      this.uploads.push(job);
    };
    this.rec.start(CHUNK_MS);
  }

  /** New session: the next chunk starts with a fresh WebM header. */
  private restart() {
    if (!this.stream || !this.rec || this.rec.state === "inactive") return;
    const old = this.rec;
    old.ondataavailable = null;
    old.stop();
    this.session = crypto.randomUUID();
    this.seq = 0;
    this.start(this.stream);
  }

  async stop() {
    if (this.rec && this.rec.state !== "inactive") {
      const stopped = new Promise((r) => this.rec!.addEventListener("stop", r, { once: true }));
      this.rec.stop();
      await stopped;
    }
    await Promise.allSettled(this.uploads);
  }
}

/**
 * Runs browser proctoring + recording once the interview clock exists (startedAt > 0), shows calm
 * rate-limited reminders to the candidate (if enabled), and logs every reminder shown with the id
 * of the event that triggered it.
 */
export function useProctoring(opts: {
  token: string;
  stream: MediaStream;
  screen: MediaStream | null;
  video: React.RefObject<HTMLVideoElement | null>;
  config: ProctorConfig & { record_video?: boolean; show_live_warnings?: boolean };
  startedAt: number;
  active: boolean;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const proctor = useRef<Proctor | null>(null);
  const lastShown = useRef<Partial<Record<ObservedType, number>>>({});
  const { token, stream, screen, video, config, startedAt, active } = opts;
  const clock = useCallback(() => Math.max(0, Date.now() - startedAt), [startedAt]);

  /** Shows a reminder (≤ 1 per type per 30 s) and logs it as CANDIDATE_WARNING_SHOWN. */
  const warn = useCallback(
    (type: ObservedType, triggerId: string) => {
      const message = CANDIDATE_WARNINGS[type];
      if (!message || config.show_live_warnings === false) return;
      const now = Date.now();
      if (now - (lastShown.current[type] ?? 0) < WARNING_COOLDOWN_MS) return;
      lastShown.current[type] = now;
      toast(message, { id: `warn-${type}`, duration: 6000 });
      proctor.current?.report({
        type: "CANDIDATE_WARNING_SHOWN",
        source: "SYSTEM",
        severity: "INFO",
        startMs: clock(),
        endMs: null,
        confidence: null,
        description: `Reminder shown to candidate: "${message}"`,
        telemetry: { trigger_client_id: triggerId, trigger_type: type, message },
      });
    },
    [clock, config.show_live_warnings],
  );

  const warnRef = useRef(warn);
  useEffect(() => {
    warnRef.current = warn;
  }, [warn]);

  useEffect(() => {
    if (!active || !startedAt || !video.current) return;
    const p = new Proctor({
      video: video.current,
      stream,
      config,
      clock,
      send: async (events: ClientEvent[]) => void (await candidateFetch(token, "proctoring/events", { body: { events } })),
      onNotice: setNotice,
      onWarning: (type, id) => warnRef.current(type, id),
    });
    proctor.current = p;
    void p.start();
    const recorder = config.record_video !== false ? new ChunkRecorder("PRIMARY", candidateUploader(token), clock) : null;
    try {
      recorder?.start(stream);
    } catch {
      /* recording unsupported: interview continues */
    }
    return () => {
      void p.stop();
      void recorder?.stop();
      proctor.current = null;
    };
    // config is stable for the session
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, startedAt, stream, token]);

  // Screen share recording: a new session whenever the candidate re-shares.
  useEffect(() => {
    if (!active || !startedAt || !screen || config.record_video === false) return;
    const rec = new ChunkRecorder("SCREEN", candidateUploader(token), clock);
    try {
      rec.start(screen);
    } catch {
      return;
    }
    return () => void rec.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, startedAt, screen, token]);

  return { notice, proctor, warn };
}
