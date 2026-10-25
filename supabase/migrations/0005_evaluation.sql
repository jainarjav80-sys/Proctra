-- P5: evaluation job state, 0–10 scoring, expired interviews, pause history, evaluation input
-- isolation (no proctoring data), and recruiter review support.

alter type interview_status add value if not exists 'EXPIRED';

-- Scores move from 1–5 to 0–10 (0 = not answered).
alter table questions drop constraint if exists questions_ai_score_check;
alter table questions drop constraint if exists questions_override_score_check;
alter table questions alter column ai_score type numeric(4, 2), alter column override_score type numeric(4, 2);
alter table questions add constraint questions_ai_score_check check (ai_score between 0 and 10);
alter table questions add constraint questions_override_score_check check (override_score between 0 and 10);
alter table questions
  add column evaluation_status text not null default 'PENDING'
    check (evaluation_status in ('PENDING', 'DONE', 'NEEDS_REVIEW', 'NOT_ANSWERED')),
  add column evaluation_flags jsonb not null default '[]',
  add column rubric_scores jsonb;

alter table score_overrides drop constraint if exists score_overrides_new_score_check;
alter table score_overrides alter column old_score type numeric(4, 2), alter column new_score type numeric(4, 2);
alter table score_overrides add constraint score_overrides_new_score_check check (new_score between 0 and 10);
alter table score_overrides add column recruiter_email text;

alter table interviews alter column overall_score type numeric(4, 2);
alter table interviews
  add column evaluation_status text not null default 'NONE'
    check (evaluation_status in ('NONE', 'PENDING', 'RUNNING', 'DONE', 'FAILED')),
  add column evaluation_error text,
  add column evaluation_attempts int not null default 0,
  add column evaluation_lease_until timestamptz,
  add column evaluation_not_before timestamptz,
  add column evaluation_started_at timestamptz,
  add column evaluation_finished_at timestamptz,
  add column evaluation_usage jsonb not null default '{}',
  add column decided_by uuid references auth.users (id),
  add column decided_by_email text;

-- Smart-tier coordination: evaluation never runs in the same minute as blueprint generation.
create table llm_activity (
  key text primary key,
  at timestamptz not null default now()
);
alter table llm_activity enable row level security; -- service role only

/**
 * The ONLY data the evaluator may see: questions, rubrics, follow-ups, candidate transcripts,
 * transcript quality, JD analysis and parsed resume. It never reads proctoring_events, snapshots or
 * recordings, so integrity signals can't leak into scoring. Service role only.
 */
create or replace function evaluation_input(iid uuid) returns jsonb
  language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'interview', jsonb_build_object(
      'id', i.id,
      'status', i.status,
      'experience_level', j.experience_level,
      'stt_engines', coalesce(i.preflight -> 'stt_engines_used', jsonb_build_array(i.preflight ->> 'stt_engine'))
    ),
    'job', jsonb_build_object('title', j.title, 'required_skills', j.required_skills, 'analysis', j.jd_analysis),
    'resume', i.resume_profile,
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id, 'parent_id', q.parent_id, 'primary_index', q.primary_index, 'follow_up_index', q.follow_up_index,
        'category', q.category, 'difficulty', q.difficulty, 'target_skills', q.target_skills, 'text', q.text,
        'rubric', q.rubric, 'status', q.status, 'transcript', q.transcript, 'evaluation_status', q.evaluation_status,
        'avg_confidence', (select avg(ts.confidence) from transcript_segments ts where ts.question_id = q.id and ts.speaker = 'CANDIDATE'),
        'segments', (select coalesce(jsonb_agg(jsonb_build_object('text', ts.text, 'start_ms', ts.start_ms) order by ts.start_ms), '[]')
                       from transcript_segments ts where ts.question_id = q.id and ts.speaker = 'CANDIDATE')
      ) order by q.primary_index, q.follow_up_index)
      from questions q where q.interview_id = i.id
    ), '[]')
  )
  from interviews i join jobs j on j.id = i.job_id
  where i.id = iid
$$;
revoke all on function evaluation_input(uuid) from public, anon, authenticated;
