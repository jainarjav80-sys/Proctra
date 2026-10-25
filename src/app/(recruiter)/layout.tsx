import { requireRecruiter } from "@/lib/auth/recruiter";
import { RecruiterHeader } from "@/components/recruiter/recruiter-header";

/** Shared recruiter chrome: the header stays visible while a page loads or shows an error. */
export default async function RecruiterLayout({ children }: LayoutProps<"/">) {
  const { user } = await requireRecruiter();
  return (
    <>
      <RecruiterHeader email={user.email} />
      {children}
    </>
  );
}
