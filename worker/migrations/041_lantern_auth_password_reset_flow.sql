-- Password reset / temp-password flow (admin-set passwords force change on next login).
-- Run: npx wrangler d1 execute lantern-db --remote --file=migrations/041_lantern_auth_password_reset_flow.sql

ALTER TABLE lantern_pilot_accounts ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;
ALTER TABLE lantern_pilot_accounts ADD COLUMN password_changed_at TEXT;
ALTER TABLE lantern_pilot_accounts ADD COLUMN password_reset_at TEXT;
ALTER TABLE lantern_pilot_accounts ADD COLUMN password_reset_by TEXT;
