import Link from "next/link";
import { loadReview } from "@/lib/review/load";
import { fmtMs } from "@/lib/review/timeline";
import { RecruiterHeader } from "@/components/recruiter/recruiter-header";
import { DecisionPanel } from "@/components/review/decision-panel";
import { EvalStatus } from "@/components/review/eval-status";
import { ProctoringPanel } from "@/components/review/proctoring-panel";
import { ReviewTabs } from "@/components/review/review-tabs";
import { ScoresPanel } from "@/components/review/scores-panel";
import { SyncedPlayer } from "@/components/review/synced-player";
import { Badge } from "@/components/ui/badge";

export const maxDuration = 30;

const ENGINE: Record<string, string> = {
  "web-speech": "browser speech recognition",
  "groq-whisper": "Whisper (server)",
  typed: "typed answers",
  "speech-synthesis": "browser voice",
  orpheus: "Orpheus voice (server)",
  kokoro: "Kokoro voice (on device)",
};

export default async function InterviewReviewPage({ params }: PageProps<"/dashboard/interviews/[id]">) {
  const { id } = await params;
  const r = await loadReview(id);
  const iv = r.interview;
  const pre = (iv.preflight ?? {}) as {
    stt_engine?: string;
    stt_engines_used?: string[];
    tts_engine?: string;
    tts_engines_used?: string[];
    audio?: { detection?: string; echoTest?: { ran: boolean; result?: string; ratio?: number } };
  };
  const stt = (pre.stt_engines_used ?? [pre.stt_engine]).filter(Boolean).map((e) => ENGINE[e!] ?? e).join(" → ");
  const tts = (pre.tts_engines_used ?? [pre.tts_engine]).filter(Boolean).map((e) => ENGINE[e!] ?? e).join(" → ");
  const echo = pre.audio?.echoTest?.ran ? `echo test ${pre.audio.echoTest.result} (×${pre.audio.echoTest.ratio})` : "echo test not run";
  const headphones = pre.audio?.detection && pre.audio.detection !== "none" ? `headphones (${pre.audio.detection})` : "no headphones detected";
  const bargeIns = r.questions.reduce((s, q) => s + (q.barge_in_count ?? 0), 0);
  const finished = ["COMPLETED", "EVALUATED", "EXPIRED"].includes(iv.status);

  return (
    <>
      <div className="print:hidden">
        <RecruiterHeader email={r.user.email} />
      </div>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-6 print:p-0">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground print:hidden">
              ← Interviews
            </Link>
            <h1 className="text-2xl font-semibold">{iv.candidate_name}</h1>
            <p className="text-sm text-muted-foreground">
              {iv.jobs?.title} · {iv.candidate_email}
            </p>
            <p className="mt-1 text-xs text-muted-foreground" data-testid="review-meta">
              {iv.started_at ? new Date(iv.started_at).toLocaleString() : "Not started"} · duration {fmtMs(r.durationMs)} (excl. pauses) · voice: {tts || "–"} · speech recognition: {stt || "–"} · {headphones}, {echo}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge variant="secondary">{iv.status}</Badge>
            <EvalStatus interviewId={iv.id} initial={iv.evaluation_status} error={iv.evaluation_error} canRerun={finished} />
          </div>
        </div>

        <ReviewTabs
          scores={
            <ScoresPanel
              interviewId={iv.id}
              questions={r.questions}
              overrides={r.overrides}
              overall={iv.overall_score}
              competencies={iv.competency_scores}
              summary={iv.evaluation_summary}
              pauses={r.pauses}
            />
          }
          recording={<SyncedPlayer sessions={r.sessions} wallDurationMs={r.wallDurationMs} markers={r.markers} pauses={r.pauses} />}
          proctoring={<ProctoringPanel events={r.events} bargeIns={bargeIns} />}
        />

        <DecisionPanel interviewId={iv.id} decision={iv.recruiter_decision} notes={iv.recruiter_notes ?? ""} decidedBy={iv.decided_by_email} decidedAt={iv.decided_at} />
      </main>
    </>
  );
}
