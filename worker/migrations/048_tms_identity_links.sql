-- TMS Nuggets staff identity link (Prompt #94): explicit, admin-created mapping from a stable
-- TMS Nuggets staff.teacher_id to a Lantern lantern_pilot_accounts.username. Required because no
-- existing column is safely shared between the two systems for STAFF (unlike students, which
-- already have lantern_pilot_accounts.mtss_student_id). Never populated by display-name matching;
-- rows are created one at a time by an authenticated Lantern admin via
-- POST /api/admin/tms-identity-links. Unmapped staff simply cannot use TMS -> Lantern SSO
-- (fail closed), which is the intended, safe default for every account until explicitly linked.
-- Run: npx wrangler d1 execute lantern-db --remote --file=worker/migrations/048_tms_identity_links.sql

CREATE TABLE IF NOT EXISTS tms_identity_links (
  tms_staff_id TEXT PRIMARY KEY,
  lantern_username TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT,
  FOREIGN KEY (lantern_username) REFERENCES lantern_pilot_accounts(username)
);

-- Each Lantern account may be the target of at most one TMS staff id (1:1 mapping).
CREATE UNIQUE INDEX IF NOT EXISTS idx_tms_identity_links_lantern_username
  ON tms_identity_links(lantern_username);

-- One-time Lantern staff SSO handoff redemption bookkeeping is NOT stored here -- the raw/
-- consumed handoff code and its expiry live in TMS Nuggets' own D1 (mtss-db), not lantern-db.
-- Lantern only ever sees the already-consumed, minimal identity result.
