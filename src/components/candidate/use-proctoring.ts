"use client";

import { useEffect, useRef, useState } from "react";
import { Proctor, type ProctorConfig } from "@/lib/proctoring/edge/proctor";
import type { ClientEvent } from "@/lib/proctoring/events";
import { createClient } from "@/lib/supabase/client";
import { candidateFetch } from "./api";

const CHUNK_MS = 10_000;
const VIDEO_BPS = 500_000; // ≈ 110 MB per 30 min: keeps the 1 GB free storage tier usable

/** Chunked recording of a stream to Supabase Storage via signed upload URLs. */
class ChunkRecorder {
  private rec: MediaRecorder | null = null;
  private index = 0;
  private uploads: Promise<unknown>[] = [];

  constructor(
    private readonly token: string,
    private readonly track: "PRIMARY" | "SECONDARY",
    private readonly clock: () => number,
  ) {}

  start(stream: MediaStream) {
    const type = ["video/webm;codecs=vp8,opus", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t));
    this.rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: VIDEO_BPS, audioBitsPerSecond: 48_000 });
    const supabase = createClient();
    this.rec.ondataavailable = (e) => {
      if (!e.data.size) return;
      const index = this.index++;
      const startedMs = Math.max(0, this.clock() - CHUNK_MS);
      const job = (async () => {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const { path, token } = await candidateFetch<{ path: string; token: string }>(this.token, "recording", { body: { track: this.track, index, startedMs } });
            const { error } = await supabase.storage.from("recordings").uploadToSignedUrl(path, token, e.data, { contentType: "video/webm", upsert: true });
            if (!error) return;
          } catch {
            /* retry */
          }
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        }
      })();
      this.uploads.push(job);
    };
    this.rec.start(CHUNK_MS);
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
 * Starts browser proctoring + recording once the interview clock exists (startedAt > 0) and stops
 * both when `active` turns false. Returns a neutral notice for the candidate UI and the proctor.
 */
export function useProctoring(opts: {
  token: string;
  stream: MediaStream;
  video: React.RefObject<HTMLVideoElement | null>;
  config: ProctorConfig & { record_video?: boolean };
  startedAt: number;
  active: boolean;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const proctor = useRef<Proctor | null>(null);
  const { token, stream, video, config, startedAt, active } = opts;

  useEffect(() => {
    if (!active || !startedAt || !video.current) return;
    const clock = () => Math.max(0, Date.now() - startedAt);
    const p = new Proctor({
      video: video.current,
      stream,
      config,
      clock,
      send: async (events: ClientEvent[]) => void (await candidateFetch(token, "proctoring/events", { body: { events } })),
      onNotice: setNotice,
    });
    proctor.current = p;
    void p.start();
    const recorder = config.record_video !== false ? new ChunkRecorder(token, "PRIMARY", clock) : null;
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

  return { notice, proctor };
}

export { ChunkRecorder };
