-- Pilot account storage (Step 1): schema + five locked rows only.
-- No plaintext passwords. password_hash / password_salt are NULL until a bootstrap step sets them.
-- Run from lantern-worker/: npx wrangler d1 execute lantern-db --remote --file=migrations/036_lantern_pilot_accounts.sql

CREATE TABLE IF NOT EXISTS lantern_pilot_accounts (
  username TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student', 'teacher', 'admin')),
  password_hash TEXT,
  password_salt TEXT,
  student_character_name TEXT,
  teacher_id TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lantern_pilot_accounts_role ON lantern_pilot_accounts(role);

-- Five locked pilot accounts (usernames / display names / roles only).
-- student_character_name: canonical character_name for Worker APIs (students only).
-- teacher_id: canonical teacher scope id for moderation (teachers only); aligns with username for pilot.
INSERT OR REPLACE INTO lantern_pilot_accounts (
  username,
  display_name,
  role,
  password_hash,
  password_salt,
  student_character_name,
  teacher_id,
  updated_at
) VALUES
  ('student1', 'Riley', 'student', NULL, NULL, 'Riley', NULL, datetime('now')),
  ('student2', 'Jordan', 'student', NULL, NULL, 'Jordan', NULL, datetime('now')),
  ('teacher1', 'Ms. Carter', 'teacher', NULL, NULL, NULL, 'teacher1', datetime('now')),
  ('teacher2', 'Mr. Lee', 'teacher', NULL, NULL, NULL, 'teacher2', datetime('now')),
  ('admin', 'Admin', 'admin', NULL, NULL, NULL, NULL, datetime('now'));
