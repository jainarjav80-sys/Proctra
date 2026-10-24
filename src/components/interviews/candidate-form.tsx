"use client";

import { useActionState } from "react";
import { createInterview, type CandidateFormState } from "@/app/(recruiter)/_actions/interviews";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Step 1 of adding a candidate; the resume is uploaded on the interview page. */
export function CandidateForm({ jobId }: { jobId: string }) {
  const [state, action, pending] = useActionState<CandidateFormState, FormData>(createInterview, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="jobId" value={jobId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Candidate name</Label>
          <Input id="name" name="name" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Candidate email</Label>
          <Input id="email" name="email" type="email" required />
        </div>
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add candidate & continue"}
        </Button>
      </div>
    </form>
  );
}
