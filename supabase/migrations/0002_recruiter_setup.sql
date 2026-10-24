-- P2: JD-analysis cache, proctoring toggles, invite revocation, blueprint approval, atomic reorder.

alter table jobs add column jd_analysis_hash text;               -- sha256 of description + skills used for jd_analysis

alter table interviews
  add column resume_status text not null default 'NONE'
    check (resume_status in ('NONE', 'UPLOADED', 'PARSED', 'FAILED')),
  add column resume_error text,
  add column proctoring_config jsonb not null default '{
    "enforce_fullscreen": true,
    "block_multi_monitor": true,
    "gaze_tracking": true,
    "object_detection": true,
    "record_video": true
  }',
  add column blueprint_approved_at timestamptz,
  add column invite_nonce text,                                  -- rotating it revokes earlier invite links
  add column invite_expires_at timestamptz;

-- Reordering swaps primary_index values inside one UPDATE, so uniqueness is checked at statement end.
alter table questions drop constraint questions_interview_id_primary_index_follow_up_index_key;
alter table questions add constraint questions_order_key
  unique (interview_id, primary_index, follow_up_index) deferrable initially immediate;

-- Renumbers primary questions 1..n in the given order. Runs as the caller, so RLS still applies.
create or replace function reorder_questions(iid uuid, ordered_ids uuid[]) returns void
  language sql security invoker set search_path = public as $$
  update questions q
     set primary_index = o.idx
    from unnest(ordered_ids) with ordinality as o(id, idx)
   where q.id = o.id and q.interview_id = iid and q.follow_up_index = 0;
$$;
