/**
 * Prompt #224 — student daily content-creation Nugget caps (Denver school day).
 *
 * NEWS / SHOUT-OUT / POLL: first legitimate publish/approval per type per day may award +1.
 * Later same-type same day: publish still allowed, +0 Nuggets.
 * Staff/teacher/admin: no student-style creation farming reward.
 * Rejected/pending: not awarded (call only after canonical publish).
 *
 * Idempotency: deterministic lantern_transactions id + TMS reference from event key.
 * Does not rewrite historical rows; does not block additional content.
 */
import { denverLocalDateYYYYMMDD, SCHOOL_SCHEDULE_TIMEZONE } from './school-schedule.js';
import { isStaffEconomyKey } from './staff-economy.js';
import { tmsEconomyTransact } from './tms-economy-bridge.js';

export const CONTENT_CREATION_REWARD_TYPES = ['news', 'shoutout', 'poll'];

const TYPE_NOTES = {
  news: 'News creation (daily first)',
  shoutout: 'Shout-Out creation (daily first)',
  poll: 'Poll creation (daily first)',
};

function safeKeyPart(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100);
}

export function contentRewardEventKey(type, characterName, dayYYYYMMDD) {
  const t = String(type || '').trim().toLowerCase();
  const who = String(characterName || '').trim();
  const day = String(dayYYYYMMDD || '').trim();
  return `content_reward:${t}:${who}:${day}`;
}

export function contentRewardTxId(eventKey) {
  const safe = safeKeyPart(eventKey) || 'unknown';
  return `tx_content_${safe}`.slice(0, 180);
}

export function contentRewardReference(eventKey) {
  return `lantern:${String(eventKey || '').trim()}`;
}

/**
 * Student-only gate. Staff economy keys and teacher/staff/admin author_type are ineligible.
 */
export function isStudentContentRewardRecipient(characterName, authorType) {
  const key = String(characterName || '').trim();
  if (!key) return false;
  if (isStaffEconomyKey(key)) return false;
  const at = String(authorType || '').trim().toLowerCase();
  if (['teacher', 'staff', 'admin'].includes(at)) return false;
  return true;
}

export async function findContentCreationRewardTx(db, eventKey) {
  const txId = contentRewardTxId(eventKey);
  try {
    return (
      (await db
        .prepare('SELECT id, character_name, delta, kind, created_at FROM lantern_transactions WHERE id = ?')
        .bind(txId)
        .first()) || null
    );
  } catch (_) {
    return null;
  }
}

/**
 * Award at most +1 Nugget for the first eligible student publish of this type today.
 * Concurrent retries share the same deterministic tx id / TMS reference.
 */
export async function awardStudentDailyContentCreationReward(db, env, opts) {
  const type = String((opts && opts.type) || '').trim().toLowerCase();
  const characterName = String((opts && opts.characterName) || '').trim();
  const authorType = opts && opts.authorType != null ? String(opts.authorType).trim() : '';
  const sourceRef = opts && opts.sourceRef != null ? String(opts.sourceRef).trim().slice(0, 200) : null;
  const now = opts && opts.now ? new Date(opts.now) : new Date();

  if (!CONTENT_CREATION_REWARD_TYPES.includes(type)) {
    return { ok: false, error: 'unknown_content_type' };
  }
  if (!characterName) {
    return { ok: false, error: 'missing_identity' };
  }
  if (!isStudentContentRewardRecipient(characterName, authorType)) {
    return {
      ok: true,
      rewarded: false,
      skipped_staff: true,
      event_key: null,
      day: denverLocalDateYYYYMMDD(now),
      timezone: SCHOOL_SCHEDULE_TIMEZONE,
    };
  }

  const day = denverLocalDateYYYYMMDD(now);
  const eventKey = contentRewardEventKey(type, characterName, day);
  const txId = contentRewardTxId(eventKey);
  const reference = contentRewardReference(eventKey);
  const note = TYPE_NOTES[type] || 'Content creation (daily first)';

  const existing = await findContentCreationRewardTx(db, eventKey);
  if (existing) {
    return {
      ok: true,
      rewarded: false,
      idempotent: true,
      capped: true,
      event_key: eventKey,
      day,
      timezone: SCHOOL_SCHEDULE_TIMEZONE,
      tx_id: existing.id,
    };
  }

  let rewarded = false;
  let idempotent = false;
  let economyAuthority = 'lantern_wallet';

  if (env) {
    const tms = await tmsEconomyTransact(env, characterName, 1, 'content_creation', 'CONTENT', note, reference);
    if (tms.ok) {
      rewarded = !tms.idempotent;
      idempotent = !!tms.idempotent;
      economyAuthority = 'tms_nuggets';
      const iso = now.toISOString();
      try {
        await db
          .prepare(
            'INSERT INTO lantern_transactions (id, character_name, delta, kind, source, note, created_at, meta_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
          )
          .bind(
            txId,
            characterName,
            1,
            'content_creation',
            'CONTENT',
            note,
            iso,
            JSON.stringify({
              event_key: eventKey,
              content_type: type,
              day,
              timezone: SCHOOL_SCHEDULE_TIMEZONE,
              source_ref: sourceRef,
              tms_reference: reference,
              tms_backed: true,
            })
          )
          .run();
      } catch (e) {
        const again = await findContentCreationRewardTx(db, eventKey);
        if (again) {
          return {
            ok: true,
            rewarded: false,
            idempotent: true,
            capped: true,
            event_key: eventKey,
            day,
            timezone: SCHOOL_SCHEDULE_TIMEZONE,
            tx_id: again.id,
            economy_authority: economyAuthority,
          };
        }
        // TMS already credited; surface without failing the publish path.
        return {
          ok: true,
          rewarded: rewarded || idempotent,
          idempotent,
          event_key: eventKey,
          day,
          timezone: SCHOOL_SCHEDULE_TIMEZONE,
          tx_id: txId,
          economy_authority: economyAuthority,
          mirror_insert_failed: true,
          detail: String(e && e.message ? e.message : e),
        };
      }
      return {
        ok: true,
        rewarded,
        idempotent,
        capped: idempotent,
        event_key: eventKey,
        day,
        timezone: SCHOOL_SCHEDULE_TIMEZONE,
        tx_id: txId,
        economy_authority: economyAuthority,
      };
    }
    if (!tms.notFound) {
      return { ok: false, error: tms.error || 'reward_credit_failed', event_key: eventKey, day };
    }
    // not a TMS student → legacy wallet
  }

  const iso = now.toISOString();
  const meta = JSON.stringify({
    event_key: eventKey,
    content_type: type,
    day,
    timezone: SCHOOL_SCHEDULE_TIMEZONE,
    source_ref: sourceRef,
    idempotency_key: eventKey,
  });

  try {
    const walletRow = await db.prepare('SELECT balance FROM lantern_wallets WHERE character_name = ?').bind(characterName).first();
    const currentBalance = walletRow ? Number(walletRow.balance) || 0 : 0;
    await db.batch([
      db
        .prepare(
          'INSERT INTO lantern_transactions (id, character_name, delta, kind, source, note, created_at, meta_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .bind(txId, characterName, 1, 'content_creation', 'CONTENT', note, iso, meta),
      db
        .prepare(
          'INSERT INTO lantern_wallets (character_name, balance, updated_at) VALUES (?, ?, ?) ON CONFLICT(character_name) DO UPDATE SET balance = balance + ?, updated_at = ?'
        )
        .bind(characterName, currentBalance + 1, iso, 1, iso),
    ]);
    rewarded = true;
  } catch (e) {
    const again = await findContentCreationRewardTx(db, eventKey);
    if (again) {
      return {
        ok: true,
        rewarded: false,
        idempotent: true,
        capped: true,
        event_key: eventKey,
        day,
        timezone: SCHOOL_SCHEDULE_TIMEZONE,
        tx_id: again.id,
        economy_authority: 'lantern_wallet',
      };
    }
    return { ok: false, error: 'reward_insert_failed', detail: String(e && e.message ? e.message : e), event_key: eventKey, day };
  }

  return {
    ok: true,
    rewarded,
    idempotent: false,
    capped: false,
    event_key: eventKey,
    day,
    timezone: SCHOOL_SCHEDULE_TIMEZONE,
    tx_id: txId,
    economy_authority: 'lantern_wallet',
  };
}
