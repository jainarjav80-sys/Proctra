import { CANDIDATE_TOKEN_HEADER, candidateError, requireCandidate } from "@/lib/candidate/session";
import { InterviewPausedError, TurnConflictError, processTurn, startOrResume, turnSchema } from "@/lib/interview/engine";
import { queueEvaluation } from "@/lib/evaluation/schedule";

export const maxDuration = 30;

/** One candidate turn → the server's next action. Retried turns with the same turnId are idempotent. */
export async function POST(req: Request) {
  try {
    const { admin, interview } = await requireCandidate(req.headers.get(CANDIDATE_TOKEN_HEADER), req);
    const parsed = turnSchema.safeParse(await req.json());
    if (!parsed.success) return Response.json({ error: "Invalid turn payload" }, { status: 400 });
    try {
      const res = await processTurn(admin, interview, parsed.data);
      // Interview finished → evaluate in the background (never inside the candidate's request).
      if (res.action.type === "END") await queueEvaluation(admin, interview.id, new URL(req.url).origin);
      return Response.json(res);
    } catch (e) {
      if (e instanceof InterviewPausedError) return Response.json({ error: "The interview is paused", paused: e.reason }, { status: 423 });
      if (!(e instanceof TurnConflictError)) throw e;
      // Another tab (or a lost response) advanced the state: return the authoritative current step.
      const { interview: fresh } = await requireCandidate(req.headers.get(CANDIDATE_TOKEN_HEADER), req);
      return Response.json({ conflict: true, ...(await startOrResume(admin, fresh)) }, { status: 409 });
    }
  } catch (e) {
    return candidateError(e);
  }
}
