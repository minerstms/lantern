/**
 * Prompt #230 / #242 — Hidden Nugget daily treasure hunt.
 *
 * One assignment per eligible student per America/Denver school day.
 * Assignment is a stable Explore card id from the student's current top-60
 * assignable Explore cards (including already-interacted cards). Discovery is
 * an accepted first poll vote / finalized reaction, or a verified Reveal
 * Results on a card the student already interacted with. Reward comes from
 * economy.hidden_nugget.
 *
 * Durable assignment requires lantern_hidden_nugget_assignments (see
 * docs/HIDDEN_NUGGET_MIGRATION_230.md). This module no-ops if the table is
 * missing. Do not run that migration from this prompt.
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
export const HIDDEN_NUGGET_ASSIGNMENT_POOL_SIZE = 60;

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

export function isAssignableHiddenNuggetCard(item) {
  if (!item || !item.id) return false;
  const type = String(item.type || '').trim();
  if (type === 'poll') return !!pollIdFromCard(item);
  return HIDDEN_NUGGET_REACTION_TYPES.has(type);
}

export function isEligibleHiddenNuggetCard(item, interactionState) {
  if (!isAssignableHiddenNuggetCard(item)) return false;
  const type = String(item.type || '').trim();
  if (type === 'poll') {
    const pid = pollIdFromCard(item);
    if (interactionState && interactionState.votedPollIds && interactionState.votedPollIds.has(pid)) return false;
    return true;
  }
  if (interactionState && interactionState.reactedItemIds && interactionState.reactedItemIds.has(String(item.id))) {
    return false;
  }
  return true;
}

export function eligibleHiddenNuggetCards(items, interactionState) {
  return (items || []).filter((item) => isEligibleHiddenNuggetCard(item, interactionState));
}

/**
 * First N assignable cards in the student's current Explore order.
 * Includes already-voted / already-reacted cards. If fewer than N exist,
 * the pool is however many assignable cards exist.
 */
export function hiddenNuggetAssignmentPool(orderedItems, limit) {
  const cap = Math.max(1, Number(limit) || HIDDEN_NUGGET_ASSIGNMENT_POOL_SIZE);
  const out = [];
  (orderedItems || []).forEach((item) => {
    if (out.length >= cap) return;
    if (isAssignableHiddenNuggetCard(item)) out.push(item);
  });
  return out;
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
 * First Explore page only. Assigns from the current top-60 assignable Explore
 * cards (same server newest-first order the student sees). Already-interacted
 * cards stay in the pool. Existing same-day rows are never rewritten.
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
    const ordered =
      opts && Array.isArray(opts.orderedItems) && opts.orderedItems.length ? opts.orderedItems : out.items;
    const pool = hiddenNuggetAssignmentPool(ordered, opts.poolSize || HIDDEN_NUGGET_ASSIGNMENT_POOL_SIZE);
    const cardId = pickAssignedCardId(accountKey, schoolDay, pool);
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

/**
 * Server-side prior-interaction check. Poll votes key by economy character name;
 * finalized reactions key by username. Client display state is ignored.
 */
export async function userHasPriorInteractionOnCard(db, opts) {
  const cardId = String((opts && opts.cardId) || '').trim();
  const accountKey = String((opts && opts.accountKey) || '').trim();
  const username = String((opts && opts.username) || '').trim();
  if (!cardId) return false;
  if (cardId.indexOf('poll:') === 0) {
    const pollId = cardId.slice(5);
    if (!pollId || !accountKey) return false;
    try {
      const row = await db
        .prepare('SELECT 1 AS ok FROM lantern_poll_votes WHERE poll_id = ? AND character_name = ? LIMIT 1')
        .bind(pollId, accountKey)
        .first();
      return !!(row && (row.ok || row['1']));
    } catch (_) {
      return false;
    }
  }
  if (!username) return false;
  try {
    const row = await db
      .prepare(
        'SELECT 1 AS ok FROM lantern_final_reaction_responses WHERE item_type = ? AND item_id = ? AND lower(trim(reactor_username)) = lower(trim(?)) LIMIT 1'
      )
      .bind('feed', cardId, username)
      .first();
    return !!(row && (row.ok || row['1']));
  } catch (_) {
    return false;
  }
}

/**
 * Reveal Results on an already-interacted card. Presentation-only on the client.
 * Awards only through maybeAwardHiddenNuggetAfterInteraction after D1 verifies
 * a prior vote/reaction belonging to this user on this card.
 */
export async function claimHiddenNuggetViaReveal(db, env, opts) {
  const empty = {
    ok: false,
    found: false,
    already: false,
    amount: 0,
    discovery_recorded: false,
    prior_verified: false,
  };
  const account = opts && opts.account;
  const accountKey = String((opts && opts.accountKey) || '').trim();
  const cardId = String((opts && opts.cardId) || '').trim();
  if (!account) return { ...empty, error: 'Sign in required', code: 401 };
  if (!isHiddenNuggetEligibleAccount(account, accountKey)) {
    return { ...empty, error: 'not_eligible', code: 403, skipped_role: true };
  }
  if (!cardId) return { ...empty, error: 'Missing card_id', code: 400 };
  const prior = await userHasPriorInteractionOnCard(db, {
    cardId,
    accountKey,
    username: account.username,
  });
  if (!prior) {
    return { ...empty, error: 'no_prior_interaction', code: 403 };
  }
  const result = await maybeAwardHiddenNuggetAfterInteraction(db, env, {
    account,
    accountKey,
    cardId,
    trigger: 'reveal',
    now: opts && opts.now,
  });
  return {
    ok: true,
    ...result,
    prior_verified: true,
    code: 200,
  };
}

export async function handleHiddenNuggetRoutes(request, url, path, env, cors, deps) {
  const jsonResponse = deps && deps.jsonResponse;
  if (!jsonResponse) return null;
  if (request.method === 'POST' && path === '/api/hidden-nugget/reveal-claim') {
    const db = env && env.DB;
    if (!db) return jsonResponse({ ok: false, error: 'DB not configured' }, 503, cors);
    const getAccount = deps.getPilotAccountFromRequest;
    let account = null;
    try {
      account = getAccount ? await getAccount(request, env) : null;
    } catch (_) {
      account = null;
    }
    if (!account) return jsonResponse({ ok: false, error: 'Sign in required' }, 401, cors);
    const accountKey =
      deps.pilotEconomyCharacterName && typeof deps.pilotEconomyCharacterName === 'function'
        ? String(deps.pilotEconomyCharacterName(account) || '').trim()
        : String(account.username || '').trim();
    let body;
    try {
      body = JSON.parse(await request.text() || '{}');
    } catch (_) {
      return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors);
    }
    const result = await claimHiddenNuggetViaReveal(db, env, {
      account,
      accountKey,
      cardId: (body && body.card_id) || '',
    });
    return jsonResponse(
      {
        ok: !!result.ok,
        error: result.error || undefined,
        prior_verified: !!result.prior_verified,
        ...hiddenNuggetResponseFields(result),
      },
      result.code || (result.ok ? 200 : 400),
      cors
    );
  }
  return jsonResponse({ ok: false, error: 'Not found' }, 404, cors);
}
