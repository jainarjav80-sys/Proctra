import { z } from "zod";
import { CANDIDATE_TOKEN_HEADER, candidateError, requireCandidate } from "@/lib/candidate/session";

const body = z.object({
  browser: z.object({ userAgent: z.string().max(500), family: z.string().max(30), chromium: z.boolean(), speechRecognition: z.boolean() }),
  camera: z.object({ ok: z.boolean(), label: z.string().max(200).nullable(), width: z.number().nullable(), height: z.number().nullable() }),
  microphone: z.object({ ok: z.boolean(), label: z.string().max(200).nullable(), peakLevel: z.number().min(0).max(1) }),
  speechTest: z.object({ ok: z.boolean(), heard: z.string().max(300), engine: z.enum(["web-speech", "groq-whisper"]), nativeError: z.string().max(50).nullable() }),
  secondaryCamera: z.object({ paired: z.boolean() }).optional(),
  tts: z
    .object({
      engine: z.enum(["speech-synthesis", "orpheus", "kokoro"]),
      browserProbe: z.object({ ok: z.boolean(), voices: z.number(), english: z.number(), voice: z.string().nullable(), reason: z.string().nullable() }),
      heardConfirmed: z.literal(true),
      kokoroLoadMs: z.number().nullable(),
    })
    .optional(),
  screenShare: z.object({ surface: z.string().max(20), width: z.number().nullable(), height: z.number().nullable() }).nullable().optional(),
  faceCheck: z.object({ status: z.enum(["passed", "unavailable"]), faces: z.number().int().min(0).max(10) }).optional(),
  audio: z.object({
    headphoneLabelMatch: z.boolean(),
    echoTest: z.union([
      z.object({ ran: z.literal(true), baselineRms: z.number(), duringRms: z.number(), ratio: z.number(), result: z.enum(["pass", "warn"]) }),
      z.object({ ran: z.literal(false) }),
    ]),
    candidateConfirmedHeadphones: z.boolean(),
    detection: z.enum(["labels", "echo-test", "candidate-confirmed", "none"]),
  }),
  display: z.object({ fullscreen: z.boolean(), isExtended: z.boolean().nullable(), screenCount: z.number().int().nullable() }),
});

/** Stores the device/display audit taken before the interview starts. */
export async function POST(req: Request) {
  try {
    const { admin, interview } = await requireCandidate(req.headers.get(CANDIDATE_TOKEN_HEADER), req);
    if (!interview.consent) return Response.json({ error: "Consent is required first" }, { status: 403 });
    const parsed = body.safeParse(await req.json());
    if (!parsed.success) return Response.json({ error: "Invalid preflight payload" }, { status: 400 });
    const p = parsed.data;
    if (!p.camera.ok || !p.microphone.ok) return Response.json({ error: "Camera and microphone are required" }, { status: 400 });
    if (interview.proctoring_config?.require_screen_share !== false && p.screenShare?.surface !== "monitor") {
      return Response.json({ error: "Share your entire screen to start the interview" }, { status: 400 });
    }
    if (interview.secondary_cam_policy === "MANDATORY" && !p.secondaryCamera?.paired) {
      return Response.json({ error: "This interview requires your phone camera to be connected" }, { status: 400 });
    }
    if (interview.proctoring_config?.block_multi_monitor !== false && (p.display.isExtended || (p.display.screenCount ?? 1) > 1)) {
      return Response.json({ error: "Disconnect extra displays before starting" }, { status: 400 });
    }
    const { error } = await admin
      .from("interviews")
      .update({ preflight: { ...p, stt_engine: p.speechTest.engine, tts_engine: p.tts?.engine ?? null, at: new Date().toISOString() } })
      .eq("id", interview.id);
    if (error) throw new Error(error.message);
    return Response.json({ ok: true });
  } catch (e) {
    return candidateError(e);
  }
}
