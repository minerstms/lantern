-- Student display names keyed by character_name (e.g. MTSS student_id as character_name).
-- Wallet/transact keys remain character_name; display_name is informational only.

CREATE TABLE IF NOT EXISTS lantern_student_identities (
  character_name TEXT PRIMARY KEY,
  display_name TEXT,
  created_at TEXT NOT NULL
);
