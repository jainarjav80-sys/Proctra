-- P3.5: organisation + candidate accounts. Data moves from recruiter scope to org scope.
--
-- Roles are assigned by a trigger at sign-up from validated metadata and copied into
-- auth.users.raw_app_meta_data (→ JWT `app_metadata`, which users cannot edit). profiles has no
-- write policies and no UPDATE privilege for clients, so a user can never change their own role.

create type account_role as enum ('ORG_ADMIN', 'RECRUITER', 'CANDIDATE');

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role account_role not null,
  org_id uuid references organizations (id) on delete cascade,
  full_name text not null default '',
  email text not null,
  created_at timestamptz not null default now(),
  constraint org_roles_have_org check ((role = 'CANDIDATE') = (org_id is null))
);
create index profiles_org_idx on profiles (org_id);

create or replace function new_invite_code() returns text language sql volatile as $$
  select upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
$$;

-- Helpers for policies (security definer so they can read profiles regardless of the caller's RLS).
create or replace function my_org_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select org_id from profiles where id = auth.uid()
$$;

create or replace function my_role() returns account_role
  language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

-- Sign-up validation. Metadata comes from the client, so every path is validated here:
--   organization + org_name        → new org, ORG_ADMIN
--   organization + org_invite_code → existing org, RECRUITER (never admin)
--   candidate + full_name          → CANDIDATE, no org
create or replace function handle_new_user_before() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}');
  kind text := meta ->> 'account_type';
  v_role account_role;
  v_org uuid;
  v_code text := upper(trim(coalesce(meta ->> 'org_invite_code', '')));
  v_org_name text := trim(coalesce(meta ->> 'org_name', ''));
begin
  if kind = 'organization' then
    if v_code <> '' then
      select id into v_org from organizations where invite_code = v_code;
      if v_org is null then raise exception 'Invalid organization invite code'; end if;
      v_role := 'RECRUITER';
    elsif char_length(v_org_name) >= 2 then
      insert into organizations (name, invite_code) values (left(v_org_name, 120), new_invite_code()) returning id into v_org;
      v_role := 'ORG_ADMIN';
    else
      raise exception 'Organization name or invite code is required';
    end if;
  elsif kind = 'candidate' then
    if char_length(trim(coalesce(meta ->> 'full_name', ''))) < 2 then raise exception 'Full name is required'; end if;
    v_role := 'CANDIDATE';
  else
    raise exception 'account_type must be organization or candidate';
  end if;
  new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}') || jsonb_build_object('role', v_role, 'org_id', v_org);
  return new;
end $$;

create or replace function handle_new_user_after() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, role, org_id, full_name, email)
  values (
    new.id,
    (new.raw_app_meta_data ->> 'role')::account_role,
    nullif(new.raw_app_meta_data ->> 'org_id', '')::uuid,
    trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')),
    lower(new.email)
  );
  return new;
end $$;

create trigger on_auth_user_before_insert before insert on auth.users
  for each row execute function handle_new_user_before();
create trigger on_auth_user_after_insert after insert on auth.users
  for each row execute function handle_new_user_after();

-- Backfill: every pre-existing user becomes admin of their own org (keeps the demo recruiter working).
do $$
declare u record; v_org uuid;
begin
  for u in select id, email from auth.users where id not in (select id from profiles) loop
    insert into organizations (name, invite_code) values ('Demo Org', new_invite_code()) returning id into v_org;
    update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}') || jsonb_build_object('role', 'ORG_ADMIN', 'org_id', v_org)
      where id = u.id;
    insert into profiles (id, role, org_id, full_name, email) values (u.id, 'ORG_ADMIN', v_org, '', lower(u.email));
  end loop;
end $$;

-- Org scope on jobs + interviews ---------------------------------------------------------------
alter table jobs add column org_id uuid references organizations (id) on delete cascade;
alter table interviews add column org_id uuid references organizations (id) on delete cascade;
update jobs j set org_id = p.org_id from profiles p where p.id = j.recruiter_id;
update interviews i set org_id = j.org_id from jobs j where j.id = i.job_id;
alter table jobs alter column org_id set not null, alter column org_id set default my_org_id();
alter table interviews alter column org_id set not null, alter column org_id set default my_org_id();
create index jobs_org_idx on jobs (org_id, created_at desc);
create index interviews_org_idx on interviews (org_id, created_at desc);
create index interviews_candidate_email_idx on interviews (lower(candidate_email));

drop policy jobs_owner on jobs;
drop policy interviews_owner on interviews;
create policy jobs_org on jobs for all to authenticated
  using (org_id = my_org_id())
  with check (org_id = my_org_id() and my_role() in ('ORG_ADMIN', 'RECRUITER'));
create policy interviews_org on interviews for all to authenticated
  using (org_id = my_org_id())
  with check (
    org_id = my_org_id() and my_role() in ('ORG_ADMIN', 'RECRUITER')
    and exists (select 1 from jobs j where j.id = job_id and j.org_id = my_org_id())
  );

-- Every child-table policy calls owns_interview(); redefining it moves them all to org scope.
create or replace function owns_interview(iid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from interviews
    where id = iid and org_id = my_org_id() and my_role() in ('ORG_ADMIN', 'RECRUITER')
  )
$$;

-- Profiles + organizations: read-only to clients ---------------------------------------------
alter table organizations enable row level security;
alter table profiles enable row level security;
create policy profiles_self_or_org on profiles for select to authenticated
  using (id = auth.uid() or (org_id is not null and org_id = my_org_id()));
create policy organizations_member on organizations for select to authenticated
  using (id = my_org_id());
revoke insert, update, delete on profiles from anon, authenticated;
revoke insert, update, delete on organizations from anon, authenticated;

create or replace function rotate_org_invite_code() returns text
  language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if my_role() is distinct from 'ORG_ADMIN' then raise exception 'Only an organization admin can rotate the invite code'; end if;
  update organizations set invite_code = new_invite_code() where id = my_org_id() returning invite_code into v_code;
  return v_code;
end $$;
revoke all on function rotate_org_invite_code() from public, anon;
grant execute on function rotate_org_invite_code() to authenticated;

-- Lets the sign-up form check a code without exposing the organizations table.
create or replace function org_name_for_invite_code(code text) returns text
  language sql stable security definer set search_path = public as $$
  select name from organizations where invite_code = upper(trim(code))
$$;
grant execute on function org_name_for_invite_code(text) to anon, authenticated;

-- Candidate dashboard: only their own interviews, only safe columns (no scores, rubric, questions,
-- transcripts or proctoring). Requires a confirmed email that matches the invitation.
create or replace function my_candidate_interviews()
  returns table (
    id uuid, job_title text, organization text, status interview_status,
    invite_active boolean, invite_expires_at timestamptz, started_at timestamptz, completed_at timestamptz,
    duration_minutes int
  )
  language sql stable security definer set search_path = public as $$
  select i.id, j.title, o.name, i.status,
         (i.invite_nonce is not null and i.invite_expires_at > now()), i.invite_expires_at,
         i.started_at, i.completed_at, i.duration_minutes
    from interviews i
    join jobs j on j.id = i.job_id
    join organizations o on o.id = i.org_id
    join auth.users u on u.id = auth.uid()
   where my_role() = 'CANDIDATE'
     and u.email_confirmed_at is not null
     and lower(i.candidate_email) = lower(u.email)
     and i.blueprint_approved_at is not null
   order by i.created_at desc
$$;
revoke all on function my_candidate_interviews() from public, anon;
grant execute on function my_candidate_interviews() to authenticated;
