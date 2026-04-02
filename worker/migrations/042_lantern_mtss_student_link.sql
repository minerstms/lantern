-- Canonical MTSS student_id on pilot accounts (optional, unique). Wallet/transact still key by character_name;
-- MTSS should use the same student_id string as character_name in POST /api/economy/transact.
-- Run: npx wrangler d1 execute lantern-db --remote --file=migrations/042_lantern_mtss_student_link.sql

ALTER TABLE lantern_pilot_accounts ADD COLUMN mtss_student_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_lantern_pilot_accounts_mtss_student_id
  ON lantern_pilot_accounts(mtss_student_id)
  WHERE mtss_student_id IS NOT NULL AND trim(mtss_student_id) != '';
