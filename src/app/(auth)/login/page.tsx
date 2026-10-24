import { AuthForm } from "@/components/auth/auth-form";
import { inviteContext } from "@/lib/auth/invite-context";
import { safeNext } from "@/lib/auth/roles";
import { login } from "../_actions/auth";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const next = safeNext((await searchParams).next) ?? undefined;
  const invite = await inviteContext(next ?? null);
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <AuthForm
        mode="login"
        action={login}
        next={next}
        defaultType={invite ? "candidate" : "organization"}
        prefillEmail={invite?.email}
        inviteNotice={invite ? "Sign in with the email your interview invitation was sent to." : undefined}
      />
    </main>
  );
}
