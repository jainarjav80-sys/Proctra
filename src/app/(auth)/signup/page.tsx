import { AuthForm } from "@/components/auth/auth-form";
import { inviteContext } from "@/lib/auth/invite-context";
import { safeNext } from "@/lib/auth/roles";
import { signup } from "../_actions/auth";

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const next = safeNext((await searchParams).next) ?? undefined;
  const invite = await inviteContext(next ?? null);
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <AuthForm
        mode="signup"
        action={signup}
        next={next}
        defaultType={invite ? "candidate" : "organization"}
        prefillEmail={invite?.email}
        inviteNotice={invite ? "Create a candidate account with the email your invitation was sent to." : undefined}
      />
    </main>
  );
}
