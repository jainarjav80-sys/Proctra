-- Proctra prototype schema.
-- Recruiters are Supabase Auth users and own their rows through RLS.
-- Candidates and the companion phone never authenticate with Supabase: route handlers verify a
-- signed Proctra token, then use the service-role client.

create extension if not exists pgcrypto;

create type experience_level as enum ('INTERN', 'ENTRY', 'MID', 'SENIOR', 'STAFF');
create type difficulty_level as enum ('FOUNDATIONAL', 'INTERMEDIATE', 'ADVANCED', 'ADAPTIVE');
create type question_category as enum ('TECHNICAL', 'BEHAVIORAL', 'EXPERIENCE', 'SCENARIO');
create type question_source as enum ('AI_GENERATED', 'RECRUITER_DEFINED');
create type question_status as enum ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'UNANSWERED');
create type interview_status as enum (
  'DRAFT', 'READY', 'ONBOARDING', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'EVALUATING', 'EVALUATED'
);
create type secondary_cam_policy as enum ('MANDATORY', 'RECOMMENDED', 'DISABLED');
create type proctor_tier as enum ('OBSERVED_EVENT', 'INFERRED_SUSPICION');
create type proctor_severity as enum ('INFO', 'LOW', 'MEDIUM', 'HIGH');
create type disposition_status as enum ('UNREVIEWED', 'VERIFIED_CONCERN', 'DISMISSED_FALSE_ALARM');
create type recruiter_decision as enum ('PENDING', 'ADVANCE', 'HOLD', 'REJECT');
create type recording_track as enum ('PRIMARY', 'SECONDARY', 'SCREEN');

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Jobs --------------------------------------------------------------------------------------
create table jobs (
  id uuid primary key default gen_random_uuid(),
  recruiter_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 255),
  description text not null check (char_length(description) between 50 and 15000),
  required_skills jsonb not null default '[]',          -- [{"name": "Java", "mandatory": true}]
  experience_level experience_level not null default 'MID',
  jd_analysis jsonb,                                     -- LLM-extracted competencies/responsibilities
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger jobs_updated_at before update on jobs for each row execute function set_updated_at();

-- Interviews (one candidate session + its config) ------------------------------------------
create table interviews (
  id uuid primary key default gen_random_uuid(),
  recruiter_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  job_id uuid not null references jobs (id) on delete cascade,
  candidate_name text not null,
  candidate_email text not null,
  resume_path text,                                      -- storage: resumes/{interview_id}/...
  resume_text text,
  resume_profile jsonb,                                  -- skills, experience, projects, education, certs
  -- Config. A null question_count means "recruiter didn't specify", which resolves to 10.
  question_count int check (question_count between 3 and 25),
  duration_minutes int not null default 30 check (duration_minutes between 10 and 90),
  category_distribution jsonb not null
    default '{"TECHNICAL": 40, "BEHAVIORAL": 20, "EXPERIENCE": 20, "SCENARIO": 20}',
  difficulty_level difficulty_level not null default 'ADAPTIVE',
  max_follow_ups int not null default 1 check (max_follow_ups between 0 and 2),
  response_time_limit_sec int not null default 180 check (response_time_limit_sec between 30 and 600),
  secondary_cam_policy secondary_cam_policy not null default 'RECOMMENDED',
  custom_questions jsonb not null default '[]',          -- [{"text": "...", "category": "TECHNICAL"}]
  -- Lifecycle
  status interview_status not null default 'DRAFT',
  fsm_state jsonb,                                       -- server-authoritative interview FSM snapshot
  consent jsonb,                                         -- {scopes: [...], policy_version, at, user_agent}
  preflight jsonb,                                       -- browser/device/display audit results
  started_at timestamptz,
  completed_at timestamptz,
  -- Evaluation (written by the evaluation module only)
  overall_score numeric(3, 2),
  competency_scores jsonb,
  evaluation_summary jsonb,                              -- {summary, strengths, gaps, further_areas}
  -- Recruiter governance (decision is human-only: there is no AI recommendation column)
  recruiter_decision recruiter_decision not null default 'PENDING',
  recruiter_notes text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index interviews_recruiter_idx on interviews (recruiter_id, created_at desc);
create trigger interviews_updated_at before update on interviews for each row execute function set_updated_at();

-- Questions (primary + follow-ups) -----------------------------------------------------------
create table questions (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null references interviews (id) on delete cascade,
  parent_id uuid references questions (id) on delete cascade,  -- null for primary questions
  primary_index int not null,                                  -- 1..N
  follow_up_index int not null default 0,                      -- 0 primary, 1 = Qi.a, 2 = Qi.b
  source question_source not null default 'AI_GENERATED',
  category question_category not null,
  difficulty text not null,
  target_skills jsonb not null default '[]',
  text text not null,
  rubric jsonb not null default '{}',                    -- {must_mention, good_signals, red_flags, follow_up_triggers}
  status question_status not null default 'PENDING',
  asked_at_ms bigint,                                    -- relative to interviews.started_at
  ended_at_ms bigint,
  transcript text,
  -- Evaluation
  ai_score numeric(3, 2) check (ai_score between 1 and 5),
  dimension_scores jsonb,
  evidence_quotes jsonb,                                 -- [{"quote": "...", "start_ms": 0}] verified substrings
  ai_summary text,
  ai_rationale text,
  strengths jsonb,
  gaps jsonb,
  override_score numeric(3, 2) check (override_score between 1 and 5),
  override_reason text,
  overridden_at timestamptz,
  unique (interview_id, primary_index, follow_up_index)
);

-- Transcript segments (word-level timing for quotes and the report) ------------------------
create table transcript_segments (
  id bigint generated always as identity primary key,
  interview_id uuid not null references interviews (id) on delete cascade,
  question_id uuid references questions (id) on delete cascade,
  speaker text not null check (speaker in ('AGENT', 'CANDIDATE')),
  text text not null,
  start_ms bigint not null,
  end_ms bigint,
  confidence real,
  created_at timestamptz not null default now()
);
create index transcript_segments_interview_idx on transcript_segments (interview_id, start_ms);

-- Proctoring (two tiers in one table; suspicions must carry benign explanations) -----------
create table proctoring_events (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null references interviews (id) on delete cascade,
  question_id uuid references questions (id) on delete set null,
  tier proctor_tier not null,
  source text not null check (source in ('PRIMARY_CAM', 'SECONDARY_CAM', 'SCREEN', 'AUDIO', 'BROWSER', 'SYSTEM')),
  event_type text not null,
  severity proctor_severity not null,
  confidence real check (confidence between 0 and 1),
  start_ms bigint not null,
  end_ms bigint,
  description text not null,
  benign_explanations text[] not null default '{}',
  contributing_event_ids uuid[] not null default '{}',
  telemetry jsonb not null default '{}',
  snapshot_path text,                                    -- storage: snapshots/{interview_id}/...
  disposition disposition_status not null default 'UNREVIEWED',
  disposition_notes text,
  disposed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint suspicion_needs_benign_explanation
    check (tier = 'OBSERVED_EVENT' or cardinality(benign_explanations) > 0)
);
create index proctoring_events_interview_idx on proctoring_events (interview_id, start_ms);

-- Recording chunks (MediaRecorder → storage) -------------------------------------------------
create table recording_chunks (
  id bigint generated always as identity primary key,
  interview_id uuid not null references interviews (id) on delete cascade,
  track recording_track not null,
  chunk_index int not null,
  path text not null,                                    -- storage: recordings/{interview_id}/{track}/{n}.webm
  started_ms bigint,
  created_at timestamptz not null default now(),
  unique (interview_id, track, chunk_index)
);

-- Score override audit (append-only) ---------------------------------------------------------
create table score_overrides (
  id bigint generated always as identity primary key,
  interview_id uuid not null references interviews (id) on delete cascade,
  question_id uuid references questions (id) on delete cascade,
  old_score numeric(3, 2),
  new_score numeric(3, 2) not null check (new_score between 1 and 5),
  reason text not null check (char_length(reason) >= 3),
  recruiter_id uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);
create or replace function forbid_mutation() returns trigger language plpgsql as $$
begin
  raise exception 'score_overrides is append-only';
end $$;
create trigger score_overrides_append_only before update or delete on score_overrides
  for each row execute function forbid_mutation();

-- Companion pairing nonces (service role only; single use, 300 s) ---------------------------
create table pair_tokens (
  nonce text primary key,
  interview_id uuid not null references interviews (id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- Row-level security -------------------------------------------------------------------------
alter table jobs enable row level security;
alter table interviews enable row level security;
alter table questions enable row level security;
alter table transcript_segments enable row level security;
alter table proctoring_events enable row level security;
alter table recording_chunks enable row level security;
alter table score_overrides enable row level security;
alter table pair_tokens enable row level security;   -- no policies: service role only

create policy jobs_owner on jobs for all to authenticated
  using (recruiter_id = auth.uid()) with check (recruiter_id = auth.uid());

create policy interviews_owner on interviews for all to authenticated
  using (recruiter_id = auth.uid()) with check (recruiter_id = auth.uid());

create or replace function owns_interview(iid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from interviews where id = iid and recruiter_id = auth.uid())
$$;

create policy questions_owner on questions for all to authenticated
  using (owns_interview(interview_id)) with check (owns_interview(interview_id));
create policy transcript_owner on transcript_segments for select to authenticated
  using (owns_interview(interview_id));
create policy proctoring_owner_read on proctoring_events for select to authenticated
  using (owns_interview(interview_id));
create policy proctoring_owner_dispose on proctoring_events for update to authenticated
  using (owns_interview(interview_id)) with check (owns_interview(interview_id));
create policy recordings_owner on recording_chunks for select to authenticated
  using (owns_interview(interview_id));
create policy overrides_owner_read on score_overrides for select to authenticated
  using (owns_interview(interview_id));
create policy overrides_owner_insert on score_overrides for insert to authenticated
  with check (owns_interview(interview_id) and recruiter_id = auth.uid());

-- Storage buckets (private; access via server-issued signed URLs only) -----------------------
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('resumes', 'resumes', false, 15728640),       -- 15 MB
  ('recordings', 'recordings', false, 52428800), -- 50 MB (free-tier per-file max)
  ('snapshots', 'snapshots', false, 5242880)     -- 5 MB
on conflict (id) do nothing;
