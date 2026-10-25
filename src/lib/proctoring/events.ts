/** Proctoring event vocabulary shared by the browser detectors, the API and the correlator. */

export const OBSERVED_TYPES = [
  "FACE_ABSENT",
  "MULTIPLE_FACES",
  "GAZE_AWAY",
  "PHONE_IN_VIEW",
  "BOOK_IN_VIEW",
  "EXTRA_PERSON",
  "TAB_HIDDEN",
  "WINDOW_BLUR",
  "FULLSCREEN_EXIT",
  "EXTENDED_DISPLAY",
  "CLIPBOARD_PASTE",
  "CLIPBOARD_COPY",
  "DEVTOOLS_SHORTCUT",
  "CAMERA_LOST",
  "MIC_LOST",
  "CAMERA_COVERED",
  "VIRTUAL_CAMERA",
  "SECONDARY_CAM_DISCONNECTED",
] as const;
export type ObservedType = (typeof OBSERVED_TYPES)[number];

export type Severity = "INFO" | "LOW" | "MEDIUM" | "HIGH";
export type Source = "PRIMARY_CAM" | "SECONDARY_CAM" | "SCREEN" | "AUDIO" | "BROWSER" | "SYSTEM";

export interface ClientEvent {
  clientId: string;
  type: ObservedType;
  source: Source;
  severity: Severity;
  startMs: number;
  endMs: number | null;
  confidence: number | null;
  description: string;
  telemetry: Record<string, unknown>;
  /** JPEG data URL captured at onset (MEDIUM+ visual events). */
  snapshot?: string;
}

/** Benign explanations shown next to every observed event (non-accusatory by design). */
export const OBSERVED_BENIGN: Partial<Record<ObservedType, string[]>> = {
  FACE_ABSENT: ["Adjusting the chair, fetching water, or poor lighting."],
  MULTIPLE_FACES: ["Someone passing behind the candidate, or a face on a poster/screen."],
  GAZE_AWAY: ["Looking away while thinking is normal; webcam gaze estimates are approximate."],
  PHONE_IN_VIEW: ["A phone resting face-down on the desk, or the paired companion phone itself."],
  BOOK_IN_VIEW: ["Books on a shelf behind the candidate."],
  EXTRA_PERSON: ["A family member or housemate passing through a shared room."],
  TAB_HIDDEN: ["An operating-system notification or accidental keyboard shortcut."],
  WINDOW_BLUR: ["A system popup (battery, updates, password manager) briefly took focus."],
  FULLSCREEN_EXIT: ["Pressing Esc by accident."],
  EXTENDED_DISPLAY: ["A docked laptop or projector the candidate forgot was connected."],
  CLIPBOARD_PASTE: ["Pasting into the typed-answer fallback, e.g. after dictating elsewhere."],
  CLIPBOARD_COPY: ["Copying text out of habit."],
  DEVTOOLS_SHORTCUT: ["Keyboard shortcuts pressed accidentally."],
  CAMERA_LOST: ["USB cable or driver glitch, or another app grabbed the camera."],
  MIC_LOST: ["Headset disconnected or Bluetooth dropout."],
  CAMERA_COVERED: ["Very dark room or a privacy shutter left half-closed."],
  VIRTUAL_CAMERA: ["Some laptops ship with virtual-camera software enabled by default."],
  SECONDARY_CAM_DISCONNECTED: ["Phone screen locked, battery died or Wi-Fi dropped."],
};
