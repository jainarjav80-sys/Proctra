import { CANDIDATE_TOKEN_HEADER, candidateError, requireCandidate } from "@/lib/candidate/session";
import { MAX_AUDIO_BYTES, transcribe } from "@/lib/speech/groq-whisper";

export const maxDuration = 30;

/**
 * Server STT fallback for browsers without a Web Speech backend: one VAD-cut audio segment →
 * Groq Whisper → text. The vocabulary prompt comes from the server's current question, not the client.
 */
export async function POST(req: Request) {
  try {
    const { admin, interview } = await requireCandidate(req.headers.get(CANDIDATE_TOKEN_HEADER), req);
    if (!interview.consent) return Response.json({ error: "Consent is required first" }, { status: 403 });
    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof Blob) || audio.size === 0) return Response.json({ error: "No audio" }, { status: 400 });
    if (audio.size > MAX_AUDIO_BYTES) return Response.json({ error: "Audio segment too large" }, { status: 413 });
    if (!/^audio\//.test(audio.type) && !/webm|ogg|wav/.test(audio.type)) return Response.json({ error: "Unsupported audio type" }, { status: 415 });

    // Vocabulary bias: the job's skills (so "Postgres" isn't heard as "posters") + the current question.
    const state = interview.fsm_state as { questionId?: string } | null;
    const { data: job } = await admin.from("jobs").select("required_skills").eq("id", interview.job_id).maybeSingle();
    const skills = ((job?.required_skills as { name: string }[] | null) ?? []).map((s) => s.name);
    let questionText = "";
    if (state?.questionId) {
      const { data: q } = await admin.from("questions").select("text, target_skills").eq("id", state.questionId).maybeSingle();
      if (q) {
        questionText = q.text;
        skills.push(...((q.target_skills as string[] | null) ?? []));
      }
    }
    const prompt = `Technical interview answer. Terms: ${[...new Set(skills)].join(", ")}. ${questionText}`.trim();
    const result = await transcribe(audio, { prompt, signal: AbortSignal.timeout(20_000) });
    return Response.json(result);
  } catch (e) {
    if (e instanceof Error && /Speech service busy/.test(e.message)) return Response.json({ error: e.message, retriable: true }, { status: 503 });
    return candidateError(e);
  }
}
