import { computeNextMilestone } from './locker-milestones.js';

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} economyKey
 * @param {string|null} submissionKey
 */
export async function fetchLockerProgress(db, economyKey, submissionKey) {
  if (!db || !economyKey) {
    return {
      available: false,
      reason: 'account_link_missing',
      missions_completed: 0,
      nuggets_earned_lifetime: 0,
      next_milestone: computeNextMilestone(0),
    };
  }

  const [missionRow, earnedRow] = await Promise.all([
    submissionKey
      ? db
          .prepare(
            "SELECT COUNT(*) AS c FROM lantern_mission_submissions WHERE character_name = ? AND LOWER(TRIM(status)) = 'accepted'"
          )
          .bind(submissionKey)
          .first()
      : Promise.resolve({ c: 0 }),
    db
      .prepare(
        'SELECT COALESCE(SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END), 0) AS earned FROM lantern_transactions WHERE character_name = ?'
      )
      .bind(economyKey)
      .first(),
  ]);

  const missionsCompleted = missionRow ? Number(missionRow.c) || 0 : 0;
  const nuggetsEarnedLifetime = earnedRow ? Number(earnedRow.earned) || 0 : 0;

  return {
    available: true,
    reason: null,
    missions_completed: missionsCompleted,
    nuggets_earned_lifetime: nuggetsEarnedLifetime,
    next_milestone: computeNextMilestone(nuggetsEarnedLifetime),
  };
}
