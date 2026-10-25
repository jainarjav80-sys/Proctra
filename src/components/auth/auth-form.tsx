"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { AuthState } from "@/app/(auth)/_actions/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AccountType = "organization" | "candidate";

const TYPES: { id: AccountType; title: string; detail: string }[] = [
  { id: "organization", title: "I'm hiring", detail: "Organization: create jobs and review interviews" },
  { id: "candidate", title: "I'm a candidate", detail: "Take interviews you've been invited to" },
];

function Field({ id, label, ...props }: { id: string; label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} {...props} />
    </div>
  );
}

export function AuthForm({
  mode,
  action,
  next,
  defaultType = "organization",
  prefillEmail,
  inviteNotice,
}: {
  mode: "login" | "signup";
  action: (state: AuthState, form: FormData) => Promise<AuthState>;
  next?: string;
  defaultType?: AccountType;
  prefillEmail?: string;
  inviteNotice?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [type, setType] = useState<AccountType>(defaultType);
  const [orgMode, setOrgMode] = useState<"create" | "join">("create");
  const isLogin = mode === "login";
  const query = next ? `?next=${encodeURIComponent(next)}` : "";

  return (
    <Card className="w-full max-w-md shadow-card">
      <CardHeader>
        <CardTitle className="text-2xl">{isLogin ? "Sign in to Proctra" : "Create your Proctra account"}</CardTitle>
        <CardDescription>{inviteNotice ?? "AI interviews with human-reviewed proctoring."}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          {next ? <input type="hidden" name="next" value={next} /> : null}
          <input type="hidden" name="accountType" value={type} />
          <fieldset className="grid grid-cols-2 gap-2" aria-label="Account type">
            {TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={type === t.id}
                data-testid={`account-${t.id}`}
                onClick={() => setType(t.id)}
                className={`rounded-lg border p-3 text-left text-sm transition-colors ${type === t.id ? "border-primary bg-accent" : "hover:bg-muted"}`}
              >
                <span className="block font-medium">{t.title}</span>
                <span className="block text-xs text-muted-foreground">{t.detail}</span>
              </button>
            ))}
          </fieldset>

          {!isLogin ? <Field id="fullName" label="Full name" autoComplete="name" required /> : null}
          <Field id="email" label="Email" type="email" autoComplete="email" defaultValue={prefillEmail} required />
          <Field id="password" label="Password" type="password" minLength={8} autoComplete={isLogin ? "current-password" : "new-password"} required />

          {!isLogin && type === "organization" ? (
            <div className="flex flex-col gap-3 rounded-lg border p-3">
              <input type="hidden" name="orgMode" value={orgMode} />
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="radio" checked={orgMode === "create"} onChange={() => setOrgMode("create")} /> New organization
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" checked={orgMode === "join"} onChange={() => setOrgMode("join")} /> Join with invite code
                </label>
              </div>
              {orgMode === "create" ? (
                <Field id="orgName" label="Organization name" placeholder="Acme Inc." required />
              ) : (
                <Field id="inviteCode" label="Organization invite code" placeholder="From your organization admin" className="font-mono uppercase" required />
              )}
              <p className="text-xs text-muted-foreground">
                {orgMode === "create" ? "You'll be the organization admin and can invite colleagues." : "You'll join as a recruiter."}
              </p>
            </div>
          ) : null}
          {!isLogin && type === "candidate" ? (
            <p className="text-xs text-muted-foreground">Use the email address your interview invitation was sent to.</p>
          ) : null}

          {state.error ? (
            <p role="alert" className="text-sm text-danger">
              {state.error}
            </p>
          ) : null}
          {state.message ? <p className="text-sm text-success">{state.message}</p> : null}
          <Button type="submit" disabled={pending}>
            {pending ? "Please wait…" : isLogin ? "Sign in" : "Create account"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            {isLogin ? "New to Proctra? " : "Already have an account? "}
            <Link className="font-medium text-primary underline-offset-4 hover:underline" href={`${isLogin ? "/signup" : "/login"}${query}`}>
              {isLogin ? "Create an account" : "Sign in"}
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
