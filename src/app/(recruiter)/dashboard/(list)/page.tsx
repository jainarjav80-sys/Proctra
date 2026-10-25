import Link from "next/link";
import { after } from "next/server";
import { requireRecruiter } from "@/lib/auth/recruiter";
import { sweepExpired } from "@/lib/evaluation/schedule";
import { requestOrigin } from "@/lib/http/origin";
import { INTERVIEW_STATUSES, recruiterHref, statusLabel } from "@/lib/interview/status";
import { createAdminClient } from "@/lib/supabase/admin";
import { DashboardFilters } from "@/components/recruiter/dashboard-filters";
import { StatusBadge } from "@/components/interviews/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { OrgInviteCard } from "@/components/org/org-invite-card";

const STATUS_FILTERS = ["ALL", ...INTERVIEW_STATUSES.filter((s) => s !== "EVALUATING")] as const;
const SORTS = { date: "Newest", score: "Score (high → low)", flags: "Most flags" } as const;
const PAGE_SIZE = 25;
const DECISION_LABEL: Record<string, string> = { ADVANCE: "Advance", HOLD: "Hold", REJECT: "Reject" };
// Desktop column layout, shared by the header row and every interview row.
const COLS = "sm:grid sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1.8fr)_8rem_4rem_3.5rem_6rem_6.5rem] sm:items-center sm:gap-3";

interface Row {
  id: string;
  candidate_name: string;
  candidate_email: string;
  status: string;
  created_at: string;
  overall_score: number | null;
  recruiter_decision: string;
  evaluation_status: string;
  jobs: { title: string } | null;
  proctoring_events: { tier: string }[];
}

/** Keeps only characters a name or email search needs, so the text can't alter the PostgREST filter. */
const cleanQuery = (v: unknown) =>
  (typeof v === "string" ? v : "")
    .replace(/[^\p{L}\p{N}@._+\- ]/gu, "")
    .trim()
    .slice(0, 80);

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const sp = await searchParams;
  const status = STATUS_FILTERS.includes(sp.status as (typeof STATUS_FILTERS)[number]) ? (sp.status as string) : "ALL";
  const sort = (Object.keys(SORTS).includes(sp.sort as string) ? sp.sort : "date") as keyof typeof SORTS;
  const q = cleanQuery(sp.q);
  const { supabase, user } = await requireRecruiter();

  // Interviews that ran out of time are marked EXPIRED (and evaluated if they have answers).
  if (user.orgId) {
    const origin = await requestOrigin();
    const orgId = user.orgId;
    after(() => sweepExpired(createAdminClient(), orgId, origin));
  }

  let query = supabase
    .from("interviews")
    .select("id, candidate_name, candidate_email, status, created_at, overall_score, recruiter_decision, evaluation_status, jobs(title), proctoring_events(tier)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (status !== "ALL") query = query.eq("status", status);
  if (q) query = query.or(`candidate_name.ilike."*${q}*",candidate_email.ilike."*${q}*"`);
  const { data, error } = await query;
  const all = ((data ?? []) as unknown as Row[]).map((r) => ({ ...r, flags: r.proctoring_events.filter((e) => e.tier === "INFERRED_SUSPICION").length }));
  if (sort === "score") all.sort((a, b) => (b.overall_score ?? -1) - (a.overall_score ?? -1));
  if (sort === "flags") all.sort((a, b) => b.flags - a.flags);

  const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number.parseInt(String(sp.page ?? "1"), 10) || 1));
  const rows = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const filtered = status !== "ALL" || q !== "";
  const hrefFor = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status !== "ALL") params.set("status", status);
    if (sort !== "date") params.set("sort", sort);
    if (p > 1) params.set("page", String(p));
    const s = params.toString();
    return s ? `/dashboard?${s}` : "/dashboard";
  };
  const { data: org } = await supabase.from("organizations").select("name, invite_code").maybeSingle();

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold">Interviews</h1>
        <DashboardFilters
          q={q}
          status={status}
          sort={sort}
          statuses={STATUS_FILTERS.map((s) => ({ value: s, label: s === "ALL" ? "All statuses" : statusLabel(s) }))}
          sorts={Object.entries(SORTS).map(([value, label]) => ({ value, label }))}
        />
      </div>

      <Card className="py-0">
        <CardContent className="px-0">
          {error ? (
            <p role="alert" className="p-4 text-sm text-danger">
              Could not load interviews: {error.message}
            </p>
          ) : !all.length ? (
            <div className="flex flex-col items-start gap-3 p-6 text-sm">
              <p className="text-muted-foreground">{filtered ? "No interviews match these filters." : "No interviews yet. Add a candidate from a job to create one."}</p>
              {filtered ? (
                <Button asChild variant="outline" size="sm">
                  <Link href="/dashboard">Clear filters</Link>
                </Button>
              ) : (
                <Button asChild size="sm">
                  <Link href="/jobs">Go to jobs</Link>
                </Button>
              )}
            </div>
          ) : (
            <>
              <div aria-hidden className={`hidden border-b px-4 py-2 text-xs font-medium text-muted-foreground ${COLS}`}>
                <span>Candidate</span>
                <span>Job</span>
                <span>Status</span>
                <span className="text-right">Score</span>
                <span className="text-right">Flags</span>
                <span>Decision</span>
                <span>Created</span>
              </div>
              <ul className="divide-y" data-testid="interviews-table" aria-label="Interviews">
                {rows.map((i) => {
                  const score = i.overall_score !== null ? Number(i.overall_score).toFixed(1) : i.evaluation_status === "RUNNING" || i.evaluation_status === "PENDING" ? "…" : "–";
                  const decision = DECISION_LABEL[i.recruiter_decision];
                  return (
                    <li key={i.id}>
                      <Link
                        href={recruiterHref(i.id, i.status)}
                        data-testid="interview-row"
                        className={`focus-ring flex flex-col gap-1.5 px-4 py-3 text-sm transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-offset-[-2px] ${COLS}`}
                      >
                        {/* Phone: name + status on top, job below, then score · flags · decision · date. */}
                        <span className="flex min-w-0 items-center justify-between gap-2">
                          <span className="truncate font-medium">{i.candidate_name}</span>
                          <StatusBadge status={i.status} className="sm:hidden" />
                        </span>
                        <span className="truncate text-muted-foreground">{i.jobs?.title}</span>
                        <span className="hidden sm:block">
                          <StatusBadge status={i.status} />
                        </span>
                        <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground sm:contents sm:text-sm">
                          <span className="sm:text-right sm:font-mono sm:text-foreground">
                            <span className="sm:sr-only">Score </span>
                            {score}
                          </span>
                          <span className="sm:text-right">
                            <span className="sm:sr-only">Flags </span>
                            {i.flags ? <Badge variant="destructive">{i.flags}</Badge> : <span>0</span>}
                          </span>
                          <span>
                            <span className="sm:sr-only">Decision </span>
                            {decision ? <Badge>{decision}</Badge> : <span>–</span>}
                          </span>
                          <span className="sm:text-xs">
                            <span className="sr-only">Created </span>
                            {new Date(i.created_at).toLocaleDateString()}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-sm text-muted-foreground">
                <span>
                  Showing {(page - 1) * PAGE_SIZE + 1}–{(page - 1) * PAGE_SIZE + rows.length} of {all.length}
                  {all.length === 200 ? " (latest 200)" : ""}
                </span>
                {pages > 1 ? (
                  <span className="flex items-center gap-2">
                    {page > 1 ? (
                      <Button asChild variant="outline" size="sm">
                        <Link href={hrefFor(page - 1)} rel="prev">
                          Previous
                        </Link>
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" disabled>
                        Previous
                      </Button>
                    )}
                    <span aria-current="page">
                      Page {page} of {pages}
                    </span>
                    {page < pages ? (
                      <Button asChild variant="outline" size="sm">
                        <Link href={hrefFor(page + 1)} rel="next">
                          Next
                        </Link>
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" disabled>
                        Next
                      </Button>
                    )}
                  </span>
                ) : null}
              </nav>
            </>
          )}
        </CardContent>
      </Card>

      {org ? <OrgInviteCard orgName={org.name} code={org.invite_code} isAdmin={user.role === "ORG_ADMIN"} /> : null}
    </main>
  );
}
