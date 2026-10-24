import type { Metadata } from "next";
import { InterviewApp } from "@/components/candidate/interview-app";

export const metadata: Metadata = { title: "Proctra interview", robots: { index: false, follow: false } };

/** Candidate entry point from the invite link. The token is verified by every API call it makes. */
export default async function CandidateInterviewPage({ params }: PageProps<"/interview/[token]">) {
  const { token } = await params;
  return (
    <main className="dark flex flex-1 flex-col bg-arena p-4 text-foreground sm:p-8">
      <InterviewApp token={decodeURIComponent(token)} />
    </main>
  );
}
