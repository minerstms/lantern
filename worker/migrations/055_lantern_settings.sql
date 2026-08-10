-- Prompt #110 — ONE canonical Lantern settings store (key/value). No prior generic settings
-- table existed (lantern_setup_state is a narrow one-time-setup flag, not general config), so
-- this becomes THE settings architecture going forward — future global settings should reuse
-- this table rather than creating a second settings framework.
-- Run: npx wrangler d1 execute lantern-db --remote --file=migrations/055_lantern_settings.sql

CREATE TABLE IF NOT EXISTS lantern_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

-- Canonical marquee/ticker scroll speed, in pixels per second, applied uniformly to every page
-- that renders #lanternTicker. See worker/lantern-settings.js for validation/bounds and
-- app/js/lantern-ticker.js for how distance/speed become an animation-duration at render time.
INSERT OR IGNORE INTO lantern_settings (key, value, updated_at, updated_by)
VALUES ('marquee_speed_px_per_second', '15', datetime('now'), NULL);
