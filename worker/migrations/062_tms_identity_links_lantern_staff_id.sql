-- Prompt #176 — durable TMS link resolution via immutable Lantern Staff ID.
-- Username/display edits must not break Admin Nugget Adjustment / Games staff economy.
ALTER TABLE tms_identity_links ADD COLUMN lantern_staff_id INTEGER;

UPDATE tms_identity_links
SET lantern_staff_id = (
  SELECT p.staff_id
  FROM lantern_pilot_accounts p
  WHERE lower(trim(p.username)) = lower(trim(tms_identity_links.lantern_username))
  LIMIT 1
)
WHERE lantern_staff_id IS NULL;
