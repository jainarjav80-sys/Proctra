import Link from "next/link";
import { requireRecruiter } from "@/lib/auth/recruiter";
import { RecruiterHeader } from "@/components/recruiter/recruiter-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OrgInviteCard } from "@/components/org/org-invite-card";

export default async function DashboardPage() {
  const { supabase, user } = await requireRecruiter();
  const { data: interviews, error } = await supabase
    .from("interviews")
    .select("id, candidate_name, status, created_at, jobs(title)")
    .order("created_at", { ascending: false })
    .limit(50);
  const { data: org } = await supabase.from("organizations").select("name, invite_code").maybeSingle();

  return (
    <>
      <RecruiterHeader email={user.email} />
      <main className="mx-auto w-full max-w-6xl flex-1 p-6">
        <div className="mb-6">
          {org ? <OrgInviteCard orgName={org.name} code={org.invite_code} isAdmin={user.role === "ORG_ADMIN"} /> : null}
        </div>
        <h1 className="mb-6 text-2xl font-semibold">Interviews</h1>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent interviews</CardTitle>
          </CardHeader>
          <CardContent>
            {error ? (
              <p role="alert" className="text-sm text-danger">
                Could not load interviews: {error.message}
              </p>
            ) : !interviews?.length ? (
              <p className="text-sm text-muted-foreground">No interviews yet.</p>
            ) : (
              <ul className="divide-y">
                {interviews.map((i) => (
                  <li key={i.id} className="flex items-center justify-between py-3 text-sm">
                    <Link href={`/interviews/${i.id}`} className="font-medium hover:text-primary">{i.candidate_name}</Link>
                    <span className="text-muted-foreground">
                      {(i.jobs as unknown as { title: string } | null)?.title}
                    </span>
                    <Badge variant="secondary">{i.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
