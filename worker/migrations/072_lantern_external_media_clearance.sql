-- Prompt #3 — Durable external-media clearance for YouTube/Hallway-adjacent hosting gates.
-- Fingerprint invalidates clearance when media or tagged people change.
-- Run: npx wrangler d1 migrations apply lantern-db --remote

CREATE TABLE IF NOT EXISTS lantern_external_media_clearance (
  content_kind TEXT NOT NULL,
  content_id TEXT NOT NULL,
  cleared_at TEXT NOT NULL,
  cleared_by TEXT NOT NULL,
  asset_fingerprint TEXT NOT NULL,
  PRIMARY KEY (content_kind, content_id)
);
