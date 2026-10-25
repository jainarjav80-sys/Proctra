import { notFound } from "next/navigation";
import { PairHarness } from "@/components/dev/pair-harness";

/** Dev-only: runs the desktop side of phone pairing for automated WebRTC tests. 404 in production. */
export default function PairHarnessPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PairHarness />;
}
