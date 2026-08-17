-- Prompt #280 — Per-avatar include/exclude for Avatar Activities.
-- Image-specific (submission id + image_key), not person-specific.
-- No row = INCLUDED (default). Does not alter moderation, profile, R2, or publicity.
-- Additive only: CREATE TABLE / INDEX. No DROP, no DELETE, no destructive ALTER.
--
-- Run from worker/: npx wrangler d1 migrations apply lantern-db --remote

CREATE TABLE IF NOT EXISTS lantern_avatar_activity_exclusions (
  submission_id TEXT PRIMARY KEY,
  image_key TEXT NOT NULL,
  excluded INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_lantern_avatar_activity_exclusions_image
  ON lantern_avatar_activity_exclusions (image_key);
