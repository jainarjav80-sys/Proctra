import { NextResponse } from "next/server";
import { envStatus } from "@/lib/config/env";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Reports which services are configured and whether the schema is reachable. No secrets returned. */
export async function GET() {
  const configured = envStatus();
  let database: "ok" | "unconfigured" | "error" = "unconfigured";
  let databaseError: string | undefined;
  if (configured.supabase) {
    const { error } = await createAdminClient().from("jobs").select("id", { head: true, count: "exact" });
    database = error ? "error" : "ok";
    databaseError = error?.message;
  }
  const ok = configured.supabase && configured.tokenSecret && configured.groq && database === "ok";
  return NextResponse.json({ ok, configured, database, databaseError }, { status: ok ? 200 : 503 });
}
