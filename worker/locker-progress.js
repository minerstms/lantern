import { computeNextMilestone } from './locker-milestones.js';
import { tmsEconomyBalance } from './tms-economy-bridge.js';

/**
 * Prompt #96: "Nuggets Earned" is a Nugget figure, so it must come from the one authoritative
 * TMS Nuggets ledger, not from summing Lantern's own (now-legacy) lantern_transactions table.
 * When `env` is supplied and this student resolves to a real TMS student, lifetime-earned comes
 * from TMS's `earned` field (same ledger the Teacher Nuggets panel and Store/Locker balance read).
 * Falls back to the local sum only for accounts that are not real TMS students (demo/persona
 * characters, local dev/test fixtures) so those keep working without a live TMS student record.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} economyKey
 * @param {string|null} submissionKey
 * @param {any} [env] optional -- enables the TMS-backed lifetime-earned figure when provided
 */
export async function fetchLockerProgress(db, economyKey, submissionKey, env) {
  if (!db || !economyKey) {
    return {
      available: false,
      reason: 'account_link_missing',
      missions_completed: 0,
      nuggets_earned_lifetime: 0,
      next_milestone: computeNextMilestone(0),
    };
  }

  const [missionRow, tms] = await Promise.all([
    submissionKey
      ? db
          .prepare(
            "SELECT COUNT(*) AS c FROM lantern_mission_submissions WHERE character_name = ? AND LOWER(TRIM(status)) = 'accepted'"
          )
          .bind(submissionKey)
          .first()
      : Promise.resolve({ c: 0 }),
    env ? tmsEconomyBalance(env, economyKey) : Promise.resolve({ ok: false, notFound: true }),
  ]);

  const missionsCompleted = missionRow ? Number(missionRow.c) || 0 : 0;

  let nuggetsEarnedLifetime;
  if (tms && tms.ok) {
    nuggetsEarnedLifetime = Number(tms.earned) || 0;
  } else {
    const earnedRow = await db
      .prepare(
        'SELECT COALESCE(SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END), 0) AS earned FROM lantern_transactions WHERE character_name = ?'
      )
      .bind(economyKey)
      .first();
    nuggetsEarnedLifetime = earnedRow ? Number(earnedRow.earned) || 0 : 0;
  }

  return {
    available: true,
    reason: null,
    missions_completed: missionsCompleted,
    nuggets_earned_lifetime: nuggetsEarnedLifetime,
    nuggets_available: tms && tms.ok ? Number(tms.available) || 0 : null,
    economy_authority: tms && tms.ok ? 'tms_nuggets' : 'lantern_legacy',
    next_milestone: computeNextMilestone(nuggetsEarnedLifetime),
  };
}
