/** Text-level duplicate detection (no embeddings in the prototype). */

export function normalizeQuestion(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORDS = new Set(
  "a an the and or of to in on for with how what why when which would could can you your do does did is are was were be been it this that me about tell describe explain walk through".split(
    " ",
  ),
);

function tokens(text: string): Set<string> {
  return new Set(normalizeQuestion(text).split(" ").filter((t) => t.length > 1 && !STOPWORDS.has(t)));
}

/** Jaccard overlap of content words. */
export function similarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

export const DUPLICATE_THRESHOLD = 0.7;

export function isDuplicate(text: string, existing: string[]): boolean {
  const n = normalizeQuestion(text);
  return existing.some((e) => normalizeQuestion(e) === n || similarity(text, e) >= DUPLICATE_THRESHOLD);
}
