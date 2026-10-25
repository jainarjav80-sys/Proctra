"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** Friendly fallback for an error boundary: retry the segment, or go somewhere safe. */
export function ErrorPanel({ error, retry, homeHref, homeLabel, dark = false }: { error: unknown; retry: () => void; homeHref: string; homeLabel: string; dark?: boolean }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  // Server errors arrive with a generic message plus a digest that matches the server logs.
  const digest = error instanceof Error && "digest" in error ? String((error as Error & { digest?: string }).digest ?? "") : "";
  return (
    <main className={`${dark ? "dark bg-arena text-foreground" : ""} flex flex-1 items-center justify-center p-6`}>
      <div role="alert" className="flex w-full max-w-md flex-col gap-4 rounded-xl border bg-card p-6 text-card-foreground">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">This page couldn&apos;t load. It&apos;s usually temporary: try again, and if it keeps happening, reload the page.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => retry()}>Try again</Button>
          <Button variant="outline" asChild>
            <Link href={homeHref}>{homeLabel}</Link>
          </Button>
        </div>
        {digest ? <p className="font-mono text-xs text-muted-foreground">Reference: {digest}</p> : null}
      </div>
    </main>
  );
}
