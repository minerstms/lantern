-- Geppetto student SSO handoffs (Lantern → Geppetto).
-- Apply manually when approved. Do not auto-run from Worker.
-- Dedicated table — do NOT reuse TMS lantern_handoffs (staff teacher_id FK).
-- Raw handoff codes are never stored; code_hash only.

CREATE TABLE IF NOT EXISTS geppetto_student_handoffs (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  lantern_username TEXT,
  mtss_student_id TEXT NOT NULL,
  display_name TEXT,
  audience TEXT NOT NULL DEFAULT 'geppetto_student',
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_geppetto_student_handoffs_expires
  ON geppetto_student_handoffs(expires_at);

CREATE INDEX IF NOT EXISTS idx_geppetto_student_handoffs_mtss
  ON geppetto_student_handoffs(mtss_student_id, created_at);
