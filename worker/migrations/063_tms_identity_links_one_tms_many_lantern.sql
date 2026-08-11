-- Prompt #184 — ONE TMS staff → MANY intentional Lantern accounts.
-- ONE Lantern account → at most ONE TMS staff identity.
-- Explicit is_primary (at most one primary per tms_staff_id) for TMS→Lantern SSO.
-- Run: npx wrangler d1 execute lantern-db --remote --file=worker/migrations/063_tms_identity_links_one_tms_many_lantern.sql

CREATE TABLE tms_identity_links_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tms_staff_id TEXT NOT NULL,
  lantern_username TEXT NOT NULL,
  lantern_staff_id INTEGER,
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  created_by TEXT,
  FOREIGN KEY (lantern_username) REFERENCES lantern_pilot_accounts(username)
);

-- Existing production rows are 1:1 — migrate each as primary.
INSERT INTO tms_identity_links_v2 (
  tms_staff_id, lantern_username, lantern_staff_id, is_primary, created_at, created_by
)
SELECT
  tms_staff_id,
  lantern_username,
  lantern_staff_id,
  1,
  created_at,
  created_by
FROM tms_identity_links;

DROP TABLE tms_identity_links;
ALTER TABLE tms_identity_links_v2 RENAME TO tms_identity_links;

CREATE UNIQUE INDEX idx_tms_identity_links_lantern_username
  ON tms_identity_links(lantern_username);

CREATE UNIQUE INDEX idx_tms_identity_links_lantern_staff_id
  ON tms_identity_links(lantern_staff_id)
  WHERE lantern_staff_id IS NOT NULL;

CREATE INDEX idx_tms_identity_links_tms_staff_id
  ON tms_identity_links(tms_staff_id);

-- At most one primary Lantern account per TMS staff identity.
CREATE UNIQUE INDEX idx_tms_identity_links_one_primary
  ON tms_identity_links(tms_staff_id)
  WHERE is_primary = 1;
