-- Part 4 decision (2026-09-01): move candidate resumes from inline base64 to
-- Supabase Storage. PRIVATE bucket (public: false) -- resumes are candidate
-- PII, never served from a public URL. Server code uses the service_role key
-- for all storage access, which bypasses RLS the same way it does for
-- regular tables, so no storage.objects policies are required.
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> Run.

insert into storage.buckets (id, name, public)
values ('resumes', 'resumes', false)
on conflict (id) do nothing;
