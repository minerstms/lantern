-- Prompt #107: Lantern participant mission visibility (Students / Staff / Everyone).
-- Additive only. Existing missions default to 'students' so historical student missions
-- are NOT suddenly shown to staff. Staff/Everyone must be set explicitly on create/edit.
-- Run: npx wrangler d1 execute lantern-db --remote --file=worker/migrations/053_lantern_mission_participant_scope.sql

ALTER TABLE lantern_missions ADD COLUMN participant_scope TEXT NOT NULL DEFAULT 'students';

CREATE INDEX IF NOT EXISTS idx_lantern_missions_participant_scope
  ON lantern_missions(participant_scope);
