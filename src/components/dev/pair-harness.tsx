"use client";

import { useEffect, useRef, useState } from "react";
import { DesktopLink, type LinkStatus } from "@/lib/companion/rtc";

export function PairHarness() {
  const video = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<LinkStatus | "init">("init");
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const link = new DesktopLink(q.get("channel") ?? "", JSON.parse(q.get("ice") ?? "[]"), (s, stream) => {
      setStatus(s);
      if (video.current && stream) video.current.srcObject = stream;
    });
    void link.start().then(() => setStatus("waiting"));
    return () => link.close();
  }, []);
  return (
    <main className="p-6">
      <p data-testid="harness-status">{status}</p>
      <video ref={video} data-testid="harness-video" autoPlay muted playsInline className="w-64 bg-black" />
    </main>
  );
}
