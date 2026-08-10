-- School Access Foundation (Prompt #30) -- additive-only data-model groundwork for upcoming
-- phases #31-#34 (teacher-approved individual grants, enrolled devices, device groups/unlocks,
-- temporary event overrides). Nothing in worker/index.js reads or writes these tables yet; no
-- production behavior changes. Existing class_access_sessions / class_access_tokens tables are
-- left untouched and are NOT duplicated here (they already cover the teacher board-code flow).
--
-- Security model (see docs/class-access.md, docs/LANTERN_AUTH_BASELINE.md, and the miners-yearbook
-- donor pattern this borrows from): a memorable request_phrase is a DISPLAY/LOOKUP IDENTIFIER
-- ONLY for a teacher to recognize which pending request belongs to which student/browser -- it is
-- NEVER a credential. The actual security boundary for a request/device is a high-entropy opaque
-- secret, and only its hash (device_secret_hash / device_token_hash) is ever stored -- the raw
-- secret lives only in an HttpOnly cookie on the requesting browser, exactly like the existing
-- class_access_tokens.token pattern (opaque, server-issued, never guessable).
--
-- Run from worker/: npx wrangler d1 execute lantern-db --remote --file=migrations/050_lantern_school_access_foundation.sql

-- Pending individual access requests -> approved individual temporary grants. One row is updated
-- in place through its lifecycle (pending -> approved/denied -> expired/revoked), matching the
-- existing "same row updated in place" pattern used for missions/news (docs/lantern-architecture.md)
-- rather than a separate parallel "grants" table.
--
-- request_expires_at is the short pending-request window (student must be approved within this
-- window or the request dies); grant_expires_at is the separate, later-set access-duration expiry
-- once approved. Keeping these as two distinct columns (rather than overloading one expires_at for
-- both meanings) avoids a known pitfall in the donor pattern this is based on.
CREATE TABLE IF NOT EXISTS lantern_access_requests (
  id TEXT PRIMARY KEY,
  request_phrase TEXT NOT NULL,
  student_username TEXT,
  student_character_name TEXT,
  device_secret_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'expired', 'revoked')),
  requested_at TEXT NOT NULL,
  request_expires_at TEXT NOT NULL,
  decided_at TEXT,
  decided_by_staff_id TEXT,
  decided_by_staff_name TEXT,
  grant_expires_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lantern_access_requests_status ON lantern_access_requests (status, requested_at);
CREATE INDEX IF NOT EXISTS idx_lantern_access_requests_phrase ON lantern_access_requests (request_phrase);

-- Named groups of enrolled classroom devices (e.g. "Room 12 Chromebook Cart") that a teacher can
-- unlock together, independent of any one student's individual grant.
CREATE TABLE IF NOT EXISTS lantern_access_device_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_by_staff_id TEXT,
  created_by_staff_name TEXT,
  created_at TEXT NOT NULL,
  archived_at TEXT
);

-- Enrolled browser/device identities. device_token_hash is the only credential; the raw
-- high-entropy token is never stored (hash only), same principle as device_secret_hash above.
CREATE TABLE IF NOT EXISTS lantern_access_devices (
  id TEXT PRIMARY KEY,
  device_token_hash TEXT NOT NULL,
  group_id TEXT REFERENCES lantern_access_device_groups(id),
  label TEXT,
  enrolled_by_staff_id TEXT,
  enrolled_by_staff_name TEXT,
  enrolled_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lantern_access_devices_group ON lantern_access_devices (group_id);
CREATE INDEX IF NOT EXISTS idx_lantern_access_devices_token_hash ON lantern_access_devices (device_token_hash);

-- Temporary unlock windows for a device group -- mirrors the existing class_access_sessions
-- shape/lifecycle (starts_at/expires_at/is_active/revoked_at) rather than inventing a new one.
CREATE TABLE IF NOT EXISTS lantern_access_group_unlocks (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES lantern_access_device_groups(id),
  started_by_staff_id TEXT,
  started_by_staff_name TEXT,
  starts_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lantern_access_group_unlocks_group ON lantern_access_group_unlocks (group_id, is_active, expires_at);

-- Temporary global/event overrides (e.g. assembly, testing week) that suspend the schedule lock
-- for everyone during a fixed window, independent of any individual grant or device group.
CREATE TABLE IF NOT EXISTS lantern_access_overrides (
  id TEXT PRIMARY KEY,
  reason TEXT,
  created_by_staff_id TEXT,
  created_by_staff_name TEXT,
  starts_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lantern_access_overrides_active ON lantern_access_overrides (is_active, expires_at);
