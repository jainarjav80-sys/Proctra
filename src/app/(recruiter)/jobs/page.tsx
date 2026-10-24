import Link from "next/link";
import { requireRecruiter } from "@/lib/auth/recruiter";
import { RecruiterHeader } from "@/components/recruiter/recruiter-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default async function JobsPage() {
  const { supabase, user } = await requireRecruiter();
  const { data: jobs, error } = await supabase
    .from("jobs")
    .select("id, title, experience_level, created_at, jd_analysis_hash, interviews(count)")
    .order("created_at", { ascending: false });

  return (
    <>
      <RecruiterHeader email={user.email} />
      <main className="mx-auto w-full max-w-6xl flex-1 p-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Jobs</h1>
          <Button asChild>
            <Link href="/jobs/new">New job</Link>
          </Button>
        </div>
        <Card>
          <CardContent>
            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error.message}
              </p>
            ) : !jobs?.length ? (
              <p className="py-4 text-sm text-muted-foreground">No jobs yet. Create one to start adding candidates.</p>
            ) : (
              <ul className="divide-y">
                {jobs.map((j) => (
                  <li key={j.id}>
                    <Link href={`/jobs/${j.id}`} className="flex items-center justify-between gap-4 py-3 text-sm hover:text-primary">
                      <span className="font-medium">{j.title}</span>
                      <span className="flex items-center gap-3 text-muted-foreground">
                        <Badge variant="secondary">{j.experience_level}</Badge>
                        {(j.interviews as unknown as { count: number }[])[0]?.count ?? 0} candidates
                        {j.jd_analysis_hash ? null : <Badge variant="outline">not analysed</Badge>}
                      </span>
                    </Link>
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
