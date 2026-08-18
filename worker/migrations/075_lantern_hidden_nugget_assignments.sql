-- Prompt #230 / #230A — Hidden Nugget daily assignment table.
-- Additive only: CREATE TABLE / INDEX. No DROP, no DELETE, no backfill, no seed rows.
-- Authoritative D1: lantern-db (lantern-api Worker binding DB).
--
-- Run from worker/: npx wrangler d1 execute lantern-db --remote --file=migrations/075_lantern_hidden_nugget_assignments.sql

CREATE TABLE IF NOT EXISTS lantern_hidden_nugget_assignments (
  id TEXT PRIMARY KEY,
  account_key TEXT NOT NULL,
  school_day TEXT NOT NULL,
  card_id TEXT NOT NULL,
  claimed_at TEXT,
  claim_tx_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hidden_nugget_account_day
  ON lantern_hidden_nugget_assignments (account_key, school_day);

CREATE INDEX IF NOT EXISTS idx_hidden_nugget_day
  ON lantern_hidden_nugget_assignments (school_day);
