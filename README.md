# Proctra

AI-led video interviews with browser-side proctoring and an optional phone camera. Every proctoring flag goes to a human for review, and the AI never makes the hiring decision.

The active scope is the 10-hour prototype in [PROTOTYPE_PLAN.md](docs/PROTOTYPE_PLAN.md). The specs live in [docs/](docs/).

## Stack

Next.js 16 (App Router, TS strict, Tailwind v4, shadcn/ui) · Supabase (Postgres + Auth + Storage) · Groq (gpt-oss-20b for live turns, gpt-oss-120b for analysis, Qwen fallback) · browser Web Speech STT with Groq Whisper fallback · interviewer voice: browser speechSynthesis → Groq Orpheus → Kokoro-82M on-device (Web Worker) · MediaPipe + COCO-SSD in the browser · phone camera over WebRTC with Supabase Realtime signalling. Everything runs on free tiers.

## Setup (about 15 minutes)

1. **Supabase**: create a free project at supabase.com.
   - In the SQL Editor, paste and run every file in `supabase/migrations/` in order (`0001` … `0005`).
   - For a fast demo, turn off email confirmation: Authentication → Sign In / Providers → Email → *Confirm email*.
   - Copy the project URL, anon (publishable) key and service_role (secret) key from Project Settings → API.
2. **Groq**: create a key at console.groq.com/keys.
3. **Groq Orpheus voice**: accept the model terms once at console.groq.com (Playground → `canopylabs/orpheus-v1-english`). The free tier allows 100 requests/day; after that the voice switches to Kokoro automatically.
4. Set up the env file:
   ```bash
   cp .env.example .env.local
   ```
   Fill it in. Generate `TOKEN_SECRET` with `openssl rand -base64 32`.

## Run locally

```bash
npm install
```

```bash
npm run dev
```

Check http://localhost:3000/api/health. It should return `"ok": true` once Supabase, the token secret and the Groq key are configured.

```bash
npm test
```

## Deploy (Vercel Hobby)

1. **Import** the GitHub repo in Vercel (framework: Next.js; build command `npm run build`, which also copies the MediaPipe/Kokoro browser runtimes into `public/vendor`).
2. **Environment variables** (Project → Settings → Environment Variables, for Production and Preview):

   | Variable | Value |
   | :--- | :--- |
   | `NEXT_PUBLIC_APP_URL` | your Vercel URL, e.g. `https://proctra.vercel.app` (used in invite links and phone QR codes) |
   | `TOKEN_SECRET` | same 32+ char secret as local (or a new one: existing invite links will stop working) |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase **publishable** key |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase **secret** key (server-only) |
   | `GROQ_API_KEY` | Groq key |
   | `GROQ_FAST_MODEL` / `GROQ_SMART_MODEL` / `GROQ_FALLBACK_MODEL` | optional; defaults `openai/gpt-oss-20b` / `openai/gpt-oss-120b` / `qwen/qwen3.8-27b` |
   | `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL` | optional TURN relay for phones on mobile data (below) |

3. **Supabase Auth URLs** (Authentication → URL Configuration): set **Site URL** to the Vercel URL and add `https://<your-app>.vercel.app/**` (and `http://localhost:3000/**` for local dev) to **Redirect URLs**. Only needed for email links (confirmation/reset); password sign-in works without it.
4. **Redeploy** after changing env vars (Vercel only applies them to new deployments).

HTTPS matters: phones only allow camera access on secure origins, so test the phone camera on the Vercel URL, not `localhost`.

### Phone camera on mobile data (TURN)

> **Phone camera currently requires both devices on the same network; TURN pending.** The ICE server list is pluggable (`TURN_*` env vars → `iceServers()` in `src/lib/companion/server.ts`, served by `/api/candidate/pair` and `/api/companion/handshake`), so a relay can be added without code changes.

The phone ↔ computer video is plain WebRTC with STUN, which works on most home/office Wi-Fi. Mobile carriers and strict corporate networks often need a **TURN relay**. Free options:

- **Metered "Open Relay" / free tier** (metered.ca): sign up, copy the TURN URLs, username and credential. Free quota is small but plenty for demos.
- **Cloudflare Realtime TURN**: free tier with generous monthly egress; credentials are generated per session via their API (would need a small server route).

Set `TURN_URL` to a comma-separated list (e.g. `turn:host:80,turn:host:443,turns:host:443?transport=tcp`) plus `TURN_USERNAME` and `TURN_CREDENTIAL`. LiveKit Cloud would include TURN, but only for LiveKit rooms; this build uses WebRTC + Supabase Realtime signalling instead.

## Browser support

- **Candidates:** a Chromium-based desktop browser. Chrome and Edge use their built-in speech recognition. Brave, Vivaldi, Opera and Arc are allowed with Proctra's server speech recognition (Groq Whisper), provided the display check (Window Management API) works there. Firefox and Safari are blocked.
- **Interviewer voice:** the browser's own voice when a real one is installed, then Groq Orpheus, then Kokoro (~90 MB one-time download, runs on the device in a Web Worker). On Linux, snap-packaged Brave/Chromium have no voices at all, so they use Orpheus or Kokoro.
- **Phone camera:** any modern phone browser over HTTPS (iOS Safari 16.4+, Android Chrome).
- **Recruiter pages:** any modern browser.

## Demo script (about 10 minutes)

Prepare once (dev server on :3123, or pass the Vercel URL as the last argument):

```bash
node --env-file=.env.local scripts/create-demo-recruiter.mjs
```

```bash
node --env-file=.env.local scripts/seed-completed-demo.mjs
```

The second command runs a whole candidate interview in headless Chromium (voice answers, a follow-up, a barge-in, camera + screen + phone recordings), waits for the background evaluation and prints the review URL. It adds one observation labelled `[demo seed]` so the Proctoring tab has a snapshot to show.

Then walk through it live:

1. **Recruiter:** sign in as the demo recruiter → Jobs → create a job from a JD → "Analyse" (skills, seniority) → add a candidate with a resume PDF → generate and approve the question blueprint → copy the invite link.
2. **Candidate** (Chrome, second profile): open the invite → consent → camera/mic + face check → sound check (browser voice, or Orpheus/Kokoro) → pair the phone by QR (same Wi-Fi) → share the entire screen → answer two questions by voice. Say "can you repeat" once and talk over the interviewer once.
3. **Review** the seeded interview at `/dashboard/interviews/:id`: overall and per-question scores with quotes highlighted in the transcript (click one to jump the video) → Recording tab (three synced streams, markers, paused spans) → Proctoring tab ("Observations for human review, not used in scoring", benign explanations) → override a score with a reason → set Advance/Hold/Reject → Download PDF / CSV.
4. **Candidate dashboard:** shows only "Completed — the hiring team will be in touch".

Things to say up front: the phone camera needs both devices on the same network (TURN pending), and Orpheus has 100 requests/day (about 25 per interview), after which Kokoro takes over.

The manual checks that automation can't cover are in [docs/MANUAL_CHECKLIST.md](docs/MANUAL_CHECKLIST.md).

## Checks

```bash
npm test
```

Live checks against your Supabase project (dev server on :3123):

```bash
node --env-file=.env.local scripts/check-rls.mjs
```

```bash
node --env-file=.env.local scripts/e2e-audio-warnings.mjs
```

```bash
node --env-file=.env.local scripts/e2e-full-interview.mjs --keep
```

```bash
node --env-file=.env.local scripts/e2e-review.mjs
```

`e2e-full-interview` runs a complete voice interview (add `--force-kokoro` to block Orpheus and measure the on-device voice; it prints the answer-to-audio gap per turn). `e2e-review` opens the kept interview's review page and checks stitched, gapless, synced playback and seeking. Other scripts in `scripts/`: `check-interview-flow`, `check-speech-signals`, `check-whisper`, `check-proctoring`, `e2e-onboarding`, `e2e-phone-pairing`, `bench-kokoro`.
