-- Webcam/microphone proctoring: per-drive opt-in flag, an events/evidence
-- log, and a private storage bucket for periodic snapshots.
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> Run.
-- Assumes 001-005 already ran.

alter table drives
  add column if not exists webcam_proctoring_enabled boolean not null default false;

-- Independent audit log, additive to the existing cheat_warnings counter on
-- candidates -- does NOT touch exam_sessions.status/TERMINATED (dead/unused
-- today) and does not retrofit the pre-existing gap where tab-switch/
-- fullscreen violation reasons are never persisted. SNAPSHOT rows are the
-- routine baseline evidence trail (not a violation); the other four event
-- types are violations that also feed candidates.cheat_warnings via the
-- existing /api/exam/sync path, same as tab-switch/fullscreen do today.
create table if not exists proctoring_events (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates(id),
  session_id uuid not null references exam_sessions(id),
  event_type text not null
    check (event_type in ('SNAPSHOT', 'NO_FACE', 'MULTIPLE_FACES', 'LOOKING_AWAY', 'HIGH_NOISE')),
  snapshot_path text,
  created_at timestamptz not null default now()
);

create index if not exists proctoring_events_candidate_id_idx
  on proctoring_events(candidate_id, created_at desc);

alter table proctoring_events enable row level security;

-- Private bucket, same convention as 005_resumes_bucket.sql: candidate
-- biometric snapshots are sensitive personal data (India DPDP Act), never a
-- public URL. Server code uses the service_role key for all storage access,
-- bypassing RLS the same way it does for regular tables.
insert into storage.buckets (id, name, public)
values ('proctoring-snapshots', 'proctoring-snapshots', false)
on conflict (id) do nothing;
