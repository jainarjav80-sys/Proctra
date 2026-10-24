import { z } from "zod";
import { CANDIDATE_TOKEN_HEADER, candidateError, requireCandidate } from "@/lib/candidate/session";

const body = z.object({
  browser: z.object({ userAgent: z.string().max(500), chromium: z.boolean(), speechRecognition: z.boolean() }),
  camera: z.object({ ok: z.boolean(), label: z.string().max(200).nullable(), width: z.number().nullable(), height: z.number().nullable() }),
  microphone: z.object({ ok: z.boolean(), label: z.string().max(200).nullable(), peakLevel: z.number().min(0).max(1) }),
  speechTest: z.object({ ok: z.boolean(), heard: z.string().max(300) }),
  display: z.object({ fullscreen: z.boolean(), isExtended: z.boolean().nullable(), screenCount: z.number().int().nullable() }),
});

/** Stores the device/display audit taken before the interview starts. */
export async function POST(req: Request) {
  try {
    const { admin, interview } = await requireCandidate(req.headers.get(CANDIDATE_TOKEN_HEADER));
    if (!interview.consent) return Response.json({ error: "Consent is required first" }, { status: 403 });
    const parsed = body.safeParse(await req.json());
    if (!parsed.success) return Response.json({ error: "Invalid preflight payload" }, { status: 400 });
    const p = parsed.data;
    if (!p.camera.ok || !p.microphone.ok) return Response.json({ error: "Camera and microphone are required" }, { status: 400 });
    if (interview.proctoring_config?.block_multi_monitor !== false && (p.display.isExtended || (p.display.screenCount ?? 1) > 1)) {
      return Response.json({ error: "Disconnect extra displays before starting" }, { status: 400 });
    }
    const { error } = await admin
      .from("interviews")
      .update({ preflight: { ...p, at: new Date().toISOString() } })
      .eq("id", interview.id);
    if (error) throw new Error(error.message);
    return Response.json({ ok: true });
  } catch (e) {
    return candidateError(e);
  }
}
