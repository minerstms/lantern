-- Prompt #211 — repair two System Admin poll approvals that never created lantern_polls
-- (INSERT omitted created_by_character NOT NULL). Idempotent via mission_submission_id.

INSERT INTO lantern_polls (
  id, mission_submission_id, question, choices_json, image_url,
  created_by_character, character_name, created_at, approved_at
)
SELECT
  'poll_211_' || substr(c.id, 10),
  'contrib:' || c.id,
  c.question,
  c.choices_json,
  CASE
    WHEN c.image_url IS NOT NULL AND substr(c.image_url, 1, 1) = '/'
      THEN 'https://tmslantern.org' || c.image_url
    ELSE c.image_url
  END,
  c.character_name,
  c.character_name,
  c.created_at,
  '2026-08-11T23:45:00.000Z'
FROM lantern_poll_contributions c
WHERE c.id IN (
  'pcontrib_1786491448361_sidoxjwb',
  'pcontrib_1786491679548_25c31nav'
)
AND NOT EXISTS (
  SELECT 1 FROM lantern_polls p
  WHERE p.mission_submission_id = 'contrib:' || c.id
);

UPDATE lantern_poll_contributions
SET status = 'approved',
    reviewed_at = '2026-08-11T23:45:00.000Z',
    reviewed_by = 'Prompt #211 publish repair'
WHERE id IN (
  'pcontrib_1786491448361_sidoxjwb',
  'pcontrib_1786491679548_25c31nav'
)
AND status != 'approved';
