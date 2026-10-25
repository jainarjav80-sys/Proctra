"use client";

import { ErrorPanel } from "@/components/feedback/error-panel";

export default function RecruiterError({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorPanel error={error} retry={retry} homeHref="/dashboard" homeLabel="Back to interviews" />;
}
