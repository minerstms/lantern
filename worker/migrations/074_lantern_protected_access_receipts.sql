-- Prompt #228 — Additive protected-view / protected-delivery access receipts.
-- Opaque TMS trace codes map server-side to an authorized viewer and surface.
-- Does NOT rewrite lantern_access_audit_log (school-access staff actions stay separate).
-- Additive only: CREATE TABLE / INDEX. No DROP, no DELETE, no destructive ALTER.
--
-- Run from worker/: npx wrangler d1 migrations apply lantern-db --remote

CREATE TABLE IF NOT EXISTS lantern_protected_access_receipts (
  id TEXT PRIMARY KEY,
  trace_code TEXT NOT NULL UNIQUE,
  viewer_username TEXT,
  viewer_role TEXT,
  resource_type TEXT,
  resource_id TEXT,
  surface TEXT,
  action TEXT NOT NULL,
  protection_tier INTEGER NOT NULL,
  session_ref TEXT,
  authorized INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lantern_protected_access_receipts_trace
  ON lantern_protected_access_receipts (trace_code);

CREATE INDEX IF NOT EXISTS idx_lantern_protected_access_receipts_created
  ON lantern_protected_access_receipts (created_at);

CREATE INDEX IF NOT EXISTS idx_lantern_protected_access_receipts_viewer
  ON lantern_protected_access_receipts (viewer_username, created_at);
