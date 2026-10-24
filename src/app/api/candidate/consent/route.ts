import { z } from "zod";
import { CANDIDATE_TOKEN_HEADER, candidateError, requireCandidate } from "@/lib/candidate/session";
import { CONSENT_POLICY_VERSION, consentItems } from "@/lib/candidate/consent";

const body = z.object({ scopes: z.array(z.string()).max(10), policyVersion: z.string() });

/** Records itemised consent (append-style: the latest grant is kept with IP, user agent and time). */
export async function POST(req: Request) {
  try {
    const { admin, interview } = await requireCandidate(req.headers.get(CANDIDATE_TOKEN_HEADER));
    const parsed = body.safeParse(await req.json());
    if (!parsed.success) return Response.json({ error: "Invalid consent payload" }, { status: 400 });
    if (parsed.data.policyVersion !== CONSENT_POLICY_VERSION) {
      return Response.json({ error: "The consent text changed. Reload the page." }, { status: 409 });
    }
    const items = consentItems({
      secondaryCamPolicy: interview.secondary_cam_policy,
      recordVideo: interview.proctoring_config?.record_video !== false,
    });
    const missing = items.filter((i) => i.required && !parsed.data.scopes.includes(i.scope));
    if (missing.length) return Response.json({ error: `Consent required: ${missing.map((m) => m.title).join(", ")}` }, { status: 400 });

    const consent = {
      scopes: items.map((i) => i.scope).filter((s) => parsed.data.scopes.includes(s)),
      policy_version: CONSENT_POLICY_VERSION,
      at: new Date().toISOString(),
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      user_agent: req.headers.get("user-agent"),
    };
    const status = interview.status === "READY" ? "ONBOARDING" : interview.status;
    const { error } = await admin.from("interviews").update({ consent, status }).eq("id", interview.id);
    if (error) throw new Error(error.message);
    return Response.json({ ok: true, scopes: consent.scopes });
  } catch (e) {
    return candidateError(e);
  }
}
