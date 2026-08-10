-- Prompt #136 — Staff identity: immutable Staff ID + first/last names (staff/admin only).
-- Additive only. Does not rename username PK, touch passwords/sessions/roles/students/Nuggets/R2.
-- Staff IDs are allocated via lantern_staff_id_alloc AUTOINCREMENT (never worker/admin-account-utils.js).
-- Never reuse Staff IDs via max-plus-one allocation. Gaps are OK; archive/delete must never reuse an ID.
-- Run: npx wrangler d1 execute lantern-db --remote --file=migrations/056_lantern_staff_identity.sql

-- Persistent never-reuse allocator (SQLite/D1 AUTOINCREMENT + sqlite_sequence).
CREATE TABLE IF NOT EXISTS lantern_staff_id_alloc (
  id INTEGER PRIMARY KEY AUTOINCREMENT
);

ALTER TABLE lantern_pilot_accounts ADD COLUMN first_name TEXT;
ALTER TABLE lantern_pilot_accounts ADD COLUMN last_name TEXT;
ALTER TABLE lantern_pilot_accounts ADD COLUMN staff_id INTEGER;

-- Uniqueness for assigned Staff IDs; multiple NULLs allowed (students / pre-setup).
CREATE UNIQUE INDEX IF NOT EXISTS idx_lantern_pilot_accounts_staff_id
  ON lantern_pilot_accounts(staff_id)
  WHERE staff_id IS NOT NULL;

-- Existing staff backfill:
-- No trustworthy created_at exists (only updated_at / password_* timestamps that reflect later edits).
-- Deterministic safe order (NOT claimed historical chronology): lower(trim(username)) ASC.
-- first_name / last_name intentionally left NULL (do not auto-split "Ms. Carter" / "Mr. Lee" / display_name).
-- display_name preserved exactly as-is.

WITH RECURSIVE
need AS (
  SELECT COUNT(*) AS n
  FROM lantern_pilot_accounts
  WHERE lower(trim(role)) IN ('teacher', 'admin')
    AND staff_id IS NULL
),
seq(i) AS (
  SELECT 1 FROM need WHERE n > 0
  UNION ALL
  SELECT i + 1 FROM seq, need WHERE i < need.n
)
INSERT INTO lantern_staff_id_alloc (id)
SELECT NULL FROM seq;

WITH ordered_staff AS (
  SELECT username,
         ROW_NUMBER() OVER (ORDER BY lower(trim(username)) ASC) AS rn
  FROM lantern_pilot_accounts
  WHERE lower(trim(role)) IN ('teacher', 'admin')
    AND staff_id IS NULL
),
new_ids AS (
  SELECT id,
         ROW_NUMBER() OVER (ORDER BY id ASC) AS rn
  FROM lantern_staff_id_alloc
  WHERE id > COALESCE(
    (SELECT MAX(staff_id) FROM lantern_pilot_accounts WHERE staff_id IS NOT NULL),
    0
  )
)
UPDATE lantern_pilot_accounts
SET staff_id = (
  SELECT new_ids.id
  FROM ordered_staff
  JOIN new_ids ON ordered_staff.rn = new_ids.rn
  WHERE ordered_staff.username = lantern_pilot_accounts.username
)
WHERE username IN (SELECT username FROM ordered_staff);
