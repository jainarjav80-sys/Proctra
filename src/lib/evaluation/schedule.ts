import "server-only";
import { createHmac } from "node:crypto";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/config/env";

export function internalKey(): string {
  return createHmac("sha256", env().TOKEN_SECRET).update("internal:evaluate").digest("hex");
}

/** Fire-and-forget: ask the internal endpoint to run the next evaluation step (after the response). */
export function kickEvaluation(origin: string, interviewId: string) {
  after(async () => {
    try {
      await fetch(`${origin}/api/internal/evaluate`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-internal-key": internalKey() },
        body: JSON.stringify({ interviewId }),
        signal: AbortSignal.timeout(5000), // just start it; the endpoint keeps running on its own
      });
    } catch {
      /* the polling endpoint re-kicks stalled jobs */
    }
  });
}

/** Queues evaluation (idempotent). `rerun` resets question results so everything is re-scored. */
export async function queueEvaluation(admin: SupabaseClient, interviewId: string, origin: string, opts: { rerun?: boolean } = {}) {
  if (opts.rerun) {
    await admin.from("questions").update({ evaluation_status: "PENDING" }).eq("interview_id", interviewId).eq("follow_up_index", 0);
    await admin
      .from("interviews")
      .update({ evaluation_status: "PENDING", evaluation_lease_until: null, evaluation_not_before: null, evaluation_attempts: 0, evaluation_error: null, evaluation_usage: {} })
      .eq("id", interviewId);
  } else {
    await admin.from("interviews").update({ evaluation_status: "PENDING" }).eq("id", interviewId).in("evaluation_status", ["NONE", "FAILED"]);
  }
  kickEvaluation(origin, interviewId);
}

/** Marks an interview that ran out of time/invite as EXPIRED (ones with answers get evaluated) and queues missed evaluations. */
export async function sweepExpired(admin: SupabaseClient, orgId: string, origin: string) {
  const { data: stale } = await admin
    .from("interviews")
    .select("id, started_at, duration_minutes, invite_expires_at, status")
    .eq("org_id", orgId)
    .in("status", ["IN_PROGRESS", "PAUSED"]);
  const now = Date.now();
  for (const iv of stale ?? []) {
    const overTime = iv.started_at && now > new Date(iv.started_at).getTime() + (iv.duration_minutes + 30) * 60_000;
    const inviteGone = iv.invite_expires_at && now > new Date(iv.invite_expires_at).getTime();
    if (!overTime && !inviteGone) continue;
    await admin.from("interviews").update({ status: "EXPIRED" }).eq("id", iv.id).in("status", ["IN_PROGRESS", "PAUSED"]);
    const { count } = await admin.from("questions").select("id", { count: "exact", head: true }).eq("interview_id", iv.id).not("transcript", "is", null);
    if (count) await queueEvaluation(admin, iv.id, origin);
  }
  // Finished interviews whose queueing never landed (e.g. a failed write at END) get queued now.
  const { data: missed } = await admin.from("interviews").select("id").eq("org_id", orgId).eq("status", "COMPLETED").eq("evaluation_status", "NONE").limit(10);
  for (const iv of missed ?? []) await queueEvaluation(admin, iv.id, origin);
}
