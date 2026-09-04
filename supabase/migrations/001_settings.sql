-- Step 1 of SUPABASE_MIGRATION.md Part 3: the Settings singleton table.
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> Run.

-- gen_random_uuid() lives in pgcrypto; harmless if Supabase already enabled it.
create extension if not exists pgcrypto;

-- Reusable trigger function: every future table's updated_at should use this
-- too (Mongoose's `timestamps: true` auto-updated it; Postgres needs this).
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table if not exists settings (
  id uuid primary key default gen_random_uuid(),
  drive_title text not null default 'Naprocs Recruitment Drive',
  exam_duration integer not null default 60,
  passing_cutoff integer not null default 70,
  proctoring_sensitivity text not null default 'MEDIUM'
    check (proctoring_sensitivity in ('LOW', 'MEDIUM', 'HIGH')),
  max_cheat_warnings integer not null default 3,
  mcq_count integer not null default 15,
  coding_count integer not null default 2,
  shuffle_questions boolean not null default true,
  shuffle_options boolean not null default true,
  is_exam_active boolean not null default true,
  start_time timestamptz,
  end_time timestamptz,
  passwords_reset_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists settings_set_updated_at on settings;
create trigger settings_set_updated_at
before update on settings
for each row execute function set_updated_at();

-- Defense in depth: only the service_role key (used by our API routes) can
-- touch this table. No policies are added, so RLS blocks anon/authenticated
-- entirely -- matches "server-only access" from Rulebook rule #12.
alter table settings enable row level security;
