"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { reanalyzeJob } from "@/app/(recruiter)/_actions/jobs";
import type { JdAnalysis } from "@/lib/jobs/analysis";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function JdAnalysisCard({ jobId, analysis }: { jobId: string; analysis: JdAnalysis | null }) {
  const [pending, start] = useTransition();
  const rerun = () =>
    start(async () => {
      const r = await reanalyzeJob(jobId);
      if (r.error) toast.error(r.error);
      else toast.success("Analysis updated");
    });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">AI job analysis</CardTitle>
        <Button size="sm" variant="outline" onClick={rerun} disabled={pending}>
          {pending ? "Analysing…" : "Re-run analysis"}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        {!analysis ? (
          <p className="text-muted-foreground">No analysis yet. It runs when the job is saved.</p>
        ) : (
          <>
            <p>{analysis.summary}</p>
            <p>
              <span className="text-muted-foreground">Calibrated seniority: </span>
              <Badge variant="secondary">{analysis.seniority}</Badge>
            </p>
            <div>
              <p className="mb-1 font-medium">Competencies</p>
              <ul className="list-disc pl-5 text-muted-foreground">
                {analysis.competencies.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 font-medium">Responsibilities</p>
              <ul className="list-disc pl-5 text-muted-foreground">
                {analysis.responsibilities.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
