/** Interview-config rules shared by the recruiter UI and the server. */

export const DEFAULT_QUESTION_COUNT = 10;
export const CATEGORIES = ["TECHNICAL", "BEHAVIORAL", "EXPERIENCE", "SCENARIO"] as const;
export type Category = (typeof CATEGORIES)[number];
export type CategoryDistribution = Record<Category, number>;

export const DEFAULT_DISTRIBUTION: CategoryDistribution = {
  TECHNICAL: 40,
  BEHAVIORAL: 20,
  EXPERIENCE: 20,
  SCENARIO: 20,
};

/** PS 3.A/3.B: if the recruiter does not specify a count, generate 10. */
export function resolveQuestionCount(questionCount: number | null | undefined): number {
  return questionCount ?? DEFAULT_QUESTION_COUNT;
}

/** Largest-remainder split of `total` questions by percentage weights (always sums to total). */
export function allocateCategories(total: number, dist: CategoryDistribution = DEFAULT_DISTRIBUTION) {
  const weightSum = CATEGORIES.reduce((s, c) => s + Math.max(0, dist[c] ?? 0), 0) || 1;
  const raw = CATEGORIES.map((c) => ({ c, exact: (total * Math.max(0, dist[c] ?? 0)) / weightSum }));
  const out = Object.fromEntries(raw.map(({ c, exact }) => [c, Math.floor(exact)])) as CategoryDistribution;
  let remaining = total - CATEGORIES.reduce((s, c) => s + out[c], 0);
  for (const { c } of [...raw].sort((a, b) => (b.exact % 1) - (a.exact % 1))) {
    if (remaining <= 0) break;
    out[c] += 1;
    remaining -= 1;
  }
  return out;
}

/**
 * Timing-fit check (plan C23): warn when the configured questions are unlikely to fit the duration.
 * Expected answer time is 2/3 of the response limit, capped at 120 s; the limit itself is a ceiling.
 */
export function checkTimingFit(input: {
  questionCount: number | null | undefined;
  durationMinutes: number;
  responseTimeLimitSec: number;
  maxFollowUps: number;
}) {
  const n = resolveQuestionCount(input.questionCount);
  const introSec = 60;
  const askSec = 20; // TTS reading the question
  const expectedAnswerSec = Math.min(120, Math.round(input.responseTimeLimitSec * (2 / 3)));
  const followUpReserveSec = input.maxFollowUps > 0 ? Math.ceil(n / 3) * (askSec + 60) : 0;
  const expectedSec = introSec + n * (askSec + expectedAnswerSec) + followUpReserveSec;
  const worstCaseSec = introSec + n * (askSec + input.responseTimeLimitSec);
  const budgetSec = input.durationMinutes * 60;

  const warnings: string[] = [];
  if (expectedSec > budgetSec) {
    warnings.push(
      `About ${Math.ceil(expectedSec / 60)} min expected for ${n} questions, but the interview is ${input.durationMinutes} min. Reduce questions or raise the duration.`,
    );
  } else if (worstCaseSec > budgetSec) {
    warnings.push(
      `If every answer uses the full ${input.responseTimeLimitSec}s limit the interview runs ${Math.ceil(worstCaseSec / 60)} min. Follow-ups will be suppressed near the end to stay on time.`,
    );
  }
  return {
    questionCount: n,
    expectedMinutes: Math.ceil(expectedSec / 60),
    worstCaseMinutes: Math.ceil(worstCaseSec / 60),
    fits: expectedSec <= budgetSec,
    warnings,
  };
}
