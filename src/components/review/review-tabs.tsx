"use client";

import { useEffect, useState } from "react";
import { SeekContext, type SeekRequest } from "./seek-context";

type TabId = "scores" | "recording" | "proctoring";

/**
 * Tabs for the review page. The Recording panel (three video streams, tens of MB) only mounts the
 * first time it's needed: opening its tab, or any quote/event click that asks to seek. Seek requests
 * are kept in context, so a seek that arrives before the player exists is applied when it mounts.
 * Once mounted it stays mounted (buffers survive tab switches). Printing shows Scores + Proctoring.
 */
export function ReviewTabs({ scores, recording, proctoring }: { scores: React.ReactNode; recording: React.ReactNode; proctoring: React.ReactNode }) {
  const [tab, setTab] = useState<TabId>("scores");
  const [recordingMounted, setRecordingMounted] = useState(false);
  const [seek, setSeek] = useState<SeekRequest | null>(null);

  const open = (id: TabId) => {
    setTab(id);
    if (id === "recording") setRecordingMounted(true);
  };

  useEffect(() => {
    const onSeek = (e: Event) => {
      const wallMs = (e as CustomEvent<{ wallMs: number }>).detail?.wallMs;
      if (typeof wallMs !== "number") return;
      setSeek((prev) => ({ wallMs, n: (prev?.n ?? 0) + 1 }));
      setTab("recording");
      setRecordingMounted(true);
    };
    window.addEventListener("review:seek", onSeek);
    return () => window.removeEventListener("review:seek", onSeek);
  }, []);

  const tabs = [
    ["scores", "Scores"],
    ["recording", "Recording"],
    ["proctoring", "Proctoring"],
  ] as const;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div role="tablist" aria-label="Review sections" className="flex gap-1 overflow-x-auto border-b print:hidden">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            id={`tab-${id}`}
            role="tab"
            type="button"
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            data-testid={`tab-${id}`}
            onClick={() => open(id)}
            className={`focus-ring -mb-px shrink-0 rounded-t-md border-b-2 px-4 py-2 text-sm ${tab === id ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div id="panel-scores" role="tabpanel" aria-labelledby="tab-scores" className={tab === "scores" ? "" : "hidden print:block"}>
        {scores}
      </div>
      <div id="panel-recording" role="tabpanel" aria-labelledby="tab-recording" className={tab === "recording" ? "" : "hidden"}>
        {recordingMounted ? <SeekContext.Provider value={seek}>{recording}</SeekContext.Provider> : null}
      </div>
      <div id="panel-proctoring" role="tabpanel" aria-labelledby="tab-proctoring" className={tab === "proctoring" ? "" : "hidden print:block"}>
        {proctoring}
      </div>
    </div>
  );
}
