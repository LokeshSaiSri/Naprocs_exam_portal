-- Step 3 of SUPABASE_MIGRATION.md Part 3: Question.
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> Run.
-- Assumes 001_settings.sql and 002_drives.sql already ran.

create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  drive_id uuid not null references drives(id),
  type text not null check (type in ('MCQ', 'CODING')),
  title text not null,
  content text not null,
  options jsonb not null default '[]'::jsonb,
  correct_answer text,
  boilerplate_code text,
  -- Rulebook rule #6: kept as free-form JSONB, not a normalized table --
  -- same shape as the old embedded Mongoose subdocuments:
  -- [{ input, expectedOutput, isHidden, weight }]
  test_cases jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists questions_drive_id_idx on questions(drive_id);
create index if not exists questions_drive_id_type_idx on questions(drive_id, type);

drop trigger if exists questions_set_updated_at on questions;
create trigger questions_set_updated_at
before update on questions
for each row execute function set_updated_at();

alter table questions enable row level security;
