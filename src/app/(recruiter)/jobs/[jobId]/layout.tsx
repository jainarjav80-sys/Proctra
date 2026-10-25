import { assertVisible } from "@/lib/auth/owned";

export default async function JobLayout({ children, params }: LayoutProps<"/jobs/[jobId]">) {
  await assertVisible("jobs", (await params).jobId);
  return children;
}
