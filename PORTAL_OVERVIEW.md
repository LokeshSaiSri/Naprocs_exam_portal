# Naprocs Exam Portal

**Status:** Supabase-backed · Load-tested to 600 concurrent candidates · Anti-cheat verified
**Last verified:** 2026-09-01

An internal briefing on what the portal does, how admins and candidates use it, and what's been verified.

---

## 1. What it is

Naprocs is a self-contained campus-recruitment platform. An admin sets up a **Drive** — a named
recruitment batch with its own registration window, exam window, and question bank — and shares
one link. Candidates register, get an access PIN, and sit a live-proctored exam that grades itself
the instant they submit. Everyone who finishes lands automatically on a live hiring pipeline the
admin team works through by hand: Tech Round, HR Round, Selected or Rejected.

Nothing here waits on a human first pass. MCQs are matched instantly; coding answers are actually
executed against test cases the moment a candidate submits. By the time an admin opens the kanban
board, every candidate already has a real score.

---

## 2. The Admin journey

*Recruitment Drives → Question Bank → Live Kanban*

1. **Create a Drive** — title, registration window, exam window, how many MCQ/coding questions
   each candidate gets, and how strict proctoring should be.
2. **Build the question bank** — write MCQs and coding problems directly (rich-text prompt, live
   code editor, public + hidden test cases), or bulk-upload a CSV.
3. **Share the registration link** — one URL per drive. It only accepts candidates inside the
   registration window — closed outside it, no exceptions.
4. **Watch the live kanban** — candidates who've finished the exam appear automatically. Drag them
   through Tech Round → HR Round → Selected/Rejected, scoring rubrics and notes as you go.
5. **Review and export** — open any candidate for a full transparency log (every question, their
   answer, right or wrong, session duration), plus resume preview and a PDF shortlist per stage.

---

## 3. The Candidate journey

*Register → Access PIN → Proctored Exam → Auto-Graded*

1. **Register** — name, email, phone, roll number, and a resume upload, only while the drive's
   registration window is open.
2. **Get an access PIN** — a 6-digit PIN, issued instantly, unique to that candidate.
3. **Log in** — email + PIN. A 2-minute device lock stops the same account running in two tabs
   at once.
4. **Sit the exam** — objective section first, then a coding sandbox with a live editor and a
   "Run Test Suite" button to self-check before the final submit.
5. **Submit — graded instantly** — the score is final and visible to admins the moment it lands.
   No waiting on manual marking.

---

## 4. How grading works

Every question is graded the same way, whether a candidate hits "Run" mid-exam or the final
submit button.

| | |
|---|---|
| **Objective questions** | Exact match against the correct option configured by the admin. No partial credit, no ambiguity. |
| **Coding questions** | The candidate's actual submitted code runs in a sandboxed environment against every test case — public ones they can see, hidden ones they can't. Each case is pass/fail; a question's score is the weighted share of cases passed. |
| **Final score** | A blended percentage across every question in the exam — the same number the admin sees on the kanban card. |

---

## 5. Exam integrity (proctoring)

Right-click, copy, and paste are blocked outright, always. Leaving fullscreen or switching tabs is
**logged** — what happens next depends on the drive's configured severity.

| Severity | On first incident | On repeat incidents |
|---|---|---|
| **Low** | Logged against the candidate. | Logged every time — the exam is never auto-ended. |
| **Medium** | A warning, with a running count shown to the candidate. | Auto-submitted the moment the drive's configured warning limit is reached. |
| **High** | Exam ends immediately — whatever was answered so far is submitted. | — |

> **Closed this week:** every incident is now written to the candidate's record the instant it
> happens, not just logged in the browser tab. Opening a candidate's file now shows the real
> violation count — the admin dashboard's integrity panel had nothing to show before this was
> wired up.

---

## 6. Under the hood

*For the engineering side of the team.*

Next.js on the front and back end; the data layer is Postgres and file storage on Supabase.

`Next.js (App Router)` · `Supabase Postgres` · `Supabase Storage` · `Migrated off MongoDB Atlas` · `Sandboxed Node VM for code execution`

The database moved from MongoDB to Supabase this week, chiefly to get past a recurring connection
problem and to fit the naturally relational shape of the data — drives own candidates and
questions, sessions belong to candidates. Every one of the ~20 API routes was ported and
individually verified against the live database, not assumed to work because the code compiled.

Resumes live in a **private** Supabase Storage bucket — never a public URL. Admins view them
through a short-lived signed link generated at request time.

---

## 7. Verified and hardened this week

| | |
|---|---|
| **600** | concurrent candidates registered, sat the exam, and submitted — 100% success |
| **10/10** | simultaneous duplicate registrations resolved correctly, every run |
| **4/4** | proctoring severity scenarios verified against a real browser |
| **0** | data-integrity issues across every load test |

> **Worth knowing:** this is a living system, not a finished artifact — expect this document to
> need updates as the portal keeps evolving.

---
*Naprocs Exam Portal — internal briefing*
