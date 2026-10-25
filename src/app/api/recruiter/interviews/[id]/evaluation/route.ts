import { requireRecruiter } from "@/lib/auth/recruiter";
import { kickEvaluation } from "@/lib/evaluation/schedule";

/**
 * Evaluation status for the review page (polled while PENDING/RUNNING). Also self-heals: a job
 * whose lease expired or whose deferral elapsed is kicked again.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/recruiter/interviews/[id]/evaluation">) {
  const { id } = await ctx.params;
  const { supabase } = await requireRecruiter();
  const { data: iv } = await supabase
    .from("interviews")
    .select("evaluation_status, evaluation_error, evaluation_lease_until, evaluation_not_before, evaluation_finished_at")
    .eq("id", id)
    .maybeSingle();
  if (!iv) return Response.json({ error: "Not found" }, { status: 404 });
  const now = Date.now();
  const stalled =
    ["PENDING", "RUNNING"].includes(iv.evaluation_status) &&
    (!iv.evaluation_lease_until || new Date(iv.evaluation_lease_until).getTime() < now) &&
    (!iv.evaluation_not_before || new Date(iv.evaluation_not_before).getTime() <= now);
  if (stalled) kickEvaluation(new URL(req.url).origin, id);
  return Response.json({ status: iv.evaluation_status, error: iv.evaluation_error, finishedAt: iv.evaluation_finished_at });
}
