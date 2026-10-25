import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { inviteContext } from "@/lib/auth/invite-context";
import { safeNext } from "@/lib/auth/roles";
import { login } from "./(auth)/_actions/auth";

/** Landing page = the sign-in page (signed-in users are sent to their home by the proxy). */
export default async function Home({ searchParams }: PageProps<"/">) {
  const next = safeNext((await searchParams).next) ?? undefined;
  const invite = await inviteContext(next ?? null);
  return (
    <AuthShell>
      <AuthForm
        bare
        mode="login"
        action={login}
        next={next}
        defaultType={invite ? "candidate" : "organization"}
        prefillEmail={invite?.email}
        inviteNotice={invite ? "Sign in with the email your interview invitation was sent to." : undefined}
      />
    </AuthShell>
  );
}
