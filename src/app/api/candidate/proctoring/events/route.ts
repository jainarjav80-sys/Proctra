import { z } from "zod";
import { CANDIDATE_TOKEN_HEADER, candidateError, requireCandidate } from "@/lib/candidate/session";
import { OBSERVED_BENIGN, OBSERVED_TYPES } from "@/lib/proctoring/events";
import { correlate, type ObservedRow } from "@/lib/proctoring/correlate";

export const maxDuration = 30;

const MAX_SNAPSHOT_BYTES = 400_000;

const eventSchema = z.object({
  clientId: z.string().min(8).max(64),
  type: z.enum(OBSERVED_TYPES),
  source: z.enum(["PRIMARY_CAM", "SECONDARY_CAM", "SCREEN", "AUDIO", "BROWSER", "SYSTEM"]),
  severity: z.enum(["INFO", "LOW", "MEDIUM", "HIGH"]),
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(0).nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  description: z.string().max(300),
  telemetry: z.record(z.string(), z.unknown()).default({}),
  snapshot: z.string().max(MAX_SNAPSHOT_BYTES * 1.4).optional(),
});
const bodySchema = z.object({ events: z.array(eventSchema).min(1).max(20) });

/**
 * Observed proctoring events from the candidate's browser (detectors run client-side). Stores them
 * with the active question, uploads snapshots, then runs the Tier-2 correlator. Advisory only:
 * nothing here can end the interview or touch a score.
 */
export async function POST(req: Request) {
  try {
    const { admin, interview } = await requireCandidate(req.headers.get(CANDIDATE_TOKEN_HEADER), req);
    if (!interview.consent) return Response.json({ error: "Consent is required first" }, { status: 403 });
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return Response.json({ error: "Invalid events payload" }, { status: 400 });

    // Idempotent: the client retries batches, so skip events already stored.
    const ids = parsed.data.events.map((e) => e.clientId);
    const { data: dupes } = await admin.from("proctoring_events").select("telemetry").eq("interview_id", interview.id).in("telemetry->>client_id", ids);
    const seen = new Set((dupes ?? []).map((d) => (d.telemetry as { client_id?: string }).client_id));
    const fresh = parsed.data.events.filter((e) => !seen.has(e.clientId));

    const questionId = (interview.fsm_state as { questionId?: string } | null)?.questionId ?? null;
    const rows = [];
    for (const e of fresh) {
      let snapshot_path: string | null = null;
      const m = e.snapshot?.match(/^data:image\/jpeg;base64,(.+)$/);
      if (m) {
        const bytes = Buffer.from(m[1], "base64");
        if (bytes.length <= MAX_SNAPSHOT_BYTES && bytes[0] === 0xff && bytes[1] === 0xd8) {
          const path = `${interview.id}/${e.clientId}.jpg`;
          const { error } = await admin.storage.from("snapshots").upload(path, bytes, { contentType: "image/jpeg", upsert: true });
          if (!error) snapshot_path = path;
        }
      }
      rows.push({
        interview_id: interview.id,
        question_id: questionId,
        tier: "OBSERVED_EVENT",
        source: e.source,
        event_type: e.type,
        severity: e.severity,
        confidence: e.confidence,
        start_ms: e.startMs,
        end_ms: e.endMs,
        description: e.description,
        benign_explanations: OBSERVED_BENIGN[e.type] ?? [],
        telemetry: { ...e.telemetry, client_id: e.clientId },
        snapshot_path,
      });
    }
    if (rows.length) {
      const { error } = await admin.from("proctoring_events").insert(rows);
      if (error) throw new Error(error.message);
    }

    // Tier-2 correlation over everything observed so far.
    const { data: all } = await admin
      .from("proctoring_events")
      .select("id, event_type, question_id, start_ms, end_ms, tier")
      .eq("interview_id", interview.id);
    const observed = (all ?? []).filter((r) => r.tier === "OBSERVED_EVENT") as ObservedRow[];
    const existing = (all ?? []).filter((r) => r.tier === "INFERRED_SUSPICION");
    const drafts = correlate(observed, existing);
    if (drafts.length) {
      await admin.from("proctoring_events").insert(
        drafts.map((d) => ({
          interview_id: interview.id,
          question_id: d.question_id,
          tier: "INFERRED_SUSPICION",
          source: "SYSTEM",
          event_type: d.event_type,
          severity: d.severity,
          confidence: d.confidence,
          start_ms: d.start_ms,
          end_ms: d.end_ms,
          description: d.description,
          benign_explanations: d.benign_explanations,
          contributing_event_ids: d.contributing_event_ids,
          telemetry: { rule: d.rule },
        })),
      );
    }
    return Response.json({ stored: rows.length, duplicates: parsed.data.events.length - fresh.length, suspicions: drafts.length });
  } catch (e) {
    return candidateError(e);
  }
}
