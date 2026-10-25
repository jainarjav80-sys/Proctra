/** Splits spoken text into sentences so TTS can be cancelled and resumed at sentence boundaries. */
export function splitSentences(text: string): string[] {
  const parts = text
    .replace(/\s+/g, " ")
    .trim()
    .match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g);
  return (parts ?? []).map((s) => s.trim()).filter(Boolean);
}

/**
 * Sentences for TTS: tiny fragments ("Thank you.", "Question 3.") are merged into the next sentence,
 * which cuts per-request TTS quota use and avoids audible gaps between very short clips.
 */
export function chunkForSpeech(text: string, minChars = 40): string[] {
  const out: string[] = [];
  let carry = "";
  for (const s of splitSentences(text)) {
    const joined = carry ? `${carry} ${s}` : s;
    if (joined.length < minChars) carry = joined;
    else {
      out.push(joined);
      carry = "";
    }
  }
  if (carry) {
    if (out.length) out[out.length - 1] += ` ${carry}`;
    else out.push(carry);
  }
  return out;
}

const CONJUNCTION = /\s(?=(?:when|and|but|because|if|so|while|which|that|after|before|than|or)\s)/gi;

/**
 * Pieces for an on-device TTS engine whose time-to-first-audio grows with text length (Kokoro):
 * each sentence alone, and sentences over `max` chars split at a clause mark, else before a
 * conjunction near the middle. Short first pieces ("Thank you.") start playing within ~1 s.
 */
export function speechPieces(text: string, max = 70): string[] {
  const split = (s: string): string[] => {
    if (s.length <= max) return [s];
    const punct = /^(.{25,}?[,;:—])\s+(.{20,})$/.exec(s);
    if (punct) return [...split(punct[1]), ...split(punct[2])];
    const cuts = [...s.matchAll(CONJUNCTION)].map((m) => m.index!).filter((i) => i >= 25 && s.length - i >= 20);
    if (!cuts.length) return [s];
    const at = cuts.reduce((a, b) => (Math.abs(b - s.length / 2) < Math.abs(a - s.length / 2) ? b : a));
    return [...split(s.slice(0, at)), ...split(s.slice(at + 1))];
  };
  return splitSentences(text).flatMap(split);
}

/**
 * Question lead-ins, spoken as their own pieces by Kokoro only (Orpheus merges them into the next
 * sentence), so Kokoro pre-generates them and a new question starts playing instantly.
 */
export const KOKORO_LEAD_INS = ["Thank you.", "Question 2.", "Question 3.", "Question 4.", "Question 5.", "Here's the final question.", "That was the last question."];

/** Phrases the interviewer says often; synthesised ahead of time during onboarding. */
export const FIXED_PHRASES = [
  "Of course. Here's the question again.",
  "Shall I continue the question?",
  "Take your time. Say repeat if you'd like to hear the question again.",
  "Would you like me to repeat the question, or skip it? You can also just start answering.",
  "Sorry, your audio broke up a little. Could you repeat that last part?",
  "Thanks for waiting. Let's pick up where we left off.",
];
