"use client";

import { useActionState, useState } from "react";
import { saveJob, type JobFormState } from "@/app/(recruiter)/_actions/jobs";
import type { JobSkill } from "@/lib/jobs/analysis";
import { NativeSelect } from "@/components/forms/native-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const LEVELS = [
  ["INTERN", "Intern"],
  ["ENTRY", "Entry (0–2 yrs)"],
  ["MID", "Mid (2–5 yrs)"],
  ["SENIOR", "Senior (5–8 yrs)"],
  ["STAFF", "Staff / Principal (8+ yrs)"],
] as const;

export interface JobFormValues {
  id?: string;
  title: string;
  description: string;
  experienceLevel: string;
  skills: JobSkill[];
}

export function JobForm({ initial }: { initial?: JobFormValues }) {
  const [state, action, pending] = useActionState<JobFormState, FormData>(saveJob, {});
  const [skills, setSkills] = useState<JobSkill[]>(initial?.skills ?? []);
  const [draft, setDraft] = useState("");

  function addSkill() {
    const names = draft.split(",").map((s) => s.trim()).filter(Boolean);
    setSkills((prev) => {
      const next = [...prev];
      for (const name of names) {
        if (!next.some((s) => s.name.toLowerCase() === name.toLowerCase())) next.push({ name, mandatory: true, source: "RECRUITER" });
      }
      return next;
    });
    setDraft("");
  }

  return (
    <form action={action} className="flex flex-col gap-5">
      {initial?.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      <input type="hidden" name="skills" value={JSON.stringify(skills)} />
      <div className="grid gap-4 sm:grid-cols-[1fr_240px]">
        <div className="flex flex-col gap-2">
          <Label htmlFor="title">Job title</Label>
          <Input id="title" name="title" defaultValue={initial?.title} placeholder="Senior Backend Engineer" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="experienceLevel">Experience level</Label>
          <NativeSelect id="experienceLevel" name="experienceLevel" defaultValue={initial?.experienceLevel ?? "MID"}>
            {LEVELS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Job description</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={initial?.description}
          rows={12}
          minLength={50}
          maxLength={15000}
          placeholder="Paste the full job description: responsibilities, requirements, stack…"
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="skill-draft">Required skills</Label>
        <div className="flex gap-2">
          <Input
            id="skill-draft"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSkill();
              }
            }}
            placeholder="Java, Spring Boot, Kafka"
          />
          <Button type="button" variant="outline" onClick={addSkill} disabled={!draft.trim()}>
            Add
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Click a skill to toggle mandatory/preferred. Skills you add win over AI-extracted ones.
        </p>
        <ul className="flex flex-wrap gap-2">
          {skills.map((s) => (
            <li key={s.name}>
              <Badge variant={s.mandatory ? "default" : "secondary"} className="gap-1 pr-1">
                <button
                  type="button"
                  title="Toggle mandatory / preferred"
                  onClick={() =>
                    setSkills((prev) =>
                      prev.map((x) => (x.name === s.name ? { ...x, mandatory: !x.mandatory, source: "RECRUITER" } : x)),
                    )
                  }
                >
                  {s.name}
                  {s.source === "AI" ? " · AI" : ""}
                  {s.mandatory ? "" : " (preferred)"}
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${s.name}`}
                  className="rounded px-1 hover:bg-black/10"
                  onClick={() => setSkills((prev) => prev.filter((x) => x.name !== s.name))}
                >
                  ×
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      {state.warning ? <p className="text-sm text-warning">{state.warning}</p> : null}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving & analysing…" : initial?.id ? "Save job" : "Create job"}
        </Button>
      </div>
    </form>
  );
}
