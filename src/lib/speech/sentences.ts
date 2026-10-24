/** Splits spoken text into sentences so TTS can be cancelled and resumed at sentence boundaries. */
export function splitSentences(text: string): string[] {
  const parts = text
    .replace(/\s+/g, " ")
    .trim()
    .match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g);
  return (parts ?? []).map((s) => s.trim()).filter(Boolean);
}
