CREATE TABLE IF NOT EXISTS lantern_test_students (
  id TEXT PRIMARY KEY,
  character_name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'test',
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_test_students_expires ON lantern_test_students(expires_at);
CREATE INDEX IF NOT EXISTS idx_test_students_character ON lantern_test_students(character_name);
