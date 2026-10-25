import Link from "next/link";
import { logout } from "@/app/(auth)/_actions/auth";
import { Button } from "@/components/ui/button";
import { NavLinks } from "./nav-links";

/** Fits a 360 px phone: the email is hidden below `sm` (still announced to screen readers via the title). */
export function RecruiterHeader({ email }: { email: string }) {
  return (
    <header className="border-b bg-card print:hidden">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2 sm:gap-5">
          <Link href="/dashboard" className="focus-ring flex shrink-0 items-center gap-2 rounded-md font-semibold">
            <span aria-hidden className="size-6 rounded-md" style={{ background: "var(--ai-gradient)" }} />
            <span className="hidden min-[400px]:inline">Proctra</span>
            <span className="sr-only min-[400px]:hidden">Proctra home</span>
          </Link>
          <NavLinks />
        </div>
        <div className="flex min-w-0 items-center gap-3 text-sm text-muted-foreground">
          <span className="hidden max-w-56 truncate sm:inline" title={email}>
            {email}
          </span>
          <form action={logout}>
            <Button variant="outline" size="sm" type="submit" title={`Sign out ${email}`}>
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
