/**
 * Turns a per-frame boolean (e.g. "no face") into debounced intervals: an interval opens once the
 * condition has held for `minMs`, and closes once it has been false for `releaseMs` (so one-frame
 * detector flicker doesn't split or end an event). Pure and time-injected for testing.
 */
export interface Interval {
  startMs: number;
  endMs: number;
  peak: number;
}

export class DurationTracker {
  private trueSince: number | null = null;
  private falseSince: number | null = null;
  private openAt: number | null = null;
  private peak = 0;

  constructor(
    private readonly minMs: number,
    private readonly releaseMs = 1000,
  ) {}

  /** Returns "open" when an interval starts, an Interval when one closes, otherwise null. */
  update(condition: boolean, nowMs: number, value = 1): "open" | Interval | null {
    if (condition) {
      this.falseSince = null;
      this.trueSince ??= nowMs;
      if (this.openAt !== null) this.peak = Math.max(this.peak, value);
      if (this.openAt === null && nowMs - this.trueSince >= this.minMs) {
        this.openAt = this.trueSince;
        this.peak = value;
        return "open";
      }
      return null;
    }
    this.trueSince = null;
    if (this.openAt === null) return null;
    this.falseSince ??= nowMs;
    if (nowMs - this.falseSince >= this.releaseMs) {
      const closed = { startMs: this.openAt, endMs: this.falseSince, peak: this.peak };
      this.openAt = null;
      this.falseSince = null;
      return closed;
    }
    return null;
  }

  get isOpen() {
    return this.openAt !== null;
  }

  /** Force-closes an open interval (e.g. at interview end). */
  flush(nowMs: number): Interval | null {
    if (this.openAt === null) return null;
    const closed = { startMs: this.openAt, endMs: nowMs, peak: this.peak };
    this.openAt = null;
    this.trueSince = null;
    this.falseSince = null;
    return closed;
  }
}

/** Mean luma (0–255) of an RGBA buffer, sampling every `step` pixels. */
export function meanLuma(data: Uint8ClampedArray, step = 16): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4 * step) {
    sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    n++;
  }
  return n ? sum / n : 0;
}

/** Head yaw/pitch (degrees) from MediaPipe's 4×4 column-major facial transformation matrix. */
export function headPose(m: ArrayLike<number>): { yaw: number; pitch: number } {
  // Rotation part: r20 = m[2], r21 = m[6], r22 = m[10] (column-major).
  const yaw = Math.atan2(-m[2], Math.hypot(m[6], m[10])) * (180 / Math.PI);
  const pitch = Math.atan2(m[6], m[10]) * (180 / Math.PI);
  return { yaw, pitch };
}

export const VIRTUAL_CAMERA_RE = /obs|virtual|manycam|snap camera|xsplit|droidcam|epoccam|camtwist|mmhmm|ndi|v4l2loopback|dummy/i;
