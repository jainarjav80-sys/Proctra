"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { rotateInviteCode } from "@/app/(recruiter)/_actions/org";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function OrgInviteCard({ orgName, code, isAdmin }: { orgName: string; code: string; isAdmin: boolean }) {
  const [current, setCurrent] = useState(code);
  const [pending, start] = useTransition();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{orgName}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted-foreground">Colleague invite code</span>
        <code className="rounded bg-muted px-2 py-1 font-mono">{current}</code>
        <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(current).then(() => toast.success("Code copied"))}>
          Copy
        </Button>
        {isAdmin ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await rotateInviteCode();
                if ("error" in r) toast.error(r.error);
                else {
                  setCurrent(r.code);
                  toast.success("New code generated; the old one no longer works");
                }
              })
            }
          >
            Generate new code
          </Button>
        ) : null}
        <p className="w-full text-xs text-muted-foreground">Colleagues sign up as “I&apos;m hiring” → “Join with invite code” to see this organization&apos;s jobs and interviews.</p>
      </CardContent>
    </Card>
  );
}
