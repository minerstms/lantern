-- School Access audit log (Phase #33) -- additive-only. One row per security-relevant School
-- Access action (request approved/denied, grant extended/revoked, device enrolled/revoked,
-- group unlocked/locked, event override started/ended). Never stores credential secrets --
-- only ids, staff identity, and short human-readable detail. Never read as an authorization
-- signal anywhere; purely a record for staff review.
--
-- Run from worker/: npx wrangler d1 execute lantern-db --remote --file=migrations/054_lantern_access_audit_log.sql
CREATE TABLE IF NOT EXISTS lantern_access_audit_log (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  staff_id TEXT,
  staff_name TEXT,
  target_id TEXT,
  detail TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lantern_access_audit_log_action_created ON lantern_access_audit_log (action, created_at);
CREATE INDEX IF NOT EXISTS idx_lantern_access_audit_log_created ON lantern_access_audit_log (created_at);
