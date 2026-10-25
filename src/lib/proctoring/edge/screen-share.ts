"use client";

/**
 * Asks for an entire-screen share (5 fps is plenty for review and keeps the recording small) and
 * rejects tab/window shares: the candidate must pick "Entire screen".
 */
export async function shareEntireScreen(): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: "monitor", frameRate: { ideal: 5, max: 5 }, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
    // Chromium hints: offer whole screens first, and don't let the candidate switch surfaces later.
    selfBrowserSurface: "include",
    surfaceSwitching: "exclude",
    monitorTypeSurfaces: "include",
  } as DisplayMediaStreamOptions);
  const settings = stream.getVideoTracks()[0]?.getSettings() as MediaTrackSettings & { displaySurface?: string };
  if (settings?.displaySurface !== "monitor") {
    stream.getTracks().forEach((t) => t.stop());
    const what = settings?.displaySurface === "browser" ? "a browser tab" : settings?.displaySurface === "window" ? "a single window" : "part of your screen";
    throw new Error(`You shared ${what}. Please share your entire screen ("Entire screen" in the picker).`);
  }
  return stream;
}

export function screenShareInfo(stream: MediaStream) {
  const s = stream.getVideoTracks()[0]?.getSettings() as MediaTrackSettings & { displaySurface?: string };
  return { surface: s?.displaySurface ?? "unknown", width: s?.width ?? null, height: s?.height ?? null };
}
