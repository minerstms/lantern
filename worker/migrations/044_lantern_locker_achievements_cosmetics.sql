-- Locker achievements + cosmetic inventory (owned + equipped).
-- Run: npx wrangler d1 execute lantern-db --remote --file=migrations/044_lantern_locker_achievements_cosmetics.sql

CREATE TABLE IF NOT EXISTS lantern_achievements (
  id TEXT PRIMARY KEY,
  character_name TEXT NOT NULL,
  achievement_id TEXT NOT NULL,
  unlocked_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  meta_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE(character_name, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_lantern_achievements_character
  ON lantern_achievements(character_name);

CREATE TABLE IF NOT EXISTS lantern_cosmetic_ownership (
  character_name TEXT PRIMARY KEY,
  owned_json TEXT NOT NULL DEFAULT '[]',
  equipped_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);
