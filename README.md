# Proctra

AI-led video interviews with browser-side proctoring and an optional phone camera. Every proctoring flag goes to a human for review, and the AI never makes the hiring decision.

The active scope is the 10-hour prototype in [PROTOTYPE_PLAN.md](docs/PROTOTYPE_PLAN.md). The specs live in [docs/](docs/).

## Stack

Next.js 16 (App Router, TS strict, Tailwind v4, shadcn/ui) · Supabase (Postgres + Auth + Storage) · Groq (gpt-oss-20b for live turns, gpt-oss-120b for analysis, Qwen fallback) · browser Web Speech STT and speechSynthesis TTS · MediaPipe + TF.js in the browser · LiveKit Cloud for the phone camera. Everything runs on free tiers.

## Setup (about 15 minutes)

1. **Supabase**: create a free project at supabase.com.
   - In the SQL Editor, paste and run `supabase/migrations/0001_init.sql`.
   - For a fast demo, turn off email confirmation: Authentication → Sign In / Providers → Email → *Confirm email*.
   - Copy the project URL, anon (publishable) key and service_role (secret) key from Project Settings → API.
2. **Groq**: create a key at console.groq.com/keys.
3. **LiveKit** (needed from P4 for the phone camera): create a project at cloud.livekit.io and copy the URL, API key and secret.
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
- **Interviewer voice:** the browser's own voice when a real one is installed; otherwise a neural voice (Kokoro, ~90 MB one-time download, runs on the device). On Linux, snap-packaged Brave/Chromium have no voices at all, so they always use Kokoro.
- **Phone camera:** any modern phone browser over HTTPS (iOS Safari 16.4+, Android Chrome).
- **Recruiter pages:** any modern browser.

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

Other scripts in `scripts/`: `check-interview-flow`, `check-speech-signals`, `check-whisper`, `check-proctoring`, `e2e-onboarding`, `e2e-phone-pairing`.
