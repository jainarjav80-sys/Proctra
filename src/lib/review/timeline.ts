/**
 * The review timeline is wall-clock ms since the interview started (what recordings use).
 * Transcripts and proctoring events are stamped on the interview clock, which excludes pauses;
 * this maps between the two using the stored pause history.
 */
export interface Pause {
  reason: string;
  clockMs: number;
  wallStartMs: number;
  wallEndMs: number;
}

export function clockToWall(clockMs: number, pauses: Pause[]): number {
  let wall = clockMs;
  for (const p of [...pauses].sort((a, b) => a.clockMs - b.clockMs)) {
    if (p.clockMs <= clockMs) wall += p.wallEndMs - p.wallStartMs;
  }
  return wall;
}

export function wallToClock(wallMs: number, pauses: Pause[]): number {
  let clock = wallMs;
  for (const p of pauses) {
    if (wallMs >= p.wallEndMs) clock -= p.wallEndMs - p.wallStartMs;
    else if (wallMs > p.wallStartMs) clock -= wallMs - p.wallStartMs;
  }
  return Math.max(0, clock);
}

export const fmtMs = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
