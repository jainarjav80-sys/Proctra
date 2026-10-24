import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="dark flex flex-1 flex-col items-center justify-center gap-6 bg-arena p-6 text-center text-foreground">
      <span aria-hidden className="size-12 rounded-xl" style={{ background: "var(--ai-gradient)" }} />
      <h1 className="text-4xl font-bold tracking-tight">Proctra</h1>
      <p className="max-w-md text-muted-foreground">
        AI-led video interviews with dual-camera proctoring. Every flag is reviewed by a human; the AI never makes the
        hiring decision.
      </p>
      <Button asChild size="lg">
        <Link href="/login">Recruiter sign in</Link>
      </Button>
      <p className="text-xs text-muted-foreground">Candidates: open the interview link from your invitation email.</p>
    </main>
  );
}
