import { requireRecruiter } from "@/lib/auth/recruiter";
import { JobForm } from "@/components/jobs/job-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const maxDuration = 60; // JD analysis LLM call runs in the save action

export default async function NewJobPage() {
  await requireRecruiter();
  return (
    <>
      <main className="mx-auto w-full max-w-4xl flex-1 p-6">
        <Card>
          <CardHeader>
            <CardTitle>New job</CardTitle>
          </CardHeader>
          <CardContent>
            <JobForm />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
