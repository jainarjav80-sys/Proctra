import type { LLMProvider } from "@/lib/llm/types";
import { UNTRUSTED_DATA_RULE, context, untrusted } from "@/lib/llm/prompt";
import {
  CATEGORIES,
  allocateCategories,
  resolveQuestionCount,
  type Category,
  type CategoryDistribution,
} from "@/lib/interview/config";
import type { ExperienceLevel, JdAnalysis, JobSkill } from "@/lib/jobs/analysis";
import type { ResumeProfile } from "@/lib/resume/profile";
import { isDuplicate } from "./dedupe";
import {
  blueprintResponseSchema,
  singleQuestionResponseSchema,
  type Difficulty,
  type QuestionDraft,
} from "./schema";

export interface BlueprintInput {
  job: { title: string; experienceLevel: ExperienceLevel; skills: JobSkill[]; analysis: JdAnalysis };
  resume: ResumeProfile;
  config: {
    questionCount: number | null;
    categoryDistribution: CategoryDistribution;
    difficultyLevel: "FOUNDATIONAL" | "INTERMEDIATE" | "ADVANCED" | "ADAPTIVE";
  };
  /** Recruiter-defined questions already in the blueprint. They count toward their category's slots. */
  manual: { category: Category; text: string }[];
}

export interface BlueprintResult {
  questions: QuestionDraft[];
  /** Slots the model failed to fill with distinct questions (recruiter can regenerate/add). */
  shortfall: Partial<Record<Category, number>>;
  targets: Record<Category, number>;
}

/** Interview order: warm up on their own experience, then depth, then scenarios, then behaviour. */
export const CATEGORY_ORDER: Category[] = ["EXPERIENCE", "TECHNICAL", "SCENARIO", "BEHAVIORAL"];

export function difficultyFor(level: BlueprintInput["config"]["difficultyLevel"], seniority: ExperienceLevel): Difficulty {
  if (level !== "ADAPTIVE") return level;
  if (seniority === "INTERN" || seniority === "ENTRY") return "FOUNDATIONAL";
  if (seniority === "MID") return "INTERMEDIATE";
  return "ADVANCED";
}

/** Questions the AI must generate per category after recruiter questions take their slots. */
export function aiTargets(input: Pick<BlueprintInput, "config" | "manual">): Record<Category, number> {
  const total = resolveQuestionCount(input.config.questionCount);
  if (input.manual.length > total) {
    throw new Error(`There are ${input.manual.length} manual questions but only ${total} slots. Remove some or raise the count.`);
  }
  const slots = allocateCategories(total, input.config.categoryDistribution);
  const targets = { ...slots };
  let overflow = 0;
  for (const m of input.manual) {
    if (targets[m.category] > 0) targets[m.category] -= 1;
    else overflow += 1;
  }
  // Manual questions beyond a category's share take slots from the largest remaining categories.
  while (overflow > 0) {
    const c = CATEGORIES.reduce((best, k) => (targets[k] > targets[best] ? k : best), CATEGORIES[0]);
    if (targets[c] === 0) break;
    targets[c] -= 1;
    overflow -= 1;
  }
  return targets;
}

const SYSTEM = `You are Proctra, an objective technical interviewer designing a structured screening interview.
Write questions that are spoken aloud by text-to-speech: conversational, one question at a time, no bullet lists, no code blocks, under 60 words.
Ground questions in the job requirements and the candidate's resume:
- Skills the candidate claims and the job needs: probe depth with questions about their specific projects or roles.
- Adjacent skills (similar tool, different product): ask about trade-offs and transfer.
- Required skills missing from the resume: ask a fair baseline question.
EXPERIENCE questions must name a specific role or project from the resume. SCENARIO questions describe a realistic production situation. BEHAVIORAL questions cover ownership, collaboration, conflict or ambiguity at the right seniority.
Every question must test a different sub-skill. Do not repeat or rephrase another question.
Never ask about age, family, health, nationality, religion or other protected characteristics.
${UNTRUSTED_DATA_RULE}`;

function sharedContext(input: BlueprintInput) {
  return [
    context("role", {
      title: input.job.title,
      experience_level: input.job.experienceLevel,
      required_skills: input.job.skills.map((s) => ({ name: s.name, mandatory: s.mandatory })),
    }),
    // Derived from untrusted documents, so it is fenced as untrusted too.
    untrusted("job_analysis", JSON.stringify(input.job.analysis)),
    untrusted("candidate_resume", JSON.stringify(input.resume)),
  ];
}

/** One LLM call for the whole blueprint. Over-asks by one per category so dedupe can still hit the counts. */
export async function generateBlueprint(llm: LLMProvider, input: BlueprintInput): Promise<BlueprintResult> {
  const targets = aiTargets(input);
  const difficulty = difficultyFor(input.config.difficultyLevel, input.job.experienceLevel);
  const ask = Object.fromEntries(CATEGORIES.map((c) => [c, targets[c] > 0 ? targets[c] + 1 : 0])) as Record<Category, number>;
  const askTotal = CATEGORIES.reduce((s, c) => s + ask[c], 0);
  if (askTotal === 0) return { questions: [], shortfall: {}, targets };

  const response = await llm.generateJSON({
    task: "question_blueprint",
    system: SYSTEM,
    prompt: [
      ...sharedContext(input),
      context("existing_recruiter_questions", input.manual.map((m) => m.text)),
      context("requirements", {
        questions_per_category: ask,
        total_questions: askTotal,
        default_difficulty: difficulty,
        note: "Use the default difficulty for most questions; one step easier or harder is fine when it suits a skill.",
      }),
      `Generate exactly ${askTotal} questions with exactly the per-category counts in questions_per_category. None may duplicate the existing recruiter questions.`,
    ].join("\n\n"),
    schema: blueprintResponseSchema,
    temperature: 0.6,
    maxOutputTokens: 12000,
  });

  return selectQuestions(response.questions, targets, input.manual.map((m) => m.text));
}

/** Deterministic post-processing: dedupe, enforce exact per-category counts, order for the interview. */
export function selectQuestions(
  candidates: QuestionDraft[],
  targets: Record<Category, number>,
  existingTexts: string[],
): BlueprintResult {
  const accepted: QuestionDraft[] = [];
  const taken = [...existingTexts];
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
  for (const q of candidates) {
    if (counts[q.category] >= targets[q.category]) continue;
    if (isDuplicate(q.text, taken)) continue;
    accepted.push(q);
    taken.push(q.text);
    counts[q.category] += 1;
  }
  const shortfall: Partial<Record<Category, number>> = {};
  for (const c of CATEGORIES) if (counts[c] < targets[c]) shortfall[c] = targets[c] - counts[c];
  accepted.sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category));
  return { questions: accepted, shortfall, targets };
}

/** Recruiter-triggered single-slot regeneration (one call, only on demand). */
export async function regenerateQuestion(
  llm: LLMProvider,
  input: BlueprintInput,
  slot: { category: Category; difficulty: Difficulty; replacing: string },
  otherQuestions: string[],
): Promise<QuestionDraft> {
  const all = [...otherQuestions, slot.replacing];
  for (let attempt = 0; attempt < 2; attempt++) {
    const { question } = await llm.generateJSON({
      task: "question_regenerate",
      system: SYSTEM,
      prompt: [
        ...sharedContext(input),
        context("questions_already_in_interview", otherQuestions),
        context("question_being_replaced", slot.replacing),
        `Write ONE new ${slot.category} question at ${slot.difficulty} difficulty that tests a different sub-skill from every question above, including the one being replaced.`,
      ].join("\n\n"),
      schema: singleQuestionResponseSchema,
      temperature: 0.8,
    });
    if (!isDuplicate(question.text, all)) return { ...question, category: slot.category };
  }
  throw new Error("Couldn't generate a distinct question. Try again or write one manually.");
}
