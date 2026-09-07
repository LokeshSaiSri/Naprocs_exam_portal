-- Server-authoritative exam timing + session end-reason tracking.
--
-- Fixes: the exam countdown was purely client-computed and reseeded from
-- scratch on every page load (using the drive's shared exam_end, not the
-- candidate's own session.start_time), so a refresh silently granted a
-- fresh ~full-duration timer. This adds a `deadline` computed once per
-- session and never recomputed, plus an `end_reason` so admins can finally
-- tell WHY a session ended (manual submit, timer, a HIGH-severity
-- violation, hitting the warning cap, or an abandoned/never-submitted
-- session picked up by the lazy sweep in src/lib/examTiming.ts).
--
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> Run.
-- Assumes 001-006 already ran.

alter table exam_sessions
  add column if not exists deadline timestamptz;

alter table exam_sessions
  add column if not exists end_reason text
    check (end_reason in (
      'MANUAL', 'TIME_EXPIRED', 'VIOLATION_HIGH_SEVERITY',
      'VIOLATION_MEDIUM_CAP', 'ABANDONED_TIMEOUT'
    ));

-- Backfill every currently-IN_PROGRESS session with the same formula the
-- app uses going forward: start_time + drive.exam_duration, capped by the
-- drive's shared exam_end window. Rows already COMPLETED/TERMINATED are
-- left alone -- end_reason stays NULL for anything that ended before this
-- migration, since we genuinely don't know why (render that as "Unknown
-- (pre-migration)" in any admin UI that surfaces it).
--
-- This backfill is belt-and-suspenders, not load-bearing: ensureSessionDeadline()
-- in src/lib/examTiming.ts self-heals any IN_PROGRESS row this update misses
-- (or any inserted between writing and running this migration) the next
-- time any route touches it.
update exam_sessions es
set deadline = least(
  es.start_time + (d.exam_duration || ' minutes')::interval,
  d.exam_end
)
from candidates c
join drives d on d.id = c.drive_id
where es.candidate_id = c.id
  and es.status = 'IN_PROGRESS'
  and es.deadline is null;

create index if not exists exam_sessions_deadline_idx
  on exam_sessions(deadline) where status = 'IN_PROGRESS';
