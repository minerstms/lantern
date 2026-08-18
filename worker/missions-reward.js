import { tmsEconomyTransact, tmsStaffEconomyTransact } from './tms-economy-bridge.js';
import { isStaffEconomyKey, resolveStaffTmsPrincipal } from './staff-economy.js';

/**
 * Server-authoritative mission approval rewards — exactly-once (Prompt #66).
 * Prompt #96: TMS Nuggets is the one authoritative Nugget ledger. When `env` is supplied and this
 * student resolves to a real TMS student, the reward is granted there first (idempotent by
 * `lantern:mission_reward:<submission_id>`); the local lantern_transactions row becomes a mirror
 * record (still written, so achievements/history keep working) rather than the source of truth.
 * Falls back to the legacy Lantern-only wallet unchanged for ids that are not real TMS students
 * (demo/persona characters, local dev/test fixtures) -- same exactly-once guarantee either way.
 * Prompt #107: staff:<username> recipients pay out to the linked TMS staff principal ledger.
 */

export function missionRewardTxId(submissionId) {
  return `tx_mission_${String(submissionId || '').trim()}`;
}

export function missionRewardReference(submissionId) {
  return `lantern:mission_reward:${String(submissionId || '').trim()}`;
}

export async function findMissionRewardTx(db, submissionId) {
  const txId = missionRewardTxId(submissionId);
  const row = await db
    .prepare('SELECT id, character_name, delta, kind, created_at FROM lantern_transactions WHERE id = ?')
    .bind(txId)
    .first();
  return row || null;
}

/**
 * Credit mission approval Nuggets. Idempotent via deterministic transaction id (legacy path) and
 * via the TMS bridge reference (TMS-backed path) -- either way, exactly once per submissionId.
 * `env`/`tmsEconomyTransact` are optional so existing local/test callers keep working unchanged.
 */
export async function creditMissionApprovalReward(db, characterName, submissionId, rewardAmount, note, opts) {
  const key = String(characterName || '').trim();
  const sid = String(submissionId || '').trim();
  // Prompt #229: payout is the saved mission reward (teacher-chosen, server-clamped).
  // Event missions still pass 1. Historical txs stay on their original delta.
  let reward = Math.trunc(Number(rewardAmount));
  if (!Number.isFinite(reward) || reward < 0) reward = 1;
  if (reward > 5) reward = 5;
  if (!key || !sid) {
    return { ok: false, error: 'missing_identity' };
  }
  if (reward === 0) {
    return {
      ok: true,
      skipped: true,
      idempotent: true,
      id: missionRewardTxId(sid),
      character_name: key,
      delta: 0,
      balance_after: null,
    };
  }

  const env = opts && opts.env;
  if (env) {
    // Prompt #107 — staff participant rewards go to TMS staff principal, never a fake student row.
    if (isStaffEconomyKey(key)) {
      const staffPrincipal = await resolveStaffTmsPrincipal(db, key);
      if (!staffPrincipal.ok) {
        return { ok: false, error: 'tms_identity_not_linked' };
      }
      const staffTx = await tmsStaffEconomyTransact(
        env,
        staffPrincipal.tmsStaffId,
        reward,
        'lantern_mission_reward',
        'APPROVAL',
        note || 'Teacher mission approved',
        missionRewardReference(sid)
      );
      if (!staffTx.ok) {
        return { ok: false, error: staffTx.error || 'reward_credit_failed' };
      }
      return {
        ok: true,
        idempotent: !!staffTx.idempotent,
        id: missionRewardTxId(sid),
        character_name: key,
        delta: staffTx.delta,
        balance_after: staffTx.available,
        economy_authority: 'tms_nuggets_staff',
      };
    }
    const tms = await tmsEconomyTransact(env, key, reward, 'lantern_mission_reward', 'APPROVAL', note || 'Teacher mission approved', missionRewardReference(sid));
    if (tms.ok) {
      return {
        ok: true,
        idempotent: !!tms.idempotent,
        id: missionRewardTxId(sid),
        character_name: key,
        delta: tms.delta,
        balance_after: tms.available,
        economy_authority: 'tms_nuggets',
      };
    }
    if (!tms.notFound) {
      return { ok: false, error: tms.error || 'reward_credit_failed' };
    }
    // tms.notFound === true -> not a real TMS student; fall through to the legacy wallet path.
  }

  const txId = missionRewardTxId(sid);
  const existing = await findMissionRewardTx(db, sid);
  if (existing) {
    return {
      ok: true,
      idempotent: true,
      id: existing.id,
      character_name: existing.character_name || key,
      delta: Number(existing.delta) || reward,
      balance_after: null,
    };
  }

  const now = new Date().toISOString();
  const walletRow = await db.prepare('SELECT balance FROM lantern_wallets WHERE character_name = ?').bind(key).first();
  const currentBalance = walletRow ? Number(walletRow.balance) || 0 : 0;
  const meta = JSON.stringify({ mission_submission_id: sid, idempotency_key: sid });

  try {
    await db.batch([
      db
        .prepare(
          'INSERT INTO lantern_transactions (id, character_name, delta, kind, source, note, created_at, meta_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .bind(txId, key, reward, 'teacher_mission', 'APPROVAL', note || 'Teacher mission approved', now, meta),
      db
        .prepare(
          'INSERT INTO lantern_wallets (character_name, balance, updated_at) VALUES (?, ?, ?) ON CONFLICT(character_name) DO UPDATE SET balance = balance + ?, updated_at = ?'
        )
        .bind(key, currentBalance + reward, now, reward, now),
    ]);
  } catch (e) {
    const again = await findMissionRewardTx(db, sid);
    if (again) {
      return {
        ok: true,
        idempotent: true,
        id: again.id,
        character_name: again.character_name || key,
        delta: Number(again.delta) || reward,
        balance_after: null,
      };
    }
    return { ok: false, error: 'reward_credit_failed', detail: String(e && e.message ? e.message : e) };
  }

  return {
    ok: true,
    idempotent: false,
    id: txId,
    character_name: key,
    delta: reward,
    balance_after: currentBalance + reward,
    economy_authority: 'lantern_legacy',
  };
}

/**
 * Prompt #8 — prior accepted submission for the same mission+participant (excludes `excludeId`).
 * Used so a redo approval can accept content without paying a second once-ever Nugget.
 */
export async function findPriorAcceptedMissionSubmission(db, missionId, characterName, excludeId) {
  const mid = String(missionId || '').trim();
  const key = String(characterName || '').trim();
  const exclude = String(excludeId || '').trim();
  if (!mid || !key) return null;
  try {
    return (
      (await db
        .prepare(
          "SELECT id, created_at FROM lantern_mission_submissions WHERE mission_id = ? AND character_name = ? AND status = 'accepted' AND id != ? ORDER BY created_at ASC LIMIT 1"
        )
        .bind(mid, key, exclude || '')
        .first()) || null
    );
  } catch (_) {
    return null;
  }
}

/**
 * Accept submission (pending → accepted) and credit reward atomically in sequence.
 * Reverts acceptance if reward credit fails.
 * Prompt #8 — redo submissions remain reviewable; once a prior accepted row exists for the
 * same mission+participant, acceptance succeeds with +0 (reward cadence already consumed).
 */
export async function approveMissionWithReward(db, opts) {
  const {
    submissionId,
    recipientCharacterName,
    rewardAmount,
    reviewerLabel,
    revertOnRewardFailure,
    env,
    skipReward,
  } = opts;
  const creditOpts = { env };
  const id = String(submissionId || '').trim();
  const now = new Date().toISOString();
  const reviewer = String(reviewerLabel || 'Teacher').trim();

  const row = await db
    .prepare('SELECT id, status, character_name, mission_id FROM lantern_mission_submissions WHERE id = ?')
    .bind(id)
    .first();
  if (!row) {
    return { ok: false, code: 404, error: 'Not found' };
  }

  const characterKey = String(row.character_name || recipientCharacterName || '').trim();
  const missionId = String(row.mission_id || '').trim();
  let rewardSkipped = !!skipReward;
  if (!rewardSkipped && missionId && characterKey) {
    const prior = await findPriorAcceptedMissionSubmission(db, missionId, characterKey, id);
    if (prior) rewardSkipped = true;
  }

  const status = String(row.status || '').trim();
  if (status === 'accepted') {
    if (rewardSkipped) {
      return {
        ok: true,
        idempotent: true,
        character_name: row.character_name,
        nuggets: 0,
        rewarded: false,
        reward_skipped: true,
        reward_idempotent: true,
      };
    }
    const reward = await creditMissionApprovalReward(
      db,
      row.character_name || recipientCharacterName,
      id,
      rewardAmount,
      'Teacher mission approved',
      creditOpts
    );
    if (!reward.ok) {
      return { ok: false, code: 500, error: reward.error || 'reward_failed', accepted_without_reward: true };
    }
    return {
      ok: true,
      idempotent: true,
      character_name: row.character_name,
      nuggets: reward.delta,
      rewarded: !reward.idempotent,
      reward_idempotent: !!reward.idempotent,
    };
  }

  if (status !== 'pending') {
    return { ok: false, code: 400, error: 'Can only approve pending submissions' };
  }

  const upd = await db
    .prepare(
      'UPDATE lantern_mission_submissions SET status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ? AND status = ?'
    )
    .bind('accepted', reviewer, now, id, 'pending')
    .run();

  const changes = upd && upd.meta ? Number(upd.meta.changes) || 0 : 0;
  if (changes === 0) {
    const again = await db.prepare('SELECT status, character_name FROM lantern_mission_submissions WHERE id = ?').bind(id).first();
    if (again && String(again.status) === 'accepted') {
      if (rewardSkipped) {
        return {
          ok: true,
          idempotent: true,
          character_name: again.character_name,
          nuggets: 0,
          rewarded: false,
          reward_skipped: true,
          reward_idempotent: true,
        };
      }
      const reward = await creditMissionApprovalReward(
        db,
        again.character_name || recipientCharacterName,
        id,
        rewardAmount,
        'Teacher mission approved',
        creditOpts
      );
      if (!reward.ok) {
        return { ok: false, code: 500, error: reward.error || 'reward_failed', accepted_without_reward: true };
      }
      return {
        ok: true,
        idempotent: true,
        character_name: again.character_name,
        nuggets: reward.delta,
        rewarded: !reward.idempotent,
        reward_idempotent: !!reward.idempotent,
      };
    }
    return { ok: false, code: 409, error: 'approval_conflict' };
  }

  if (rewardSkipped) {
    return {
      ok: true,
      idempotent: false,
      character_name: recipientCharacterName || row.character_name,
      nuggets: 0,
      rewarded: false,
      reward_skipped: true,
      reward_idempotent: true,
    };
  }

  const credit = await creditMissionApprovalReward(
    db,
    recipientCharacterName || row.character_name,
    id,
    rewardAmount,
    'Teacher mission approved',
    creditOpts
  );

  if (!credit.ok && revertOnRewardFailure !== false) {
    // Prompt #13 — staff without a TMS principal link are reward-ineligible: keep acceptance
    // published (+0) rather than reverting into the student review queue.
    if (
      credit.error === 'tms_identity_not_linked' &&
      isStaffEconomyKey(recipientCharacterName || row.character_name)
    ) {
      return {
        ok: true,
        idempotent: false,
        character_name: recipientCharacterName || row.character_name,
        nuggets: 0,
        rewarded: false,
        reward_skipped: true,
        reward_skip_reason: 'tms_identity_not_linked',
        reward_idempotent: true,
      };
    }
    const rev = await db
      .prepare(
        'UPDATE lantern_mission_submissions SET status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ? AND status = ?'
      )
      .bind('pending', null, null, id, 'accepted')
      .run();
    const revChanges = rev && rev.meta ? Number(rev.meta.changes) || 0 : 0;
    if (revChanges === 0) {
      const cur = await db.prepare('SELECT status FROM lantern_mission_submissions WHERE id = ?').bind(id).first();
      if (cur && String(cur.status) === 'accepted') {
        return {
          ok: false,
          code: 500,
          error: credit.error || 'reward_failed',
          accepted_without_reward: true,
          revert_failed: true,
        };
      }
    }
    return { ok: false, code: 500, error: credit.error || 'reward_failed' };
  }

  if (!credit.ok) {
    return { ok: false, code: 500, error: credit.error || 'reward_failed', accepted_without_reward: true };
  }

  return {
    ok: true,
    idempotent: false,
    character_name: recipientCharacterName || row.character_name,
    nuggets: credit.delta,
    balance_after: credit.balance_after,
    rewarded: !credit.idempotent,
    reward_idempotent: !!credit.idempotent,
  };
}
