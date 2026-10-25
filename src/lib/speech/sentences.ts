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

/** Phrases the interviewer says often; synthesised ahead of time during onboarding. */
export const FIXED_PHRASES = [
  "Of course. Here's the question again.",
  "Shall I continue the question?",
  "Take your time. Say repeat if you'd like to hear the question again.",
  "Would you like me to repeat the question, or skip it? You can also just start answering.",
  "Sorry, your audio broke up a little. Could you repeat that last part?",
  "Thanks for waiting. Let's pick up where we left off.",
];
