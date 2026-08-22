-- Prompt #252A — owner Locker showcase organization (feature / archive / archive-for-later).
-- Additive only. Does not alter hidden_at, hidden_by, or moderation status columns.
-- Authoritative D1: lantern-db (lantern-api Worker binding DB).
--
-- DO NOT apply from this prompt. Lantern D1 migration bookkeeping is unreliable.
-- Production apply later, deliberately, after review:
--   npx wrangler d1 execute lantern-db --remote --file=migrations/078_lantern_locker_item_state.sql
--
-- Do NOT run: wrangler d1 migrations apply

CREATE TABLE IF NOT EXISTS lantern_locker_item_state (
  character_name TEXT NOT NULL,
  item_type TEXT NOT NULL,
  item_id TEXT NOT NULL,
  featured INTEGER NOT NULL DEFAULT 0,
  featured_sort INTEGER,
  owner_archived_at TEXT,
  owner_archived_from TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (character_name, item_type, item_id)
);

CREATE INDEX IF NOT EXISTS idx_lantern_locker_item_state_owner_archived
  ON lantern_locker_item_state (character_name, owner_archived_at);

CREATE INDEX IF NOT EXISTS idx_lantern_locker_item_state_featured
  ON lantern_locker_item_state (character_name, featured, featured_sort);
