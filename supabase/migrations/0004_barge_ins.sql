-- P3.5: barge-in tracking per question (count + detail: sentence index, time, what was said).
alter table questions
  add column barge_in_count int not null default 0,
  add column barge_ins jsonb not null default '[]';
