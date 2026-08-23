/**
 * Prompt #252A — authoritative Locker item-state (feature / archive / reopen).
 * Never overloads hidden_at / hidden_by / moderation status.
 */

import { canonicalItemType } from './moderation-events.js';

export const FEATURE_MAX = 3;

export const LOCKER_ITEM_ACTIONS = Object.freeze([
  'feature',
  'unfeature',
  'archive',
  'restore',
  'reopen_revision',
]);

export class LockerItemStateSchemaError extends Error {
  constructor(message) {
    super(message || 'locker_item_state_schema_required');
    this.name = 'LockerItemStateSchemaError';
    this.code = 503;
    this.error = 'locker_item_state_schema_required';
  }
}

export function isLockerItemStateSchemaError(err) {
  if (err && err.name === 'LockerItemStateSchemaError') return true;
  const m = String((err && err.message) || err || '');
  return /no such table:\s*lantern_locker_item_state/i.test(m);
}

const FEED_PREFIX = {
  news: 'news',
  mission: 'mission_submission',
  poll: 'poll',
  shout_out: null,
};

export function normalizeLockerItemRef(itemType, itemId) {
  let type = String(itemType || '').trim().toLowerCase();
  let id = String(itemId || '').trim();
  if (!id) return { item_type: '', item_id: '' };
  const prefixed = id.match(/^(news|mission|poll|shout_out|feed):(.+)$/i);
  if (prefixed) {
    const prefix = prefixed[1].toLowerCase();
    id = prefixed[2].trim();
    if (!type || type === 'feed' || type === prefix) {
      type = FEED_PREFIX[prefix] != null ? FEED_PREFIX[prefix] : prefix;
    }
  }
  if (type === 'news_submission') type = 'news';
  if (type === 'shoutout' || type === 'shout-out' || type === 'shout_out') type = 'news';
  if (type === 'poll') return { item_type: 'poll', item_id: id };
  const canon = canonicalItemType(type);
  if (canon === 'avatar' || !canon) return { item_type: '', item_id: '' };
  return { item_type: canon, item_id: id };
}

export function emptyItemState() {
  return {
    featured: 0,
    featured_sort: null,
    owner_archived_at: null,
    owner_archived_from: null,
  };
}

function presentState(row) {
  if (!row) return emptyItemState();
  const featured = Number(row.featured) === 1 ? 1 : 0;
  return {
    featured,
    featured_sort: featured && row.featured_sort != null ? Number(row.featured_sort) || null : null,
    owner_archived_at: row.owner_archived_at ? String(row.owner_archived_at) : null,
    owner_archived_from: row.owner_archived_from ? String(row.owner_archived_from) : null,
  };
}

function isArchivedState(state) {
  return !!(state && state.owner_archived_at);
}

function contentStatus(row) {
  return String((row && row.status) || '').trim().toLowerCase();
}

function isHiddenRow(row) {
  return !!(row && row.hidden_at != null && String(row.hidden_at).trim() !== '');
}

function isApprovedLike(type, row) {
  const st = contentStatus(row);
  if (type === 'mission_submission') return st === 'accepted' || st === 'approved';
  if (type === 'poll') return !!(row && (row.approved_at || st === 'approved'));
  return st === 'approved';
}

function isPendingLike(type, row) {
  const st = contentStatus(row);
  if (type === 'poll' && row && !row.approved_at && (st === '' || st === 'pending' || st === 'submitted')) {
    return true;
  }
  return st === 'pending' || st === 'submitted' || st === 'draft';
}

function isReturnedLike(row) {
  return contentStatus(row) === 'returned';
}

function isRejectedLike(row) {
  return contentStatus(row) === 'rejected';
}

export async function loadLockerContentRow(db, itemType, itemId) {
  const ref = normalizeLockerItemRef(itemType, itemId);
  const t = ref.item_type;
  const id = ref.item_id;
  if (!t || !id || !db) return { type: t, row: null };
  if (t === 'news') {
    return { type: t, row: await db.prepare('SELECT * FROM lantern_news_submissions WHERE id = ?').bind(id).first() };
  }
  if (t === 'poll_contribution') {
    return { type: t, row: await db.prepare('SELECT * FROM lantern_poll_contributions WHERE id = ?').bind(id).first() };
  }
  if (t === 'poll') {
    return { type: t, row: await db.prepare('SELECT * FROM lantern_polls WHERE id = ?').bind(id).first() };
  }
  if (t === 'mission_submission') {
    return { type: t, row: await db.prepare('SELECT * FROM lantern_mission_submissions WHERE id = ?').bind(id).first() };
  }
  if (t === 'feed_item') {
    return { type: t, row: await db.prepare('SELECT * FROM lantern_feed_items WHERE id = ?').bind(id).first() };
  }
  return { type: t, row: null };
}

export function studentOwnsLockerRow(type, row, keys) {
  if (!row || !keys || !keys.length) return false;
  const set = new Set(keys.map((k) => String(k || '').trim()).filter(Boolean));
  const hit = (v) => {
    const s = String(v || '').trim();
    return !!(s && set.has(s));
  };
  if (type === 'news') return hit(row.author_name) || hit(row.actor_id);
  if (type === 'poll_contribution' || type === 'mission_submission' || type === 'poll') {
    return hit(row.character_name) || hit(row.created_by_character);
  }
  if (type === 'feed_item') return hit(row.author_display_name) || hit(row.author_id);
  return false;
}

export async function readLockerItemState(db, characterName, itemType, itemId) {
  const key = String(characterName || '').trim();
  const ref = normalizeLockerItemRef(itemType, itemId);
  if (!key || !ref.item_type || !ref.item_id || !db) return emptyItemState();
  try {
    const row = await db
      .prepare(
        'SELECT featured, featured_sort, owner_archived_at, owner_archived_from FROM lantern_locker_item_state WHERE character_name = ? AND item_type = ? AND item_id = ?'
      )
      .bind(key, ref.item_type, ref.item_id)
      .first();
    return presentState(row);
  } catch (err) {
    if (isLockerItemStateSchemaError(err)) return emptyItemState();
    throw err;
  }
}

export async function listLockerItemStatesForOwner(db, characterName) {
  const key = String(characterName || '').trim();
  if (!key || !db) return [];
  try {
    const res = await db
      .prepare(
        'SELECT character_name, item_type, item_id, featured, featured_sort, owner_archived_at, owner_archived_from, updated_at FROM lantern_locker_item_state WHERE character_name = ?'
      )
      .bind(key)
      .all();
    return ((res && res.results) || []).map((r) => ({
      item_type: r.item_type,
      item_id: r.item_id,
      ...presentState(r),
      updated_at: r.updated_at || null,
    }));
  } catch (err) {
    if (isLockerItemStateSchemaError(err)) return [];
    throw err;
  }
}

export async function listArchivedLockerRefs(db, characterNames) {
  const keys = [...new Set((characterNames || []).map((k) => String(k || '').trim()).filter(Boolean))];
  if (!keys.length || !db) return [];
  const ph = keys.map(() => '?').join(',');
  try {
    const res = await db
      .prepare(
        `SELECT character_name, item_type, item_id FROM lantern_locker_item_state WHERE character_name IN (${ph}) AND owner_archived_at IS NOT NULL AND TRIM(owner_archived_at) != ''`
      )
      .bind(...keys)
      .all();
    return (res && res.results) || [];
  } catch (err) {
    if (isLockerItemStateSchemaError(err)) return [];
    throw err;
  }
}

function stateKey(itemType, itemId) {
  return String(itemType || '') + ':' + String(itemId || '');
}

export function archivedRefSet(rows) {
  const set = new Set();
  (rows || []).forEach((r) => {
    if (!r) return;
    set.add(stateKey(r.item_type, r.item_id));
  });
  return set;
}

export function isOwnerArchivedRef(set, itemType, itemId) {
  const ref = normalizeLockerItemRef(itemType, itemId);
  if (!ref.item_type || !ref.item_id) return false;
  return set.has(stateKey(ref.item_type, ref.item_id));
}

async function countFeatured(db, characterName) {
  const key = String(characterName || '').trim();
  const row = await db
    .prepare(
      'SELECT COUNT(*) AS c FROM lantern_locker_item_state WHERE character_name = ? AND featured = 1'
    )
    .bind(key)
    .first();
  return row && row.c != null ? Number(row.c) || 0 : 0;
}

async function nextFeaturedSort(db, characterName) {
  const key = String(characterName || '').trim();
  const row = await db
    .prepare(
      'SELECT MAX(featured_sort) AS m FROM lantern_locker_item_state WHERE character_name = ? AND featured = 1'
    )
    .bind(key)
    .first();
  const m = row && row.m != null ? Number(row.m) || 0 : 0;
  return m + 1;
}

async function upsertItemState(db, characterName, itemType, itemId, patch) {
  const key = String(characterName || '').trim();
  const now = new Date().toISOString();
  const current = await readLockerItemState(db, key, itemType, itemId);
  const next = {
    featured: patch.featured != null ? (patch.featured ? 1 : 0) : current.featured,
    featured_sort: patch.featured_sort !== undefined ? patch.featured_sort : current.featured_sort,
    owner_archived_at: patch.owner_archived_at !== undefined ? patch.owner_archived_at : current.owner_archived_at,
    owner_archived_from: patch.owner_archived_from !== undefined ? patch.owner_archived_from : current.owner_archived_from,
  };
  if (!next.featured) next.featured_sort = null;
  try {
    await db
      .prepare(
        `INSERT INTO lantern_locker_item_state
          (character_name, item_type, item_id, featured, featured_sort, owner_archived_at, owner_archived_from, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(character_name, item_type, item_id) DO UPDATE SET
           featured = excluded.featured,
           featured_sort = excluded.featured_sort,
           owner_archived_at = excluded.owner_archived_at,
           owner_archived_from = excluded.owner_archived_from,
           updated_at = excluded.updated_at`
      )
      .bind(
        key,
        itemType,
        itemId,
        next.featured,
        next.featured_sort,
        next.owner_archived_at,
        next.owner_archived_from,
        now
      )
      .run();
  } catch (err) {
    if (isLockerItemStateSchemaError(err)) throw new LockerItemStateSchemaError();
    throw err;
  }
  return { ...next, updated_at: now };
}

function ownerIdentityKeys(account, economyKey, deps) {
  const keys = [];
  const add = (v) => {
    const s = String(v || '').trim();
    if (s && keys.indexOf(s) < 0) keys.push(s);
  };
  add(economyKey);
  if (deps && typeof deps.pilotEconomyCharacterName === 'function') add(deps.pilotEconomyCharacterName(account));
  if (deps && typeof deps.durableAccountKeyFromPilotAccount === 'function') {
    add(deps.durableAccountKeyFromPilotAccount(account));
  }
  if (account) {
    add(account.student_character_name);
    add(account.username);
    add(account.display_name);
    add(account.mtss_student_id);
    add(account._economy_character_name);
  }
  return keys;
}

export async function applyLockerItemAction(db, account, economyKey, body, deps) {
  const action = String((body && body.action) || '').trim().toLowerCase();
  if (LOCKER_ITEM_ACTIONS.indexOf(action) < 0) {
    return { ok: false, error: 'invalid_action', status: 400 };
  }
  const ref = normalizeLockerItemRef(body && body.item_type, body && body.item_id);
  if (!ref.item_type || !ref.item_id) {
    return { ok: false, error: 'missing_item', status: 400 };
  }
  const ownerKey = String(economyKey || '').trim();
  if (!ownerKey) return { ok: false, error: 'account_link_missing', status: 400 };

  const keys = ownerIdentityKeys(account, ownerKey, deps);

  const loaded = await loadLockerContentRow(db, ref.item_type, ref.item_id);
  if (!loaded.row) return { ok: false, error: 'not_found', status: 404 };
  if (!studentOwnsLockerRow(loaded.type, loaded.row, keys)) {
    return { ok: false, error: 'forbidden', status: 403 };
  }

  const state = await readLockerItemState(db, ownerKey, loaded.type, ref.item_id);
  const hidden = isHiddenRow(loaded.row);

  if (action === 'feature') {
    if (hidden) return { ok: false, error: 'item_hidden', status: 400 };
    if (isArchivedState(state)) return { ok: false, error: 'item_archived', status: 400 };
    if (!isApprovedLike(loaded.type, loaded.row)) return { ok: false, error: 'not_featureable', status: 400 };
    if (state.featured) {
      return { ok: true, action, item_type: loaded.type, item_id: ref.item_id, state };
    }
    const featuredCount = await countFeatured(db, ownerKey);
    if (featuredCount >= FEATURE_MAX) {
      return { ok: false, error: 'feature_limit', max: FEATURE_MAX, status: 400 };
    }
    const featured_sort = await nextFeaturedSort(db, ownerKey);
    const next = await upsertItemState(db, ownerKey, loaded.type, ref.item_id, {
      featured: 1,
      featured_sort,
    });
    return { ok: true, action, item_type: loaded.type, item_id: ref.item_id, state: next };
  }

  if (action === 'unfeature') {
    if (!state.featured) {
      return { ok: true, action, item_type: loaded.type, item_id: ref.item_id, state };
    }
    const next = await upsertItemState(db, ownerKey, loaded.type, ref.item_id, {
      featured: 0,
      featured_sort: null,
    });
    return { ok: true, action, item_type: loaded.type, item_id: ref.item_id, state: next };
  }

  if (action === 'archive') {
    const canArchive =
      isApprovedLike(loaded.type, loaded.row) || isReturnedLike(loaded.row) || isRejectedLike(loaded.row);
    if (!canArchive) {
      return { ok: false, error: 'pending_not_archivable', status: 400 };
    }
    if (canArchive) {
      const from = isReturnedLike(loaded.row)
        ? 'returned'
        : isRejectedLike(loaded.row)
          ? 'rejected'
          : 'approved';
      const next = await upsertItemState(db, ownerKey, loaded.type, ref.item_id, {
        featured: 0,
        featured_sort: null,
        owner_archived_at: state.owner_archived_at || new Date().toISOString(),
        owner_archived_from: from,
      });
      return {
        ok: true,
        action,
        item_type: loaded.type,
        item_id: ref.item_id,
        state: next,
        archive_kind: from === 'returned' ? 'archive_for_later' : 'archive_from_locker',
      };
    }
    return { ok: false, error: 'pending_not_archivable', status: 400 };
  }

  if (action === 'restore') {
    if (!isArchivedState(state)) {
      return { ok: true, action, item_type: loaded.type, item_id: ref.item_id, state };
    }
    if (isReturnedLike(loaded.row)) {
      return { ok: false, error: 'use_reopen_revision', status: 400 };
    }
    const next = await upsertItemState(db, ownerKey, loaded.type, ref.item_id, {
      owner_archived_at: null,
      owner_archived_from: null,
    });
    return { ok: true, action, item_type: loaded.type, item_id: ref.item_id, state: next };
  }

  if (action === 'reopen_revision') {
    if (!isReturnedLike(loaded.row)) return { ok: false, error: 'not_returned', status: 400 };
    if (!isArchivedState(state)) {
      return { ok: true, action, item_type: loaded.type, item_id: ref.item_id, state };
    }
    const next = await upsertItemState(db, ownerKey, loaded.type, ref.item_id, {
      owner_archived_at: null,
      owner_archived_from: null,
      featured: 0,
      featured_sort: null,
    });
    return { ok: true, action, item_type: loaded.type, item_id: ref.item_id, state: next };
  }

  return { ok: false, error: 'invalid_action', status: 400 };
}

export function attachStateToOwnerItems(items, stateRows, typeFromItem) {
  const map = Object.create(null);
  (stateRows || []).forEach((s) => {
    map[stateKey(s.item_type, s.item_id)] = s;
  });
  return (items || []).map((item) => {
    const inferred = typeFromItem ? typeFromItem(item) : item && (item.item_type || item.type);
    const ref = normalizeLockerItemRef(inferred, item && item.id);
    const st = map[stateKey(ref.item_type, ref.item_id)] || emptyItemState();
    return {
      ...item,
      featured: st.featured ? 1 : 0,
      featured_sort: st.featured_sort,
      owner_archived_at: st.owner_archived_at,
      owner_archived_from: st.owner_archived_from,
    };
  });
}

export function ownerItemTypeFromSubmission(item) {
  if (!item) return '';
  const t = String(item.type || item.item_type || '').trim().toLowerCase();
  if (t === 'news_submission' || t === 'news') return 'news';
  if (t === 'mission_submission') return 'mission_submission';
  if (t === 'poll_contribution') return 'poll_contribution';
  if (t === 'feed_item' || t === 'feed') return 'feed_item';
  if (t === 'poll') return 'poll';
  return t;
}

export const lockerItemStateTest = {
  contentStatus,
  isHiddenRow,
  isApprovedLike,
  isPendingLike,
  isReturnedLike,
  isRejectedLike,
  presentState,
};
