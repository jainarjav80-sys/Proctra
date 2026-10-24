/** Maps Web Speech API error codes to their real cause, user-facing text and what to do next. */

export type SttErrorKind = "permission" | "device" | "service" | "offline" | "language" | "transient";

export interface SttErrorInfo {
  code: string;
  kind: SttErrorKind;
  message: string;
  /** Stop trying this engine. */
  fatal: boolean;
  /** Switching to server-side Whisper should fix it. */
  useServerFallback: boolean;
}

export function mapSttError(code: string, online: boolean): SttErrorInfo {
  switch (code) {
    case "network":
      // Chrome reports "network" both when offline and when the browser has no speech backend
      // (Brave, Vivaldi, Opera, Chromium builds without Google API keys).
      return online
        ? { code, kind: "service", fatal: true, useServerFallback: true, message: "This browser's built-in speech recognition isn't available. Switching to Proctra's speech service." }
        : { code, kind: "offline", fatal: false, useServerFallback: false, message: "You appear to be offline. Reconnect to the internet to continue." };
    case "not-allowed":
      return { code, kind: "permission", fatal: true, useServerFallback: false, message: "Microphone access was blocked. Click the camera/mic icon in the address bar, allow the microphone, and try again." };
    case "service-not-allowed":
      return { code, kind: "service", fatal: true, useServerFallback: true, message: "This browser doesn't allow its built-in speech recognition. Switching to Proctra's speech service." };
    case "audio-capture":
      return { code, kind: "device", fatal: true, useServerFallback: false, message: "No working microphone was found. Check it's connected and selected, then try again." };
    case "language-not-supported":
      return { code, kind: "language", fatal: true, useServerFallback: true, message: "Speech recognition doesn't support this language here. Switching to Proctra's speech service." };
    case "no-speech":
      return { code, kind: "transient", fatal: false, useServerFallback: false, message: "We didn't hear anything. Speak a little louder or move closer to the microphone." };
    case "aborted":
      return { code, kind: "transient", fatal: false, useServerFallback: false, message: "Listening was interrupted. Try again." };
    default:
      return { code, kind: "service", fatal: true, useServerFallback: true, message: `Speech recognition failed (${code}). Switching to Proctra's speech service.` };
  }
}
