"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  addManualQuestion,
  approveBlueprint,
  deleteQuestion,
  generateBlueprintAction,
  regenerateQuestionAction,
  reorderQuestions,
  unlockBlueprint,
  updateQuestion,
  type QuestionEdit,
} from "@/app/(recruiter)/_actions/blueprint";
import { CATEGORIES, type Category } from "@/lib/interview/config";
import { NativeSelect } from "@/components/forms/native-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface BlueprintQuestion {
  id: string;
  primary_index: number;
  source: "AI_GENERATED" | "RECRUITER_DEFINED";
  category: Category;
  difficulty: "FOUNDATIONAL" | "INTERMEDIATE" | "ADVANCED";
  target_skills: string[];
  text: string;
  rubric: { rubric_points?: string[]; expected_answer_outline?: string; red_flags?: string[] };
}

type Result = { error: string } | object;

export function BlueprintEditor({
  interviewId,
  questions,
  target,
  approvedAt,
  canGenerate,
  canUnlock,
}: {
  interviewId: string;
  questions: BlueprintQuestion[];
  target: number;
  approvedAt: string | null;
  canGenerate: boolean;
  canUnlock: boolean;
}) {
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const locked = Boolean(approvedAt);

  function run(fn: () => Promise<Result>, success?: string, id?: string) {
    setBusyId(id ?? null);
    start(async () => {
      const r = await fn();
      setBusyId(null);
      if ("error" in r) toast.error(r.error);
      else {
        if ("warning" in r && typeof r.warning === "string") toast.warning(r.warning);
        else if (success) toast.success(success);
        setEditing(null);
      }
    });
  }

  function move(index: number, delta: -1 | 1) {
    const ids = questions.map((q) => q.id);
    const j = index + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    run(() => reorderQuestions(interviewId, ids));
  }

  const countOk = questions.length === target;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle className="text-base">Question blueprint</CardTitle>
          <p className={`text-sm ${countOk ? "text-muted-foreground" : "text-warning"}`}>
            {questions.length} of {target} configured questions{countOk ? "" : " · regenerate or add/remove to match the configuration"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {locked ? (
            <>
              <Badge>Approved · locked</Badge>
              {canUnlock ? (
                <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => unlockBlueprint(interviewId), "Unlocked. The previous invite link was revoked.")}>
                  Unlock
                </Button>
              ) : null}
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant={questions.length ? "outline" : "default"}
                disabled={pending || !canGenerate}
                title={canGenerate ? undefined : "Parse the resume first"}
                onClick={() => {
                  if (questions.some((q) => q.source === "AI_GENERATED") && !confirm("Replace all AI-generated questions? Your manual questions are kept.")) return;
                  run(() => generateBlueprintAction(interviewId), "Blueprint generated");
                }}
              >
                {pending && busyId === null ? "Generating…" : questions.length ? "Regenerate all" : "Generate blueprint"}
              </Button>
              <Button size="sm" disabled={pending || questions.length < 3} onClick={() => run(() => approveBlueprint(interviewId), "Blueprint approved")}>
                Approve & lock
              </Button>
            </>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {questions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {canGenerate ? "Generate the blueprint from the job analysis and parsed resume." : "Upload and parse the resume to generate questions."}
          </p>
        ) : null}
        <ol className="flex flex-col gap-3">
          {questions.map((q, i) => (
            <li key={q.id} className="rounded-lg border bg-card p-3 text-sm">
              {editing === q.id ? (
                <QuestionEditor
                  q={q}
                  pending={pending}
                  onCancel={() => setEditing(null)}
                  onSave={(edit) => run(() => updateQuestion(interviewId, q.id, edit), "Question updated", q.id)}
                />
              ) : (
                <div className="flex gap-3">
                  <span className="font-mono text-xs text-muted-foreground">Q{i + 1}</span>
                  <div className="flex flex-1 flex-col gap-2">
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="secondary">{q.category}</Badge>
                      <Badge variant="outline">{q.difficulty}</Badge>
                      {q.target_skills[0] ? <Badge variant="outline">{q.target_skills[0]}</Badge> : null}
                      <Badge variant={q.source === "RECRUITER_DEFINED" ? "default" : "outline"}>
                        {q.source === "RECRUITER_DEFINED" ? "Recruiter" : "AI"}
                      </Badge>
                    </div>
                    <p className="text-base">{q.text}</p>
                    {q.rubric.rubric_points?.length ? (
                      <details className="text-muted-foreground">
                        <summary className="cursor-pointer">Rubric & expected answer (hidden from candidate)</summary>
                        <ul className="mt-2 list-disc pl-5">
                          {q.rubric.rubric_points.map((p) => (
                            <li key={p}>{p}</li>
                          ))}
                        </ul>
                        {q.rubric.expected_answer_outline ? <p className="mt-2">{q.rubric.expected_answer_outline}</p> : null}
                        {q.rubric.red_flags?.length ? <p className="mt-2 text-danger">Red flags: {q.rubric.red_flags.join("; ")}</p> : null}
                      </details>
                    ) : null}
                    {!locked ? (
                      <div className="flex flex-wrap gap-1">
                        <Button size="xs" variant="ghost" disabled={pending || i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                          ↑
                        </Button>
                        <Button size="xs" variant="ghost" disabled={pending || i === questions.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                          ↓
                        </Button>
                        <Button size="xs" variant="ghost" disabled={pending} onClick={() => setEditing(q.id)}>
                          Edit
                        </Button>
                        <Button size="xs" variant="ghost" disabled={pending || !canGenerate} onClick={() => run(() => regenerateQuestionAction(interviewId, q.id), "Question regenerated", q.id)}>
                          {busyId === q.id ? "Regenerating…" : "Regenerate"}
                        </Button>
                        <Button size="xs" variant="ghost" className="text-danger" disabled={pending} onClick={() => run(() => deleteQuestion(interviewId, q.id), "Question deleted", q.id)}>
                          Delete
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ol>
        {!locked ? <ManualQuestionForm pending={pending} onAdd={(text, category) => run(() => addManualQuestion(interviewId, { text, category }), "Question added")} /> : null}
      </CardContent>
    </Card>
  );
}

function QuestionEditor({
  q,
  pending,
  onSave,
  onCancel,
}: {
  q: BlueprintQuestion;
  pending: boolean;
  onSave: (e: QuestionEdit) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(q.text);
  const [category, setCategory] = useState<Category>(q.category);
  const [difficulty, setDifficulty] = useState(q.difficulty);
  const [skill, setSkill] = useState(q.target_skills[0] ?? "General");
  const [points, setPoints] = useState((q.rubric.rubric_points ?? []).join("\n"));
  const [expected, setExpected] = useState(q.rubric.expected_answer_outline ?? "");
  return (
    <div className="flex flex-col gap-3">
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} aria-label="Question text" />
      <div className="grid gap-2 sm:grid-cols-3">
        <NativeSelect value={category} onChange={(e) => setCategory(e.target.value as Category)} aria-label="Category">
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </NativeSelect>
        <NativeSelect value={difficulty} onChange={(e) => setDifficulty(e.target.value as BlueprintQuestion["difficulty"])} aria-label="Difficulty">
          <option>FOUNDATIONAL</option>
          <option>INTERMEDIATE</option>
          <option>ADVANCED</option>
        </NativeSelect>
        <Input value={skill} onChange={(e) => setSkill(e.target.value)} aria-label="Target skill" />
      </div>
      <Label className="text-xs text-muted-foreground">Rubric points (one per line)</Label>
      <Textarea value={points} onChange={(e) => setPoints(e.target.value)} rows={3} />
      <Label className="text-xs text-muted-foreground">Expected answer outline</Label>
      <Textarea value={expected} onChange={(e) => setExpected(e.target.value)} rows={3} />
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            onSave({
              text,
              category,
              difficulty,
              targetSkill: skill,
              rubricPoints: points.split("\n").map((p) => p.trim()).filter(Boolean),
              expectedAnswer: expected,
            })
          }
        >
          Save
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function ManualQuestionForm({ pending, onAdd }: { pending: boolean; onAdd: (text: string, category: Category) => void }) {
  const [text, setText] = useState("");
  const [category, setCategory] = useState<Category>("TECHNICAL");
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
      <Label htmlFor="manual-q">Add your own question</Label>
      <Textarea id="manual-q" value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Asked verbatim by the AI interviewer" />
      <div className="flex gap-2">
        <NativeSelect className="max-w-48" value={category} onChange={(e) => setCategory(e.target.value as Category)} aria-label="Category">
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </NativeSelect>
        <Button
          size="sm"
          disabled={pending || text.trim().length < 10}
          onClick={() => {
            onAdd(text, category);
            setText("");
          }}
        >
          Add question
        </Button>
      </div>
    </div>
  );
}
