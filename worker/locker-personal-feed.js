import {
  collectApprovedFeed,
  filterFeedItems,
  attachReactionsAndComments,
} from './feed-handlers.js';

const ATTRIBUTION_KEYS = [
  'photographer',
  'photo_credit',
  'contributor',
  'creator',
  'credited_participant',
  'participant',
  'camera',
];

/**
 * Permanent identity keys for a pilot account row (never display_name alone).
 * @param {object} account
 * @param {string|null} economyKey
 */
export function identityKeysForAccount(account, economyKey) {
  const keys = new Set();
  const add = (v) => {
    const s = v != null ? String(v).trim() : '';
    if (s) keys.add(s.toLowerCase());
  };
  if (account) {
    add(account.username);
    add(account.student_character_name);
    add(account.mtss_student_id);
    add(account._economy_character_name);
  }
  add(economyKey);
  return keys;
}

function matchesIdentity(value, keys) {
  const s = value != null ? String(value).trim().toLowerCase() : '';
  return s ? keys.has(s) : false;
}

function parseExtraJson(item) {
  const raw = item && (item.extra_json || item.extraJson);
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return {};
  }
}

function isSubmittedByIdentity(item, keys, username) {
  if (!item) return false;
  if (matchesIdentity(item.authorId, keys)) return true;
  if (matchesIdentity(item.authorDisplayName, keys)) return true;
  if (username && matchesIdentity(item.authorId, new Set([String(username).toLowerCase()]))) return true;
  return false;
}

function isTaggedForIdentity(item, keys) {
  const extra = parseExtraJson(item);
  for (let i = 0; i < ATTRIBUTION_KEYS.length; i++) {
    const k = ATTRIBUTION_KEYS[i];
    if (matchesIdentity(extra[k], keys)) return true;
  }
  if (item.contentSlot && typeof item.contentSlot === 'object') {
    for (let i = 0; i < ATTRIBUTION_KEYS.length; i++) {
      const k = ATTRIBUTION_KEYS[i];
      if (matchesIdentity(item.contentSlot[k], keys)) return true;
    }
  }
  return false;
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} economyKey
 * @param {Set<string>} identityKeys
 */
async function reactedFeedIds(db, economyKey) {
  const rows = await db
    .prepare(
      "SELECT DISTINCT item_id FROM lantern_reactions WHERE item_type = 'feed' AND lower(trim(character_name)) = lower(trim(?))"
    )
    .bind(economyKey)
    .all();
  return new Set((rows.results || []).map((r) => String(r.item_id)));
}

/**
 * Build authenticated personal feed for Locker (server-scoped).
 */
export async function buildLockerPersonalFeed(db, origin, account, economyKey, params) {
  const keys = identityKeysForAccount(account, economyKey);
  const username = account ? String(account.username || '').trim() : '';
  const relationship = String(params.relationship || 'all').trim().toLowerCase();
  const viewer = economyKey || '';

  let items = await collectApprovedFeed(db, origin, { limit: 300 });

  const reactedIds = relationship === 'reacted' || relationship === 'all'
    ? await reactedFeedIds(db, economyKey)
    : new Set();

  function submittedSet() {
    return items.filter((it) => isSubmittedByIdentity(it, keys, username));
  }
  function reactedSet() {
    return items.filter((it) => reactedIds.has(String(it.id)));
  }
  function taggedSet() {
    return items.filter((it) => isTaggedForIdentity(it, keys));
  }

  let scoped = items;
  if (relationship === 'submitted') scoped = submittedSet();
  else if (relationship === 'reacted') scoped = reactedSet();
  else if (relationship === 'tagged') scoped = taggedSet();
  else if (relationship === 'all') {
    const byId = new Map();
    submittedSet().concat(reactedSet(), taggedSet()).forEach((it) => {
      byId.set(String(it.id), it);
    });
    scoped = [...byId.values()];
  }

  scoped = filterFeedItems(scoped, params);
  scoped = await attachReactionsAndComments(db, scoped, viewer);

  return {
    ok: true,
    items: scoped,
    meta: {
      count: scoped.length,
      relationship,
      contract: 'lantern-locker-personal-feed-v1',
    },
  };
}

/** @internal test helpers */
export const lockerPersonalFeedTest = {
  isSubmittedByIdentity,
  isTaggedForIdentity,
  identityKeysForAccount,
};
