import { notFound } from "next/navigation";
import { ProctorHarness } from "@/components/dev/proctor-harness";

/** Dev-only: runs the real useProctoring hook (detectors, warnings, event posting) for E2E tests. */
export default function ProctorHarnessPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ProctorHarness />;
}
