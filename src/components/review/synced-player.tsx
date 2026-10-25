"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RecordingSession, TimelineMarker, TrackName } from "@/lib/review/load";
import { fmtMs, type Pause } from "@/lib/review/timeline";
import { useSeekRequest } from "./seek-context";
import { Button } from "@/components/ui/button";

const TRACKS: { name: TrackName; label: string }[] = [
  { name: "PRIMARY", label: "Camera" },
  { name: "SCREEN", label: "Screen" },
  { name: "SECONDARY", label: "Phone" },
];
const DRIFT_S = 0.35;
const MARKER_KIND: Record<TimelineMarker["kind"], string> = {
  QUESTION: "interviewer question",
  ANSWER: "answer",
  OBSERVED: "observation",
  SUSPICION: "pattern-based flag",
  WARNING: "reminder shown to the candidate",
};

/** Appends a session's 10 s WebM chunks, in order, into one MediaSource buffer (gapless). */
async function attachSession(video: HTMLVideoElement, s: RecordingSession, onBuffered: (ranges: number) => void) {
  const mime = s.track === "PRIMARY" ? 'video/webm; codecs="vp8, opus"' : 'video/webm; codecs="vp8"';
  const ms = new MediaSource();
  video.src = URL.createObjectURL(ms);
  await new Promise((r) => ms.addEventListener("sourceopen", r, { once: true }));
  const sb = ms.addSourceBuffer(MediaSource.isTypeSupported(mime) ? mime : "video/webm");
  for (const url of s.urls) {
    const buf = await (await fetch(url)).arrayBuffer();
    await new Promise<void>((resolve, reject) => {
      sb.addEventListener("updateend", () => resolve(), { once: true });
      sb.addEventListener("error", () => reject(new Error("append failed")), { once: true });
      sb.appendBuffer(buf);
    });
  }
  if (ms.readyState === "open") ms.endOfStream();
  video.dataset.loaded = "1"; // every chunk appended (tests wait for this)
  onBuffered(video.buffered.length);
}

export function SyncedPlayer({
  sessions,
  wallDurationMs,
  markers,
  pauses,
}: {
  sessions: RecordingSession[];
  wallDurationMs: number;
  markers: TimelineMarker[];
  pauses: Pause[];
}) {
  const videos = useRef(new Map<string, HTMLVideoElement>());
  const [t, setT] = useState(0);
  const tRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [loaded, setLoaded] = useState<Record<string, number>>({});
  const total = Math.max(wallDurationMs, ...sessions.map((s) => s.startMs + 1000), 1000);
  // Latest sync/playing for callbacks that outlive a render (chunk loading finishes later).
  const syncRef = useRef<(ms: number, play: boolean) => void>(() => {});
  const playingRef = useRef(false);

  // Load every session once (the player itself mounts only when the Recording tab is first needed).
  useEffect(() => {
    for (const s of sessions) {
      const v = videos.current.get(s.id);
      if (!v || v.dataset.attached) continue;
      v.dataset.attached = "1";
      void attachSession(v, s, (ranges) => {
        setLoaded((p) => ({ ...p, [s.id]: ranges }));
        // A seek may have happened before this stream finished loading: place it now.
        syncRef.current(tRef.current, playingRef.current);
      }).catch(() => setLoaded((p) => ({ ...p, [s.id]: -1 })));
    }
  }, [sessions]);

  /** Puts every video at the master time (or pauses/hides those not covering it). */
  const sync = useCallback(
    (ms: number, play: boolean) => {
      for (const s of sessions) {
        const v = videos.current.get(s.id);
        if (!v) continue;
        const local = (ms - s.startMs) / 1000;
        const end = v.buffered.length ? v.buffered.end(v.buffered.length - 1) : 0;
        const active = local >= 0 && local <= end + 0.2;
        v.dataset.active = active ? "1" : "0";
        if (!active) {
          if (!v.paused) v.pause();
          continue;
        }
        if (Math.abs(v.currentTime - local) > DRIFT_S) v.currentTime = local;
        if (play && v.paused) void v.play().catch(() => {});
        if (!play && !v.paused) v.pause();
      }
    },
    [sessions],
  );

  // Master clock.
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      tRef.current = Math.min(total, tRef.current + (now - last));
      last = now;
      setT(tRef.current);
      sync(tRef.current, true);
      if (tRef.current >= total) setPlaying(false);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, sync, total]);

  const seek = useCallback(
    (ms: number) => {
      tRef.current = Math.max(0, Math.min(total, ms));
      setT(tRef.current);
      sync(tRef.current, playing);
    },
    [playing, sync, total],
  );

  useEffect(() => {
    syncRef.current = sync;
    playingRef.current = playing;
  }, [sync, playing]);

  // Quote/event clicks elsewhere on the page arrive as seek requests (including one made before
  // this player mounted); start 2 s early for context.
  const request = useSeekRequest();
  const seekRef = useRef(seek);
  useEffect(() => {
    seekRef.current = seek;
  }, [seek]);
  useEffect(() => {
    if (request) seekRef.current(request.wallMs - 2000);
  }, [request]);

  const markerColor: Record<TimelineMarker["kind"], string> = {
    QUESTION: "bg-brand-500",
    ANSWER: "bg-slate-300",
    OBSERVED: "bg-warning",
    SUSPICION: "bg-danger",
    WARNING: "bg-ai",
  };

  return (
    <div className="flex flex-col gap-4" data-testid="synced-player">
      <div className="grid gap-3 md:grid-cols-3">
        {TRACKS.map(({ name, label }) => {
          const list = sessions.filter((s) => s.track === name);
          return (
            <div key={name} className="flex flex-col gap-1">
              <p className="text-xs font-medium text-muted-foreground">
                {label}
                {list.length > 1 ? ` · ${list.length} segments` : ""}
              </p>
              <div className="relative aspect-video overflow-hidden rounded-lg bg-black">
                {list.length === 0 ? (
                  <p className="absolute inset-0 flex items-center justify-center text-xs text-slate-300">No {label.toLowerCase()} recording</p>
                ) : null}
                {list.map((s) => (
                  <video
                    key={s.id}
                    ref={(el) => {
                      if (el) videos.current.set(s.id, el);
                    }}
                    data-testid={`player-${name}`}
                    data-session-start={s.startMs}
                    muted={name !== "PRIMARY"}
                    playsInline
                    className="absolute inset-0 size-full object-contain data-[active=0]:opacity-0"
                  />
                ))}
              </div>
              {list.some((s) => loaded[s.id] === -1) ? <p className="text-xs text-danger">Couldn&apos;t load part of this recording.</p> : null}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <Button
          size="sm"
          onClick={() => {
            const next = !playing;
            setPlaying(next);
            sync(tRef.current, next);
          }}
          data-testid="player-toggle"
        >
          {playing ? "Pause" : "Play"}
        </Button>
        <span className="font-mono text-xs" data-testid="player-time">
          {fmtMs(t)} / {fmtMs(total)}
        </span>
      </div>

      <div className="relative h-12 select-none" aria-label="Interview timeline">
        <div className="absolute top-5 h-2 w-full rounded-full bg-muted" />
        {pauses.map((p, i) => (
          <div
            key={i}
            title={`Paused: ${p.reason}`}
            className="absolute top-4 h-4 rounded bg-warning/40"
            style={{ left: `${(p.wallStartMs / total) * 100}%`, width: `${((p.wallEndMs - p.wallStartMs) / total) * 100}%` }}
          />
        ))}
        <input
          type="range"
          min={0}
          max={total}
          value={t}
          onChange={(e) => seek(Number(e.target.value))}
          className="absolute top-3 h-6 w-full cursor-pointer opacity-60"
          aria-label="Seek"
        />
        {markers
          .filter((m) => m.kind !== "ANSWER")
          .map((m, i) => (
            <button
              key={`${m.kind}-${i}`}
              type="button"
              title={`${fmtMs(m.atMs)} ${m.label}`}
              aria-label={`Play from ${fmtMs(m.atMs)}: ${MARKER_KIND[m.kind]}, ${m.label}`}
              data-testid={m.refId && m.kind !== "QUESTION" ? `marker-${m.refId}` : undefined}
              onClick={() => seek(m.atMs - 2000)}
              className="focus-ring absolute -top-1.5 flex h-6 w-6 -translate-x-1/2 items-start justify-center rounded-sm"
              style={{ left: `${Math.min(100, Math.max(0, (m.atMs / total) * 100))}%` }}
            >
              {/* 24 px hit area around a 6 px visual tick. */}
              <span aria-hidden className={`mt-1.5 h-3 w-1.5 rounded-sm ${markerColor[m.kind]}`} />
            </button>
          ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Markers: <span className="text-brand-500">■</span> interviewer questions · <span className="text-warning">■</span> observations ·{" "}
        <span className="text-danger">■</span> pattern-based flags · <span className="text-ai">■</span> reminders shown to the candidate ·{" "}
        <span className="text-warning">▬</span> paused time
      </p>
    </div>
  );
}
