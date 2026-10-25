import { after } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { llm } from "@/lib/llm";
import { runEvaluationStep } from "@/lib/evaluation/run";
import { internalKey } from "@/lib/evaluation/schedule";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

const body = z.object({ interviewId: z.uuid() });

/**
 * Background evaluation worker. Each invocation does ≤ 40 s of work (well inside Vercel's limit),
 * then re-invokes itself until the evaluation is DONE/FAILED. Internal-only (HMAC key).
 */
export async function POST(req: Request) {
  const key = req.headers.get("x-internal-key") ?? "";
  const expected = internalKey();
  if (key.length !== expected.length || !timingSafeEqual(Buffer.from(key), Buffer.from(expected))) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad request" }, { status: 400 });
  const { interviewId } = parsed.data;
  const origin = new URL(req.url).origin;

  after(async () => {
    const result = await runEvaluationStep(createAdminClient(), interviewId, llm("smart"));
    if (result === "more") {
      await fetch(`${origin}/api/internal/evaluate`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-internal-key": expected },
        body: JSON.stringify({ interviewId }),
        signal: AbortSignal.timeout(5000),
      }).catch(() => {});
    }
  });
  return Response.json({ accepted: true }, { status: 202 });
}
