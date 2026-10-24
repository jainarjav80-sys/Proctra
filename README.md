# Proctra

AI-led video interviews with browser-side proctoring and an optional phone camera. Every proctoring flag goes to a human for review, and the AI never makes the hiring decision.

The active scope is the 10-hour prototype in [PROTOTYPE_PLAN.md](PROTOTYPE_PLAN.md). The specs live in [docs/](docs/).

## Stack

Next.js 16 (App Router, TS strict, Tailwind v4, shadcn/ui) · Supabase (Postgres + Auth + Storage) · Gemini Flash with a Groq fallback · browser Web Speech STT and speechSynthesis TTS · MediaPipe + TF.js in the browser · LiveKit Cloud for the phone camera. Everything runs on free tiers.

## Setup (about 15 minutes)

1. **Supabase**: create a free project at supabase.com.
   - In the SQL Editor, paste and run `supabase/migrations/0001_init.sql`.
   - For a fast demo, turn off email confirmation: Authentication → Sign In / Providers → Email → *Confirm email*.
   - Copy the project URL, anon (publishable) key and service_role (secret) key from Project Settings → API.
2. **Gemini**: create a key at aistudio.google.com/apikey.
3. **Groq** (optional fallback): create a key at console.groq.com/keys.
4. **LiveKit** (needed from P4 for the phone camera): create a project at cloud.livekit.io and copy the URL, API key and secret.
5. Set up the env file:
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

Check http://localhost:3000/api/health. It should return `"ok": true` once Supabase, the token secret and one LLM key are configured.

```bash
npm test
```

## Deploy (Vercel Hobby)

Import the repo in Vercel, add every variable from `.env.example` with `NEXT_PUBLIC_APP_URL` set to the Vercel URL, and deploy. The camera, mic and screen APIs need HTTPS, which Vercel provides. On localhost they also work in Chrome.

## Browser support

Candidates need current **Chrome or Edge**, because multi-monitor detection and Web Speech recognition are Chromium-only. Recruiter pages work in any modern browser.
