import "server-only";
import { notFound } from "next/navigation";
import { requireRecruiter } from "@/lib/auth/recruiter";

/**
 * Responds 404 unless the recruiter's org can see this row (RLS). Called from a segment layout so it
 * runs before that segment's loading.tsx starts streaming; otherwise notFound() would arrive after a
 * 200 status was already sent.
 */
export async function assertVisible(table: "interviews" | "jobs", id: string) {
  const { supabase } = await requireRecruiter();
  const { data } = await supabase.from(table).select("id").eq("id", id).maybeSingle();
  if (!data) notFound();
}
