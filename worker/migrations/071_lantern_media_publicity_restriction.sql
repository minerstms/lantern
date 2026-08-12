-- Prompt #3 — Media/Publicity Restriction on canonical student identity (MTSS student_id = character_name).
-- Additive, default-safe: existing students remain Allowed (0).
-- Run: npx wrangler d1 migrations apply lantern-db --remote

ALTER TABLE lantern_student_identities ADD COLUMN media_publicity_restricted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE lantern_student_identities ADD COLUMN media_publicity_updated_at TEXT;
ALTER TABLE lantern_student_identities ADD COLUMN media_publicity_updated_by TEXT;
