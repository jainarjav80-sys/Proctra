# Proctra — 10-Hour Prototype Plan (ACTIVE)

The production reference is [Implementation_plan.md](Implementation_plan.md). Its §3 conflict resolutions and §4 feasibility notes still apply, scaled down to prototype size. **Where they conflict, this file wins.**

## Scope

**In:** one Next.js app with three route groups: `(recruiter)`, `(candidate)` and `(companion)`. Supabase handles DB, auth and storage. Gemini is the LLM, with Groq as fallback. The browser does speech-to-text and text-to-speech. Proctoring runs in the browser. The phone camera connects over LiveKit via QR. Recordings use MediaRecorder. Evaluation quotes are verified. A recruiter report closes the loop. Candidates must use Chrome or Edge.

**Out:** k8s/Helm/Terraform, GPU or Python workers, Celery, OTel/Grafana/Langfuse, OIDC, multi-tenant RBAC (one recruiter owns their own rows), pen-test, load testing, data-deletion workflows, eval harnesses, server-side lip-sync/diarization, composite evidence clips, PDF export.

**Kept from the full plan (§3/§4):**
- LiveKit SFU instead of P2P, with P2P over Supabase Realtime as the documented fallback.
- Two tiers: observed events vs. inferred suspicions, each suspicion with benign explanations, and no automated penalty.
- The voice-biometric check stays off. It is not built.
- No AI hire/reject recommendation. The recruiter makes the decision.
- Timing-fit warning on the interview config.
- Default of 10 questions.
- Single-use pair token valid for 300 s.
- Alt+Tab can only be detected through window blur.
- Chromium only.

## Free services, limits and your setup steps

Quotas change, so check each dashboard. Everything below is free tier, with no card.

| Service | Used for | Limits that matter | You do |
| :--- | :--- | :--- | :--- |
| **Supabase** (Free) | Postgres, Auth, Storage | 500 MB DB, 1 GB storage, **50 MB per file**, project pauses after 7 days idle | Create a project. Run `supabase/migrations/*.sql` in the SQL editor. Turn off "Confirm email" (Auth → Providers → Email) for a quick demo. Copy the URL, anon key and service-role key |
| **Vercel** (Hobby) | Hosting | **4.5 MB request body** limit on functions, so uploads go straight to Supabase via signed URLs. Function timeout is limited (we set `maxDuration` 60) | Import the repo and add the env vars |
| **Google AI Studio (Gemini)** | Primary LLM (Flash) | Per-minute and per-day request caps. Free-tier prompts may be used by Google, so use demo data only | Create an API key and set `GEMINI_API_KEY` |
| **Groq** | Fallback LLM (Llama), optional Whisper STT | Requests/tokens per minute and per day | Create an API key and set `GROQ_API_KEY` |
| **LiveKit Cloud** (Build) | Phone camera stream | Monthly participant-minute quota | Create a project. Set `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` |
| Web Speech API / speechSynthesis | STT / TTS | Chrome sends the audio to Google, so it needs a network connection. Recognition stops on silence, so we auto-restart it | Nothing |
| MediaPipe Face Landmarker, TF.js COCO-SSD | Edge proctoring | Apache-2.0. Models load from CDN | Nothing |

Generate `TOKEN_SECRET` yourself with `openssl rand -base64 32`. See `.env.example`.

## Phases (time-boxed: cut features before running over)

| Phase | Budget | Builds | PS coverage |
| :--- | :--- | :--- | :--- |
| **P1 Foundation** | 1.5 h | Scaffold. Supabase schema + RLS. Recruiter email/password auth. Design tokens. Signed candidate/pair tokens. LLM provider interface with Gemini and Groq JSON-schema output. STT/TTS client interfaces. `.env.example`. A skeleton that deploys to Vercel. Smoke test: tokens + default-10 | Groundwork for all of it |
| **P2 Recruiter setup** | 1.5 h | Job + JD + skills. Resume upload (signed URL) + parse (`pdf-parse` / `mammoth`) + LLM extraction. LLM question blueprint (category split, difficulty, dedup, custom questions, editable). Config with the timing-fit check. Signed invite link | 3.A (config, resume extraction, defaults), 3.B |
| **P3 AI interview** | 2.5 h | Onboarding: browser gate, itemized consent, camera/mic check, fullscreen, display audit. Interview loop: TTS question → STT answer → LLM decides follow-up or advance (respects the follow-up cap and time buffer; handles repeat/skip/"I don't know"; silence ladder). Server-side FSM state in the DB. Transcript stored per question, with statuses | 3.A onboarding, 3.C |
| **P4 Proctoring + phone cam** | 2 h | Face count, gaze/head pose (with grace window), COCO-SSD for phone/book/person, visibility/blur/fullscreen, multi-monitor (Window Management API), paste/devtools heuristics, camera/mic loss. Event log + snapshots on HIGH events + suspicion rules. Companion QR → LiveKit → desktop subscribes, runs detection, logs disconnects. Chunked recording upload | 3.D, 3.E |
| **P5 Evaluation + report** | 1.5 h | Per-question 1–5 scores on 4 dimensions. Quotes verified as transcript substrings, with retries. Competency summary, strengths/gaps/areas to probe. The evaluation module never imports proctoring data. Report: scores, transcript, proctoring timeline + snapshots, recording playback, override with reason, recruiter decision | 3.F, 3.G |
| **P6 Buffer** | 1 h | Seed demo JD/resume, an end-to-end run, fixes, README with a demo script | §4 workflow, deliverables 9–10 |

**Cut order if behind:** live recruiter view of the phone feed → screen-share recording → Groq Whisper fallback → follow-up context memory → override UI (keep the decision).
