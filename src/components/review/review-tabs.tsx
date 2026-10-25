"use client";

import { useEffect, useState } from "react";

/** Tabs that switch to the recording whenever something asks to seek. Printing shows all panels. */
export function ReviewTabs({ scores, recording, proctoring }: { scores: React.ReactNode; recording: React.ReactNode; proctoring: React.ReactNode }) {
  const [tab, setTab] = useState<"scores" | "recording" | "proctoring">("scores");
  useEffect(() => {
    const onSeek = () => setTab("recording");
    window.addEventListener("review:seek", onSeek);
    return () => window.removeEventListener("review:seek", onSeek);
  }, []);
  const tabs = [
    ["scores", "Scores"],
    ["recording", "Recording"],
    ["proctoring", "Proctoring"],
  ] as const;
  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" className="flex gap-1 border-b print:hidden">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            data-testid={`tab-${id}`}
            onClick={() => setTab(id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm ${tab === id ? "border-primary font-medium" : "border-transparent text-muted-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {/* Panels stay mounted (videos keep their buffers); hidden ones are display:none on screen only. */}
      <div className={tab === "scores" ? "" : "hidden print:block"}>{scores}</div>
      <div className={tab === "recording" ? "" : "hidden"}>{recording}</div>
      <div className={tab === "proctoring" ? "" : "hidden print:block"}>{proctoring}</div>
    </div>
  );
}
