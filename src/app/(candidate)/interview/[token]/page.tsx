import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { logout } from "@/app/(auth)/_actions/auth";
import { CandidateAuthError, requireCandidate } from "@/lib/candidate/session";
import { InterviewApp } from "@/components/candidate/interview-app";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Proctra interview", robots: { index: false, follow: false } };

/**
 * Candidate entry point from the invite link. Requires a signed-in candidate account whose email
 * matches the invitation; every API call re-checks the same thing.
 */
export default async function CandidateInterviewPage({ params }: PageProps<"/interview/[token]">) {
  const { token: raw } = await params;
  const token = decodeURIComponent(raw);
  try {
    await requireCandidate(token);
  } catch (e) {
    if (!(e instanceof CandidateAuthError)) throw e;
    if (e.code === "SIGN_IN") redirect(`/login?next=${encodeURIComponent(`/interview/${raw}`)}`);
    return (
      <main className="dark flex flex-1 items-center justify-center bg-arena p-6 text-foreground">
        <div className="flex max-w-md flex-col gap-4 rounded-xl border bg-card p-8 text-center">
          <h1 className="text-xl font-semibold">We couldn&apos;t open this interview</h1>
          <p className="text-muted-foreground">{e.message}</p>
          {e.code === "WRONG_ACCOUNT" ? (
            <form action={logout}>
              <Button type="submit" variant="outline">
                Sign out
              </Button>
            </form>
          ) : null}
        </div>
      </main>
    );
  }
  return (
    <main className="dark flex flex-1 flex-col bg-arena p-4 text-foreground sm:p-8">
      <InterviewApp token={token} />
    </main>
  );
}
