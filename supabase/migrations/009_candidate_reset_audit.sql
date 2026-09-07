-- Lightweight audit trail for the "Re-attempt" admin action
-- (POST /api/admin/candidates/[id]/reset). This app has no per-admin
-- identity (admin auth is a single shared passphrase -- see
-- src/app/api/auth/admin-login/route.ts), so `last_reset_by` is necessarily
-- self-attested free text the admin types into the confirm dialog, not a
-- verified identity. Good enough to answer "who/when/why" without inventing
-- a whole admin-accounts system for it.
--
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> Run.
-- Assumes 001-008 already ran.

alter table candidates
  add column if not exists last_reset_at timestamptz,
  add column if not exists last_reset_reason text,
  add column if not exists last_reset_by text;
