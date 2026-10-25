import { CANDIDATE_TOKEN_HEADER, candidateError, requireCandidate } from "@/lib/candidate/session";
import { resumeInterview } from "@/lib/interview/engine";

/** Resumes a policy pause and re-asks the current question. */
export async function POST(req: Request) {
  try {
    const { admin, interview } = await requireCandidate(req.headers.get(CANDIDATE_TOKEN_HEADER), req);
    return Response.json(await resumeInterview(admin, interview));
  } catch (e) {
    return candidateError(e);
  }
}
