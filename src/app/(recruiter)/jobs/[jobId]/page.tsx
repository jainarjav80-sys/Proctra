import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireRecruiter } from "@/lib/auth/recruiter";
import { jdAnalysisSchema, skillSchema } from "@/lib/jobs/analysis";
import { RecruiterHeader } from "@/components/recruiter/recruiter-header";
import { JobForm } from "@/components/jobs/job-form";
import { JdAnalysisCard } from "@/components/jobs/jd-analysis-card";
import { CandidateForm } from "@/components/interviews/candidate-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const maxDuration = 60;

export default async function JobPage({ params }: PageProps<"/jobs/[jobId]">) {
  const { jobId } = await params;
  const { supabase, user } = await requireRecruiter();
  const { data: job } = await supabase.from("jobs").select("*").eq("id", jobId).maybeSingle();
  if (!job) notFound();
  const { data: interviews } = await supabase
    .from("interviews")
    .select("id, candidate_name, candidate_email, status, resume_status, created_at")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });

  const analysis = jdAnalysisSchema.safeParse(job.jd_analysis);

  return (
    <>
      <RecruiterHeader email={user.email} />
      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-6 p-6 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Candidates</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {interviews?.length ? (
                <ul className="divide-y text-sm">
                  {interviews.map((i) => (
                    <li key={i.id}>
                      <Link href={`/interviews/${i.id}`} className="flex items-center justify-between py-2 hover:text-primary">
                        <span>
                          <span className="font-medium">{i.candidate_name}</span>{" "}
                          <span className="text-muted-foreground">{i.candidate_email}</span>
                        </span>
                        <Badge variant="secondary">{i.status}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No candidates yet.</p>
              )}
              <CandidateForm jobId={jobId} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Job details</CardTitle>
            </CardHeader>
            <CardContent>
              <JobForm
                initial={{
                  id: job.id,
                  title: job.title,
                  description: job.description,
                  experienceLevel: job.experience_level,
                  skills: z.array(skillSchema).catch([]).parse(job.required_skills),
                }}
              />
            </CardContent>
          </Card>
        </div>
        <JdAnalysisCard jobId={jobId} analysis={analysis.success ? analysis.data : null} />
      </main>
    </>
  );
}
