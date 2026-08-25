/**
 * READ-ONLY production diagnostic for stuck Poll review rows (#260).
 * Usage: node worker/scripts/stuck-poll-review-260-diagnostic.mjs
 */
console.log(`
#260 Stuck Poll review diagnostic (READ-ONLY — do not write)

## A. Pending approvals with non-pending contributions (stale queue rows)
SELECT a.id AS approval_id, a.item_type, a.item_id, a.status AS approval_status, a.created_at,
       pc.question, pc.status AS contribution_status, pc.reviewed_at, pc.reviewed_by
FROM lantern_approvals a
LEFT JOIN lantern_poll_contributions pc ON pc.id = a.item_id
WHERE LOWER(TRIM(a.status)) = 'pending'
  AND a.item_type = 'poll_contribution'
  AND (pc.id IS NULL OR LOWER(TRIM(pc.status)) != 'pending');

## B. Unresolved flags on published polls (reported queue)
SELECT f.id AS flag_id, f.item_type, f.item_id, f.reason, f.created_at, f.resolved_at,
       p.question, p.hidden_at, p.hidden_by, p.mission_submission_id
FROM lantern_content_flags f
LEFT JOIN lantern_polls p ON p.id = f.item_id AND f.item_type = 'poll'
WHERE (f.resolved_at IS NULL OR TRIM(f.resolved_at) = '')
  AND (f.item_type = 'poll' OR f.item_type = 'poll_contribution');

## C. Orphan unresolved flags on contribution ids with live poll link
SELECT f.id, f.item_type, f.item_id, f.reason, p.id AS live_poll_id, p.question
FROM lantern_content_flags f
JOIN lantern_poll_contributions pc ON pc.id = f.item_id AND f.item_type = 'poll_contribution'
LEFT JOIN lantern_polls p ON p.mission_submission_id = ('contrib:' || pc.id)
WHERE (f.resolved_at IS NULL OR TRIM(f.resolved_at) = '');

## D. Moderation events for suspected stuck items (staff action already taken?)
SELECT item_type, item_id, event_type, actor_label, created_at, note
FROM lantern_moderation_events
WHERE item_type IN ('poll', 'poll_contribution')
ORDER BY created_at DESC
LIMIT 50;
`);

process.exit(0);
