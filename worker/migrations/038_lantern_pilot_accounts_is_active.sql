-- Account enable/disable for admin moderation.
-- Run: npx wrangler d1 execute lantern-db --remote --file=migrations/038_lantern_pilot_accounts_is_active.sql

ALTER TABLE lantern_pilot_accounts ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
