-- Prompt #142 — Additive teacher pre-authorization intent for Individual Access.
-- This is NOT an access grant. Access still requires a later authenticated claim that
-- creates a normal device-bound lantern_access_requests row (device_secret_hash NOT NULL).
-- Do not apply to production from this prompt.
--
-- Run from worker/ (later reviewed deploy): npx wrangler d1 execute lantern-db --remote --file=migrations/073_lantern_access_pre_authorizations.sql

CREATE TABLE IF NOT EXISTS lantern_access_pre_authorizations (
  id TEXT PRIMARY KEY,
  student_username TEXT NOT NULL,
  student_display_name TEXT,
  student_id TEXT,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes IN (15, 30)),
  created_at TEXT NOT NULL,
  created_by_staff_id TEXT,
  created_by_staff_name TEXT,
  claim_expires_at TEXT NOT NULL,
  claimed_at TEXT,
  claimed_request_id TEXT,
  cancelled_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_lantern_access_preauth_student
  ON lantern_access_pre_authorizations (student_username, claim_expires_at);

CREATE INDEX IF NOT EXISTS idx_lantern_access_preauth_claimed_request
  ON lantern_access_pre_authorizations (claimed_request_id);
