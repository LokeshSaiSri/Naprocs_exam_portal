-- Step 2 of SUPABASE_MIGRATION.md Part 3: Drive.
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> Run.
-- Assumes 001_settings.sql already ran (reuses its set_updated_at() function).

create table if not exists drives (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  exam_duration integer not null default 60,
  passing_cutoff integer not null default 70,
  -- NOTE: this is "proctoring_severity" (Drive), distinct from
  -- "proctoring_sensitivity" (Settings) -- a pre-existing naming
  -- inconsistency in the original app, preserved deliberately (rule #1).
  proctoring_severity text not null default 'MEDIUM'
    check (proctoring_severity in ('LOW', 'MEDIUM', 'HIGH')),
  max_cheat_warnings integer not null default 3,
  mcq_count integer not null default 15,
  coding_count integer not null default 2,
  shuffle_questions boolean not null default true,
  shuffle_options boolean not null default true,
  is_exam_active boolean not null default true,
  reg_start timestamptz not null,
  reg_end timestamptz not null,
  exam_start timestamptz not null,
  exam_end timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists drives_set_updated_at on drives;
create trigger drives_set_updated_at
before update on drives
for each row execute function set_updated_at();

alter table drives enable row level security;
