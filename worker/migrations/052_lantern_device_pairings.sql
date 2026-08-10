-- Phase #32 (enrolled classroom devices + device-group unlock) additive schema.
--
-- lantern_access_device_pairings: ephemeral (~10 minute) pairing requests, structurally parallel
-- to lantern_access_requests (Phase #31, migration 050) but for DEVICE enrollment rather than a
-- one-time individual grant. pairing_phrase is a DISPLAY/LOOKUP IDENTIFIER ONLY -- the real
-- security boundary is pairing_secret_hash (hash of an opaque secret held only in an HttpOnly
-- cookie on the requesting browser during the pending window). On approval the server mints a
-- SEPARATE, unrelated high-entropy device credential (stored hashed in
-- lantern_access_devices.device_token_hash, table created empty by migration 050) and this
-- pairing row is updated to point at the new device_id -- the raw device credential itself is
-- delivered to the browser at most once (credential_delivered_at) and is NEVER stored here or
-- shown to staff.
--
-- Run from worker/:
--   npx wrangler d1 execute lantern-db --remote --file=migrations/052_lantern_device_pairings.sql
CREATE TABLE IF NOT EXISTS lantern_access_device_pairings (
  id TEXT PRIMARY KEY,
  pairing_phrase TEXT NOT NULL,
  pairing_secret_hash TEXT NOT NULL,
  requester_ip_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  requested_at TEXT NOT NULL,
  request_expires_at TEXT NOT NULL,
  decided_at TEXT,
  decided_by_staff_id TEXT,
  decided_by_staff_name TEXT,
  device_id TEXT REFERENCES lantern_access_devices(id),
  credential_delivered_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lantern_access_device_pairings_status ON lantern_access_device_pairings (status, requested_at);
CREATE INDEX IF NOT EXISTS idx_lantern_access_device_pairings_phrase ON lantern_access_device_pairings (pairing_phrase);
CREATE INDEX IF NOT EXISTS idx_lantern_access_device_pairings_ip_hash ON lantern_access_device_pairings (requester_ip_hash, requested_at);

-- lantern_access_devices (created empty by migration 050) gets two additive, diagnostic-only
-- columns. Per Phase #32's security model, last_seen_ip_hash (like requester_ip_hash above) is
-- NEVER an authorization signal -- only device_token_hash + group membership + an active group
-- unlock ever qualify access.
ALTER TABLE lantern_access_devices ADD COLUMN last_seen_at TEXT;
ALTER TABLE lantern_access_devices ADD COLUMN last_seen_ip_hash TEXT;
