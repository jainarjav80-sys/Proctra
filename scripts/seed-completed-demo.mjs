#!/usr/bin/env node
// A fully completed demo interview for the recruiter review page: runs the real candidate flow
// (scripts/e2e-full-interview.mjs --keep: voice answers, follow-ups, barge-in, 3 recordings, automatic
// evaluation), then adds ONE clearly labelled "[demo seed]" observation with a snapshot so the
// Proctoring tab has a thumbnail to show (the synthetic face video never triggers a detector).
// Waits for the background evaluation and prints the review URL.
// Usage: node --env-file=.env.local scripts/seed-completed-demo.mjs [--interview <id>] [baseUrl]
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = process.env;
const base = process.argv.find((a) => a.startsWith("http")) ?? "http://localhost:3123";
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const given = process.argv.includes("--interview") ? process.argv[process.argv.indexOf("--interview") + 1] : null;

let interviewId = given;
if (!interviewId) {
  console.log("Running the full candidate interview (≈ 9 min)…");
  execFileSync(process.execPath, ["--env-file=.env.local", "scripts/e2e-full-interview.mjs", "--keep", base], { stdio: "inherit" });
  interviewId = JSON.parse(readFileSync(".last-full-interview.json", "utf8")).interviewId;
}

// One labelled observation with a snapshot (JPEG of the synthetic face), mid-interview.
const { data: existing } = await admin.from("proctoring_events").select("id").eq("interview_id", interviewId).like("description", "[demo seed]%");
if (!existing?.length) {
  const jpeg = execFileSync("python3", ["-I", "-c", "import io,sys; from PIL import Image; b=io.BytesIO(); Image.open(sys.argv[1]).convert('RGB').save(b,'JPEG',quality=70); sys.stdout.buffer.write(b.getvalue())", "tests/fixtures/face.png"]);
  const path = `${interviewId}/demo-seed-phone.jpg`;
  const { error: upErr } = await admin.storage.from("snapshots").upload(path, jpeg, { contentType: "image/jpeg", upsert: true });
  if (upErr) throw new Error(upErr.message);
  const { data: q } = await admin.from("questions").select("id, asked_at_ms").eq("interview_id", interviewId).eq("primary_index", 2).eq("follow_up_index", 0).single();
  const at = Number(q.asked_at_ms ?? 60_000) + 15_000;
  const { error } = await admin.from("proctoring_events").insert({
    interview_id: interviewId,
    question_id: q.id,
    tier: "OBSERVED_EVENT",
    source: "PRIMARY_CAM",
    event_type: "PHONE_IN_VIEW",
    severity: "MEDIUM",
    confidence: 0.71,
    start_ms: at,
    end_ms: at + 4000,
    description: "[demo seed] Phone-like object in camera view for 4.0 s (added by seed-completed-demo.mjs, not detected).",
    benign_explanations: ["A phone resting face-down on the desk, or the paired companion phone itself."],
    telemetry: { demo_seed: true },
    snapshot_path: path,
  });
  if (error) throw new Error(error.message);
}

// The evaluation starts automatically when the interview ends; wait for it (re-queue if it never started).
for (let i = 0; i < 40; i++) {
  const { data: iv } = await admin.from("interviews").select("status, evaluation_status, overall_score").eq("id", interviewId).single();
  if (iv.evaluation_status === "DONE" || iv.evaluation_status === "FAILED") {
    console.log(`Evaluation ${iv.evaluation_status} (overall ${iv.overall_score ?? "–"}, status ${iv.status})`);
    break;
  }
  if (i === 0 && iv.evaluation_status === "NONE") await admin.from("interviews").update({ evaluation_status: "PENDING" }).eq("id", interviewId);
  if (i % 10 === 0) {
    const { createHmac } = await import("node:crypto");
    const key = createHmac("sha256", env.TOKEN_SECRET).update("internal:evaluate").digest("hex");
    await fetch(`${base}/api/internal/evaluate`, { method: "POST", headers: { "content-type": "application/json", "x-internal-key": key }, body: JSON.stringify({ interviewId }) }).catch(() => {});
  }
  await new Promise((r) => setTimeout(r, 5000));
}
console.log(`\nDemo interview ready: ${base}/dashboard/interviews/${interviewId}\n(sign in as ${env.DEMO_RECRUITER_EMAIL || "demo.recruiter@proctra.test"})`);
