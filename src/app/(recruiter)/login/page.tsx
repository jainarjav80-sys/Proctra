import { AuthForm } from "@/components/auth-form";
import { login } from "../actions";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <AuthForm mode="login" action={login} next={typeof next === "string" ? next : undefined} />
    </main>
  );
}
