import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRecruiter } from "@/lib/auth/recruiter";
import { DEFAULT_DISTRIBUTION, resolveQuestionCount, type CategoryDistribution } from "@/lib/interview/config";
import { buildInviteUrl } from "@/lib/interviews/invite";
import { resumeProfileSchema } from "@/lib/resume/profile";
import { RecruiterHeader } from "@/components/recruiter/recruiter-header";
import { BlueprintEditor, type BlueprintQuestion } from "@/components/interviews/blueprint-editor";
import { ConfigForm } from "@/components/interviews/config-form";
import { InvitePanel } from "@/components/interviews/invite-panel";
import { ResumePanel } from "@/components/interviews/resume-panel";
import { Badge } from "@/components/ui/badge";

export const maxDuration = 60; // resume extraction and blueprint generation call the LLM

const DEFAULT_PROCTORING = {
  enforce_fullscreen: true,
  block_multi_monitor: true,
  gaze_tracking: true,
  object_detection: true,
  record_video: true,
};

export default async function InterviewPage({ params }: PageProps<"/interviews/[interviewId]">) {
  const { interviewId } = await params;
  const { supabase, user } = await requireRecruiter();
  const { data: interview } = await supabase
    .from("interviews")
    .select("*, jobs(id, title, jd_analysis)")
    .eq("id", interviewId)
    .maybeSingle();
  if (!interview) notFound();

  const { data: questions } = await supabase
    .from("questions")
    .select("id, primary_index, source, category, difficulty, target_skills, text, rubric")
    .eq("interview_id", interviewId)
    .eq("follow_up_index", 0)
    .order("primary_index");

  const profile = resumeProfileSchema.safeParse(interview.resume_profile);
  const locked = Boolean(interview.blueprint_approved_at);
  const inviteUrl =
    interview.invite_nonce && interview.invite_expires_at
      ? await buildInviteUrl(interview.id, interview.invite_nonce, interview.invite_expires_at)
      : null;

  return (
    <>
      <RecruiterHeader email={user.email} />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href={`/jobs/${interview.jobs.id}`} className="text-sm text-muted-foreground hover:text-foreground">
              ← {interview.jobs.title}
            </Link>
            <h1 className="text-2xl font-semibold">{interview.candidate_name}</h1>
            <p className="text-sm text-muted-foreground">{interview.candidate_email}</p>
          </div>
          <Badge variant="secondary">{interview.status}</Badge>
        </div>
        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="flex flex-col gap-6">
            <BlueprintEditor
              interviewId={interviewId}
              questions={(questions ?? []) as BlueprintQuestion[]}
              target={resolveQuestionCount(interview.question_count)}
              approvedAt={interview.blueprint_approved_at}
              canGenerate={profile.success}
              canUnlock={["READY", "DRAFT"].includes(interview.status)}
            />
            <ConfigForm
              interviewId={interviewId}
              locked={locked}
              initial={{
                questionCount: interview.question_count,
                durationMinutes: interview.duration_minutes,
                responseTimeLimitSec: interview.response_time_limit_sec,
                maxFollowUps: interview.max_follow_ups,
                difficultyLevel: interview.difficulty_level,
                categoryDistribution: { ...DEFAULT_DISTRIBUTION, ...(interview.category_distribution as CategoryDistribution) },
                secondaryCamPolicy: interview.secondary_cam_policy,
                proctoring: { ...DEFAULT_PROCTORING, ...interview.proctoring_config },
              }}
            />
          </div>
          <div className="flex flex-col gap-6">
            <InvitePanel
              interviewId={interviewId}
              approved={locked}
              initialUrl={inviteUrl}
              initialExpiresAt={inviteUrl ? interview.invite_expires_at : null}
            />
            <ResumePanel
              interviewId={interviewId}
              status={interview.resume_status}
              error={interview.resume_error}
              profile={profile.success ? profile.data : null}
              locked={locked}
            />
          </div>
        </div>
      </main>
    </>
  );
}
