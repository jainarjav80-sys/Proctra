"use client";

import { fmtMs } from "@/lib/review/timeline";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { seekTo } from "./scores-panel";

interface EventRow {
  id: string;
  tier: string;
  source: string;
  event_type: string;
  severity: string;
  confidence: number | null;
  start_ms: number;
  end_ms: number | null;
  wallMs: number;
  description: string;
  benign_explanations: string[];
  contributing_event_ids: string[];
  telemetry: Record<string, unknown>;
  snapshotUrl: string | null;
  disposition: string;
}

const dur = (e: EventRow) => (e.end_ms ? `${((e.end_ms - e.start_ms) / 1000).toFixed(1)} s` : "–");

export function ProctoringPanel({ events, bargeIns }: { events: EventRow[]; bargeIns: number }) {
  const suspicions = events.filter((e) => e.tier === "INFERRED_SUSPICION");
  const observed = events.filter((e) => e.tier === "OBSERVED_EVENT" && e.event_type !== "CANDIDATE_WARNING_SHOWN");
  const warnings = events.filter((e) => e.event_type === "CANDIDATE_WARNING_SHOWN");
  const readAloud = events.filter((e) => e.event_type === "QUESTION_READ_ALOUD").length;
  const byId = new Map(events.map((e) => [e.id, e]));

  return (
    <div className="flex flex-col gap-6">
      <p className="rounded-md border border-ai/40 bg-ai/10 px-3 py-2 text-sm" data-testid="proctoring-label">
        Observations for human review, not used in scoring. Every item lists harmless explanations; none of it ended the interview or changed a score.
      </p>
      <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
        {[
          ["Observed events", observed.length],
          ["Pattern-based flags", suspicions.length],
          ["Interruptions (barge-ins)", bargeIns],
          ["Question read aloud", readAloud],
          ["Reminders shown", warnings.length],
        ].map(([label, n]) => (
          <div key={label as string} className="rounded-lg border p-3">
            <p className="text-2xl font-semibold">{n}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pattern-based flags (Tier 2)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {!suspicions.length ? <p className="text-muted-foreground">No patterns flagged.</p> : null}
          {suspicions.map((s) => (
            <div key={s.id} className="rounded-md border p-3" data-testid="suspicion">
              <div className="flex flex-wrap items-center gap-2">
                <button className="font-mono text-xs underline" onClick={() => seekTo(s.wallMs)}>{fmtMs(s.wallMs)}</button>
                <Badge variant={s.severity === "HIGH" ? "destructive" : "secondary"}>{s.severity}</Badge>
                <span className="font-medium">{s.event_type.replace(/^INF_/, "").replaceAll("_", " ").toLowerCase()}</span>
                <span className="text-xs text-muted-foreground">confidence {s.confidence?.toFixed(2) ?? "–"} · rule {String(s.telemetry.rule ?? "–")}</span>
              </div>
              <p className="mt-1">{s.description}</p>
              <p className="mt-1 text-xs text-muted-foreground">Possible harmless explanations: {s.benign_explanations.join(" · ")}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Based on:{" "}
                {s.contributing_event_ids.map((id) => {
                  const ev = byId.get(id);
                  return (
                    <button key={id} className="mr-2 font-mono underline" onClick={() => ev && seekTo(ev.wallMs)} title={id}>
                      {ev ? `${ev.event_type} @ ${fmtMs(ev.wallMs)}` : id.slice(0, 8)}
                    </button>
                  );
                })}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Observed events (Tier 1)</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {!observed.length ? <p className="text-sm text-muted-foreground">Nothing observed.</p> : null}
          {observed.length ? (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-muted-foreground"><th className="py-1">Time</th><th>Event</th><th>Duration</th><th>Source</th><th>Severity</th><th>Confidence</th><th>Snapshot</th><th>Harmless explanations</th></tr>
              </thead>
              <tbody>
                {observed.map((e) => (
                  <tr key={e.id} className="border-t align-top" data-testid="observed-event">
                    <td className="py-1 pr-2"><button className="font-mono underline" onClick={() => seekTo(e.wallMs)} data-testid={`event-seek-${e.id}`}>{fmtMs(e.wallMs)}</button></td>
                    <td className="pr-2"><span className="font-medium">{e.event_type}</span><br /><span className="text-muted-foreground">{e.description}</span></td>
                    <td className="pr-2">{dur(e)}</td>
                    <td className="pr-2">{e.source}</td>
                    <td className="pr-2">{e.severity}</td>
                    <td className="pr-2">{e.confidence?.toFixed(2) ?? "–"}</td>
                    <td className="pr-2">
                      {e.snapshotUrl ? (
                        <a href={e.snapshotUrl} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                          <img src={e.snapshotUrl} alt={`Snapshot at ${fmtMs(e.wallMs)}`} className="h-12 w-20 rounded object-cover" />
                        </a>
                      ) : "–"}
                    </td>
                    <td className="text-muted-foreground">{e.benign_explanations.join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </CardContent>
      </Card>

      {warnings.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Reminders shown to the candidate</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-xs">
            {warnings.map((w) => (
              <p key={w.id}>
                <button className="font-mono underline" onClick={() => seekTo(w.wallMs)}>{fmtMs(w.wallMs)}</button> “{String(w.telemetry.message ?? "")}” (triggered by {String(w.telemetry.trigger_type ?? "")} event {String(w.telemetry.trigger_client_id ?? "").slice(0, 8)})
              </p>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
