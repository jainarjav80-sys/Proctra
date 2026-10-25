import { Skeleton } from "@/components/ui/skeleton";

/** Loading region: announced once to screen readers, visual placeholders hidden from them. */
function Loading({ label, className, children }: { label: string; className: string; children: React.ReactNode }) {
  return (
    <main className={className} aria-busy="true">
      <p role="status" className="sr-only">
        {label}
      </p>
      {children}
    </main>
  );
}

const Card = ({ className = "", children }: { className?: string; children: React.ReactNode }) => (
  <div className={`flex flex-col gap-3 rounded-xl border bg-card p-4 ${className}`}>{children}</div>
);

export function ListPageSkeleton({ label, rows = 6 }: { label: string; rows?: number }) {
  return (
    <Loading label={label} className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-end justify-between gap-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-9 w-56" />
      </div>
      <Card>
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </Card>
    </Loading>
  );
}

export function DetailPageSkeleton({ label }: { label: string }) {
  return (
    <Loading label={label} className="mx-auto grid w-full max-w-6xl flex-1 gap-6 p-4 sm:p-6 lg:grid-cols-[1fr_340px]">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Card>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </Card>
      </div>
      <Card className="h-fit">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-20 w-full" />
      </Card>
    </Loading>
  );
}
