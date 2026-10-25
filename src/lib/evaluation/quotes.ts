/** Evidence-quote validation: a quote must appear in that question's transcript (normalised). */

export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^\p{L}\p{N}']+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True if the quote (≥ 3 words) occurs verbatim, ignoring case, punctuation and spacing. */
export function quoteInTranscript(quote: string, transcript: string): boolean {
  const q = normalizeForMatch(quote);
  if (q.split(" ").length < 3) return false;
  return normalizeForMatch(transcript).includes(q);
}

/** Interview-clock ms of the transcript segment where the quote starts (for seeking playback). */
export function quoteStartMs(quote: string, segments: { text: string; start_ms: number }[]): number | null {
  const head = normalizeForMatch(quote).split(" ").slice(0, 4).join(" ");
  for (const s of segments) if (normalizeForMatch(s.text).includes(head)) return s.start_ms;
  // The quote may span two segments: fall back to the first segment containing its first word pair.
  const pair = head.split(" ").slice(0, 2).join(" ");
  return segments.find((s) => normalizeForMatch(s.text).includes(pair))?.start_ms ?? null;
}
