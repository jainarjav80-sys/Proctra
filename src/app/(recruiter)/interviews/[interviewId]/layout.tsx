import { assertVisible } from "@/lib/auth/owned";

export default async function InterviewLayout({ children, params }: LayoutProps<"/interviews/[interviewId]">) {
  await assertVisible("interviews", (await params).interviewId);
  return children;
}
