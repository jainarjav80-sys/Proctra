/** Audio onboarding helpers: level meter scaling, device naming, headphone hints and the echo test. */

/** RMS → 0..1 meter position on a dB scale (−60 dBFS = empty, −10 dBFS = full). Linear RMS barely
 *  moves for normal speech (≈0.01–0.1), which is why the old meter looked dead. */
export function meterLevel(rms: number): number {
  if (rms <= 0) return 0;
  const db = 20 * Math.log10(rms);
  return Math.min(1, Math.max(0, (db + 60) / 50));
}

/** Fast attack, slow release, so the bar is readable instead of flickering. */
export function smoothLevel(prev: number, next: number): number {
  return next > prev ? next : prev * 0.85 + next * 0.15;
}

const VIRTUAL = /^(default|communications)$/i;
export const HEADPHONE_RE = /head(set|phone)s?|ear(bud|phone)s?|airpods|\bbuds\b|bluetooth|hands-?free|\bwh-|\bwf-|\bjabra|\bbose|\bsony wh/i;

export interface DeviceLike {
  deviceId: string;
  groupId: string;
  kind: string;
  label: string;
}

/** Real microphones (drops the "default"/"communications" aliases browsers add). */
export function realInputs(devices: DeviceLike[]): DeviceLike[] {
  return devices.filter((d) => d.kind === "audioinput" && !VIRTUAL.test(d.deviceId));
}

/**
 * A readable name for the active input. On Linux/PipeWire the track label is often just "Default";
 * resolve it through the device list (same deviceId, or same groupId as a real device).
 */
export function resolveInputLabel(trackLabel: string, deviceId: string | undefined, devices: DeviceLike[]): string {
  const cleaned = trackLabel.replace(/^Default\s*-\s*/i, "").trim();
  if (cleaned && !/^default$/i.test(cleaned)) return cleaned;
  const inputs = devices.filter((d) => d.kind === "audioinput");
  const exact = inputs.find((d) => d.deviceId === deviceId);
  const viaGroup = exact && inputs.find((d) => d.groupId === exact.groupId && !VIRTUAL.test(d.deviceId) && d.label);
  const label = (viaGroup ?? exact)?.label.replace(/^Default\s*-\s*/i, "").trim();
  if (label && !/^default$/i.test(label)) return label;
  const real = realInputs(devices);
  return real.length === 1 && real[0].label ? real[0].label : "System default microphone";
}

/** Label hint only (labels are empty before permission, and BT headphones are often output-only). */
export function headphoneLabelMatch(devices: DeviceLike[]): boolean {
  return devices.some((d) => (d.kind === "audiooutput" || d.kind === "audioinput") && HEADPHONE_RE.test(d.label));
}

export interface EchoTestResult {
  baselineRms: number;
  duringRms: number;
  ratio: number;
  /** pass = little of the interviewer's voice reaches the mic (headphones or good echo cancellation). */
  result: "pass" | "warn";
}

/** Pickup verdict: the mic level while the interviewer speaks, relative to the room's quiet level. */
export function judgeEcho(baselineRms: number, duringRms: number): EchoTestResult {
  const base = Math.max(baselineRms, 0.002);
  const ratio = Math.round((duringRms / base) * 100) / 100;
  const pass = duringRms < 0.02 || ratio < 2.5;
  return { baselineRms: Math.round(baselineRms * 10000) / 10000, duringRms: Math.round(duringRms * 10000) / 10000, ratio, result: pass ? "pass" : "warn" };
}
