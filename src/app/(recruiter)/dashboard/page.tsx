import Link from "next/link";
import { after } from "next/server";
import { headers } from "next/headers";
import { requireRecruiter } from "@/lib/auth/recruiter";
import { sweepExpired } from "@/lib/evaluation/schedule";
import { createAdminClient } from "@/lib/supabase/admin";
import { RecruiterHeader } from "@/components/recruiter/recruiter-header";
import { NativeSelect } from "@/components/forms/native-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { OrgInviteCard } from "@/components/org/org-invite-card";

const STATUSES = ["ALL", "DRAFT", "READY", "ONBOARDING", "IN_PROGRESS", "PAUSED", "COMPLETED", "EVALUATED", "EXPIRED"] as const;
const SORTS = { date: "Newest", score: "Score (high → low)", flags: "Most flags" } as const;

interface Row {
  id: string;
  candidate_name: string;
  status: string;
  created_at: string;
  overall_score: number | null;
  recruiter_decision: string;
  evaluation_status: string;
  jobs: { title: string } | null;
  proctoring_events: { tier: string }[];
}

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const sp = await searchParams;
  const status = STATUSES.includes(sp.status as (typeof STATUSES)[number]) ? (sp.status as string) : "ALL";
  const sort = (Object.keys(SORTS).includes(sp.sort as string) ? sp.sort : "date") as keyof typeof SORTS;
  const { supabase, user } = await requireRecruiter();

  // Interviews that ran out of time are marked EXPIRED (and evaluated if they have answers).
  if (user.orgId) {
    const h = await headers();
    const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
    const orgId = user.orgId;
    after(() => sweepExpired(createAdminClient(), orgId, origin));
  }

  let q = supabase
    .from("interviews")
    .select("id, candidate_name, status, created_at, overall_score, recruiter_decision, evaluation_status, jobs(title), proctoring_events(tier)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (status !== "ALL") q = q.eq("status", status);
  const { data, error } = await q;
  const rows = ((data ?? []) as unknown as Row[]).map((r) => ({ ...r, flags: r.proctoring_events.filter((e) => e.tier === "INFERRED_SUSPICION").length }));
  if (sort === "score") rows.sort((a, b) => (b.overall_score ?? -1) - (a.overall_score ?? -1));
  if (sort === "flags") rows.sort((a, b) => b.flags - a.flags);
  const { data: org } = await supabase.from("organizations").select("name, invite_code").maybeSingle();

  return (
    <>
      <RecruiterHeader email={user.email} />
      <main className="mx-auto w-full max-w-6xl flex-1 p-6">
        <div className="mb-6">{org ? <OrgInviteCard orgName={org.name} code={org.invite_code} isAdmin={user.role === "ORG_ADMIN"} /> : null}</div>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-2xl font-semibold">Interviews</h1>
          <form className="flex items-end gap-2 text-sm" method="get">
            <label className="flex flex-col gap-1">
              Status
              <NativeSelect name="status" defaultValue={status} className="w-40">
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s === "ALL" ? "All" : s.replace("_", " ").toLowerCase()}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className="flex flex-col gap-1">
              Sort
              <NativeSelect name="sort" defaultValue={sort} className="w-44">
                {Object.entries(SORTS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <Button type="submit" size="sm" variant="outline">
              Apply
            </Button>
          </form>
        </div>
        <Card>
          <CardContent className="overflow-x-auto">
            {error ? (
              <p role="alert" className="text-sm text-danger">
                Could not load interviews: {error.message}
              </p>
            ) : !rows.length ? (
              <p className="py-4 text-sm text-muted-foreground">No interviews match.</p>
            ) : (
              <table className="w-full text-left text-sm" data-testid="interviews-table">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="py-2">Candidate</th>
                    <th>Job</th>
                    <th>Status</th>
                    <th>Score</th>
                    <th>Flags</th>
                    <th>Decision</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((i) => {
                    const finished = ["COMPLETED", "EVALUATED", "EXPIRED"].includes(i.status);
                    return (
                      <tr key={i.id} className="border-t">
                        <td className="py-2">
                          <Link href={finished ? `/dashboard/interviews/${i.id}` : `/interviews/${i.id}`} className="font-medium hover:text-primary">
                            {i.candidate_name}
                          </Link>
                        </td>
                        <td className="text-muted-foreground">{i.jobs?.title}</td>
                        <td>
                          <Badge variant="secondary">{i.status}</Badge>
                        </td>
                        <td className="font-mono">{i.overall_score !== null ? Number(i.overall_score).toFixed(1) : i.evaluation_status === "RUNNING" || i.evaluation_status === "PENDING" ? "…" : "–"}</td>
                        <td>{i.flags ? <Badge variant="destructive">{i.flags}</Badge> : <span className="text-muted-foreground">0</span>}</td>
                        <td>{i.recruiter_decision === "PENDING" ? <span className="text-muted-foreground">–</span> : <Badge>{i.recruiter_decision}</Badge>}</td>
                        <td className="text-xs text-muted-foreground">{new Date(i.created_at).toLocaleDateString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
