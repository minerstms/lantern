-- Poll image persistence: add image_url to lantern_polls so approved poll images show in Explore.
-- Run: npx wrangler d1 execute lantern-db --remote --file=lantern-worker/migrations/034_poll_image_url.sql
-- Requires 027 (lantern_polls). If the column already exists, this may error with "duplicate column" — safe to ignore.
ALTER TABLE lantern_polls ADD COLUMN image_url TEXT;
