"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserTTS } from "@/lib/speech/browser-tts";
import { EnergyVAD } from "@/lib/speech/energy-vad";
import { splitSentences } from "@/lib/speech/sentences";
import { WebSpeechSTT } from "@/lib/speech/web-speech-stt";
import { classifyIntent } from "@/lib/interview/fsm";
import type { ClientQuestion, InterviewAction } from "@/lib/interview/engine";
import { ApiError, candidateFetch, withReconnect, type CandidateSession, type TurnResponse } from "./api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Phase = "starting" | "speaking" | "listening" | "submitting" | "reconnecting" | "ended" | "error";
type TurnKind = "ANSWER" | "NO_RESPONSE" | "SKIP" | "REPEAT";
/** answer = normal answering; barge = capturing what they said over the interviewer;
 *  confirm = waiting for "yes/no" to "Shall I continue the question?" */
type Mode = "answer" | "barge" | "confirm";
interface Segment { text: string; startMs: number; endMs: number; confidence: number | null }
interface BargeIn { sentenceIndex: number; sentenceCount: number; atMs: number; utterance: string }

// Silence ladder before the candidate starts speaking (PDR §4.4.4), and auto-submit after they stop.
const NUDGE_1_MS = 8_000;
const NUDGE_2_MS = 20_000;
const NO_RESPONSE_MS = 30_000;
const END_OF_ANSWER_SILENCE_MS = 5_000;
const SUBMIT_COUNTDOWN_FROM_MS = 2_000;
// Barge-in handling.
const BARGE_END_SILENCE_MS = 1_500; // they've finished their interjection
const BARGE_FALSE_ALARM_MS = 5_000; // VAD fired but STT heard nothing (echo/noise): resume the question
const CONFIRM_WAIT_MS = 6_000;
const OPENING_WINDOW_MS = 15_000; // first part of the answer used for the question-echo check
const YES_RE = /\b(yes|yeah|yep|sure|please|continue|go on|go ahead|ok|okay|carry on)\b/i;
const NO_RE = /\b(no|nope|nah|i'?m good|it'?s fine|that'?s fine|not needed)\b/i;

const fmt = (sec: number) => `${Math.floor(Math.max(0, sec) / 60)}:${String(Math.floor(Math.max(0, sec) % 60)).padStart(2, "0")}`;

export function InterviewStage({ token, session, stream }: { token: string; session: CandidateSession; stream: MediaStream }) {
  const selfView = useRef<HTMLVideoElement>(null);
  const tts = useRef<BrowserTTS | null>(null);
  const stt = useRef<WebSpeechSTT | null>(null);
  const vad = useRef<EnergyVAD | null>(null);

  const [phase, setPhase] = useState<Phase>("starting");
  const [question, setQuestion] = useState<ClientQuestion | null>(null);
  const [caption, setCaption] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [finals, setFinals] = useState<Segment[]>([]);
  const [interim, setInterim] = useState("");
  // Render-safe snapshot of the timing refs, refreshed every tick.
  const [clock, setClock] = useState({ now: 0, startedAt: 0, durationMinutes: session.durationMinutes, listenStartedAt: 0, lastSpeechAt: 0, spoke: false, mode: "answer" as Mode, bargeIns: 0 });
  const [error, setError] = useState<string | null>(null);
  const [typedMode, setTypedMode] = useState(false);
  const [typed, setTyped] = useState("");
  const [fullscreenLost, setFullscreenLost] = useState(false);

  // Mutable interview bookkeeping (read inside timers and recognition/VAD callbacks).
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
    // TTS sentence playback
    sentences: [] as string[],
    questionFrom: 0, // index of the first sentence of the question itself
    sentenceIdx: 0,
    speakToken: 0,
    speakingQuestion: false,
    // Barge-in
    mode: "answer" as Mode,
    modeSince: 0,
    interruptedIdx: 0,
    bargeIns: [] as BargeIn[],
    totalBargeIns: 0,
    pendingAnswer: [] as Segment[],
  });

  useEffect(() => {
    if (selfView.current) selfView.current.srcObject = stream;
  }, [stream]);

  const rel = () => Math.max(0, Date.now() - s.current.startedAt);

  // ---- speech helpers -------------------------------------------------------------------------
  const stopListening = useCallback(() => {
    stt.current?.stop();
    setInterim("");
  }, []);

  /**
   * Speaks sentence by sentence (avoids Chrome's long-utterance cutoff and makes resume possible).
   * Resolves "done", or "interrupted" if a barge-in cancelled playback.
   */
  const speakSentences = useCallback(
    async (sentences: string[], from: number, opts: { question: boolean; questionFrom?: number; caption?: string }) => {
      const st = s.current;
      const token = ++st.speakToken;
      stopListening(); // the recogniser must not transcribe the interviewer
      st.sentences = sentences;
      st.questionFrom = opts.questionFrom ?? 0;
      st.speakingQuestion = opts.question;
      setPhase("speaking");
      setHint(null);
      setCaption(opts.caption ?? sentences.join(" "));
      if (vad.current) vad.current.armed = true;
      for (let i = from; i < sentences.length; i++) {
        if (token !== st.speakToken) return "interrupted" as const;
        st.sentenceIdx = i;
        vad.current?.calibrate();
        await tts.current!.speak(sentences[i]);
      }
      if (token !== st.speakToken) return "interrupted" as const;
      if (vad.current) {
        vad.current.armed = false;
        vad.current.resetFloor();
      }
      return "done" as const;
    },
    [stopListening],
  );

  const speak = useCallback((text: string) => speakSentences(splitSentences(text), 0, { question: false }), [speakSentences]);

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
        st.mode = "answer";
      }
      setInterim("");
      setPhase("listening");
      if (!typedMode) stt.current?.start();
    },
    [typedMode],
  );

  /** Reads the current question (optionally resuming at a sentence), then listens for the answer. */
  const askQuestion = useCallback(
    async (lead: string, q: ClientQuestion, from = 0) => {
      const leadSentences = splitSentences(lead);
      const qSentences = splitSentences(q.text);
      const all = [...leadSentences, ...qSentences];
      const result = await speakSentences(all, from, { question: true, questionFrom: leadSentences.length, caption: q.text });
      setCaption(q.text);
      if (result === "done") startListening(true);
    },
    [speakSentences, startListening],
  );

  // ---- barge-in -------------------------------------------------------------------------------
  const onBargeIn = useCallback(() => {
    const st = s.current;
    if (!st.speakingQuestion || st.busy) {
      // Talking over a nudge/prompt just means they're ready: stop and listen.
      st.speakToken++;
      tts.current?.cancel();
      startListening(false);
      return;
    }
    st.speakToken++;
    tts.current?.cancel();
    if (vad.current) vad.current.armed = false;
    st.interruptedIdx = st.sentenceIdx;
    st.bargeIns.push({ sentenceIndex: st.sentenceIdx, sentenceCount: st.sentences.length, atMs: rel(), utterance: "" });
    st.totalBargeIns++;
    st.mode = "barge";
    st.modeSince = Date.now();
    st.finals = [];
    setFinals([]);
    st.spoke = false;
    st.lastSpeechAt = 0;
    st.listenStartedAt = Date.now();
    setHint("Go ahead…");
    setPhase("listening");
    if (!typedMode) stt.current?.start();
  }, [startListening, typedMode]);

  // The VAD callback is registered once; route it to the latest handler.
  const onBargeInRef = useRef(onBargeIn);
  useEffect(() => {
    onBargeInRef.current = onBargeIn;
  }, [onBargeIn]);

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
        vad.current?.stop();
        setPhase("ended");
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      setQuestion(action.question);
      if (action.type === "LISTEN") {
        if ((await speak(action.say)) === "done") startListening(true); // the server already stored the unclear part
        return;
      }
      await askQuestion(action.say, action.question);
    },
    [askQuestion, speak, startListening, stopListening, stream],
  );

  const sendTurn = useCallback(
    async (kind: TurnKind) => {
      const st = s.current;
      if (st.busy) return;
      st.busy = true;
      st.speakToken++;
      tts.current?.cancel();
      if (vad.current) vad.current.armed = false;
      stopListening();
      setPhase("submitting");
      setHint(null);
      const text = (typedMode ? typed : st.finals.map((f) => f.text).join(" ")).trim();
      const confs = st.finals.map((f) => f.confidence).filter((c): c is number => typeof c === "number" && c > 0);
      const answerStartRel = Math.max(0, st.listenStartedAt - st.startedAt);
      const opening = typedMode ? "" : st.finals.filter((f) => f.startMs <= answerStartRel + OPENING_WINDOW_MS).map((f) => f.text).join(" ");
      const body = {
        turnId: crypto.randomUUID(),
        version: st.version,
        kind: kind === "ANSWER" && !text ? "NO_RESPONSE" : kind,
        transcript: text,
        avgConfidence: typedMode || !confs.length ? null : confs.reduce((a, b) => a + b, 0) / confs.length,
        segments: typedMode ? [] : st.finals,
        bargeIns: st.bargeIns,
        openingText: opening,
      };
      try {
        const res = await withReconnect(
          () => candidateFetch<TurnResponse>(token, "interview/turn", { body }),
          () => setPhase("reconnecting"),
        );
        st.bargeIns = [];
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

  /** After an interjection: meta request → handle it; otherwise offer to finish reading the question. */
  const resolveBargeIn = useCallback(() => {
    const st = s.current;
    const said = st.finals.map((f) => f.text).join(" ").trim();
    const last = st.bargeIns[st.bargeIns.length - 1];
    if (last) last.utterance = said.slice(0, 2000);
    stopListening();
    const q = question;
    if (!q) return;
    const intent = classifyIntent(said);
    if (intent === "REPEAT") {
      st.mode = "answer";
      void askQuestion("Sure, from the start.", q);
      return;
    }
    if (intent === "SKIP") {
      st.mode = "answer";
      void sendTurn("SKIP");
      return;
    }
    if (!said) {
      // VAD fired but nothing intelligible: most likely echo or noise. Carry on reading.
      st.mode = "answer";
      void askQuestion("", q, st.interruptedIdx);
      return;
    }
    const questionDone = st.interruptedIdx >= st.sentences.length - 1;
    if (questionDone) {
      // They interrupted the last sentence: treat what they said as the start of their answer.
      st.mode = "answer";
      setHint(null);
      startListening(false);
      return;
    }
    st.pendingAnswer = st.finals;
    st.mode = "confirm";
    void speak("Shall I continue the question?").then((r) => {
      if (r !== "done") return;
      st.finals = [];
      setFinals([]);
      st.spoke = false;
      st.lastSpeechAt = 0;
      st.modeSince = Date.now();
      setHint("Say “yes” to hear the rest, or keep answering.");
      setPhase("listening");
      if (!typedMode) stt.current?.start();
    });
  }, [askQuestion, question, sendTurn, speak, startListening, stopListening, typedMode]);

  const resolveConfirm = useCallback(() => {
    const st = s.current;
    const said = st.finals.map((f) => f.text).join(" ").trim();
    stopListening();
    const q = question;
    if (!q) return;
    if (!said || (YES_RE.test(said) && !NO_RE.test(said))) {
      st.mode = "answer";
      void askQuestion("", q, Math.max(st.questionFrom, st.interruptedIdx));
      return;
    }
    // They declined or just kept answering: keep their interjection as the start of the answer.
    st.mode = "answer";
    st.finals = NO_RE.test(said) && said.split(/\s+/).length <= 4 ? st.pendingAnswer : [...st.pendingAnswer, ...st.finals];
    setFinals(st.finals);
    setHint(null);
    startListening(false);
  }, [askQuestion, question, startListening, stopListening]);

  // ---- setup: speech engines, VAD + start/resume -----------------------------------------------
  useEffect(() => {
    tts.current = new BrowserTTS();
    const rec = new WebSpeechSTT();
    stt.current = rec;
    const offResult = rec.onResult((r) => {
      const st = s.current;
      const now = rel();
      if (!st.spoke) st.segStart = now;
      st.spoke = true;
      st.lastSpeechAt = Date.now();
      if (r.isFinal) {
        const seg = { text: r.text.trim(), startMs: Math.max(0, st.segStart), endMs: now, confidence: r.confidence || null };
        if (seg.text) {
          st.finals = [...st.finals, seg];
          setFinals(st.finals);
        }
        st.segStart = now;
        setInterim("");
      } else {
        setInterim(r.text);
      }
    });
    const offError = rec.onError((m) => {
      setTypedMode(true);
      setError(m === "network" ? "Speech recognition lost its connection. You can type your answer below." : `Speech recognition unavailable (${m}). You can type your answer below.`);
    });

    const detector = new EnergyVAD();
    vad.current = detector;
    let offVad: (() => void) | null = null;
    detector
      .start()
      .then(() => {
        offVad = detector.on((e) => {
          if (e === "start" && s.current.speakToken && tts.current?.speaking) onBargeInRef.current();
        });
      })
      .catch(() => {
        vad.current = null; // no barge-in without a second mic stream; the interview still works
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
      offVad?.();
      detector.stop();
      rec.stop();
      tts.current?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per mount
  }, []);

  // ---- timers: barge-in resolution, silence ladder, end-of-answer, answer limit -------------------
  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now();
      const st = s.current;
      setClock({ now: t, startedAt: st.startedAt, durationMinutes: st.durationMinutes, listenStartedAt: st.listenStartedAt, lastSpeechAt: st.lastSpeechAt, spoke: st.spoke, mode: st.mode, bargeIns: st.totalBargeIns });
      if (phase !== "listening" || st.busy || !question) return;

      if (st.mode === "barge") {
        if ((st.spoke && t - st.lastSpeechAt >= BARGE_END_SILENCE_MS) || (!st.spoke && t - st.modeSince >= BARGE_FALSE_ALARM_MS)) resolveBargeIn();
        return;
      }
      if (st.mode === "confirm") {
        if ((st.spoke && t - st.lastSpeechAt >= BARGE_END_SILENCE_MS) || t - st.modeSince >= CONFIRM_WAIT_MS) resolveConfirm();
        return;
      }

      const sinceListen = t - st.listenStartedAt;
      if (sinceListen >= question.answerLimitSec * 1000) return void sendTurn("ANSWER");
      if (typedMode) return;
      if (!st.spoke) {
        if (sinceListen >= NO_RESPONSE_MS) return void sendTurn("NO_RESPONSE");
        if (sinceListen >= NUDGE_2_MS && st.nudges < 2) {
          st.nudges = 2;
          void speak("Would you like me to repeat the question, or skip it? You can also just start answering.").then((r) => r === "done" && startListening(false));
        } else if (sinceListen >= NUDGE_1_MS && st.nudges < 1) {
          st.nudges = 1;
          void speak("Take your time. Say repeat if you'd like to hear the question again.").then((r) => r === "done" && startListening(false));
        }
        return;
      }
      if (t - st.lastSpeechAt >= END_OF_ANSWER_SILENCE_MS) void sendTurn("ANSWER");
    }, 250);
    return () => clearInterval(id);
  }, [phase, question, resolveBargeIn, resolveConfirm, sendTurn, speak, startListening, typedMode]);


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
  const silenceMs = phase === "listening" && clock.spoke && clock.mode === "answer" ? now - clock.lastSpeechAt : 0;
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
          {phase === "speaking" && "Interviewer is speaking… (you can interrupt)"}
          {phase === "listening" && (hint ?? (clock.spoke ? "Listening…" : "Your turn. Answer out loud."))}
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
