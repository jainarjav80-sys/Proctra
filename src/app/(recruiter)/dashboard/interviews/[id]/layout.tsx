import { assertVisible } from "@/lib/auth/owned";

export default async function ReviewLayout({ children, params }: LayoutProps<"/dashboard/interviews/[id]">) {
  await assertVisible("interviews", (await params).id);
  return children;
}
