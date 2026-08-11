-- Prompt #204 — Canonical Thank a Teacher mission + send/audit ledger.
-- Additive only. Does not delete legacy localStorage thanks or any mission history.

CREATE TABLE IF NOT EXISTS lantern_thank_you_sends (
  id TEXT PRIMARY KEY,
  event_key TEXT NOT NULL,
  mission_id TEXT NOT NULL,
  character_name TEXT NOT NULL,
  student_display_label TEXT,
  tms_staff_id TEXT NOT NULL,
  recipient_display_label TEXT NOT NULL,
  message TEXT NOT NULL,
  send_status TEXT NOT NULL,
  provider_message_id TEXT,
  submission_id TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lantern_thank_you_sends_event_key
  ON lantern_thank_you_sends (event_key);

CREATE INDEX IF NOT EXISTS idx_lantern_thank_you_sends_character_created
  ON lantern_thank_you_sends (character_name, created_at);

CREATE INDEX IF NOT EXISTS idx_lantern_thank_you_sends_staff_created
  ON lantern_thank_you_sends (tms_staff_id, created_at);

-- Canonical school mission: one successful send per student per Denver school day.
INSERT OR IGNORE INTO lantern_missions (
  id, teacher_id, teacher_name, title, description, reward_amount, submission_type,
  audience, participant_scope, target_character_names, featured, active, archived, site_eligible,
  allows_text, allows_image, allows_video, allows_link, min_characters, created_at
) VALUES (
  'perm_thank_you', 'mr_radle', 'Mr. Radle',
  'Thank a Teacher',
  'Choose a staff member, write a short thank-you, and send it. Completes when the email is sent (+1 Nugget).',
  1, 'confirmation', 'school_mission', 'students', NULL, 1, 1, 0, 0,
  1, 0, 0, 0, 10, '2026-08-11T12:00:00.000Z'
);
