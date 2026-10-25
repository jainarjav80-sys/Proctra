import { z } from "zod";
import { CANDIDATE_TOKEN_HEADER, candidateError, requireCandidate } from "@/lib/candidate/session";
import { pauseInterview } from "@/lib/interview/engine";

const body = z.object({ reason: z.enum(["SCREEN_SHARE_STOPPED", "PHONE_CAMERA_LOST"]) });

/** Policy pause: freezes the interview at the current question until the requirement is restored. */
export async function POST(req: Request) {
  try {
    const { admin, interview } = await requireCandidate(req.headers.get(CANDIDATE_TOKEN_HEADER), req);
    const parsed = body.safeParse(await req.json());
    if (!parsed.success) return Response.json({ error: "Invalid pause reason" }, { status: 400 });
    return Response.json(await pauseInterview(admin, interview, parsed.data.reason));
  } catch (e) {
    return candidateError(e);
  }
}
