import Link from "next/link";
import { logout } from "@/app/(recruiter)/actions";
import { Button } from "@/components/ui/button";

export function RecruiterHeader({ email }: { email: string }) {
  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
          <span aria-hidden className="size-6 rounded-md" style={{ background: "var(--ai-gradient)" }} />
          Proctra
        </Link>
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
