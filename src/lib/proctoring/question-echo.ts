/**
 * Question-echo similarity: does an utterance repeat the question text? Pure and client-safe.
 * score = 0.6 × coverage (share of the question's content words present in the utterance)
 *       + 0.4 × run (longest common contiguous word run ÷ question length).
 * Verbatim reading scores ≈ 1; paraphrase scores low because word order and wording change;
 * short meta requests ("can you repeat") are ignored entirely.
 */

const STOPWORDS = new Set(
  "a an the and or but of to in on at for with by from as is are was were be been being it its this that these those you your yours i me my we our they them their he she his her do does did done how what why when where which who whom would could should can will shall may might must have has had into about over under so if then than there here just also very".split(
    " ",
  ),
);

export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/'/g, "")
    .split(/\s+/)
    .filter(Boolean);
}

const content = (ws: string[]) => ws.filter((w) => w.length > 1 && !STOPWORDS.has(w));

/** Longest run of consecutive words appearing in the same order in both. */
export function longestCommonRun(a: string[], b: string[]): number {
  let best = 0;
  const prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let diag = 0;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = a[i - 1] === b[j - 1] ? diag + 1 : 0;
      if (prev[j] > best) best = prev[j];
      diag = tmp;
    }
  }
  return best;
}

export interface EchoResult {
  score: number;
  coverage: number;
  run: number;
  /** False when the utterance is too short to judge (e.g. "can you repeat that"). */
  eligible: boolean;
}

export const MIN_ECHO_CONTENT_WORDS = 4;

export function questionEchoSimilarity(question: string, utterance: string): EchoResult {
  const qw = words(question);
  const uw = words(utterance);
  const qc = new Set(content(qw));
  const uc = new Set(content(uw));
  const eligible = uc.size >= MIN_ECHO_CONTENT_WORDS && qc.size > 0;
  if (!eligible) return { score: 0, coverage: 0, run: 0, eligible: false };
  let hit = 0;
  for (const w of qc) if (uc.has(w)) hit++;
  const coverage = hit / qc.size;
  const run = Math.min(1, longestCommonRun(qw, uw) / Math.max(1, qw.length));
  const score = Math.round((0.6 * coverage + 0.4 * run) * 1000) / 1000;
  return { score, coverage: Math.round(coverage * 1000) / 1000, run: Math.round(run * 1000) / 1000, eligible };
}

export const DEFAULT_ECHO_THRESHOLD = 0.6;
export const DEFAULT_MAX_BARGE_INS = 5;
