import { CANDIDATE_TOKEN_HEADER, candidateError, requireCandidate } from "@/lib/candidate/session";
import { TurnConflictError, processTurn, startOrResume, turnSchema } from "@/lib/interview/engine";

export const maxDuration = 30;

/** One candidate turn → the server's next action. Retried turns with the same turnId are idempotent. */
export async function POST(req: Request) {
  try {
    const { admin, interview } = await requireCandidate(req.headers.get(CANDIDATE_TOKEN_HEADER));
    const parsed = turnSchema.safeParse(await req.json());
    if (!parsed.success) return Response.json({ error: "Invalid turn payload" }, { status: 400 });
    try {
      return Response.json(await processTurn(admin, interview, parsed.data));
    } catch (e) {
      if (!(e instanceof TurnConflictError)) throw e;
      // Another tab (or a lost response) advanced the state: return the authoritative current step.
      const { interview: fresh } = await requireCandidate(req.headers.get(CANDIDATE_TOKEN_HEADER));
      return Response.json({ conflict: true, ...(await startOrResume(admin, fresh)) }, { status: 409 });
    }
  } catch (e) {
    return candidateError(e);
  }
}
