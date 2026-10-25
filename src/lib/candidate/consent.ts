/** Itemised consent shown at onboarding (shared by the candidate UI and the API). */

export const CONSENT_POLICY_VERSION = "2026-10-25.2"; // bump whenever consent text changes

export type ConsentScope =
  | "AUDIO_VIDEO_RECORDING"
  | "AI_TRANSCRIPTION_EVALUATION"
  | "AUTOMATED_PROCTORING"
  | "SCREEN_ENVIRONMENT_MONITORING"
  | "SECONDARY_CAMERA";

export interface ConsentItem {
  scope: ConsentScope;
  title: string;
  detail: string;
}

export function consentItems(opts: { secondaryCamPolicy: "MANDATORY" | "RECOMMENDED" | "DISABLED"; recordVideo: boolean }) {
  const items: (ConsentItem & { required: boolean })[] = [
    {
      scope: "AUDIO_VIDEO_RECORDING",
      title: opts.recordVideo ? "Camera, microphone and recording" : "Camera and microphone",
      detail: opts.recordVideo
        ? "Your camera and microphone stay on during the interview, and the session is recorded so the recruiter can review it."
        : "Your camera and microphone stay on during the interview. Video is not recorded.",
      required: true,
    },
    {
      scope: "AI_TRANSCRIPTION_EVALUATION",
      title: "AI transcription and evaluation",
      detail:
        "Your spoken answers are transcribed (by your browser's speech service) and scored by AI against the job's requirements. Only the words you say are scored, never your accent, appearance or speaking speed. A human recruiter reviews every score.",
      required: true,
    },
    {
      scope: "AUTOMATED_PROCTORING",
      title: "Automated integrity monitoring",
      detail:
        "Your browser checks face presence, extra people or devices in view, and prolonged attention away from the screen. Flags are only notes for a human reviewer; they never end the interview or change your score.",
      required: true,
    },
    {
      scope: "SCREEN_ENVIRONMENT_MONITORING",
      title: "Screen sharing and browser checks",
      detail: "You'll share your entire screen, which is recorded with the interview. Tab switches, leaving fullscreen and extra connected displays are logged with timestamps.",
      required: true,
    },
  ];
  if (opts.secondaryCamPolicy !== "DISABLED") {
    items.push({
      scope: "SECONDARY_CAMERA",
      title: "Phone camera (workspace view)",
      detail: "Your phone streams and records a side view of your desk during the interview. Its audio is never captured.",
      required: opts.secondaryCamPolicy === "MANDATORY",
    });
  }
  return items;
}
