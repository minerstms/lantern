-- Schema alignment: lantern_polls canonical identity column is character_name.
-- Legacy migration 027 created created_by_character; Worker code uses character_name.
-- Run from lantern-worker/: npx wrangler d1 execute lantern-db --remote --file=migrations/035_lantern_polls_character_name_alignment.sql
-- If character_name already exists, ignore duplicate-column error and keep the UPDATE step.

ALTER TABLE lantern_polls ADD COLUMN character_name TEXT NOT NULL DEFAULT '';

UPDATE lantern_polls
SET character_name = created_by_character
WHERE (character_name IS NULL OR character_name = '')
  AND created_by_character IS NOT NULL
  AND created_by_character != '';
