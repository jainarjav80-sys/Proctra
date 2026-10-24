#!/usr/bin/env node
// Creates (or resets) a confirmed demo recruiter and stores its credentials in .env.local.
// Usage: node --env-file=.env.local scripts/create-demo-recruiter.mjs
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const email = process.env.DEMO_RECRUITER_EMAIL || "demo.recruiter@proctra.test";
const password = process.env.DEMO_RECRUITER_PASSWORD || `Demo-${randomBytes(9).toString("base64url")}`;

const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
const existing = list?.users.find((u) => u.email === email);
const { error } = existing
  ? await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true })
  : await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (error) throw error;

let env = readFileSync(".env.local", "utf8");
for (const [k, v] of [["DEMO_RECRUITER_EMAIL", email], ["DEMO_RECRUITER_PASSWORD", password]]) {
  env = env.match(new RegExp(`^${k}=`, "m")) ? env.replace(new RegExp(`^${k}=.*$`, "m"), `${k}=${v}`) : `${env.trimEnd()}\n${k}=${v}\n`;
}
writeFileSync(".env.local", env);
console.log(`Demo recruiter ready: ${email} (password saved to .env.local as DEMO_RECRUITER_PASSWORD)`);
