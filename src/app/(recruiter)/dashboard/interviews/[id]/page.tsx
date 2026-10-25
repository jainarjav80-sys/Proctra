import Link from "next/link";
import { loadReview } from "@/lib/review/load";
import { fmtMs } from "@/lib/review/timeline";
import { DecisionPanel } from "@/components/review/decision-panel";
import { EvalStatus } from "@/components/review/eval-status";
import { ProctoringPanel } from "@/components/review/proctoring-panel";
import { ReviewTabs } from "@/components/review/review-tabs";
import { ScoresPanel } from "@/components/review/scores-panel";
import { SyncedPlayer } from "@/components/review/synced-player";
import { isFinished } from "@/lib/interview/status";
import { StatusBadge } from "@/components/interviews/status-badge";

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
  const finished = isFinished(iv.status);
  const meta: [string, string][] = [
    ["Started", iv.started_at ? new Date(iv.started_at).toLocaleString() : "Not started"],
    ["Duration", `${fmtMs(r.durationMs)} (excl. pauses)`],
    ["Interviewer voice", tts || "–"],
    ["Speech recognition", stt || "–"],
    ["Audio check", `${headphones}, ${echo}`],
  ];

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-4 pb-20 sm:p-6 sm:pb-20 lg:pb-6 print:p-0">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <Link href="/dashboard" className="focus-ring rounded-sm text-sm text-muted-foreground hover:text-foreground print:hidden">
              ← Interviews
            </Link>
            <h1 className="text-2xl font-semibold">{iv.candidate_name}</h1>
            <p className="break-words text-sm text-muted-foreground">
              {iv.jobs?.title} · {iv.candidate_email}
            </p>
          </div>
          <div className="flex flex-col gap-3 lg:items-end">
            <div className="flex items-center gap-3">
              <StatusBadge status={iv.status} />
              {iv.overall_score !== null ? (
                <p className="text-sm text-muted-foreground" data-testid="header-score">
                  <span className="font-mono text-lg font-semibold text-foreground">{Number(iv.overall_score).toFixed(1)}</span> / 10 overall
                </p>
              ) : null}
            </div>
            <EvalStatus interviewId={iv.id} initial={iv.evaluation_status} error={iv.evaluation_error} canRerun={finished} />
          </div>
        </div>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-xl border bg-card p-4 text-sm min-[480px]:grid-cols-2 lg:grid-cols-5" data-testid="review-meta">
          {meta.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="break-words">{v}</dd>
            </div>
          ))}
        </dl>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] print:block">
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
        {/* The decision stays in view on desktop; on smaller screens it follows the tabs, with a shortcut button. */}
        <aside id="decision" aria-label="Hiring decision" className="scroll-mt-4 lg:sticky lg:top-4 lg:self-start print:mt-6">
          <DecisionPanel interviewId={iv.id} decision={iv.recruiter_decision} notes={iv.recruiter_notes ?? ""} decidedBy={iv.decided_by_email} decidedAt={iv.decided_at} />
        </aside>
      </div>
      <a
        href="#decision"
        className="focus-ring fixed right-4 bottom-4 z-10 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-overlay lg:hidden print:hidden"
      >
        Decide
      </a>
    </main>
  );
}
