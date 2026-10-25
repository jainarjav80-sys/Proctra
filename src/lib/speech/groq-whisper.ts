import "server-only";
import { parseRetryAfterMs } from "@/lib/llm/groq";

const wordsOf = (t: string) => t.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

/**
 * Whisper sometimes "transcribes" its own prompt when the audio is near-silent. Treat output whose
 * words are almost all prompt words (and isn't longer than the prompt) as a hallucination.
 */
export function isPromptEcho(text: string, prompt: string | undefined): boolean {
  if (!prompt) return false;
  const out = wordsOf(text);
  if (!out.length) return false;
  const vocab = new Set(wordsOf(prompt));
  const inPrompt = out.filter((w) => vocab.has(w)).length / out.length;
  return inPrompt >= 0.85 && out.length <= wordsOf(prompt).length * 1.5;
}

export const WHISPER_MODELS = ["whisper-large-v3-turbo", "whisper-large-v3"] as const;
export const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

export interface WhisperResult {
  text: string;
  confidence: number | null;
  durationSec: number | null;
  model: string;
}

interface VerboseSegment { text: string; avg_logprob: number; no_speech_prob: number }

/**
 * Transcribes one answer segment with Groq Whisper (turbo first, full model on 429/5xx).
 * `prompt` biases vocabulary (question text + job skills) so "Postgres" isn't heard as "posters".
 * Segments Whisper thinks are non-speech are dropped to avoid silence hallucinations ("Thank you.").
 */
export async function transcribe(audio: Blob, opts: { prompt?: string; signal?: AbortSignal } = {}): Promise<WhisperResult> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is not set");
  let lastError = "";
  for (const model of WHISPER_MODELS) {
    const form = new FormData();
    form.set("file", audio, audio.type.includes("wav") ? "answer.wav" : "answer.webm");
    form.set("model", model);
    form.set("response_format", "verbose_json");
    form.set("language", "en");
    form.set("temperature", "0");
    if (opts.prompt) form.set("prompt", opts.prompt.slice(0, 800));
    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { authorization: `Bearer ${key}` },
      body: form,
      signal: opts.signal,
    });
    if (res.status === 429 || res.status >= 500) {
      lastError = `${model}: HTTP ${res.status}${res.status === 429 ? ` (retry in ${Math.round((parseRetryAfterMs(res.headers) ?? 0) / 1000)}s)` : ""}`;
      continue;
    }
    if (!res.ok) throw new Error(`Whisper ${model} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as { text?: string; duration?: number; segments?: VerboseSegment[] };
    const segments = (json.segments ?? []).filter((s) => !(s.no_speech_prob > 0.6 && s.avg_logprob < -0.7));
    let text = (json.segments ? segments.map((s) => s.text).join("") : (json.text ?? "")).trim();
    if (isPromptEcho(text, opts.prompt)) text = "";
    const confidence = segments.length ? Math.exp(segments.reduce((a, s) => a + s.avg_logprob, 0) / segments.length) : null;
    return { text, confidence: confidence === null ? null : Math.round(confidence * 1000) / 1000, durationSec: json.duration ?? null, model };
  }
  throw new Error(`Speech service busy: ${lastError}`);
}
