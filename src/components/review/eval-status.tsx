"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { rerunEvaluation } from "@/app/(recruiter)/_actions/review";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/** Shows evaluation status, polls while it runs (refreshing the page when done), re-run + export. */
export function EvalStatus({ interviewId, initial, error, canRerun }: { interviewId: string; initial: string; error: string | null; canRerun: boolean }) {
  const [status, setStatus] = useState(initial);
  const [pending, start] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (!["PENDING", "RUNNING"].includes(status)) return;
    const id = setInterval(async () => {
      const r = await fetch(`/api/recruiter/interviews/${interviewId}/evaluation`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
      if (!r) return;
      setStatus(r.status);
      if (r.status === "DONE" || r.status === "FAILED") router.refresh();
    }, 3000);
    return () => clearInterval(id);
  }, [status, interviewId, router]);

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <Badge variant={status === "DONE" ? "default" : status === "FAILED" ? "destructive" : "secondary"} data-testid="eval-status">
        Evaluation: {status === "NONE" ? "not started" : status.toLowerCase()}
      </Badge>
      {status === "FAILED" && error ? <span className="text-xs text-danger">{error.slice(0, 120)}</span> : null}
      {canRerun ? (
        <Button
          size="sm"
          variant="outline"
          disabled={pending || status === "RUNNING"}
          onClick={() =>
            start(async () => {
              const r = await rerunEvaluation(interviewId);
              if ("error" in r) toast.error(r.error);
              else {
                setStatus("PENDING");
                toast.success("Evaluation queued");
              }
            })
          }
        >
          Re-run evaluation
        </Button>
      ) : null}
      <Button size="sm" variant="outline" onClick={() => window.print()}>
        Download PDF
      </Button>
      <Button size="sm" variant="outline" asChild>
        <a href={`/api/recruiter/interviews/${interviewId}/scores.csv`}>Scores CSV</a>
      </Button>
    </div>
  );
}
