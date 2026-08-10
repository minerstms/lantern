-- Phase #31 (individual student access-request + teacher-approval flow) additive columns on the
-- lantern_access_requests table created empty by migration 050. Both columns are nullable and
-- additive only -- existing rows/behavior are unaffected.
--
-- proposed_name: unverified, student-entered display name. Populated ONLY when no authenticated
-- Lantern pilot student session is available at request time. Kept as a SEPARATE column from the
-- verified student_username / student_character_name columns so verified and self-reported
-- identity are never conflated in the teacher UI or in audit history.
--
-- requester_ip_hash: SHA-256 hash of the requesting client's IP (never the raw IP). Used ONLY to
-- rate-limit request creation (anti-spam -- caps how many pending requests one network can create
-- in a short window). It is NEVER used to authorize, qualify, or grant access; the only access
-- boundary remains device_secret_hash (see column comment in migration 050).
--
-- Run from worker/:
--   npx wrangler d1 execute lantern-db --remote --file=migrations/051_lantern_access_requests_rate_limit_and_proposed_name.sql
ALTER TABLE lantern_access_requests ADD COLUMN proposed_name TEXT;
ALTER TABLE lantern_access_requests ADD COLUMN requester_ip_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_lantern_access_requests_ip_hash_requested_at
  ON lantern_access_requests (requester_ip_hash, requested_at);
