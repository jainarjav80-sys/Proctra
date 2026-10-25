"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveDecision } from "@/app/(recruiter)/_actions/review";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

const OPTIONS = [
  ["ADVANCE", "Advance"],
  ["HOLD", "Hold"],
  ["REJECT", "Reject"],
  ["PENDING", "Undecided"],
] as const;

/** Final decision: recruiter-only. The AI never recommends or sets it. */
export function DecisionPanel({ interviewId, decision, notes, decidedBy, decidedAt }: { interviewId: string; decision: string; notes: string; decidedBy: string | null; decidedAt: string | null }) {
  const [d, setD] = useState(decision);
  const [n, setN] = useState(notes);
  const [pending, start] = useTransition();
  return (
    <Card className="break-inside-avoid">
      <CardHeader>
        <CardTitle className="text-base">Your decision</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <div className="flex flex-wrap gap-2 print:hidden" role="radiogroup" aria-label="Decision">
          {OPTIONS.map(([v, label]) => (
            <Button key={v} size="sm" variant={d === v ? "default" : "outline"} role="radio" aria-checked={d === v} onClick={() => setD(v)}>
              {label}
            </Button>
          ))}
        </div>
        <Textarea value={n} onChange={(e) => setN(e.target.value)} rows={4} placeholder="Notes for the hiring team" aria-label="Notes" className="print:hidden" />
        <p className="hidden whitespace-pre-wrap print:block">Decision: {d}{n ? `\n${n}` : ""}</p>
        <div className="flex items-center gap-3 print:hidden">
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await saveDecision(interviewId, { decision: d, notes: n });
                if ("error" in r) toast.error(r.error);
                else toast.success("Saved");
              })
            }
          >
            Save decision
          </Button>
          {decidedAt ? <span className="text-xs text-muted-foreground">Last decided by {decidedBy ?? "recruiter"} on {new Date(decidedAt).toLocaleString()}</span> : null}
        </div>
      </CardContent>
    </Card>
  );
}
