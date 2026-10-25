"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { saveConfig, type InterviewConfigInput } from "@/app/(recruiter)/_actions/interviews";
import { CATEGORIES, allocateCategories, checkTimingFit, resolveQuestionCount } from "@/lib/interview/config";
import { NativeSelect } from "@/components/forms/native-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const TOGGLES: [keyof InterviewConfigInput["proctoring"], string][] = [
  ["enforce_fullscreen", "Require fullscreen"],
  ["block_multi_monitor", "Block extended / multiple displays"],
  ["gaze_tracking", "Face presence & gaze tracking"],
  ["object_detection", "Phone / book / extra person detection"],
  ["record_video", "Record video for review"],
  ["require_screen_share", "Require entire-screen sharing (recorded; stopping it pauses the interview)"],
  ["show_live_warnings", "Show live warnings to candidate (calm reminders, e.g. “keep your face in view”)"],
];

function int(v: string) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

export function ConfigForm({ interviewId, initial, locked }: { interviewId: string; initial: InterviewConfigInput; locked: boolean }) {
  const [c, setC] = useState(initial);
  const [pending, start] = useTransition();
  const set = <K extends keyof InterviewConfigInput>(k: K, v: InterviewConfigInput[K]) => setC((p) => ({ ...p, [k]: v }));

  const fit = useMemo(
    () =>
      checkTimingFit({
        questionCount: c.questionCount,
        durationMinutes: c.durationMinutes,
        responseTimeLimitSec: c.responseTimeLimitSec,
        maxFollowUps: c.maxFollowUps,
      }),
    [c.questionCount, c.durationMinutes, c.responseTimeLimitSec, c.maxFollowUps],
  );
  const splitTotal = CATEGORIES.reduce((s, k) => s + c.categoryDistribution[k], 0);
  const split = allocateCategories(resolveQuestionCount(c.questionCount), c.categoryDistribution);

  const save = () =>
    start(async () => {
      const r = await saveConfig(interviewId, c);
      if ("error" in r) toast.error(r.error);
      else toast.success("Configuration saved");
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Interview configuration</CardTitle>
      </CardHeader>
      <CardContent>
        <fieldset disabled={locked || pending} className="flex flex-col gap-5 text-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="qcount">Number of questions</Label>
              <Input
                id="qcount"
                type="number"
                min={3}
                max={25}
                placeholder="Default (10)"
                value={c.questionCount ?? ""}
                onChange={(e) => set("questionCount", e.target.value === "" ? null : int(e.target.value))}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="duration">Total duration (minutes)</Label>
              <Input id="duration" type="number" min={10} max={90} value={c.durationMinutes} onChange={(e) => set("durationMinutes", int(e.target.value))} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="limit">Per-answer limit (seconds)</Label>
              <Input id="limit" type="number" min={30} max={600} step={10} value={c.responseTimeLimitSec} onChange={(e) => set("responseTimeLimitSec", int(e.target.value))} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="followups">Max follow-ups per question</Label>
              <NativeSelect id="followups" value={c.maxFollowUps} onChange={(e) => set("maxFollowUps", int(e.target.value))}>
                <option value={0}>None</option>
                <option value={1}>1</option>
                <option value={2}>2</option>
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="difficulty">Difficulty</Label>
              <NativeSelect id="difficulty" value={c.difficultyLevel} onChange={(e) => set("difficultyLevel", e.target.value as InterviewConfigInput["difficultyLevel"])}>
                <option value="ADAPTIVE">Adaptive to experience level</option>
                <option value="FOUNDATIONAL">Foundational</option>
                <option value="INTERMEDIATE">Intermediate</option>
                <option value="ADVANCED">Advanced</option>
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="phone">Phone camera</Label>
              <NativeSelect id="phone" value={c.secondaryCamPolicy} onChange={(e) => set("secondaryCamPolicy", e.target.value as InterviewConfigInput["secondaryCamPolicy"])}>
                <option value="MANDATORY">Required</option>
                <option value="RECOMMENDED">Recommended (optional)</option>
                <option value="DISABLED">Off</option>
              </NativeSelect>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label id="categories-label">Question categories (%)</Label>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" role="group" aria-labelledby="categories-label">
              {CATEGORIES.map((k) => (
                <div key={k} className="flex flex-col gap-1">
                  <label htmlFor={`cat-${k}`} className="text-xs text-muted-foreground">
                    {k.toLowerCase()} · {split[k]} q
                  </label>
                  <Input
                    id={`cat-${k}`}
                    aria-label={`${k.toLowerCase()} questions, percent`}
                    type="number"
                    min={0}
                    max={100}
                    step={5}
                    value={c.categoryDistribution[k]}
                    onChange={(e) => set("categoryDistribution", { ...c.categoryDistribution, [k]: int(e.target.value) })}
                  />
                </div>
              ))}
            </div>
            {splitTotal !== 100 ? <p role="alert" className="text-danger">Split adds up to {splitTotal}%; it must be 100%.</p> : null}
          </div>

          <div className="flex flex-col gap-3">
            <Label>Proctoring</Label>
            {TOGGLES.map(([k, label]) => (
              <label key={k} className="flex items-center justify-between gap-4">
                <span>{label}</span>
                <Switch checked={c.proctoring[k]} onCheckedChange={(v) => set("proctoring", { ...c.proctoring, [k]: v })} />
              </label>
            ))}
          </div>

          <div
            className={`rounded-md border p-3 ${fit.warnings.length ? (fit.fits ? "border-warning bg-warning-soft" : "border-danger bg-danger-soft") : "border-success bg-success-soft"} text-slate-900`}
            aria-live="polite"
          >
            <p className="font-medium">
              {fit.questionCount} questions · about {fit.expectedMinutes} min expected · {fit.worstCaseMinutes} min worst case · {c.durationMinutes} min budget
            </p>
            {fit.warnings.length ? fit.warnings.map((w) => <p key={w}>{w}</p>) : <p>Fits comfortably in the time budget.</p>}
          </div>

          <div>
            <Button onClick={save} disabled={locked || pending || splitTotal !== 100}>
              {pending ? "Saving…" : "Save configuration"}
            </Button>
          </div>
        </fieldset>
      </CardContent>
    </Card>
  );
}
