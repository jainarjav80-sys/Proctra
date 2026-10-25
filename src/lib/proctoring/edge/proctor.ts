"use client";

import type { ClientEvent, ObservedType, Severity, Source } from "../events";
import { DurationTracker, VIRTUAL_CAMERA_RE, type Interval } from "./duration-tracker";
import { FaceTracker, ObjectTracker, frameLuma, snapshot } from "./vision";

export interface ProctorConfig {
  gaze_tracking?: boolean;
  object_detection?: boolean;
  enforce_fullscreen?: boolean;
  block_multi_monitor?: boolean;
}

export interface ProctorOptions {
  video: HTMLVideoElement;
  stream: MediaStream;
  config: ProctorConfig;
  /** Interview-relative milliseconds. */
  clock: () => number;
  send: (events: ClientEvent[]) => Promise<void>;
  /** Neutral, non-accusatory notices for the candidate UI. */
  onNotice?: (message: string | null) => void;
}

interface VisualDetector {
  type: ObservedType;
  source: Source;
  severity: Severity;
  tracker: DurationTracker;
  describe: (i: Interval) => string;
  pendingSnapshot?: string;
}

/**
 * Runs every browser-side detector during the interview and turns them into debounced OBSERVED
 * events. Face/gaze ≈ 5 fps (MediaPipe), objects ≈ 1 fps (COCO-SSD), luma 1 Hz, browser signals
 * event-driven. Events are batched to the server every 3 s (immediately for MEDIUM+).
 */
export class Proctor {
  private queue: ClientEvent[] = [];
  private timers: ReturnType<typeof setInterval>[] = [];
  private cleanups: (() => void)[] = [];
  private face: FaceTracker | null = null;
  private objects: ObjectTracker | null = null;
  private secondary: HTMLVideoElement | null = null;
  private canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
  private running = false;
  private detectors: Record<string, VisualDetector> = {};
  private openSince: Record<string, number> = {};
  readonly status = { face: "off" as "off" | "loading" | "on" | "failed", objects: "off" as "off" | "loading" | "on" | "failed" };

  constructor(private readonly o: ProctorOptions) {
    const d = (type: ObservedType, source: Source, severity: Severity, minMs: number, describe: (i: Interval) => string, releaseMs = 1000): VisualDetector => ({
      type,
      source,
      severity,
      tracker: new DurationTracker(minMs, releaseMs),
      describe,
    });
    const secs = (i: Interval) => ((i.endMs - i.startMs) / 1000).toFixed(1);
    this.detectors = {
      faceAbsent: d("FACE_ABSENT", "PRIMARY_CAM", "LOW", 3000, (i) => `No face visible for ${secs(i)} s.`),
      multiFace: d("MULTIPLE_FACES", "PRIMARY_CAM", "MEDIUM", 1500, (i) => `${i.peak} faces visible for ${secs(i)} s.`),
      gazeAway: d("GAZE_AWAY", "PRIMARY_CAM", "LOW", 4000, (i) => `Looked away from the screen for ${secs(i)} s.`, 800),
      phone: d("PHONE_IN_VIEW", "PRIMARY_CAM", "MEDIUM", 2000, (i) => `A phone was visible for ${secs(i)} s.`, 2000),
      book: d("BOOK_IN_VIEW", "PRIMARY_CAM", "LOW", 2000, (i) => `A book or papers were visible for ${secs(i)} s.`, 2000),
      covered: d("CAMERA_COVERED", "PRIMARY_CAM", "MEDIUM", 3000, (i) => `Camera image was dark/covered for ${secs(i)} s.`),
      secPerson: d("EXTRA_PERSON", "SECONDARY_CAM", "MEDIUM", 1500, (i) => `${i.peak} people visible on the phone camera for ${secs(i)} s.`, 2000),
      secPhone: d("PHONE_IN_VIEW", "SECONDARY_CAM", "MEDIUM", 2000, (i) => `A second phone was visible on the workspace camera for ${secs(i)} s.`, 2000),
    };
  }

  private emit(e: Omit<ClientEvent, "clientId">) {
    this.queue.push({ ...e, clientId: crypto.randomUUID() });
    if (e.severity === "MEDIUM" || e.severity === "HIGH") void this.flush();
  }

  private step(key: string, condition: boolean, value = 1, video?: HTMLVideoElement, telemetry: Record<string, unknown> = {}) {
    const det = this.detectors[key];
    const now = this.o.clock();
    const r = det.tracker.update(condition, now, value);
    if (r === "open" && (det.severity === "MEDIUM" || det.severity === "HIGH") && video) det.pendingSnapshot = snapshot(video);
    if (r && r !== "open") this.closeVisual(det, r, telemetry);
  }

  private closeVisual(det: VisualDetector, i: Interval, telemetry: Record<string, unknown> = {}) {
    this.emit({ type: det.type, source: det.source, severity: det.severity, startMs: i.startMs, endMs: i.endMs, confidence: null, description: det.describe(i), telemetry: { peak: i.peak, ...telemetry }, snapshot: det.pendingSnapshot });
    det.pendingSnapshot = undefined;
  }

  /** Interval events driven by browser signals (tab hidden, blur, fullscreen exit). */
  private openSignal(key: string) {
    this.openSince[key] ??= this.o.clock();
  }
  private closeSignal(key: string, type: ObservedType, severityFor: (ms: number) => Severity | null, describe: (ms: number) => string) {
    const start = this.openSince[key];
    if (start === undefined) return;
    delete this.openSince[key];
    const end = this.o.clock();
    const sev = severityFor(end - start);
    if (sev) this.emit({ type, source: "BROWSER", severity: sev, startMs: start, endMs: end, confidence: 1, description: describe(end - start), telemetry: { duration_ms: end - start } });
  }

  async start() {
    this.running = true;
    const { config: c, video, stream } = this.o;

    // Camera/mic loss + virtual camera.
    for (const track of stream.getTracks()) {
      const type: ObservedType = track.kind === "video" ? "CAMERA_LOST" : "MIC_LOST";
      const onEnd = () => this.emit({ type, source: track.kind === "video" ? "PRIMARY_CAM" : "AUDIO", severity: "MEDIUM", startMs: this.o.clock(), endMs: null, confidence: 1, description: `${track.kind === "video" ? "Camera" : "Microphone"} stopped (${track.label || track.kind}).`, telemetry: { label: track.label } });
      track.addEventListener("ended", onEnd);
      this.cleanups.push(() => track.removeEventListener("ended", onEnd));
    }
    const camLabel = stream.getVideoTracks()[0]?.label ?? "";
    if (VIRTUAL_CAMERA_RE.test(camLabel)) {
      this.emit({ type: "VIRTUAL_CAMERA", source: "PRIMARY_CAM", severity: "MEDIUM", startMs: this.o.clock(), endMs: null, confidence: 0.7, description: `Camera "${camLabel}" looks like virtual-camera software.`, telemetry: { label: camLabel } });
    }

    this.startBrowserGuard();

    // Vision models load in the background; the interview never waits on them.
    if (c.gaze_tracking !== false) {
      this.status.face = "loading";
      FaceTracker.create()
        .then((f) => ((this.face = f), (this.status.face = "on")))
        .catch(() => (this.status.face = "failed"));
    }
    if (c.object_detection !== false) {
      this.status.objects = "loading";
      ObjectTracker.create()
        .then((m) => ((this.objects = m), (this.status.objects = "on")))
        .catch(() => (this.status.objects = "failed"));
    }

    this.timers.push(
      setInterval(() => {
        if (!this.face) return;
        const f = this.face.detect(video, performance.now());
        if (!f) return;
        this.step("faceAbsent", f.faces === 0, 1, video);
        this.step("multiFace", f.faces > 1, f.faces, video);
        this.step("gazeAway", f.faces === 1 && f.gazeAway, f.gazeScore, video, { yaw: f.yaw, pitch: f.pitch });
      }, 200),
      setInterval(async () => {
        if (!this.objects) return;
        const p = await this.objects.detect(video);
        if (p) {
          this.step("phone", p.phones > 0, p.best.phone, video);
          this.step("book", p.books > 0, p.best.book, video);
        }
        if (this.secondary) {
          const s = await this.objects.detect(this.secondary);
          if (s) {
            this.step("secPerson", s.persons > 1, s.persons, this.secondary);
            this.step("secPhone", s.phones > 0, s.best.phone, this.secondary);
          }
        }
      }, 1000),
      setInterval(() => {
        if (!this.canvas) return;
        const l = frameLuma(video, this.canvas);
        if (l !== null) this.step("covered", l < 10, Math.round(l));
      }, 1000),
      setInterval(() => void this.flush(), 3000),
    );
  }

  private startBrowserGuard() {
    const { config: c } = this.o;
    const on = <K extends keyof WindowEventMap>(t: K, fn: (e: WindowEventMap[K]) => void) => {
      window.addEventListener(t, fn);
      this.cleanups.push(() => window.removeEventListener(t, fn));
    };
    const onDoc = <K extends keyof DocumentEventMap>(t: K, fn: (e: DocumentEventMap[K]) => void) => {
      document.addEventListener(t, fn);
      this.cleanups.push(() => document.removeEventListener(t, fn));
    };

    onDoc("visibilitychange", () => {
      if (document.visibilityState === "hidden") this.openSignal("hidden");
      else this.closeSignal("hidden", "TAB_HIDDEN", (ms) => (ms < 100 ? null : ms < 2000 ? "LOW" : "MEDIUM"), (ms) => `Interview tab was hidden for ${(ms / 1000).toFixed(1)} s.`);
    });
    on("blur", () => {
      if (document.visibilityState === "visible") this.openSignal("blur");
    });
    on("focus", () =>
      this.closeSignal("blur", "WINDOW_BLUR", (ms) => (ms < 500 ? null : "LOW"), (ms) => `Another window had focus for ${(ms / 1000).toFixed(1)} s.`),
    );
    if (c.enforce_fullscreen !== false) {
      onDoc("fullscreenchange", () => {
        if (!document.fullscreenElement) this.openSignal("fs");
        else this.closeSignal("fs", "FULLSCREEN_EXIT", () => "MEDIUM", (ms) => `Left fullscreen for ${(ms / 1000).toFixed(1)} s.`);
      });
    }
    onDoc("paste", () => this.emit({ type: "CLIPBOARD_PASTE", source: "BROWSER", severity: "LOW", startMs: this.o.clock(), endMs: null, confidence: 1, description: "Text was pasted into the interview page.", telemetry: {} }));
    onDoc("copy", () => this.emit({ type: "CLIPBOARD_COPY", source: "BROWSER", severity: "LOW", startMs: this.o.clock(), endMs: null, confidence: 1, description: "Text was copied from the interview page.", telemetry: {} }));
    on("keydown", (e) => {
      const k = e.key.toLowerCase();
      const devtools = e.key === "F12" || ((e.ctrlKey || e.metaKey) && (e.shiftKey || e.altKey) && ["i", "j", "c"].includes(k));
      if (devtools) this.emit({ type: "DEVTOOLS_SHORTCUT", source: "BROWSER", severity: "LOW", startMs: this.o.clock(), endMs: null, confidence: 1, description: `Developer-tools shortcut pressed (${e.key}).`, telemetry: { key: e.key } });
    });

    // Multi-monitor hot-plug: screenschange when permitted, isExtended polling otherwise.
    if (c.block_multi_monitor !== false) {
      let extended = Boolean((screen as Screen & { isExtended?: boolean }).isExtended);
      const report = (count: number | null) => {
        this.emit({ type: "EXTENDED_DISPLAY", source: "BROWSER", severity: "HIGH", startMs: this.o.clock(), endMs: null, confidence: 1, description: `An additional display was connected${count ? ` (${count} screens)` : ""}.`, telemetry: { screen_count: count } });
        this.o.onNotice?.("A second display was detected. Please disconnect it to continue.");
      };
      const w = window as Window & { getScreenDetails?: () => Promise<EventTarget & { screens: unknown[] }> };
      w.getScreenDetails?.()
        .then((d) => {
          const onChange = () => d.screens.length > 1 && report(d.screens.length);
          d.addEventListener("screenschange", onChange);
          this.cleanups.push(() => d.removeEventListener("screenschange", onChange));
        })
        .catch(() => {});
      this.timers.push(
        setInterval(() => {
          const now = Boolean((screen as Screen & { isExtended?: boolean }).isExtended);
          if (now && !extended) report(null);
          if (!now && extended) this.o.onNotice?.(null);
          extended = now;
        }, 2000),
      );
    }
  }

  /** Workspace video from the paired phone (person/phone detection runs on it too). */
  setSecondary(video: HTMLVideoElement | null) {
    this.secondary = video;
  }

  /** Logs an externally detected event (e.g. phone camera disconnect) through the same pipeline. */
  report(e: Omit<ClientEvent, "clientId">) {
    this.emit(e);
  }

  async flush() {
    if (!this.queue.length) return;
    const batch = this.queue.splice(0, 20);
    try {
      await this.o.send(batch);
    } catch {
      this.queue.unshift(...batch); // retried next tick; the server dedupes by clientId
    }
  }

  async stop() {
    if (!this.running) return;
    this.running = false;
    this.timers.forEach(clearInterval);
    this.cleanups.forEach((c) => c());
    const now = this.o.clock();
    for (const det of Object.values(this.detectors)) {
      const i = det.tracker.flush(now);
      if (i) this.closeVisual(det, i);
    }
    this.face?.close();
    while (this.queue.length) {
      const before = this.queue.length;
      await this.flush();
      if (this.queue.length >= before) break;
    }
  }
}
