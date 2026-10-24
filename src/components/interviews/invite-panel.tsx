"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createInvite } from "@/app/(recruiter)/_actions/interviews";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function InvitePanel({
  interviewId,
  approved,
  initialUrl,
  initialExpiresAt,
}: {
  interviewId: string;
  approved: boolean;
  initialUrl: string | null;
  initialExpiresAt: string | null;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [expiresAt, setExpiresAt] = useState(initialExpiresAt);
  const [pending, start] = useTransition();

  const generate = () =>
    start(async () => {
      if (url && !confirm("Generate a new link? The current link will stop working.")) return;
      const r = await createInvite(interviewId);
      if ("error" in r) return void toast.error(r.error);
      setUrl(r.url);
      setExpiresAt(r.expiresAt);
      toast.success("Invite link ready");
    });

  const copy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    toast.success("Link copied");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Candidate invite</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {!approved ? (
          <p className="text-muted-foreground">Approve the blueprint to create the candidate link.</p>
        ) : (
          <>
            {url ? (
              <>
                <div className="flex gap-2">
                  <Input readOnly value={url} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} aria-label="Candidate link" />
                  <Button size="sm" onClick={copy}>
                    Copy
                  </Button>
                </div>
                <p className="text-muted-foreground">
                  Expires <time dateTime={expiresAt ?? ""}>{expiresAt ? new Date(expiresAt).toLocaleString() : ""}</time>. Send it to the
                  candidate yourself; Proctra doesn&apos;t send email.
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">No active link.</p>
            )}
            <div>
              <Button size="sm" variant={url ? "outline" : "default"} onClick={generate} disabled={pending}>
                {url ? "Generate new link (revokes current)" : "Create invite link"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
