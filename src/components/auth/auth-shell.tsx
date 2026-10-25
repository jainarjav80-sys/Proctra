import { BrandMark } from "@/components/brand/logo";
import { LineField } from "@/components/marketing/line-field";

/**
 * Split entry layout shared by the landing/sign-in page and sign-up: animated contour field with the
 * product principle on the left (a short band on phones), the form on a faint grid on the right.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh flex-1 bg-slate-100 text-foreground lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <section className="relative h-36 overflow-hidden border-b border-slate-200 bg-slate-200/60 sm:h-48 lg:h-auto lg:border-r lg:border-b-0">
        <LineField className="absolute inset-0 size-full" />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-100/90 via-transparent to-slate-100/30" />
        <figure className="absolute bottom-10 left-10 hidden max-w-sm rounded-lg border bg-card/90 p-6 shadow-card backdrop-blur-sm lg:block">
          <p className="text-[11px] font-medium tracking-[0.2em] text-primary uppercase">How Proctra works</p>
          <blockquote className="mt-3 text-[15px] leading-relaxed text-foreground">
            “An AI interviewer asks, listens and follows up. Every proctoring signal goes to a person with its harmless explanations
            next to it. The AI scores answers; people make the hiring decision.”
          </blockquote>
          <figcaption className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
            <BrandMark className="h-3" />
            Proctra design principle
          </figcaption>
        </figure>
      </section>

      <section className="relative flex items-center justify-center overflow-hidden px-6 py-10 sm:px-10">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgb(15_23_42/0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgb(15_23_42/0.05)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_75%)]"
        />
        <div aria-hidden className="pointer-events-none absolute top-1/3 left-1/2 size-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500/10 blur-3xl" />
        <div className="relative w-full max-w-md">{children}</div>
      </section>
    </main>
  );
}
