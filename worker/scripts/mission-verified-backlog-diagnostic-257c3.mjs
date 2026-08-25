/**
 * Prompt #257C3 — READ-ONLY production backlog diagnostic (plan only; do not write).
 *
 * Safe usage (requires approved read-only D1 access):
 *   npx wrangler d1 execute lantern-db --remote --command "SELECT ..."
 *
 * This script runs locally against mock/empty DB to validate query shapes only.
 * For production, run the SQL blocks below via approved read-only wrangler/DB console.
 *
 * Usage: node worker/scripts/mission-verified-backlog-diagnostic-257c3.mjs
 */

console.log(`
#257C3 Verified-activity backlog diagnostic (READ-ONLY)

## 1. Pending mission rows by mission (human vs verified run-state)
SELECT mission_id, status, COUNT(*) AS c
FROM lantern_mission_submissions
WHERE LOWER(TRIM(status)) = 'pending'
GROUP BY mission_id, status
ORDER BY c DESC;

## 2. Verified trivia run-state rows (legacy pending OR run_active)
SELECT id, mission_id, character_name, status, created_at,
  json_extract(submission_content, '$.type') AS content_type,
  json_extract(submission_content, '$.run_id') AS run_id
FROM lantern_mission_submissions
WHERE json_extract(submission_content, '$.type') = 'trivia_run'
   OR status IN ('run_active', 'run_complete')
ORDER BY created_at DESC;

## 3. Authoritative completions for trivia missions
SELECT mission_id, character_name, event_key, source_ref, submission_id, created_at
FROM lantern_mission_completions
WHERE mission_id IN (
  'perm_handbook_trivia',
  'perm_local_history_trivia',
  'perm_srp_safety',
  'perm_seven_habits'
)
ORDER BY created_at DESC;

## 4. Reward already credited for completion submission ids
SELECT t.character_name, t.id AS tx_id, t.delta, t.note, t.created_at
FROM lantern_transactions t
WHERE t.kind = 'mission_reward'
  AND t.id LIKE 'tx_mission_msub_evt_%'
ORDER BY t.created_at DESC;

## 5. Ambiguous rows (pending, NOT trivia_run, confirmation type on verified missions)
SELECT s.id, s.mission_id, s.character_name, s.submission_type, s.status, s.created_at
FROM lantern_mission_submissions s
WHERE LOWER(TRIM(s.status)) = 'pending'
  AND s.mission_id IN (
    'perm_handbook_trivia',
    'perm_local_history_trivia',
    'perm_srp_safety',
    'perm_seven_habits'
  )
  AND (json_extract(s.submission_content, '$.type') IS NULL
       OR json_extract(s.submission_content, '$.type') != 'trivia_run');

## Backlog cleanup plan (DO NOT RUN without approval)
For each row from query #2 tied to run_id R and character C:
  A) If lantern_mission_completions has matching source_ref=R OR event_key contains R
     AND tx_mission_msub_evt_* exists → mark row resolved (status=run_complete), NO new reward.
  B) If completion exists but NO reward tx → award once via existing creditMissionApprovalReward
     using completion.submission_id, then resolve row.
  C) If no completion proof → leave for human review (fail closed).
Never auto-process submission_type=text/image/video or non-verified mission_ids.
`);

process.exit(0);
