import { CANDIDATE_TOKEN_HEADER, candidateError, requireCandidate } from "@/lib/candidate/session";
import { CONSENT_POLICY_VERSION, consentItems } from "@/lib/candidate/consent";

export const dynamic = "force-dynamic";

/** Candidate-safe view of the interview: no rubric, resume or evaluation data. */
export async function GET(req: Request) {
  try {
    const { admin, interview } = await requireCandidate(req.headers.get(CANDIDATE_TOKEN_HEADER), req);
    const { count } = await admin
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("interview_id", interview.id)
      .eq("follow_up_index", 0);
    const proctoring = interview.proctoring_config ?? {};
    return Response.json({
      candidateName: interview.candidate_name,
      jobTitle: (interview.jobs as { title: string } | null)?.title ?? "",
      questionCount: count ?? 0,
      durationMinutes: interview.duration_minutes,
      responseTimeLimitSec: interview.response_time_limit_sec,
      secondaryCamPolicy: interview.secondary_cam_policy,
      proctoring,
      status: interview.status,
      consented: Boolean(interview.consent),
      preflightDone: Boolean(interview.preflight),
      policyVersion: CONSENT_POLICY_VERSION,
      consentItems: consentItems({ secondaryCamPolicy: interview.secondary_cam_policy, recordVideo: proctoring.record_video !== false }),
    });
  } catch (e) {
    return candidateError(e);
  }
}
