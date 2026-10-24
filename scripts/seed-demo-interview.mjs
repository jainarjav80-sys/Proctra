#!/usr/bin/env node
// Creates an approved demo interview (job + candidate + 3 questions) owned by the demo recruiter and
// prints a candidate invite link. No LLM calls. Usage:
//   node --env-file=.env.local scripts/seed-demo-interview.mjs [--questions 3]
import { randomBytes } from "node:crypto";
import { SignJWT } from "jose";
import { createClient } from "@supabase/supabase-js";

const env = process.env;
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const count = Number(process.argv[process.argv.indexOf("--questions") + 1]) || 3;

const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
const recruiter = users?.users.find((u) => u.email === (env.DEMO_RECRUITER_EMAIL || "demo.recruiter@proctra.test"));
if (!recruiter) throw new Error("Run scripts/create-demo-recruiter.mjs first");

const QUESTIONS = [
  ["EXPERIENCE", "Spring Boot", "Tell me about the payments monolith you split into microservices at FinFlow. How did you decide where the first service boundary should go?"],
  ["TECHNICAL", "Apache Kafka", "How do you make a Kafka consumer idempotent when the same payment event can be delivered more than once?"],
  ["SCENARIO", "PostgreSQL", "Authorisation latency suddenly doubles after a deploy and the database looks busy. Walk me through how you'd investigate."],
  ["BEHAVIORAL", "Ownership", "Describe a time you disagreed with a senior engineer about a technical decision. What happened?"],
  ["TECHNICAL", "Kubernetes", "How would you roll out a breaking schema change to a service running on Kubernetes without downtime?"],
];

const { data: job, error: jobErr } = await admin
  .from("jobs")
  .insert({
    recruiter_id: recruiter.id,
    title: "Senior Backend Engineer (demo)",
    description: "Demo job for the Proctra prototype. Java, Spring Boot, Kafka, PostgreSQL and Kubernetes for a payments platform.",
    experience_level: "SENIOR",
    required_skills: ["Java", "Spring Boot", "Kafka", "PostgreSQL"].map((name) => ({ name, mandatory: true, source: "RECRUITER" })),
  })
  .select("id")
  .single();
if (jobErr) throw jobErr;

const nonce = randomBytes(16).toString("base64url");
const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000);
const { data: iv, error: ivErr } = await admin
  .from("interviews")
  .insert({
    recruiter_id: recruiter.id,
    job_id: job.id,
    candidate_name: "Priya Raman",
    candidate_email: "priya.raman@proctra.test",
    question_count: count,
    duration_minutes: 15,
    response_time_limit_sec: 120,
    max_follow_ups: 1,
    secondary_cam_policy: "RECOMMENDED",
    status: "READY",
    blueprint_approved_at: new Date().toISOString(),
    invite_nonce: nonce,
    invite_expires_at: expires.toISOString(),
  })
  .select("id")
  .single();
if (ivErr) throw ivErr;

const { error: qErr } = await admin.from("questions").insert(
  QUESTIONS.slice(0, count).map(([category, skill, text], i) => ({
    interview_id: iv.id,
    primary_index: i + 1,
    source: "AI_GENERATED",
    category,
    difficulty: "ADVANCED",
    target_skills: [skill],
    text,
    rubric: { rubric_points: [`Explains ${skill} concretely`, "Names a trade-off"], expected_answer_outline: "", red_flags: [] },
  })),
);
if (qErr) throw qErr;

const token = await new SignJWT({ typ: "candidate", nonce })
  .setProtectedHeader({ alg: "HS256" })
  .setIssuer("proctra")
  .setAudience("candidate")
  .setSubject(iv.id)
  .setIssuedAt()
  .setExpirationTime(Math.floor(expires.getTime() / 1000))
  .sign(new TextEncoder().encode(env.TOKEN_SECRET));

console.log(JSON.stringify({ interviewId: iv.id, url: `${env.NEXT_PUBLIC_APP_URL}/interview/${token}`, token }));
