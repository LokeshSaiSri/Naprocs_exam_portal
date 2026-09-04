-- Step 4 of SUPABASE_MIGRATION.md Part 3: Candidate admin routes.
-- Creates `candidates` (needed by every route in this step) and, ahead of its
-- own Step 7, the full `exam_sessions` table (needed here by `reset` and
-- `exam-report`). Only the Candidate-admin ROUTES are verified in this step;
-- the live exam-taking routes that also use exam_sessions stay deferred to
-- Step 7 per the rulebook's ordering rationale -- table exists early, usage doesn't.
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> Run.
-- Assumes 001, 002, 003 already ran.

create table if not exists candidates (
  id uuid primary key default gen_random_uuid(),
  drive_id uuid not null references drives(id),
  name text not null,
  email text not null unique,
  phone text not null,
  college_roll_number text not null unique,
  -- Inline base64 data URI, same as the original Mongo field (Part 4 open
  -- decision on moving to Supabase Storage is still unresolved -- not changed here).
  resume_url text,
  access_pin text not null,
  exam_score integer not null default 0,
  stage text not null default 'EXAM_PENDING'
    check (stage in ('EXAM_PENDING', 'EXAM_COMPLETED', 'TECH_ROUND', 'HR_ROUND', 'SELECTED', 'REJECTED')),
  tech_notes text,
  hr_notes text,
  last_active_at timestamptz,
  current_session_id text,
  score_logic integer default 0,
  score_architecture integer default 0,
  score_linguistic integer default 0,
  score_mission integer default 0,
  cheat_warnings integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists candidates_drive_id_idx on candidates(drive_id);
create index if not exists candidates_stage_idx on candidates(stage);

drop trigger if exists candidates_set_updated_at on candidates;
create trigger candidates_set_updated_at
before update on candidates
for each row execute function set_updated_at();

alter table candidates enable row level security;

create table if not exists exam_sessions (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates(id),
  responses jsonb not null default '{}'::jsonb,
  question_ids uuid[] not null default '{}',
  current_stage text not null default 'MCQ' check (current_stage in ('MCQ', 'CODING')),
  start_time timestamptz not null default now(),
  status text not null default 'IN_PROGRESS' check (status in ('IN_PROGRESS', 'COMPLETED', 'TERMINATED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists exam_sessions_candidate_id_idx on exam_sessions(candidate_id);
create index if not exists exam_sessions_candidate_status_idx on exam_sessions(candidate_id, status);

drop trigger if exists exam_sessions_set_updated_at on exam_sessions;
create trigger exam_sessions_set_updated_at
before update on exam_sessions
for each row execute function set_updated_at();

alter table exam_sessions enable row level security;
