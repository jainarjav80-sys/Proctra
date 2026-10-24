"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CATEGORIES, resolveQuestionCount, type Category, type CategoryDistribution } from "@/lib/interview/config";
import { assertEditable, attempt, ownedInterview } from "@/lib/interviews/access";
import { llm } from "@/lib/llm";
import { analyzeJob, jdAnalysisHash, jdAnalysisSchema, mergeSkills, skillSchema } from "@/lib/jobs/analysis";
import { resumeProfileSchema } from "@/lib/resume/profile";
import { CATEGORY_ORDER, difficultyFor, generateBlueprint, regenerateQuestion, type BlueprintInput } from "@/lib/blueprint/generate";
import { DIFFICULTIES, toStoredRubric } from "@/lib/blueprint/schema";
import { isDuplicate } from "@/lib/blueprint/dedupe";

type Owned = Awaited<ReturnType<typeof ownedInterview>>;

/** Builds generator input, running (and caching) JD analysis only if the job has none. */
async function blueprintInput({ supabase, interview }: Owned): Promise<BlueprintInput> {
  const job = interview.jobs;
  if (!interview.resume_profile) throw new Error("Upload and parse the resume first");
  const skills = z.array(skillSchema).parse(job.required_skills ?? []);
  let analysis = job.jd_analysis ? jdAnalysisSchema.parse(job.jd_analysis) : null;
  if (!analysis) {
    const input = { title: job.title, description: job.description, experienceLevel: job.experience_level, skills };
    analysis = await analyzeJob(llm(), input);
    await supabase
      .from("jobs")
      .update({ jd_analysis: analysis, jd_analysis_hash: jdAnalysisHash(input), required_skills: mergeSkills(skills, analysis.skills) })
      .eq("id", job.id);
  }
  const { data: manual } = await supabase
    .from("questions")
    .select("category, text")
    .eq("interview_id", interview.id)
    .eq("follow_up_index", 0)
    .eq("source", "RECRUITER_DEFINED");
  return {
    job: { title: job.title, experienceLevel: job.experience_level, skills, analysis },
    resume: resumeProfileSchema.parse(interview.resume_profile),
    config: {
      questionCount: interview.question_count,
      categoryDistribution: interview.category_distribution as CategoryDistribution,
      difficultyLevel: interview.difficulty_level,
    },
    manual: (manual ?? []) as { category: Category; text: string }[],
  };
}

async function primaryQuestions(owned: Owned) {
  const { data, error } = await owned.supabase
    .from("questions")
    .select("id, category, text, source, primary_index, difficulty")
    .eq("interview_id", owned.interview.id)
    .eq("follow_up_index", 0)
    .order("primary_index");
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function renumber(owned: Owned, orderedIds: string[]) {
  const { error } = await owned.supabase.rpc("reorder_questions", { iid: owned.interview.id, ordered_ids: orderedIds });
  if (error) throw new Error(`Couldn't reorder: ${error.message}`);
}

function done(interviewId: string) {
  revalidatePath(`/interviews/${interviewId}`);
}

/** ONE LLM call: replaces every AI question, keeps recruiter questions, fills to the configured count. */
export async function generateBlueprintAction(interviewId: string) {
  return attempt(async () => {
    const owned = await ownedInterview(interviewId);
    assertEditable(owned.interview);
    const input = await blueprintInput(owned);
    const result = await generateBlueprint(llm(), input);

    const { error: delErr } = await owned.supabase
      .from("questions")
      .delete()
      .eq("interview_id", interviewId)
      .eq("source", "AI_GENERATED");
    if (delErr) throw new Error(delErr.message);

    if (result.questions.length) {
      const { error: insErr } = await owned.supabase.from("questions").insert(
        result.questions.map((q, i) => ({
          interview_id: interviewId,
          primary_index: 1000 + i, // temporary; renumbered below
          source: "AI_GENERATED",
          category: q.category,
          difficulty: q.difficulty,
          target_skills: [q.target_skill],
          text: q.text,
          rubric: toStoredRubric(q),
        })),
      );
      if (insErr) throw new Error(insErr.message);
    }

    // Order by interview flow, recruiter questions after the AI ones in the same category.
    const all = await primaryQuestions(owned);
    const rank = (q: (typeof all)[number]) => CATEGORY_ORDER.indexOf(q.category as Category) * 2 + (q.source === "RECRUITER_DEFINED" ? 1 : 0);
    await renumber(owned, [...all].sort((a, b) => rank(a) - rank(b) || a.primary_index - b.primary_index).map((q) => q.id));
    done(interviewId);

    const missing = Object.entries(result.shortfall).map(([c, n]) => `${n} ${c.toLowerCase()}`);
    return {
      count: all.length,
      target: resolveQuestionCount(owned.interview.question_count),
      warning: missing.length ? `The AI returned too few distinct questions (${missing.join(", ")} missing). Regenerate or add them manually.` : undefined,
    };
  });
}

const editSchema = z.object({
  text: z.string().trim().min(10, "Question is too short").max(600),
  category: z.enum(CATEGORIES),
  difficulty: z.enum(DIFFICULTIES),
  targetSkill: z.string().trim().min(1).max(80),
  rubricPoints: z.array(z.string().trim().min(1)).max(8),
  expectedAnswer: z.string().trim().max(1200),
});
export type QuestionEdit = z.infer<typeof editSchema>;

export async function updateQuestion(interviewId: string, questionId: string, edit: QuestionEdit) {
  return attempt(async () => {
    const parsed = editSchema.safeParse(edit);
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid question");
    const owned = await ownedInterview(interviewId);
    assertEditable(owned.interview);
    const others = (await primaryQuestions(owned)).filter((q) => q.id !== questionId).map((q) => q.text);
    if (isDuplicate(parsed.data.text, others)) throw new Error("This duplicates another question in the blueprint");
    const { data: current } = await owned.supabase.from("questions").select("rubric").eq("id", questionId).single();
    const e = parsed.data;
    const { error } = await owned.supabase
      .from("questions")
      .update({
        text: e.text,
        category: e.category,
        difficulty: e.difficulty,
        target_skills: [e.targetSkill],
        rubric: { ...((current?.rubric as object) ?? {}), rubric_points: e.rubricPoints, expected_answer_outline: e.expectedAnswer },
      })
      .eq("id", questionId)
      .eq("interview_id", interviewId);
    if (error) throw new Error(error.message);
    done(interviewId);
    return { ok: true as const };
  });
}

export async function deleteQuestion(interviewId: string, questionId: string) {
  return attempt(async () => {
    const owned = await ownedInterview(interviewId);
    assertEditable(owned.interview);
    const { error } = await owned.supabase.from("questions").delete().eq("id", questionId).eq("interview_id", interviewId);
    if (error) throw new Error(error.message);
    await renumber(owned, (await primaryQuestions(owned)).map((q) => q.id));
    done(interviewId);
    return { ok: true as const };
  });
}

export async function reorderQuestions(interviewId: string, orderedIds: string[]) {
  return attempt(async () => {
    const owned = await ownedInterview(interviewId);
    assertEditable(owned.interview);
    const current = await primaryQuestions(owned);
    if (orderedIds.length !== current.length || !current.every((q) => orderedIds.includes(q.id))) {
      throw new Error("The question list changed. Refresh and try again.");
    }
    await renumber(owned, orderedIds);
    done(interviewId);
    return { ok: true as const };
  });
}

const manualSchema = z.object({
  text: z.string().trim().min(10, "Question is too short").max(600),
  category: z.enum(CATEGORIES),
});

export async function addManualQuestion(interviewId: string, input: z.infer<typeof manualSchema>) {
  return attempt(async () => {
    const parsed = manualSchema.safeParse(input);
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid question");
    const owned = await ownedInterview(interviewId);
    assertEditable(owned.interview);
    const existing = await primaryQuestions(owned);
    if (existing.length >= 25) throw new Error("An interview can have at most 25 questions");
    if (isDuplicate(parsed.data.text, existing.map((q) => q.text))) throw new Error("This duplicates an existing question");
    const job = owned.interview.jobs;
    const { error } = await owned.supabase.from("questions").insert({
      interview_id: interviewId,
      primary_index: existing.length + 1,
      source: "RECRUITER_DEFINED",
      category: parsed.data.category,
      difficulty: difficultyFor(owned.interview.difficulty_level, job.experience_level),
      target_skills: [],
      text: parsed.data.text,
      rubric: { rubric_points: [], expected_answer_outline: "", red_flags: [] },
    });
    if (error) throw new Error(error.message);
    done(interviewId);
    return { ok: true as const };
  });
}

/** One LLM call, recruiter-triggered: replaces a single question in place. */
export async function regenerateQuestionAction(interviewId: string, questionId: string) {
  return attempt(async () => {
    const owned = await ownedInterview(interviewId);
    assertEditable(owned.interview);
    const all = await primaryQuestions(owned);
    const target = all.find((q) => q.id === questionId);
    if (!target) throw new Error("Question not found");
    const input = await blueprintInput(owned);
    const q = await regenerateQuestion(
      llm(),
      input,
      { category: target.category as Category, difficulty: target.difficulty as (typeof DIFFICULTIES)[number], replacing: target.text },
      all.filter((x) => x.id !== questionId).map((x) => x.text),
    );
    const { error } = await owned.supabase
      .from("questions")
      .update({
        text: q.text,
        difficulty: q.difficulty,
        target_skills: [q.target_skill],
        rubric: toStoredRubric(q),
        source: "AI_GENERATED",
      })
      .eq("id", questionId);
    if (error) throw new Error(error.message);
    done(interviewId);
    return { ok: true as const };
  });
}

export async function approveBlueprint(interviewId: string) {
  return attempt(async () => {
    const owned = await ownedInterview(interviewId);
    assertEditable(owned.interview);
    const questions = await primaryQuestions(owned);
    if (questions.length < 3) throw new Error("An interview needs at least 3 questions");
    const { error } = await owned.supabase
      .from("interviews")
      .update({ blueprint_approved_at: new Date().toISOString(), status: "READY" })
      .eq("id", interviewId);
    if (error) throw new Error(error.message);
    done(interviewId);
    return { ok: true as const };
  });
}

/** Unlocking revokes the current invite link, since the questions may change. */
export async function unlockBlueprint(interviewId: string) {
  return attempt(async () => {
    const owned = await ownedInterview(interviewId);
    if (!["READY", "DRAFT"].includes(owned.interview.status)) {
      throw new Error("The candidate has already started; the blueprint can't be changed");
    }
    const { error } = await owned.supabase
      .from("interviews")
      .update({ blueprint_approved_at: null, status: "DRAFT", invite_nonce: null, invite_expires_at: null })
      .eq("id", interviewId);
    if (error) throw new Error(error.message);
    done(interviewId);
    return { ok: true as const };
  });
}
