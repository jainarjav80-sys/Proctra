"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { overrideScore } from "@/app/(recruiter)/_actions/review";
import { clockToWall, fmtMs, type Pause } from "@/lib/review/timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface Quote { quote: string; supports: string; start_ms: number | null }
interface Question {
  id: string;
  parent_id: string | null;
  primary_index: number;
  follow_up_index: number;
  category: string;
  text: string;
  status: string;
  transcript: string | null;
  ai_score: number | null;
  override_score: number | null;
  rubric_scores: { point: string; score: number; justification: string }[] | null;
  evidence_quotes: Quote[] | null;
  ai_summary: string | null;
  strengths: string[] | null;
  gaps: string[] | null;
  evaluation_status: string;
  evaluation_flags: string[] | null;
  barge_in_count: number;
}
interface Override { question_id: string; old_score: number | null; new_score: number; reason: string; recruiter_email: string | null; created_at: string }

const FLAG_LABEL: Record<string, string> = {
  LOW_TRANSCRIPT_CONFIDENCE: "Low transcript confidence: check the recording",
  TYPED_ANSWERS: "Answer was typed",
  INSTRUCTION_IN_ANSWER: "Answer contained instructions to the evaluator (ignored)",
  UNVERIFIED_QUOTES_REMOVED: "Some AI quotes failed verification and were removed",
};

export const seekTo = (wallMs: number) => window.dispatchEvent(new CustomEvent("review:seek", { detail: { wallMs } }));

/** Highlights each evidence quote inside the transcript (tolerant to punctuation/case). */
function Highlighted({ text, quotes }: { text: string; quotes: Quote[] }) {
  const patterns = quotes
    .map((q) => q.quote.trim().split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}']/gu, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).filter(Boolean).join("[^\\p{L}\\p{N}']+"))
    .filter(Boolean);
  if (!patterns.length) return <>{text}</>;
  const re = new RegExp(`(${patterns.join("|")})`, "giu");
  return (
    <>
      {text.split(re).map((part, i) => (i % 2 === 1 ? <mark key={i} className="rounded bg-warning-soft px-0.5 text-slate-900">{part}</mark> : <span key={i}>{part}</span>))}
    </>
  );
}

function OverrideForm({ interviewId, q }: { interviewId: string; q: Question }) {
  const [open, setOpen] = useState(false);
  const [score, setScore] = useState(String(q.override_score ?? q.ai_score ?? ""));
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  if (!open) return <Button size="xs" variant="outline" onClick={() => setOpen(true)} className="print:hidden">Override score</Button>;
  return (
    <div className="flex flex-wrap items-end gap-2 print:hidden">
      <Input type="number" min={0} max={10} step={0.5} value={score} onChange={(e) => setScore(e.target.value)} className="w-20" aria-label="New score" />
      <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" className="min-w-64 flex-1" aria-label="Override reason" />
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await overrideScore(interviewId, q.id, { score: Number(score), reason });
            if ("error" in r) toast.error(r.error);
            else {
              toast.success("Override saved");
              setOpen(false);
              setReason("");
            }
          })
        }
      >
        Save
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </div>
  );
}

export function ScoresPanel({
  interviewId,
  questions,
  overrides,
  overall,
  competencies,
  summary,
  pauses,
}: {
  interviewId: string;
  questions: Question[];
  overrides: Override[];
  overall: number | null;
  competencies: Record<string, { score: number; rationale: string }> | null;
  summary: { summary?: string; strengths?: string[]; gaps?: string[]; further_areas?: string[]; resume_consistency?: { claim: string; observation: string; consistent: boolean }[]; confidence?: string; confidence_reason?: string; needs_review?: number } | null;
  pauses: Pause[];
}) {
  const primaries = questions.filter((q) => q.follow_up_index === 0);
  const effective = (q: Question) => q.override_score ?? q.ai_score;
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Overall</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-[180px_1fr]">
          <div>
            <p className="text-display text-4xl font-bold" data-testid="overall-score">{overall !== null ? Number(overall).toFixed(1) : "–"}</p>
            <p className="text-sm text-muted-foreground">out of 10 (mean of question scores, AI-assisted)</p>
            {summary?.confidence ? <Badge variant="outline" className="mt-2">Confidence: {summary.confidence}</Badge> : null}
          </div>
          <div className="flex flex-col gap-2" aria-label="Competency breakdown">
            {competencies
              ? (["technical", "problem_solving", "communication", "experience_fit"] as const).map((k) => (
                  <div key={k} className="grid grid-cols-[140px_1fr_40px] items-center gap-2 text-sm" title={competencies[k]?.rationale}>
                    <span className="capitalize">{k.replace("_", " ")}</span>
                    <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${(competencies[k]?.score ?? 0) * 10}%` }} />
                    </div>
                    <span className="font-mono text-xs">{competencies[k]?.score?.toFixed(1)}</span>
                  </div>
                ))
              : <p className="text-sm text-muted-foreground">Competencies appear once the evaluation finishes.</p>}
          </div>
          {summary?.summary ? (
            <div className="flex flex-col gap-3 text-sm md:col-span-2">
              <p>{summary.summary}</p>
              <div className="grid gap-4 md:grid-cols-3">
                <div><p className="font-medium">Strengths</p><ul className="list-disc pl-5 text-muted-foreground">{summary.strengths?.map((s) => <li key={s}>{s}</li>)}</ul></div>
                <div><p className="font-medium">Gaps</p><ul className="list-disc pl-5 text-muted-foreground">{summary.gaps?.map((s) => <li key={s}>{s}</li>)}</ul></div>
                <div><p className="font-medium">Probe further</p><ul className="list-disc pl-5 text-muted-foreground">{summary.further_areas?.map((s) => <li key={s}>{s}</li>)}</ul></div>
              </div>
              {summary.resume_consistency?.length ? (
                <div>
                  <p className="font-medium">Resume vs. answers</p>
                  <ul className="text-muted-foreground">
                    {summary.resume_consistency.map((r) => (
                      <li key={r.claim}>{r.consistent ? "✓" : "⚠"} <span className="text-foreground">{r.claim}</span>: {r.observation}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {summary.confidence_reason ? <p className="text-xs text-muted-foreground">Confidence: {summary.confidence_reason}</p> : null}
              <p className="text-xs text-muted-foreground">AI scores are decision support only. No hire/reject recommendation is made; the decision is yours.</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {primaries.map((q) => {
        const followUps = questions.filter((f) => f.parent_id === q.id);
        const quotes = q.evidence_quotes ?? [];
        const history = overrides.filter((o) => o.question_id === q.id);
        return (
          <Card key={q.id} data-testid={`question-card-${q.primary_index}`} className="break-inside-avoid">
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap gap-1">
                  <Badge variant="secondary">Q{q.primary_index}</Badge>
                  <Badge variant="outline">{q.category}</Badge>
                  <Badge variant="outline">{q.status}</Badge>
                  {q.evaluation_status === "NEEDS_REVIEW" ? <Badge variant="destructive">Needs review</Badge> : null}
                  {q.barge_in_count ? <Badge variant="outline">{q.barge_in_count} interruption(s)</Badge> : null}
                </div>
                <CardTitle className="text-base font-medium">{q.text}</CardTitle>
              </div>
              <div className="text-right">
                <p className="text-2xl font-semibold">{effective(q) !== null ? Number(effective(q)).toFixed(1) : "–"}<span className="text-sm text-muted-foreground"> / 10</span></p>
                {q.override_score !== null ? <p className="text-xs text-muted-foreground">AI score {Number(q.ai_score).toFixed(1)}, adjusted by recruiter</p> : null}
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 text-sm">
              {q.ai_summary ? <p>{q.ai_summary}</p> : null}
              {(q.evaluation_flags ?? []).map((f) => <p key={f} className="text-xs text-warning">⚑ {FLAG_LABEL[f] ?? f}</p>)}
              {q.rubric_scores?.length ? (
                <table className="w-full text-left text-xs">
                  <thead><tr className="text-muted-foreground"><th className="py-1">Rubric point</th><th>Score</th><th>Why</th></tr></thead>
                  <tbody>
                    {q.rubric_scores.map((r) => (
                      <tr key={r.point} className="border-t align-top"><td className="py-1 pr-2">{r.point}</td><td className="pr-2 font-mono">{r.score}/10</td><td className="text-muted-foreground">{r.justification}</td></tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
              <div>
                <p className="mb-1 font-medium">Transcript</p>
                <p className="whitespace-pre-wrap rounded-md bg-muted p-3 leading-relaxed" data-testid={`transcript-${q.primary_index}`}>
                  {q.transcript ? <Highlighted text={q.transcript} quotes={quotes} /> : <span className="text-muted-foreground">No answer recorded.</span>}
                </p>
              </div>
              {followUps.map((f) => (
                <div key={f.id} className="border-l-2 pl-3">
                  <p className="text-xs font-medium text-muted-foreground">Follow-up: {f.text}</p>
                  <p className="whitespace-pre-wrap">{f.transcript ? <Highlighted text={f.transcript} quotes={quotes} /> : <span className="text-muted-foreground">No answer.</span>}</p>
                </div>
              ))}
              {quotes.length ? (
                <div className="flex flex-col gap-1">
                  <p className="font-medium">Evidence</p>
                  {quotes.map((qt) => (
                    <button
                      key={qt.quote}
                      className="text-left text-xs hover:underline"
                      onClick={() => qt.start_ms !== null && seekTo(clockToWall(qt.start_ms, pauses))}
                      disabled={qt.start_ms === null}
                      data-testid="evidence-quote"
                    >
                      <span className="font-mono text-muted-foreground">{qt.start_ms !== null ? fmtMs(clockToWall(qt.start_ms, pauses)) : "–"}</span> “{qt.quote}” <span className="text-muted-foreground">({qt.supports})</span>
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="grid gap-3 md:grid-cols-2">
                {q.strengths?.length ? <div><p className="font-medium">Strengths</p><ul className="list-disc pl-5 text-muted-foreground">{q.strengths.map((s) => <li key={s}>{s}</li>)}</ul></div> : null}
                {q.gaps?.length ? <div><p className="font-medium">Gaps</p><ul className="list-disc pl-5 text-muted-foreground">{q.gaps.map((s) => <li key={s}>{s}</li>)}</ul></div> : null}
              </div>
              {history.length ? (
                <ul className="text-xs text-muted-foreground" data-testid="override-history">
                  {history.map((o) => (
                    <li key={o.created_at}>
                      {new Date(o.created_at).toLocaleString()}: {o.recruiter_email ?? "recruiter"} changed {o.old_score ?? "–"} → {o.new_score}: “{o.reason}”
                    </li>
                  ))}
                </ul>
              ) : null}
              <OverrideForm interviewId={interviewId} q={q} />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
