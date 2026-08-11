-- Prompt #165 — WAVE 2 mission completions + seed authoritative mission definitions.
-- Additive only. No deletes of historical submissions/transactions.

CREATE TABLE IF NOT EXISTS lantern_mission_completions (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL,
  character_name TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  event_key TEXT NOT NULL,
  source_ref TEXT,
  submission_id TEXT,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lantern_mission_completions_event_key
  ON lantern_mission_completions (event_key);

CREATE INDEX IF NOT EXISTS idx_lantern_mission_completions_mission_character
  ON lantern_mission_completions (mission_id, character_name);

-- Daily Check-In (server claim; special UI)
INSERT OR IGNORE INTO lantern_missions (
  id, teacher_id, teacher_name, title, description, reward_amount, submission_type,
  audience, participant_scope, target_character_names, featured, active, archived, site_eligible,
  allows_text, allows_image, allows_video, allows_link, min_characters, created_at
) VALUES (
  'perm_daily_checkin', 'mr_radle', 'Mr. Radle',
  'Daily Check-In',
  'How are you starting today? Choose Ready, Okay, Tired, or Need a reset.',
  1, 'confirmation', 'school_mission', 'students', NULL, 1, 1, 0, 0,
  0, 0, 0, 0, 0, '2026-08-11T00:00:00.000Z'
);

-- First Game Played (auto on successful game_play -1)
INSERT OR IGNORE INTO lantern_missions (
  id, teacher_id, teacher_name, title, description, reward_amount, submission_type,
  audience, participant_scope, target_character_names, featured, active, archived, site_eligible,
  allows_text, allows_image, allows_video, allows_link, min_characters, created_at
) VALUES (
  'perm_first_game', 'mr_radle', 'Mr. Radle',
  'First Game Played',
  'Play any paid Lantern game once. Completes automatically after your first successful play starts.',
  1, 'confirmation', 'school_mission', 'students', NULL, 1, 1, 0, 0,
  0, 0, 0, 0, 0, '2026-08-11T00:00:00.000Z'
);

-- Grade Reflection (normal Review Queue text mission)
INSERT OR IGNORE INTO lantern_missions (
  id, teacher_id, teacher_name, title, description, reward_amount, submission_type,
  audience, participant_scope, target_character_names, featured, active, archived, site_eligible,
  allows_text, allows_image, allows_video, allows_link, min_characters, created_at
) VALUES (
  'perm_grade_reflection', 'mr_radle', 'Mr. Radle',
  'Grade Reflection',
  'Think about how your learning is going. Write one thing you are proud of and one thing you want to improve next.',
  1, 'text', 'school_mission', 'students', NULL, 0, 1, 0, 0,
  1, 0, 0, 0, 40, '2026-08-11T00:00:00.000Z'
);

-- Rename / polish existing First Photo Share row (preserve id + history)
UPDATE lantern_missions
SET title = 'First Photo Share',
    description = 'Share your first appropriate Lantern photo and add a short caption explaining what we are looking at.',
    submission_type = 'image_url',
    allows_text = 1,
    allows_image = 1,
    allows_video = 0,
    allows_link = 0,
    min_characters = 20,
    reward_amount = 1,
    active = 1,
    archived = 0
WHERE id = 'tmission_1773676581540_qzl0kx'
  AND reward_amount = 1;
