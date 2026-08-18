/**
 * Prompt #230 — Hidden Nugget daily treasure hunt.
 *
 * One assignment per eligible student per America/Denver school day.
 * Assignment is a stable Explore card id. Discovery is an accepted poll vote
 * or finalized reaction on that card. Reward comes from economy.hidden_nugget.
 *
 * Durable assignment requires lantern_hidden_nugget_assignments (see
 * docs/HIDDEN_NUGGET_MIGRATION_230.md). This module no-ops if the table is
 * missing. Do not run that migration from #230.
 */
import { denverLocalDateYYYYMMDD, SCHOOL_SCHEDULE_TIMEZONE } from './school-schedule.js';
import { isStaffEconomyKey } from './staff-economy.js';
import { tmsEconomyTransact } from './tms-economy-bridge.js';
import { resolveEconomyAmount } from './nugget-economy-settings.js';
import { awardAchievementsForEconomyTransact } from './locker-achievements.js';

export const HIDDEN_NUGGET_REACTION_TYPES = new Set([
  'news',
  'mission',
  'shout_out',
  'photo',
  'video',
  'article',
]);

export const HIDDEN_NUGGET_TABLE = 'lantern_hidden_nugget_assignments';

let tableReadyCache = null;

export function resetHiddenNuggetTableCache() {
  tableReadyCache = null;
}

function safeKeyPart(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100);
}

export function hiddenNuggetAssignmentId(accountKey, schoolDay) {
  return `hn:${String(schoolDay || '').trim()}:${String(accountKey || '').trim()}`.slice(0, 180);
}

export function hiddenNuggetEventKey(accountKey, schoolDay) {
  return `hidden_nugget:${String(accountKey || '').trim()}:${String(schoolDay || '').trim()}`;
}

export function hiddenNuggetTxId(eventKey) {
  return `tx_hidden_${safeKeyPart(eventKey) || 'unknown'}`.slice(0, 180);
}

export function hiddenNuggetReference(schoolDay, accountKey) {
  return `lantern:hidden_nugget:${String(schoolDay || '').trim()}:${String(accountKey || '').trim()}`;
}

export function formatHiddenNuggetRewardCopy(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return '';
  return `+${Math.trunc(n)} Nugget${Math.trunc(n) === 1 ? '' : 's'}`;
}

export function isHiddenNuggetEligibleAccount(account, accountKey) {
  if (!account) return false;
  const role = String(account.role || '').trim().toLowerCase();
  if (role !== 'student') return false;
  const user = String(account.username || '').trim().toLowerCase();
  if (user === 'admin' || user === 'system' || user === 'operator') return false;
  const key = String(accountKey || '').trim();
  if (!key || isStaffEconomyKey(key)) return false;
  return true;
}

export function pollIdFromCard(item) {
  if (!item) return '';
  const slot = item.contentSlot || {};
  if (slot.pollId != null && String(slot.pollId).trim()) return String(slot.pollId).trim();
  const id = String(item.id || '').trim();
  if (id.indexOf('poll:') === 0) return id.slice(5);
  return '';
}

export function cardIdForPoll(pollId) {
  const raw = String(pollId || '').trim();
  return raw ? `poll:${raw}` : '';
}

export function isEligibleHiddenNuggetCard(item, interactionState) {
  if (!item || !item.id) return false;
  const type = String(item.type || '').trim();
  if (type === 'poll') {
    const pid = pollIdFromCard(item);
    if (!pid) return false;
    if (interactionState && interactionState.votedPollIds && interactionState.votedPollIds.has(pid)) return false;
    return true;
  }
  if (!HIDDEN_NUGGET_REACTION_TYPES.has(type)) return false;
  if (interactionState && interactionState.reactedItemIds && interactionState.reactedItemIds.has(String(item.id))) {
    return false;
  }
  return true;
}

export function eligibleHiddenNuggetCards(items, interactionState) {
  return (items || []).filter((item) => isEligibleHiddenNuggetCard(item, interactionState));
}

/** Deterministic pick from a frozen first-page eligible set. Not a reroll. */
export function stablePickIndex(accountKey, schoolDay, count) {
  const n = Number(count) || 0;
  if (n <= 0) return 0;
  let h = 2166136261;
  const s = `${String(accountKey || '').trim()}|${String(schoolDay || '').trim()}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % n;
}

export function pickAssignedCardId(accountKey, schoolDay, eligibleItems) {
  const list = eligibleItems || [];
  if (!list.length) return '';
  const idx = stablePickIndex(accountKey, schoolDay, list.length);
  return String(list[idx].id || '').trim();
}

/**
 * Keep natural keyset cursor. If the assigned card fell off page 1, show newest
 * 59 + the target (max 60) without changing next_cursor.
 */
export function pinAssignedCardOnFirstPage(naturalItems, targetItem, pageSize) {
  const lim = Math.max(1, Number(pageSize) || 60);
  const items = Array.isArray(naturalItems) ? naturalItems.slice() : [];
  if (!targetItem || !targetItem.id) return items.slice(0, lim);
  if (items.some((it) => it && it.id === targetItem.id)) return items.slice(0, lim);
  const head = items.slice(0, Math.max(0, lim - 1));
  head.push(targetItem);
  return head.slice(0, lim);
}

export async function hiddenNuggetTableReady(db) {
  if (tableReadyCache === true) return true;
  if (tableReadyCache === false) return false;
  if (!db) {
    tableReadyCache = false;
    return false;
  }
  try {
    await db.prepare(`SELECT 1 FROM ${HIDDEN_NUGGET_TABLE} LIMIT 1`).first();
    tableReadyCache = true;
    return true;
  } catch (e) {
    const msg = String((e && e.message) || e || '');
    if (/no such table/i.test(msg)) {
      tableReadyCache = false;
      return false;
    }
    return false;
  }
}

async function loadAssignment(db, accountKey, schoolDay) {
  const id = hiddenNuggetAssignmentId(accountKey, schoolDay);
  try {
    return (
      (await db
        .prepare(
          `SELECT id, account_key, school_day, card_id, claimed_at, claim_tx_id, created_at, updated_at FROM ${HIDDEN_NUGGET_TABLE} WHERE id = ?`
        )
        .bind(id)
        .first()) || null
    );
  } catch (_) {
    return null;
  }
}

async function loadInteractionState(db, accountKey, username) {
  const votedPollIds = new Set();
  const reactedItemIds = new Set();
  try {
    const votes = await db
      .prepare('SELECT poll_id FROM lantern_poll_votes WHERE character_name = ?')
      .bind(accountKey)
      .all();
    (votes.results || []).forEach((r) => {
      if (r && r.poll_id) votedPollIds.add(String(r.poll_id));
    });
  } catch (_) {}
  const reactor = String(username || '').trim();
  if (reactor) {
    try {
      const rows = await db
        .prepare(
          'SELECT item_id FROM lantern_final_reaction_responses WHERE item_type = ? AND lower(trim(reactor_username)) = lower(trim(?))'
        )
        .bind('feed', reactor)
        .all();
      (rows.results || []).forEach((r) => {
        if (r && r.item_id) reactedItemIds.add(String(r.item_id));
      });
    } catch (_) {}
  }
  return { votedPollIds, reactedItemIds };
}

async function insertAssignment(db, accountKey, schoolDay, cardId, nowIso) {
  const id = hiddenNuggetAssignmentId(accountKey, schoolDay);
  try {
    await db
      .prepare(
        `INSERT OR IGNORE INTO ${HIDDEN_NUGGET_TABLE} (id, account_key, school_day, card_id, claimed_at, claim_tx_id, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?)`
      )
      .bind(id, accountKey, schoolDay, cardId, nowIso, nowIso)
      .run();
  } catch (_) {}
  return loadAssignment(db, accountKey, schoolDay);
}

/**
 * First Explore page only. Assigns from the natural first-60 eligible set.
 * Pins the assigned card into page 1 before it is found. Never leaks which card.
 */
export async function applyFirstPageHiddenNugget(db, env, opts) {
  const page = opts && opts.page ? opts.page : { items: [], has_more: false, next_cursor: '' };
  const out = {
    items: Array.isArray(page.items) ? page.items.slice() : [],
    has_more: !!page.has_more,
    next_cursor: page.next_cursor || '',
    assignment: null,
    table_ready: false,
  };
  if (opts && opts.cursor) return out;
  const account = opts && opts.account;
  const accountKey = String((opts && opts.accountKey) || '').trim();
  if (!isHiddenNuggetEligibleAccount(account, accountKey)) return out;
  if (!(await hiddenNuggetTableReady(db))) return out;
  out.table_ready = true;

  const now = opts && opts.now ? new Date(opts.now) : new Date();
  const schoolDay = denverLocalDateYYYYMMDD(now);
  let row = await loadAssignment(db, accountKey, schoolDay);
  if (!row) {
    const interaction = await loadInteractionState(db, accountKey, account && account.username);
    const eligible = eligibleHiddenNuggetCards(out.items, interaction);
    const cardId = pickAssignedCardId(accountKey, schoolDay, eligible);
    if (cardId) {
      row = await insertAssignment(db, accountKey, schoolDay, cardId, now.toISOString());
    }
  }
  out.assignment = row;
  if (!row || row.claimed_at) return out;

  const already = out.items.some((it) => it && it.id === row.card_id);
  if (already) return out;
  const fetchItem = opts && typeof opts.fetchItem === 'function' ? opts.fetchItem : null;
  if (!fetchItem) return out;
  let target = null;
  try {
    target = await fetchItem(row.card_id);
  } catch (_) {
    target = null;
  }
  if (!target) return out;
  out.items = pinAssignedCardOnFirstPage(out.items, target, opts.pageSize || 60);
  return out;
}

async function findHiddenNuggetTx(db, eventKey) {
  const txId = hiddenNuggetTxId(eventKey);
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

async function markClaimed(db, assignment, txId, nowIso) {
  try {
    await db
      .prepare(`UPDATE ${HIDDEN_NUGGET_TABLE} SET claimed_at = ?, claim_tx_id = ?, updated_at = ? WHERE id = ?`)
      .bind(nowIso, txId, nowIso, assignment.id)
      .run();
  } catch (_) {}
}

export function hiddenNuggetResponseFields(result) {
  if (!result) return {};
  return {
    hidden_nugget: {
      found: !!result.found,
      already: !!result.already,
      amount: Number(result.amount) || 0,
      discovery_recorded: !!result.discovery_recorded,
      copy: formatHiddenNuggetRewardCopy(result.amount),
    },
  };
}

/**
 * After an accepted poll vote or finalized reaction. Server verifies assignment.
 * Client flags are ignored.
 */
export async function maybeAwardHiddenNuggetAfterInteraction(db, env, opts) {
  const account = opts && opts.account;
  const accountKey = String((opts && opts.accountKey) || '').trim();
  const triggerCardId = String((opts && opts.cardId) || '').trim();
  const now = opts && opts.now ? new Date(opts.now) : new Date();
  const empty = {
    ok: true,
    found: false,
    already: false,
    amount: 0,
    discovery_recorded: false,
    skipped: true,
  };
  if (!isHiddenNuggetEligibleAccount(account, accountKey)) {
    return { ...empty, skipped_role: true };
  }
  if (!triggerCardId) return empty;
  if (!(await hiddenNuggetTableReady(db))) return { ...empty, table_missing: true };

  const schoolDay = denverLocalDateYYYYMMDD(now);
  const assignment = await loadAssignment(db, accountKey, schoolDay);
  if (!assignment || String(assignment.card_id) !== triggerCardId) {
    return { ...empty, skipped: true, wrong_card: !!(assignment && assignment.card_id) };
  }

  const eventKey = hiddenNuggetEventKey(accountKey, schoolDay);
  const txId = hiddenNuggetTxId(eventKey);
  const reference = hiddenNuggetReference(schoolDay, accountKey);
  const amount = await resolveEconomyAmount(db, 'hidden_nugget');
  const existingTx = await findHiddenNuggetTx(db, eventKey);
  if (existingTx || assignment.claimed_at) {
    return {
      ok: true,
      found: true,
      already: true,
      amount: existingTx ? Number(existingTx.delta) || 0 : amount,
      discovery_recorded: true,
      idempotent: true,
      tx_id: existingTx ? existingTx.id : assignment.claim_tx_id,
      event_key: eventKey,
      day: schoolDay,
      timezone: SCHOOL_SCHEDULE_TIMEZONE,
    };
  }

  const iso = now.toISOString();
  const note = 'Hidden Nugget';
  const meta = JSON.stringify({
    event_key: eventKey,
    school_day: schoolDay,
    timezone: SCHOOL_SCHEDULE_TIMEZONE,
    card_id: triggerCardId,
    trigger: String((opts && opts.trigger) || ''),
    tms_reference: reference,
  });

  if (amount === 0) {
    try {
      await db
        .prepare(
          'INSERT INTO lantern_transactions (id, character_name, delta, kind, source, note, created_at, meta_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .bind(txId, accountKey, 0, 'hidden_nugget', 'DISCOVERY', note, iso, meta)
        .run();
    } catch (_) {}
    await markClaimed(db, assignment, txId, iso);
    return {
      ok: true,
      found: true,
      already: false,
      amount: 0,
      discovery_recorded: true,
      rewarded: false,
      tx_id: txId,
      event_key: eventKey,
      day: schoolDay,
      timezone: SCHOOL_SCHEDULE_TIMEZONE,
      economy_authority: 'configured_zero',
    };
  }

  let rewarded = false;
  let idempotent = false;
  let economyAuthority = 'lantern_wallet';
  if (env) {
    const tms = await tmsEconomyTransact(env, accountKey, amount, 'hidden_nugget', 'DISCOVERY', note, reference);
    if (tms && tms.ok) {
      rewarded = !tms.idempotent;
      idempotent = !!tms.idempotent;
      economyAuthority = 'tms_nuggets';
    }
  }
  try {
    await db
      .prepare(
        'INSERT INTO lantern_transactions (id, character_name, delta, kind, source, note, created_at, meta_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(txId, accountKey, amount, 'hidden_nugget', 'DISCOVERY', note, iso, meta)
      .run();
  } catch (_) {
    const again = await findHiddenNuggetTx(db, eventKey);
    if (again) {
      await markClaimed(db, assignment, txId, iso);
      return {
        ok: true,
        found: true,
        already: true,
        amount: Number(again.delta) || 0,
        discovery_recorded: true,
        idempotent: true,
        tx_id: again.id,
        event_key: eventKey,
        day: schoolDay,
        timezone: SCHOOL_SCHEDULE_TIMEZONE,
      };
    }
  }
  await markClaimed(db, assignment, txId, iso);
  try {
    await awardAchievementsForEconomyTransact(db, accountKey, 'hidden_nugget', txId, note);
  } catch (_) {}
  return {
    ok: true,
    found: true,
    already: false,
    amount,
    discovery_recorded: true,
    rewarded: rewarded || amount > 0,
    idempotent,
    tx_id: txId,
    event_key: eventKey,
    day: schoolDay,
    timezone: SCHOOL_SCHEDULE_TIMEZONE,
    economy_authority: economyAuthority,
  };
}
