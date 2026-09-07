-- Normalizes candidates.email / candidates.college_roll_number casing so
-- login-by-either-identifier (src/app/api/auth/exam-login/route.ts) is
-- reliable regardless of how a candidate types it back in. Registration
-- (src/app/api/register/route.ts) now normalizes at write time
-- (lowercase+trim email, uppercase+trim roll number); this migration
-- backfills every row that predates that change, then hardens both
-- constraints to be case-insensitive going forward.
--
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> Run.
-- Assumes 001-007 already ran.
--
-- *** PRE-FLIGHT CHECK -- RUN THIS FIRST, BEFORE THE STATEMENTS BELOW ***
-- The existing unique constraints are case-sensitive, so it's possible (if
-- unlikely) that two existing rows already differ only by case. Normalizing
-- them would collide. Check first:
--
--   select lower(email), count(*) from candidates group by 1 having count(*) > 1;
--   select upper(college_roll_number), count(*) from candidates group by 1 having count(*) > 1;
--
-- If either query returns rows, resolve them manually (e.g. merge/delete the
-- duplicate) before running the rest of this file -- do not let the UPDATE
-- below fail-and-partially-apply against live data.

update candidates
set email = lower(trim(email))
where email <> lower(trim(email));

update candidates
set college_roll_number = upper(trim(college_roll_number))
where college_roll_number <> upper(trim(college_roll_number));

-- Defense in depth: replace the bare (case-sensitive) unique constraints
-- with case-insensitive unique indexes, so any future write path that
-- forgets to normalize still can't create a case-only duplicate.
-- `drop constraint if exists` is a safe no-op if the actual auto-generated
-- constraint name differs from the guess below -- verify with `\d candidates`
-- in the Supabase SQL editor if this doesn't find them.
alter table candidates drop constraint if exists candidates_email_key;
alter table candidates drop constraint if exists candidates_college_roll_number_key;

create unique index if not exists candidates_email_lower_unique_idx
  on candidates (lower(email));
create unique index if not exists candidates_college_roll_number_upper_unique_idx
  on candidates (upper(college_roll_number));
