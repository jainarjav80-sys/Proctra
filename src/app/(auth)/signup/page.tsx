import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { inviteContext } from "@/lib/auth/invite-context";
import { safeNext } from "@/lib/auth/roles";
import { signup } from "../_actions/auth";

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const next = safeNext((await searchParams).next) ?? undefined;
  const invite = await inviteContext(next ?? null);
  return (
    <AuthShell>
      <AuthForm
        bare
        mode="signup"
        action={signup}
        next={next}
        defaultType={invite ? "candidate" : "organization"}
        prefillEmail={invite?.email}
        inviteNotice={invite ? "Create a candidate account with the email your invitation was sent to." : undefined}
      />
    </AuthShell>
  );
}
