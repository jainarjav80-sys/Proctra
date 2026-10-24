"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserTTS } from "@/lib/speech/browser-tts";
import { WebSpeechSTT } from "@/lib/speech/web-speech-stt";
import type { ClientQuestion, InterviewAction } from "@/lib/interview/engine";
import { ApiError, candidateFetch, withReconnect, type CandidateSession, type TurnResponse } from "./api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Phase = "starting" | "speaking" | "listening" | "submitting" | "reconnecting" | "ended" | "error";
type TurnKind = "ANSWER" | "NO_RESPONSE" | "SKIP" | "REPEAT";
interface Segment { text: string; startMs: number; endMs: number; confidence: number | null }

// Silence ladder before the candidate starts speaking (PDR §4.4.4), and auto-submit after they stop.
const NUDGE_1_MS = 8_000;
const NUDGE_2_MS = 20_000;
const NO_RESPONSE_MS = 30_000;
const END_OF_ANSWER_SILENCE_MS = 5_000;
const SUBMIT_COUNTDOWN_FROM_MS = 2_000;

const fmt = (sec: number) => `${Math.floor(Math.max(0, sec) / 60)}:${String(Math.floor(Math.max(0, sec) % 60)).padStart(2, "0")}`;

export function InterviewStage({ token, session, stream }: { token: string; session: CandidateSession; stream: MediaStream }) {
  const selfView = useRef<HTMLVideoElement>(null);
  const tts = useRef<BrowserTTS | null>(null);
  const stt = useRef<WebSpeechSTT | null>(null);

  const [phase, setPhase] = useState<Phase>("starting");
  const [question, setQuestion] = useState<ClientQuestion | null>(null);
  const [caption, setCaption] = useState("");
  const [finals, setFinals] = useState<Segment[]>([]);
  const [interim, setInterim] = useState("");
  // Render-safe snapshot of the timing refs, refreshed every tick.
  const [clock, setClock] = useState({ now: 0, startedAt: 0, durationMinutes: session.durationMinutes, listenStartedAt: 0, lastSpeechAt: 0, spoke: false });
  const [error, setError] = useState<string | null>(null);
  const [typedMode, setTypedMode] = useState(false);
  const [typed, setTyped] = useState("");
  const [fullscreenLost, setFullscreenLost] = useState(false);

  // Mutable interview bookkeeping (read inside timers and recognition callbacks).
  const s = useRef({
    version: 0,
    startedAt: 0,
    durationMinutes: session.durationMinutes,
    listenStartedAt: 0,
    lastSpeechAt: 0,
    spoke: false,
    nudges: 0,
    segStart: 0,
    finals: [] as Segment[],
    busy: false,
  });

  useEffect(() => {
    if (selfView.current) selfView.current.srcObject = stream;
  }, [stream]);

  // ---- speech helpers -------------------------------------------------------------------------
  const stopListening = useCallback(() => {
    stt.current?.stop();
    setInterim("");
  }, []);

  const speak = useCallback(async (text: string) => {
    if (!text.trim()) return;
    stopListening(); // don't transcribe our own voice
    setPhase("speaking");
    setCaption(text);
    await tts.current!.speak(text);
  }, [stopListening]);

  /** fresh = a new answer attempt (new question or clarify). Resuming after a nudge keeps the clock
   *  and nudge count, so the silence ladder runs 8 s → 20 s → 30 s in total, not per nudge. */
  const startListening = useCallback(
    (fresh: boolean) => {
      const st = s.current;
      if (fresh) {
        st.finals = [];
        setFinals([]);
        setTyped("");
        st.listenStartedAt = Date.now();
        st.lastSpeechAt = 0;
        st.spoke = false;
        st.nudges = 0;
      }
      setInterim("");
      setPhase("listening");
      if (!typedMode) stt.current?.start();
    },
    [typedMode],
  );

  // ---- server turns ---------------------------------------------------------------------------
  const handle = useCallback(
    async (res: TurnResponse) => {
      const st = s.current;
      st.version = res.version;
      st.startedAt = new Date(res.startedAt).getTime();
      st.durationMinutes = res.durationMinutes;
      const action: InterviewAction = res.action;
      if (action.type === "END") {
        setQuestion(null);
        await speak(action.say);
        stopListening();
        setPhase("ended");
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      setQuestion(action.question);
      if (action.type === "LISTEN") {
        await speak(action.say);
        startListening(true); // the server already stored the unclear part
        return;
      }
      await speak([action.say, action.question.text].filter(Boolean).join(" "));
      setCaption(action.question.text);
      startListening(true);
    },
    [speak, startListening, stopListening, stream],
  );

  const sendTurn = useCallback(
    async (kind: TurnKind) => {
      const st = s.current;
      if (st.busy) return;
      st.busy = true;
      stopListening();
      setPhase("submitting");
      const text = (typedMode ? typed : st.finals.map((f) => f.text).join(" ")).trim();
      const confs = st.finals.map((f) => f.confidence).filter((c): c is number => typeof c === "number" && c > 0);
      const body = {
        turnId: crypto.randomUUID(),
        version: st.version,
        kind: kind === "ANSWER" && !text ? "NO_RESPONSE" : kind,
        transcript: text,
        avgConfidence: typedMode || !confs.length ? null : confs.reduce((a, b) => a + b, 0) / confs.length,
        segments: typedMode ? [] : st.finals,
      };
      try {
        const res = await withReconnect(
          () => candidateFetch<TurnResponse>(token, "interview/turn", { body }),
          () => setPhase("reconnecting"),
        );
        st.busy = false;
        await handle(res);
      } catch (e) {
        st.busy = false;
        setError(e instanceof ApiError ? e.message : "We couldn't reach the server. Check your connection and reload this page; your progress is saved.");
        setPhase("error");
      }
    },
    [handle, stopListening, token, typed, typedMode],
  );

  // ---- setup: speech engines + start/resume ----------------------------------------------------
  useEffect(() => {
    tts.current = new BrowserTTS();
    const rec = new WebSpeechSTT();
    stt.current = rec;
    const offResult = rec.onResult((r) => {
      const st = s.current;
      const rel = Date.now() - st.startedAt;
      if (!st.spoke) st.segStart = rel;
      st.spoke = true;
      st.lastSpeechAt = Date.now();
      if (r.isFinal) {
        const seg = { text: r.text.trim(), startMs: Math.max(0, st.segStart), endMs: Math.max(0, rel), confidence: r.confidence || null };
        if (seg.text) {
          st.finals = [...st.finals, seg];
          setFinals(st.finals);
        }
        st.segStart = rel;
        setInterim("");
      } else {
        setInterim(r.text);
      }
    });
    const offError = rec.onError((m) => {
      setTypedMode(true);
      setError(m === "network" ? "Speech recognition lost its connection. You can type your answer below." : `Speech recognition unavailable (${m}). You can type your answer below.`);
    });

    let cancelled = false;
    (async () => {
      try {
        const res = await withReconnect(() => candidateFetch<TurnResponse>(token, "interview/start", { method: "POST", body: {} }), () => setPhase("reconnecting"));
        if (!cancelled) await handle(res);
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message);
          setPhase("error");
        }
      }
    })();
    return () => {
      cancelled = true;
      offResult();
      offError();
      rec.stop();
      tts.current?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per mount
  }, []);

  // ---- timers: silence ladder, end-of-answer detection, answer limit -----------------------------
  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now();
      const st = s.current;
      setClock({ now: t, startedAt: st.startedAt, durationMinutes: st.durationMinutes, listenStartedAt: st.listenStartedAt, lastSpeechAt: st.lastSpeechAt, spoke: st.spoke });
      if (phase !== "listening" || st.busy || !question) return;
      const sinceListen = t - st.listenStartedAt;
      if (sinceListen >= question.answerLimitSec * 1000) return void sendTurn("ANSWER");
      if (typedMode) return;
      if (!st.spoke) {
        if (sinceListen >= NO_RESPONSE_MS) return void sendTurn("NO_RESPONSE");
        if (sinceListen >= NUDGE_2_MS && st.nudges < 2) {
          st.nudges = 2;
          void speak("Would you like me to repeat the question, or skip it? You can also just start answering.").then(() => startListening(false));
        } else if (sinceListen >= NUDGE_1_MS && st.nudges < 1) {
          st.nudges = 1;
          void speak("Take your time. Say repeat if you'd like to hear the question again.").then(() => startListening(false));
        }
        return;
      }
      if (t - st.lastSpeechAt >= END_OF_ANSWER_SILENCE_MS) void sendTurn("ANSWER");
    }, 250);
    return () => clearInterval(id);
  }, [phase, question, sendTurn, speak, startListening, typedMode]);

  // ---- fullscreen guard (logging comes in P4) ----------------------------------------------------
  useEffect(() => {
    if (session.proctoring.enforce_fullscreen === false) return;
    const onChange = () => setFullscreenLost(!document.fullscreenElement && phase !== "ended");
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [phase, session.proctoring.enforce_fullscreen]);

  // ---- render -----------------------------------------------------------------------------------
  const { now } = clock;
  const elapsedSec = clock.startedAt ? (now - clock.startedAt) / 1000 : 0;
  const remainingSec = clock.durationMinutes * 60 - elapsedSec;
  const answerLeft = question && phase === "listening" && clock.listenStartedAt ? question.answerLimitSec - (now - clock.listenStartedAt) / 1000 : null;
  const silenceMs = phase === "listening" && clock.spoke ? now - clock.lastSpeechAt : 0;
  const submitIn = silenceMs >= SUBMIT_COUNTDOWN_FROM_MS ? Math.ceil((END_OF_ANSWER_SILENCE_MS - silenceMs) / 1000) : null;
  const answerText = [finals.map((f) => f.text).join(" "), interim].filter(Boolean).join(" ");

  if (phase === "ended") {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 py-24 text-center">
        <span aria-hidden className="size-16 rounded-full" style={{ background: "var(--ai-gradient)" }} />
        <h1 className="text-2xl font-semibold">Interview complete</h1>
        <p className="text-muted-foreground">Thank you. Your answers have been saved, and the recruiter will review your interview. You can close this window.</p>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-[calc(100vh-2rem)] flex-col gap-4">
      {/* Progress bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-sm text-muted-foreground">
        <span>
          {question ? (
            <>
              Question {question.primaryIndex} of {question.total}
              {question.followUpIndex ? " · follow-up" : ""}
            </>
          ) : (
            "Getting ready…"
          )}
        </span>
        <span>
          {answerLeft !== null ? <>Answer time {fmt(answerLeft)} · </> : null}
          Interview {fmt(remainingSec)} left
        </span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary transition-[width]" style={{ width: `${question ? ((question.primaryIndex - 1) / question.total) * 100 : 0}%` }} />
      </div>

      {/* Interviewer */}
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <div
          aria-hidden
          className={`size-28 rounded-full transition-transform ${phase === "speaking" ? "animate-pulse scale-110" : ""}`}
          style={{
            background: phase === "listening" ? "var(--success-500)" : "var(--ai-gradient)",
            boxShadow: phase === "listening" ? "0 0 0 12px rgb(16 185 129 / 0.15)" : "0 0 40px rgb(139 92 246 / 0.4)",
          }}
        />
        <p className="text-sm font-medium text-muted-foreground" aria-live="polite">
          {phase === "speaking" && "Interviewer is speaking…"}
          {phase === "listening" && (clock.spoke ? "Listening…" : "Your turn. Answer out loud.")}
          {phase === "submitting" && "Thinking…"}
          {phase === "reconnecting" && "Reconnecting… your progress is saved."}
          {phase === "starting" && "Connecting…"}
        </p>
        <div className="max-w-3xl rounded-xl border bg-card/85 p-6 backdrop-blur">
          {question ? (
            <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">{question.category.toLowerCase()}</p>
          ) : null}
          <p className="text-xl leading-relaxed">{caption || "…"}</p>
        </div>

        {/* Live transcript / typed fallback */}
        {typedMode ? (
          <Textarea
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            rows={5}
            className="max-w-3xl"
            placeholder="Type your answer here"
            disabled={phase !== "listening"}
            aria-label="Typed answer"
          />
        ) : (
          <p className="min-h-12 max-w-3xl text-muted-foreground" aria-live="polite">
            {answerText}
          </p>
        )}
        {submitIn !== null && submitIn > 0 ? <p className="text-sm text-warning">Submitting in {submitIn}s… keep talking to continue.</p> : null}

        <div className="flex flex-wrap justify-center gap-2">
          {phase === "speaking" ? (
            <Button variant="outline" onClick={() => tts.current?.cancel()}>
              Skip reading
            </Button>
          ) : null}
          <Button size="lg" disabled={phase !== "listening"} onClick={() => sendTurn("ANSWER")}>
            I&apos;ve finished my answer
          </Button>
          <Button variant="outline" disabled={phase !== "listening"} onClick={() => sendTurn("REPEAT")}>
            Repeat question
          </Button>
          <Button variant="outline" disabled={phase !== "listening"} onClick={() => sendTurn("SKIP")}>
            Skip question
          </Button>
        </div>
        {error ? (
          <p role="alert" className="max-w-xl text-sm text-warning">
            {error}
          </p>
        ) : null}
        {phase === "error" ? <Button onClick={() => window.location.reload()}>Reload and continue</Button> : null}
      </div>

      {/* Self view */}
      <video
        ref={selfView}
        autoPlay
        muted
        playsInline
        className="absolute right-0 bottom-0 aspect-video w-56 rounded-lg border-2 border-border bg-black object-cover [transform:scaleX(-1)]"
        aria-label="Your camera"
      />

      {fullscreenLost ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6" role="dialog" aria-modal="true">
          <div className="flex max-w-sm flex-col gap-4 rounded-xl border bg-card p-6 text-center">
            <p className="font-medium">Please return to fullscreen</p>
            <p className="text-sm text-muted-foreground">The interview runs in fullscreen. Leaving it is noted for the recruiter.</p>
            <Button onClick={() => void document.documentElement.requestFullscreen().then(() => setFullscreenLost(false))}>Return to fullscreen</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
