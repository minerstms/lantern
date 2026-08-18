/**
 * Prompt #169 / #229 — Poll completion Nugget: configured amount once per poll per account.
 * Default/fallback is 0 (no TMS credit). Idempotency remains per poll + account.
 *
 * TMS references are globally unique, so the key MUST include the account:
 *   lantern:poll_complete:<poll_id>:<account_key>
 *
 * Staff participants use the TMS staff ledger. Unlinked staff never get a
 * fake lantern_wallets success. Vote persistence is independent of reward.
 */
import { applyAuthoritativeNuggetDelta } from './tms-economy-apply.js';
import { isKnownDemoPersonaName } from './demo-persona-guard.js';
import { resolveEconomyAmount } from './nugget-economy-settings.js';

export function pollCompleteReference(pollId, characterName) {
  const poll = String(pollId || '').trim();
  const who = String(characterName || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, '_');
  return 'lantern:poll_complete:' + poll + ':' + who;
}

export async function creditPollCompletionReward(db, env, pollId, characterName) {
  const poll = String(pollId || '').trim();
  const who = String(characterName || '').trim();
  if (!poll || !who) {
    return { ok: false, status: 'failed', error: 'missing_identity', voter_nuggets: 0 };
  }
  if (!db) {
    return { ok: false, status: 'failed', error: 'db_required', voter_nuggets: 0 };
  }

  const existing = await db
    .prepare('SELECT id FROM lantern_poll_voter_rewards WHERE poll_id = ? AND character_name = ?')
    .bind(poll, who)
    .first();
  if (existing) {
    return { ok: true, status: 'already', voter_nuggets: 0 };
  }

  const amount = await resolveEconomyAmount(db, 'poll_response');
  if (amount === 0) {
    const nowZero = new Date().toISOString();
    const rewardIdZero = 'pvr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
    try {
      await db
        .prepare(
          'INSERT INTO lantern_poll_voter_rewards (id, poll_id, character_name, created_at) VALUES (?, ?, ?, ?)'
        )
        .bind(rewardIdZero, poll, who, nowZero)
        .run();
    } catch (e) {
      if (!(e && /UNIQUE/i.test(String(e.message || e)))) throw e;
    }
    return { ok: true, status: 'skipped', voter_nuggets: 0 };
  }

  const applied = await applyAuthoritativeNuggetDelta(db, env, {
    characterName: who,
    delta: amount,
    kind: 'poll_complete',
    source: 'POLL',
    note: 'Poll participation',
    reference: pollCompleteReference(poll, who),
    meta: { poll_id: poll },
    // Production authenticated principals fail closed. Known demo personas may still
    // use isolated lantern_wallets; they are never a production spendable authority.
    allowLegacyWallet: isKnownDemoPersonaName(who),
  });

  if (!applied.ok) {
    return {
      ok: false,
      status: applied.status || 'failed',
      error: applied.error || 'reward_failed',
      voter_nuggets: 0,
    };
  }

  const now = new Date().toISOString();
  const rewardId = 'pvr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
  try {
    await db
      .prepare(
        'INSERT INTO lantern_poll_voter_rewards (id, poll_id, character_name, created_at) VALUES (?, ?, ?, ?)'
      )
      .bind(rewardId, poll, who, now)
      .run();
  } catch (e) {
    if (!(e && /UNIQUE/i.test(String(e.message || e)))) throw e;
  }

  return {
    ok: true,
    status: applied.status === 'legacy' ? 'granted' : applied.status,
    voter_nuggets: amount,
    authority: applied.authority,
  };
}

export function pollRewardResponseFields(reward) {
  reward = reward || {};
  const amount = Number(reward.voter_nuggets) || 0;
  const newlyGranted = !!(
    reward.ok &&
    amount &&
    reward.status !== 'already' &&
    reward.status !== 'skipped'
  );
  return {
    voter_nuggets: newlyGranted ? amount : 0,
    reward_status: reward.status || 'none',
    reward_error: reward.ok ? null : reward.error || null,
  };
}
