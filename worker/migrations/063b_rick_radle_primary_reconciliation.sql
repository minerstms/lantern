-- Prompt #184 Rick reconciliation (run AFTER 063 migration).
-- Keep existing Radle → Rick Radle (admin) link.
-- Add Radle → rick.radle (teacher) link.
-- Set primary SSO target to rick.radle; admin remains secondary.
-- Does NOT create TMS staff rows or change Lantern roles.
-- Note: D1 remote execute rejects BEGIN TRANSACTION; run statements sequentially.

INSERT INTO tms_identity_links (
  tms_staff_id, lantern_username, lantern_staff_id, is_primary, created_at, created_by
)
SELECT
  'Radle',
  'rick.radle',
  4,
  0,
  datetime('now'),
  'prompt-184'
WHERE NOT EXISTS (
  SELECT 1 FROM tms_identity_links
  WHERE lower(trim(lantern_username)) = lower(trim('rick.radle'))
);

UPDATE tms_identity_links SET is_primary = 0 WHERE tms_staff_id = 'Radle';

UPDATE tms_identity_links
  SET is_primary = 1
  WHERE tms_staff_id = 'Radle'
    AND lower(trim(lantern_username)) = lower(trim('rick.radle'));
