-- Prompt #249B — stored card-thumbnail sidecar.
-- Additive only: CREATE TABLE / INDEX. No DROP, no DELETE, no ALTER of historical content tables.
-- Authoritative D1: lantern-db (lantern-api Worker binding DB).
--
-- DO NOT apply from this prompt. Lantern D1 migration bookkeeping is unreliable.
-- Production apply later, deliberately, after review:
--   npx wrangler d1 execute lantern-db --remote --file=migrations/076_lantern_image_thumbnails.sql
--
-- Do NOT run: wrangler d1 migrations apply

CREATE TABLE IF NOT EXISTS lantern_image_thumbnails (
  source_kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  original_object_key TEXT NOT NULL,
  image_version INTEGER NOT NULL DEFAULT 1,
  thumbnail_object_key TEXT,
  thumbnail_mime_type TEXT,
  thumbnail_size_bytes INTEGER,
  thumbnail_width INTEGER,
  thumbnail_height INTEGER,
  thumbnail_generated_at TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (source_kind, source_id)
);

CREATE INDEX IF NOT EXISTS idx_lantern_image_thumbnails_original
  ON lantern_image_thumbnails (original_object_key);
