import "server-only";
import { z } from "zod";

/**
 * Server-side environment, validated lazily so `next build` works without secrets.
 * Each accessor throws a readable error naming the missing variable at first use.
 */
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  TOKEN_SECRET: z.string().min(32, "TOKEN_SECRET must be at least 32 characters"),
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default("openai/gpt-oss-120b"),
  GROQ_STT_MODEL: z.string().default("whisper-large-v3-turbo"),
  LIVEKIT_URL: z.string().optional(),
  LIVEKIT_API_KEY: z.string().optional(),
  LIVEKIT_API_SECRET: z.string().optional(),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | undefined;

export function env(): ServerEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${problems}. See .env.example.`);
  }
  cached = parsed.data;
  return cached;
}

/** Non-throwing presence check, used by /api/health. */
export function envStatus() {
  const has = (k: string) => Boolean(process.env[k]);
  return {
    supabase: has("NEXT_PUBLIC_SUPABASE_URL") && has("NEXT_PUBLIC_SUPABASE_ANON_KEY") && has("SUPABASE_SERVICE_ROLE_KEY"),
    tokenSecret: (process.env.TOKEN_SECRET?.length ?? 0) >= 32,
    gemini: has("GEMINI_API_KEY"),
    groq: has("GROQ_API_KEY"),
    livekit: has("LIVEKIT_URL") && has("LIVEKIT_API_KEY") && has("LIVEKIT_API_SECRET"),
  };
}
