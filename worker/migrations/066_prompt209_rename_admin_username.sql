-- Prompt #209 — rename privileged admin login Rick Radle → admin (preserve password hash/salt).
-- Constraints: FK(tms_identity_links.lantern_username), UNIQUE(email), UNIQUE(staff_id).
-- Strategy: free unique fields on source → insert renamed row → retarget link → delete source.

UPDATE lantern_pilot_accounts
SET email = NULL,
    staff_id = NULL,
    updated_at = datetime('now')
WHERE username = 'Rick Radle'
  AND staff_id = 1
  AND lower(trim(role)) = 'admin'
  AND NOT EXISTS (
    SELECT 1 FROM lantern_pilot_accounts WHERE lower(trim(username)) = 'admin'
  );

INSERT INTO lantern_pilot_accounts (
  username, display_name, role, password_hash, password_salt, student_character_name, teacher_id, updated_at,
  is_active, student_must_change_password, must_change_password, password_changed_at, password_reset_at, password_reset_by,
  mtss_student_id, bio, first_name, last_name, staff_id, email
)
SELECT
  'admin',
  'Web Admin',
  role,
  password_hash,
  password_salt,
  student_character_name,
  teacher_id,
  datetime('now'),
  is_active,
  student_must_change_password,
  must_change_password,
  password_changed_at,
  password_reset_at,
  password_reset_by,
  mtss_student_id,
  bio,
  'Web',
  'Admin',
  1,
  'rick.radle@trinidad.k12.co.us'
FROM lantern_pilot_accounts
WHERE username = 'Rick Radle'
  AND lower(trim(role)) = 'admin'
  AND staff_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM lantern_pilot_accounts WHERE lower(trim(username)) = 'admin'
  );

UPDATE tms_identity_links
SET lantern_username = 'admin',
    lantern_staff_id = 1
WHERE id = 1
  AND tms_staff_id = 'Radle'
  AND lantern_username = 'Rick Radle'
  AND is_primary = 0
  AND EXISTS (
    SELECT 1 FROM lantern_pilot_accounts WHERE username = 'admin' AND staff_id = 1
  );

DELETE FROM lantern_pilot_accounts
WHERE username = 'Rick Radle'
  AND lower(trim(role)) = 'admin'
  AND EXISTS (
    SELECT 1 FROM lantern_pilot_accounts WHERE username = 'admin' AND staff_id = 1
  )
  AND NOT EXISTS (
    SELECT 1 FROM tms_identity_links WHERE lantern_username = 'Rick Radle'
  );
