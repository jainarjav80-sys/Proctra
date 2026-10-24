import { AuthForm } from "@/components/auth-form";
import { signup } from "../actions";

export default function SignupPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <AuthForm mode="signup" action={signup} />
    </main>
  );
}
