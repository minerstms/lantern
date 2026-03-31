-- First-run setup flag (one-time password initialization via /api/setup/complete).
-- Run from lantern-worker/: npx wrangler d1 execute lantern-db --remote --file=migrations/037_lantern_setup_state.sql

CREATE TABLE IF NOT EXISTS lantern_setup_state (
  id TEXT PRIMARY KEY,
  setup_completed_at TEXT,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO lantern_setup_state (id, setup_completed_at, updated_at)
VALUES ('global', NULL, datetime('now'));
