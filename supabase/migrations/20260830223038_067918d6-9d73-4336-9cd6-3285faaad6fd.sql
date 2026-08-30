-- Scheduled automation: the system does its work whether or not anyone opens the app.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- Per-person delivery preferences for the standing briefing.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists weekly_briefing_enabled boolean not null default true,
  add column if not exists briefing_day smallint not null default 0,
  add column if not exists briefing_email_enabled boolean not null default true;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_briefing_day_check'
  ) then
    alter table public.profiles
      add constraint profiles_briefing_day_check check (briefing_day between 0 and 6);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- A record of every scheduled run, so "it ran" is a fact rather than a hope.
-- ---------------------------------------------------------------------------
create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null,
  status text not null check (status in ('ok','partial','skipped','failed')),
  message text,
  detail jsonb,
  households integer not null default 0,
  duration_ms integer,
  ran_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

grant select on public.automation_runs to authenticated;
grant all on public.automation_runs to service_role;

alter table public.automation_runs enable row level security;

drop policy if exists "household members read automation runs" on public.automation_runs;
create policy "household members read automation runs"
  on public.automation_runs
  for select
  to authenticated
  using (private.current_household_id() is not null);

create index if not exists automation_runs_job_ran_idx
  on public.automation_runs (job, ran_at desc);

-- ---------------------------------------------------------------------------
-- Shared secret for the scheduled callbacks. Private schema: no Data API path.
-- ---------------------------------------------------------------------------
create table if not exists private.job_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

revoke all on private.job_config from anon, authenticated;