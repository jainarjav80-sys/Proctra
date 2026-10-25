"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { createResumeUpload, processResume, retryResumeExtraction } from "@/app/(recruiter)/_actions/interviews";
import { createClient } from "@/lib/supabase/client";
import type { ResumeProfile } from "@/lib/resume/profile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const ACCEPT = ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function ResumePanel({
  interviewId,
  status,
  error,
  profile,
  locked,
}: {
  interviewId: string;
  status: "NONE" | "UPLOADED" | "PARSED" | "FAILED";
  error: string | null;
  profile: ResumeProfile | null;
  locked: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function upload(file: File) {
    start(async () => {
      setStep("Uploading…");
      const target = await createResumeUpload(interviewId, { name: file.name, size: file.size, type: file.type });
      if ("error" in target) {
        toast.error(target.error);
        setStep(null);
        return;
      }
      const { error: upErr } = await createClient()
        .storage.from("resumes")
        .uploadToSignedUrl(target.path, target.token, file, { contentType: file.type || undefined, upsert: true });
      if (upErr) {
        toast.error(`Upload failed: ${upErr.message}`);
        setStep(null);
        return;
      }
      setStep("Parsing and extracting…");
      const result = await processResume(interviewId, target.path);
      setStep(null);
      if ("error" in result) toast.error(result.error);
      else toast.success("Resume parsed");
    });
  }

  function retry() {
    start(async () => {
      setStep("Extracting…");
      const r = await retryResumeExtraction(interviewId);
      setStep(null);
      if ("error" in r) toast.error(r.error);
      else toast.success("Resume parsed");
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Resume</CardTitle>
        <Badge variant={status === "PARSED" ? "default" : status === "FAILED" ? "destructive" : "secondary"}>{status}</Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          aria-label="Resume file (PDF or DOCX)"
          tabIndex={-1}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = "";
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => input.current?.click()} disabled={pending || locked}>
            {status === "NONE" ? "Upload PDF / DOCX" : "Replace resume"}
          </Button>
          {status === "FAILED" || status === "UPLOADED" ? (
            <Button size="sm" variant="outline" onClick={retry} disabled={pending || locked}>
              Retry extraction
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">PDF or DOCX up to 15 MB. Text-based files only (no OCR).</p>
        {step ? <p className="text-muted-foreground">{step}</p> : null}
        {error && status === "FAILED" ? (
          <p role="alert" className="text-danger">
            {error}
          </p>
        ) : null}
        {profile ? (
          <div className="flex flex-col gap-3">
            <p className="font-medium">{profile.headline}</p>
            <p className="text-muted-foreground">{profile.total_years_experience} years experience</p>
            <div className="flex flex-wrap gap-1">
              {profile.skills.map((s) => (
                <Badge key={s.name} variant="outline" title={s.evidence}>
                  {s.name}
                </Badge>
              ))}
            </div>
            <div>
              <p className="mb-1 font-medium">Experience</p>
              <ul className="flex flex-col gap-1 text-muted-foreground">
                {profile.experience.map((x, i) => (
                  <li key={i}>
                    {x.title} · {x.company}{" "}
                    <span className="font-mono text-xs">
                      {x.start}–{x.end}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            {profile.projects.length ? (
              <div>
                <p className="mb-1 font-medium">Projects</p>
                <ul className="flex flex-col gap-1 text-muted-foreground">
                  {profile.projects.map((p) => (
                    <li key={p.name}>
                      {p.name}: {p.tech_stack.join(", ")}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {profile.education.length || profile.certifications.length ? (
              <div className="text-muted-foreground">
                {profile.education.map((e) => `${e.degree}, ${e.institution} ${e.year}`).join(" · ")}
                {profile.certifications.length ? ` · Certs: ${profile.certifications.join(", ")}` : ""}
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
