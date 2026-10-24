"use client";

/**
 * Energy-based voice activity detector on its own echo-cancelled mic stream (used for barge-in).
 * Speech = RMS above max(MIN_THRESHOLD, noiseFloor × FLOOR_MULTIPLIER) continuously for ≥ minSpeechMs,
 * so short echo blips and clicks don't count. The noise floor adapts while nobody is speaking,
 * including the AI's own voice leaking from speakers, which raises the bar during TTS playback.
 */
export class EnergyVAD {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private raf = 0;
  private floor = 0.01;
  private aboveSince = 0;
  private speaking = false;
  private listeners = new Set<(e: "start" | "end") => void>();
  private calibrateUntil = 0;
  armed = false;

  constructor(
    private readonly minSpeechMs = 300,
    private readonly floorMultiplier = 3,
    private readonly minThreshold = 0.03,
  ) {}

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    this.ctx = new AudioContext();
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 1024;
    this.ctx.createMediaStreamSource(this.stream).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    let silentSince = 0;
    const tick = () => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      const rms = Math.sqrt(sum / buf.length);
      const threshold = Math.max(this.minThreshold, this.floor * this.floorMultiplier);
      const now = performance.now();
      if (now < this.calibrateUntil) {
        // Learn the current background (e.g. the interviewer's voice from speakers) without triggering.
        this.floor = this.floor * 0.85 + rms * 0.15;
        this.aboveSince = 0;
      } else if (rms > threshold) {
        silentSince = 0;
        this.aboveSince ||= now;
        if (!this.speaking && now - this.aboveSince >= this.minSpeechMs) {
          this.speaking = true;
          if (this.armed) this.listeners.forEach((l) => l("start"));
        }
      } else {
        this.aboveSince = 0;
        // Adapt the floor only on quiet frames (slow EMA) so speech doesn't inflate it.
        this.floor = this.floor * 0.98 + rms * 0.02;
        silentSince ||= now;
        if (this.speaking && now - silentSince > 600) {
          this.speaking = false;
          if (this.armed) this.listeners.forEach((l) => l("end"));
        }
      }
      this.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  /** Call when TTS starts a sentence: the next `ms` of audio sets the floor instead of triggering. */
  calibrate(ms = 350) {
    this.calibrateUntil = performance.now() + ms;
  }

  /** Back to a quiet-room baseline once TTS stops, so the candidate's own speech isn't masked. */
  resetFloor() {
    this.floor = Math.min(this.floor, 0.01);
  }

  on(cb: (e: "start" | "end") => void) {
    this.listeners.add(cb);
    return () => void this.listeners.delete(cb);
  }

  get isSpeaking() {
    return this.speaking;
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close();
    this.ctx = null;
  }
}
