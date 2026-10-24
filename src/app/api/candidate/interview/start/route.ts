import { CANDIDATE_TOKEN_HEADER, candidateError, requireCandidate } from "@/lib/candidate/session";
import { startOrResume } from "@/lib/interview/engine";

export const maxDuration = 30;

/** Starts the interview, or returns the current question when resuming after a refresh. */
export async function POST(req: Request) {
  try {
    const { admin, interview } = await requireCandidate(req.headers.get(CANDIDATE_TOKEN_HEADER), req);
    if (!interview.consent || !interview.preflight) {
      return Response.json({ error: "Finish the consent and device checks first" }, { status: 403 });
    }
    return Response.json(await startOrResume(admin, interview));
  } catch (e) {
    return candidateError(e);
  }
}
