import { z } from "zod";
import { CANDIDATE_TOKEN_HEADER, candidateError, requireCandidate } from "@/lib/candidate/session";

export const maxDuration = 30;

const body = z.object({ text: z.string().trim().min(1).max(600) });
const MODEL = process.env.GROQ_TTS_MODEL || "canopylabs/orpheus-v1-english";
const VOICE = process.env.GROQ_TTS_VOICE || "troy";

/**
 * Interviewer voice via Groq Orpheus (one sentence → WAV). Candidate-authenticated so the key and
 * quota can't be used by anyone else. Free tier ≈ 100 requests/day: on 429 the client switches to
 * the in-browser Kokoro voice, which is preloaded as a hot standby.
 */
export async function POST(req: Request) {
  try {
    await requireCandidate(req.headers.get(CANDIDATE_TOKEN_HEADER), req);
    const parsed = body.safeParse(await req.json());
    if (!parsed.success) return Response.json({ error: "Invalid text" }, { status: 400 });
    const res = await fetch("https://api.groq.com/openai/v1/audio/speech", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.GROQ_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, voice: VOICE, response_format: "wav", input: parsed.data.text }),
      signal: AbortSignal.timeout(15_000),
    });
    const remaining = res.headers.get("x-ratelimit-remaining-requests") ?? "";
    if (res.status === 429) return Response.json({ error: "Voice quota reached", rateLimited: true }, { status: 429, headers: { "x-tts-remaining": remaining } });
    if (!res.ok || !res.body) return Response.json({ error: `Voice service error ${res.status}` }, { status: 502 });
    return new Response(res.body, { headers: { "content-type": "audio/wav", "cache-control": "no-store", "x-tts-remaining": remaining } });
  } catch (e) {
    return candidateError(e);
  }
}
