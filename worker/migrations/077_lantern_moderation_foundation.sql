-- Prompt #251A — report resolution + append-only moderation history.
-- Additive only. No DROP, no DELETE, no new content statuses.
-- Authoritative D1: lantern-db (lantern-api Worker binding DB).
--
-- DO NOT apply from this prompt. Lantern D1 migration bookkeeping is unreliable.
-- Production apply later, deliberately, after review:
--   npx wrangler d1 execute lantern-db --remote --file=migrations/077_lantern_moderation_foundation.sql
--
-- Do NOT run: wrangler d1 migrations apply

ALTER TABLE lantern_content_flags ADD COLUMN resolved_at TEXT;
ALTER TABLE lantern_content_flags ADD COLUMN resolved_by TEXT;
ALTER TABLE lantern_content_flags ADD COLUMN resolution TEXT;
ALTER TABLE lantern_content_flags ADD COLUMN staff_note TEXT;

CREATE TABLE IF NOT EXISTS lantern_moderation_events (
  id TEXT PRIMARY KEY,
  item_type TEXT NOT NULL,
  item_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_key TEXT,
  actor_role TEXT,
  actor_label TEXT,
  note TEXT,
  snapshot_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lantern_moderation_events_item
  ON lantern_moderation_events (item_type, item_id, created_at);

CREATE INDEX IF NOT EXISTS idx_lantern_content_flags_unresolved
  ON lantern_content_flags (item_type, item_id, resolved_at);
