/**
 * Browser identification from User-Agent Client Hints brands plus vendor-specific signals, never
 * UA-string sniffing (Brave, Vivaldi and Arc deliberately send a Chrome UA string).
 * Only Google Chrome and Microsoft Edge ship a working cloud backend for webkitSpeechRecognition;
 * other Chromium browsers expose the API but fail with "network" / "service-not-allowed".
 */

export type BrowserFamily = "chrome" | "edge" | "brave" | "opera" | "vivaldi" | "arc" | "chromium" | "non-chromium";

export interface BrowserSignals {
  /** navigator.userAgentData?.brands (undefined in Firefox/Safari). */
  brands?: { brand: string }[];
  /** await navigator.brave?.isBrave() */
  isBrave?: boolean;
  /** Arc injects --arc-palette-* CSS variables into every page. */
  arcPalette?: boolean;
}

export interface BrowserInfo {
  family: BrowserFamily;
  chromium: boolean;
  /** Web Speech recognition has a real backend (Chrome → Google, Edge → Microsoft). */
  nativeSpeech: boolean;
  label: string;
}

const LABELS: Record<BrowserFamily, string> = {
  chrome: "Google Chrome",
  edge: "Microsoft Edge",
  brave: "Brave",
  opera: "Opera",
  vivaldi: "Vivaldi",
  arc: "Arc",
  chromium: "a Chromium-based browser",
  "non-chromium": "this browser",
};

export function detectBrowser(signals: BrowserSignals): BrowserInfo {
  const brands = (signals.brands ?? []).map((b) => b.brand);
  const has = (re: RegExp) => brands.some((b) => re.test(b));
  const chromium = has(/^Chromium$/) || has(/Google Chrome|Microsoft Edge|Opera|Brave/);
  let family: BrowserFamily;
  if (!signals.brands || !chromium) family = "non-chromium";
  else if (signals.isBrave || has(/^Brave$/)) family = "brave";
  else if (signals.arcPalette) family = "arc";
  else if (has(/Microsoft Edge/)) family = "edge";
  else if (has(/Opera|OPR/)) family = "opera";
  else if (has(/Google Chrome/)) family = "chrome";
  // Vivaldi and plain Chromium both report only "Chromium" (Vivaldi hides its brand).
  else family = "chromium";
  return {
    family,
    chromium: family !== "non-chromium",
    nativeSpeech: family === "chrome" || family === "edge",
    label: LABELS[family],
  };
}

/** Collects the signals in the browser (async because navigator.brave.isBrave() is a promise). */
export async function readBrowserSignals(): Promise<BrowserSignals> {
  const nav = navigator as Navigator & {
    userAgentData?: { brands: { brand: string }[] };
    brave?: { isBrave?: () => Promise<boolean> };
  };
  let isBrave = false;
  try {
    isBrave = Boolean(await nav.brave?.isBrave?.());
  } catch {
    isBrave = false;
  }
  const arcPalette = Boolean(getComputedStyle(document.documentElement).getPropertyValue("--arc-palette-title").trim());
  return { brands: nav.userAgentData?.brands, isBrave, arcPalette };
}
