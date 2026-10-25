import Link from "next/link";
import { logout } from "@/app/(auth)/_actions/auth";
import { requireCandidateUser } from "@/lib/auth/recruiter";
import { buildInviteUrl } from "@/lib/interviews/invite";
import { createAdminClient } from "@/lib/supabase/admin";
import { isFinished } from "@/lib/interview/status";
import { BrandMark } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface CandidateInterviewRow {
  id: string;
  job_title: string;
  organization: string;
  status: string;
  invite_active: boolean;
  invite_expires_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_minutes: number;
}



/** Candidate home: only their own invitations, with no scores, questions, transcripts or proctoring data. */
export default async function CandidateDashboard() {
  const { supabase, user } = await requireCandidateUser();
  const { data, error } = await supabase.rpc("my_candidate_interviews");
  const rows = (data ?? []) as CandidateInterviewRow[];

  // The start link needs the current invite nonce, which the RPC deliberately doesn't return.
  const activeIds = rows.filter((r) => r.invite_active && !isFinished(r.status)).map((r) => r.id);
  const links = new Map<string, string>();
  if (activeIds.length) {
    const { data: invites } = await createAdminClient()
      .from("interviews")
      .select("id, invite_nonce, invite_expires_at, candidate_email")
      .in("id", activeIds);
    for (const i of invites ?? []) {
      if (i.invite_nonce && i.invite_expires_at && i.candidate_email.toLowerCase() === user.email.toLowerCase()) {
        const url = await buildInviteUrl(i.id, i.invite_nonce, i.invite_expires_at);
        if (url) links.set(i.id, new URL(url).pathname);
      }
    }
  }

  return (
    <>
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between gap-3 px-4 sm:px-6">
          <span className="flex shrink-0 items-center gap-2 font-semibold">
            <BrandMark />
            Proctra
          </span>
          <div className="flex min-w-0 items-center gap-3 text-sm text-muted-foreground">
            <span className="hidden max-w-56 truncate sm:inline" title={user.email}>
              {user.email}
            </span>
            <form action={logout}>
              <Button variant="outline" size="sm" type="submit">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 p-4 sm:p-6">
        <h1 className="mb-6 text-2xl font-semibold">Your interviews</h1>
        <Card>
          <CardHeader>
            <CardTitle className="text-base break-words">Invitations for {user.email}</CardTitle>
          </CardHeader>
          <CardContent>
            {error ? (
              <p role="alert" className="text-sm text-danger">
                Could not load your interviews.
              </p>
            ) : !rows.length ? (
              <p className="text-sm text-muted-foreground">No interviews yet. When a company invites you with this email, it will appear here.</p>
            ) : (
              <ul className="divide-y">
                {rows.map((r) => {
                  const link = links.get(r.id);
                  const done = isFinished(r.status);
                  return (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm">
                      <div>
                        <p className="font-medium">{r.job_title}</p>
                        <p className="text-muted-foreground">
                          {r.organization} · about {r.duration_minutes} min
                          {r.invite_expires_at && !done ? ` · link expires ${new Date(r.invite_expires_at).toLocaleString()}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="secondary">{done ? "Completed — the hiring team will be in touch" : r.status === "IN_PROGRESS" || r.status === "PAUSED" ? "In progress" : r.invite_active ? "Invited" : "Link expired"}</Badge>
                        {link && !done ? (
                          <Button asChild size="sm">
                            <Link href={link}>{r.status === "IN_PROGRESS" ? "Resume interview" : "Start interview"}</Link>
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
