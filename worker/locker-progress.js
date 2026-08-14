import { fetchAuthoritativeEconomySnapshot } from './tms-economy-apply.js';

/**
 * Locker progress: missions completed + authoritative TMS lifetime earned when available.
 * Does not invent a spendable balance or a 0/50 milestone from a failed lookup.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} economyKey
 * @param {string|null} submissionKey
 * @param {any} [env] optional -- enables TMS-backed lifetime-earned when provided
 */
export async function fetchLockerProgress(db, economyKey, submissionKey, env) {
  if (!db || !economyKey) {
    return {
      available: false,
      reason: 'account_link_missing',
      missions_completed: 0,
      nuggets_earned_lifetime: null,
      nuggets_available: null,
      economy_authority: null,
      next_milestone: null,
    };
  }

  const [missionRow, snap] = await Promise.all([
    submissionKey
      ? db
          .prepare(
            "SELECT COUNT(*) AS c FROM lantern_mission_submissions WHERE character_name = ? AND LOWER(TRIM(status)) = 'accepted'"
          )
          .bind(submissionKey)
          .first()
      : Promise.resolve({ c: 0 }),
    env ? fetchAuthoritativeEconomySnapshot(env, db, economyKey) : Promise.resolve({ ok: false }),
  ]);

  const missionsCompleted = missionRow ? Number(missionRow.c) || 0 : 0;
  const tmsOk = !!(snap && snap.ok && snap.available != null);

  return {
    available: true,
    reason: null,
    missions_completed: missionsCompleted,
    nuggets_earned_lifetime: tmsOk && snap.earned != null ? snap.earned : null,
    nuggets_available: tmsOk ? snap.available : null,
    economy_authority: tmsOk ? snap.authority : null,
    next_milestone: null,
  };
}
