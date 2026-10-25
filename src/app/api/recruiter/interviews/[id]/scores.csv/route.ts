import { requireRecruiter } from "@/lib/auth/recruiter";

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"` : s; // CSV + formula-injection safe
};

/** Per-question scores as CSV (org-scoped by RLS). */
export async function GET(_req: Request, ctx: RouteContext<"/api/recruiter/interviews/[id]/scores.csv">) {
  const { id } = await ctx.params;
  const { supabase } = await requireRecruiter();
  const { data: iv } = await supabase.from("interviews").select("candidate_name, overall_score, jobs(title)").eq("id", id).maybeSingle();
  if (!iv) return new Response("Not found", { status: 404 });
  const { data: qs } = await supabase
    .from("questions")
    .select("primary_index, category, text, status, ai_score, override_score, override_reason, evaluation_status")
    .eq("interview_id", id)
    .eq("follow_up_index", 0)
    .order("primary_index");
  const rows = [
    ["question", "category", "text", "status", "ai_score", "override_score", "final_score", "override_reason", "evaluation_status"],
    ...(qs ?? []).map((q) => [q.primary_index, q.category, q.text, q.status, q.ai_score, q.override_score, q.override_score ?? q.ai_score, q.override_reason, q.evaluation_status]),
    [],
    ["overall_ai_score", iv.overall_score],
  ];
  const body = rows.map((r) => r.map(cell).join(",")).join("\n");
  const name = `${iv.candidate_name.replace(/[^a-z0-9]+/gi, "-")}-scores.csv`;
  return new Response(body, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"` } });
}
