-- Prompt #170 — Canonical staff/school email on lantern_pilot_accounts (additive).
-- Nullable email for Thank-You Letter server-side resolution later; not exposed to students.
-- Unique among non-empty emails. Existing rows remain NULL until import/update.
-- Run: npx wrangler d1 execute lantern-db --remote --file=migrations/060_lantern_pilot_accounts_email.sql

ALTER TABLE lantern_pilot_accounts ADD COLUMN email TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_lantern_pilot_accounts_email
  ON lantern_pilot_accounts(email)
  WHERE email IS NOT NULL AND trim(email) != '';
