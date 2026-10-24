import Link from "next/link";
import { logout } from "@/app/(recruiter)/_actions/auth";
import { Button } from "@/components/ui/button";

export function RecruiterHeader({ email }: { email: string }) {
  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
            <span aria-hidden className="size-6 rounded-md" style={{ background: "var(--ai-gradient)" }} />
            Proctra
          </Link>
          <nav className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link className="hover:text-foreground" href="/dashboard">
              Interviews
            </Link>
            <Link className="hover:text-foreground" href="/jobs">
              Jobs
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{email}</span>
          <form action={logout}>
            <Button variant="outline" size="sm" type="submit">
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
