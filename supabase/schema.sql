-- Seicologia / Supabase schema (MVP)
-- Goal: multi-user shared "workspace" (max 3 members), datasets, and secure per-workspace data.
-- Apply in Supabase SQL editor.

-- Extensions
create extension if not exists pgcrypto;

-- 1) Workspaces (shared account) ---------------------------------------------
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  join_code text not null unique,
  created_at timestamptz not null default now()
);

-- Simple random join code generator (12 chars) via trigger
create or replace function public.generate_join_code()
returns text
language plpgsql
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
begin
  for i in 1..12 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end;
$$;

create or replace function public.workspaces_set_join_code()
returns trigger
language plpgsql
as $$
begin
  if new.join_code is null or new.join_code = '' then
    new.join_code := public.generate_join_code();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_workspaces_join_code on public.workspaces;
create trigger trg_workspaces_join_code
before insert on public.workspaces
for each row execute function public.workspaces_set_join_code();

-- 2) Workspace members (max 3) ----------------------------------------------
create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  main_psychologist text,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

-- Backfill-safe schema evolution
alter table public.workspace_members add column if not exists main_psychologist text;

create or replace function public.enforce_max_3_members()
returns trigger
language plpgsql
as $$
declare
  cnt int;
begin
  select count(*) into cnt from public.workspace_members where workspace_id = new.workspace_id;
  if cnt >= 3 then
    raise exception 'workspace member limit (3) reached';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_workspace_members_limit on public.workspace_members;
create trigger trg_workspace_members_limit
before insert on public.workspace_members
for each row execute function public.enforce_max_3_members();

-- 3) Datasets (each workspace can have one or more imports) -----------------
create table if not exists public.datasets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  source_file_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_datasets_updated_at on public.datasets;
create trigger trg_datasets_updated_at
before update on public.datasets
for each row execute function public.touch_updated_at();

-- 4) Example: patients table (source-of-truth, not the XLSX) ----------------
create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  dataset_id uuid references public.datasets(id) on delete set null,
  name text not null,
  psychologist text,
  rate numeric not null default 0,
  duration int not null default 50,
  -- Scheduling
  frequency text,
  day_of_week text,
  time text,
  start_date date,
  last_adjustment date,
  end_date date,
  active boolean not null default true,
  -- Payments
  pay_day text,
  pay_recurrence text,
  -- Extra fields used by the app
  mode text,
  is_social boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Backfill-safe schema evolution (if table already existed)
alter table public.patients add column if not exists frequency text;
alter table public.patients add column if not exists day_of_week text;
alter table public.patients add column if not exists time text;
alter table public.patients add column if not exists start_date date;
alter table public.patients add column if not exists last_adjustment date;
alter table public.patients add column if not exists end_date date;
alter table public.patients add column if not exists mode text;
alter table public.patients add column if not exists is_social boolean;

drop trigger if exists trg_patients_updated_at on public.patients;
create trigger trg_patients_updated_at
before update on public.patients
for each row execute function public.touch_updated_at();

-- 5) Notes / prontuários (editable + searchable) ----------------------------
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  session_date date,
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Backfill-safe schema evolution for notes
alter table public.notes add column if not exists patient_name text;
alter table public.notes add column if not exists session_time text;
alter table public.notes add column if not exists appointment_key text;

-- One prontuário per session occurrence (workspace-scoped)
create unique index if not exists notes_workspace_appointment_key_uidx
on public.notes (workspace_id, appointment_key);

-- Limit: max 50 prontuários per workspace (single-user per workspace)
create or replace function public.enforce_max_50_notes()
returns trigger
language plpgsql
as $$
declare
  cnt int;
begin
  select count(*) into cnt from public.notes where workspace_id = new.workspace_id;
  if cnt >= 50 then
    raise exception 'notes limit (50) reached';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notes_limit on public.notes;
create trigger trg_notes_limit
before insert on public.notes
for each row execute function public.enforce_max_50_notes();

drop trigger if exists trg_notes_updated_at on public.notes;
create trigger trg_notes_updated_at
before update on public.notes
for each row execute function public.touch_updated_at();

-- 5b) Workspace settings (shared config like psychologists list) -------------
create table if not exists public.workspace_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  psychologists text[] not null default '{}',
  -- Calendar/Tasks state persisted per workspace
  appointment_overrides jsonb not null default '{}'::jsonb,
  extra_sessions jsonb not null default '[]'::jsonb,
  payment_overrides jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint psychologists_max_3 check (coalesce(array_length(psychologists, 1), 0) <= 3)
);

-- Backfill-safe schema evolution (if table already existed)
alter table public.workspace_settings add column if not exists appointment_overrides jsonb;
alter table public.workspace_settings add column if not exists extra_sessions jsonb;
alter table public.workspace_settings add column if not exists payment_overrides jsonb;

-- Ensure defaults / non-null for existing rows
update public.workspace_settings set appointment_overrides = '{}'::jsonb where appointment_overrides is null;
update public.workspace_settings set extra_sessions = '[]'::jsonb where extra_sessions is null;
update public.workspace_settings set payment_overrides = '{}'::jsonb where payment_overrides is null;

alter table public.workspace_settings alter column appointment_overrides set default '{}'::jsonb;
alter table public.workspace_settings alter column extra_sessions set default '[]'::jsonb;
alter table public.workspace_settings alter column payment_overrides set default '{}'::jsonb;

alter table public.workspace_settings alter column appointment_overrides set not null;
alter table public.workspace_settings alter column extra_sessions set not null;
alter table public.workspace_settings alter column payment_overrides set not null;

drop trigger if exists trg_workspace_settings_updated_at on public.workspace_settings;
create trigger trg_workspace_settings_updated_at
before update on public.workspace_settings
for each row execute function public.touch_updated_at();

-- 5c) User profiles (plan/flags per account) --------------------------------
-- This is for future "standard vs premium". For now everyone defaults to 'standard'.
create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'standard' check (plan in ('standard','premium')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_user_profiles_updated_at on public.user_profiles;
create trigger trg_user_profiles_updated_at
before update on public.user_profiles
for each row execute function public.touch_updated_at();

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- 6) RLS policies ------------------------------------------------------------
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.datasets enable row level security;
alter table public.patients enable row level security;
alter table public.notes enable row level security;
alter table public.workspace_settings enable row level security;
alter table public.user_profiles enable row level security;

-- Helper: check membership
create or replace function public.is_workspace_member(wid uuid)
returns boolean
language sql
stable
as $$
  select exists(
    select 1
    from public.workspace_members m
    where m.workspace_id = wid
      and m.user_id = auth.uid()
  );
$$;

-- workspace_members: user can see their memberships
drop policy if exists "members_select_own" on public.workspace_members;
create policy "members_select_own"
on public.workspace_members
for select
to authenticated
using (user_id = auth.uid());

-- workspace_members: allow joining via join_code handled by RPC/edge later.
-- For MVP we can allow user to insert themselves if they know workspace_id.
drop policy if exists "members_insert_self" on public.workspace_members;
create policy "members_insert_self"
on public.workspace_members
for insert
to authenticated
with check (user_id = auth.uid());

-- workspace_members: allow user to update their own membership (for per-user preferences)
drop policy if exists "members_update_self" on public.workspace_members;
create policy "members_update_self"
on public.workspace_members
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- workspaces: select only if member
drop policy if exists "workspaces_select_if_member" on public.workspaces;
create policy "workspaces_select_if_member"
on public.workspaces
for select
to authenticated
using (public.is_workspace_member(id));

-- workspaces: allow creating workspace (any authed user)
drop policy if exists "workspaces_insert_authed" on public.workspaces;
create policy "workspaces_insert_authed"
on public.workspaces
for insert
to authenticated
with check (true);

-- datasets/patients/notes: only within member workspace
drop policy if exists "datasets_rw_member" on public.datasets;
create policy "datasets_rw_member"
on public.datasets
for all
to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "patients_rw_member" on public.patients;
create policy "patients_rw_member"
on public.patients
for all
to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "notes_rw_member" on public.notes;
create policy "notes_rw_member"
on public.notes
for all
to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "workspace_settings_rw_member" on public.workspace_settings;
create policy "workspace_settings_rw_member"
on public.workspace_settings
for all
to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

-- user_profiles: user can see/update their own profile
drop policy if exists "user_profiles_select_own" on public.user_profiles;
create policy "user_profiles_select_own"
on public.user_profiles
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "user_profiles_update_own" on public.user_profiles;
create policy "user_profiles_update_own"
on public.user_profiles
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- 7) RPC: join workspace by code (recommended) -------------------------------
-- This avoids needing to expose workspaces by join_code via RLS.
create or replace function public.join_workspace_by_code(p_code text)
returns table(workspace_id uuid, workspace_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  wid uuid;
  wname text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select w.id, w.name into wid, wname
  from public.workspaces w
  where w.join_code = upper(trim(p_code))
  limit 1;

  if wid is null then
    raise exception 'invalid code';
  end if;

  -- Insert membership if not exists (enforce_max_3_members trigger will apply)
  insert into public.workspace_members (workspace_id, user_id, role)
  values (wid, auth.uid(), 'member')
  on conflict on constraint workspace_members_pkey do nothing;

  return query select wid, wname;
end;
$$;

grant execute on function public.join_workspace_by_code(text) to authenticated;

-- 8) RPC: create workspace + owner membership (atomic) ----------------------
-- Fixes: creating workspaces via client insert+select can fail due to RLS on SELECT
-- (membership row doesn't exist yet at the moment PostgREST returns the inserted row).
create or replace function public.create_workspace(p_name text)
returns table(workspace_id uuid, workspace_name text, join_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  wid uuid;
  wname text;
  jcode text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  wname := nullif(trim(p_name), '');
  if wname is null then
    raise exception 'invalid name';
  end if;

  insert into public.workspaces as w (name)
  values (wname)
  returning w.id, w.name, w.join_code into wid, wname, jcode;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (wid, auth.uid(), 'owner')
  on conflict on constraint workspace_members_pkey do update set role = excluded.role;

  return query select wid as workspace_id, wname as workspace_name, jcode as join_code;
end;
$$;

grant execute on function public.create_workspace(text) to authenticated;

-- Storage (configure in Storage UI):
-- Buckets suggested:
-- 1) seicologia-bases: path bases/{workspaceId}/{datasetId}/base.xlsx
-- 2) seicologia-attachments: path attachments/{workspaceId}/{noteId}/{filename}
-- Add Storage policies mirroring membership.
