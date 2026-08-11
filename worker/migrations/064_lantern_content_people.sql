-- Prompt #190 — Canonical content↔person relationships (recognized / tagged).
-- Additive only. Does not rewrite historical free-text recognition names.
-- Run: npx wrangler d1 execute lantern-db --remote --file=worker/migrations/064_lantern_content_people.sql

CREATE TABLE IF NOT EXISTS lantern_content_people (
  id TEXT PRIMARY KEY,
  content_kind TEXT NOT NULL,
  content_id TEXT NOT NULL,
  person_kind TEXT NOT NULL,
  person_key TEXT NOT NULL,
  relationship TEXT NOT NULL,
  display_label TEXT,
  created_at TEXT NOT NULL,
  created_by_username TEXT
);

-- Same person cannot be attached twice for the same relationship on one content row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_content_people_unique
  ON lantern_content_people(content_kind, content_id, person_kind, person_key, relationship);

CREATE INDEX IF NOT EXISTS idx_content_people_person
  ON lantern_content_people(person_kind, person_key);

CREATE INDEX IF NOT EXISTS idx_content_people_content
  ON lantern_content_people(content_kind, content_id);

CREATE INDEX IF NOT EXISTS idx_content_people_rel
  ON lantern_content_people(relationship);
