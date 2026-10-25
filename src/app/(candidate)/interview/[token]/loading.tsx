/** Candidate arena while the invite is verified: same dark stage, no layout jump. */
export default function Loading() {
  return (
    <main className="dark flex flex-1 items-center justify-center bg-arena p-6 text-foreground" aria-busy="true">
      <p role="status" className="flex items-center gap-3 text-sm text-muted-foreground">
        <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-muted-foreground/40 border-t-foreground motion-reduce:animate-none" />
        Preparing your interview…
      </p>
    </main>
  );
}
