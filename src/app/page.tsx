import Link from "next/link";
import { ArrowRightIcon, Building2Icon, BriefcaseBusinessIcon, MailIcon } from "lucide-react";
import { BrandLogo, BrandMark } from "@/components/brand/logo";
import { LineField } from "@/components/marketing/line-field";

/** Bordered full-width entry row (sign in / create account). */
function EntryLink({ href, icon, label, hint }: { href: string; icon: React.ReactNode; label: string; hint: string }) {
  return (
    <Link
      href={href}
      className="focus-ring group flex items-center gap-3 rounded-md border border-white/10 bg-white/[0.03] px-4 py-3 text-sm transition-colors hover:border-brand-500/60 hover:bg-white/[0.06]"
    >
      <span aria-hidden className="text-muted-foreground transition-colors group-hover:text-brand-100">
        {icon}
      </span>
      <span className="flex flex-col">
        <span className="font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </span>
      <ArrowRightIcon aria-hidden className="ml-auto size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

export default function Home() {
  return (
    <main className="dark grid min-h-dvh flex-1 bg-arena text-foreground lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      {/* Left: animated contour field + principle card (a short band on phones). */}
      <section className="relative h-44 overflow-hidden border-b border-white/10 sm:h-56 lg:h-auto lg:border-r lg:border-b-0">
        <LineField className="absolute inset-0 size-full" />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-arena/80 via-transparent to-arena/30" />
        <figure className="absolute bottom-10 left-10 hidden max-w-sm rounded-lg border border-white/10 bg-arena/85 p-6 shadow-overlay backdrop-blur-sm lg:block">
          <p className="text-[11px] font-medium tracking-[0.2em] text-brand-100/80 uppercase">How Proctra works</p>
          <blockquote className="mt-3 text-[15px] leading-relaxed text-foreground">
            “An AI interviewer asks, listens and follows up. Every proctoring signal goes to a person with its harmless explanations
            next to it. The AI scores answers; people make the hiring decision.”
          </blockquote>
          <figcaption className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
            <BrandMark tone="dark" className="h-3" />
            Proctra design principle
          </figcaption>
        </figure>
      </section>

      {/* Right: entry panel on a faint grid with an indigo glow. */}
      <section className="relative flex items-center justify-center overflow-hidden px-6 py-12 sm:px-10">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgb(255_255_255/0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.035)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_75%)]"
        />
        <div aria-hidden className="pointer-events-none absolute top-1/3 left-1/2 size-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500/15 blur-3xl" />

        <div className="relative flex w-full max-w-sm flex-col gap-6">
          <h1 className="sr-only">Proctra: AI video interviews with human-reviewed proctoring</h1>
          <BrandLogo tone="dark" className="h-12 self-start" />
          <div className="flex flex-col gap-2">
            <p className="text-3xl font-semibold tracking-tight">AI interviews, human decisions.</p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Voice interviews tailored to each job and resume, with browser-side proctoring and a synced review of camera,
              screen and phone.
            </p>
          </div>

          <nav aria-label="Get started" className="flex flex-col gap-3">
            <EntryLink href="/login" icon={<BriefcaseBusinessIcon className="size-4" />} label="Recruiter sign in" hint="Jobs, interviews and reviews" />
            <EntryLink href="/signup" icon={<Building2Icon className="size-4" />} label="Create an organization" hint="Start hiring with your team" />
          </nav>

          <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden>
            <span className="h-px flex-1 bg-white/10" />
            candidates
            <span className="h-px flex-1 bg-white/10" />
          </div>

          <div className="flex items-start gap-3 rounded-md border border-brand-500/40 bg-brand-500/[0.06] px-4 py-3 text-sm">
            <MailIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-100" />
            <p className="text-muted-foreground">
              Open the interview link from your invitation email. Already have an account?{" "}
              <Link href="/login" className="focus-ring rounded-sm font-medium text-brand-100 underline-offset-4 hover:underline">
                Sign in as a candidate
              </Link>
              .
            </p>
          </div>

          <p className="text-xs text-muted-foreground">Every flag is reviewed by a human · No automated hiring decisions</p>
        </div>
      </section>
    </main>
  );
}
