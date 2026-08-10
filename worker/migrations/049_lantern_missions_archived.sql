-- Mission Archive lifecycle (Prompt #103). Archive is distinct from Pause (active=0):
-- ACTIVE: active=1, archived=0 | PAUSED: active=0, archived=0 | ARCHIVED: archived=1.
-- Student-facing availability requires active = 1 AND archived = 0 everywhere.
-- Run: npx wrangler d1 execute lantern-db --remote --file=migrations/049_lantern_missions_archived.sql
ALTER TABLE lantern_missions ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_lantern_missions_archived_active ON lantern_missions (archived, active);
