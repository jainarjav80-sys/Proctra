"use client";

import { ErrorPanel } from "@/components/feedback/error-panel";

export default function InterviewError({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorPanel error={error} retry={retry} homeHref="/candidate" homeLabel="Your interviews" dark />;
}
