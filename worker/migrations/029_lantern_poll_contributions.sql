-- Poll as first-class contribute flow (teacher approval via lantern_approvals).
-- Run after 027/028. mission_submission_id on lantern_polls may reference mission or 'contrib:<id>'.

CREATE TABLE IF NOT EXISTS lantern_poll_contributions (
  id TEXT PRIMARY KEY,
  character_name TEXT NOT NULL,
  question TEXT NOT NULL,
  choices_json TEXT NOT NULL,
  image_url TEXT,
  fallback_key TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  reviewed_by TEXT,
  decision_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_poll_contrib_status ON lantern_poll_contributions(status);
