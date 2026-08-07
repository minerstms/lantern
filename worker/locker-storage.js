/**
 * D1 persistence for Locker achievements and cosmetic inventory.
 * All writes are keyed by economy character_name (session-derived upstream).
 */

import { getCosmeticById, isValidEquipSlot } from './cosmetic-catalog.js';
import { normalizeBioFromDb } from './locker-bio.js';

export const ACHIEVEMENT_DEFS = [
  { id: 'first_post', name: 'First Post', icon: '📝', desc: 'Create your first post' },
  { id: 'first_game', name: 'First Game Played', icon: '🎮', desc: 'Play your first game' },
  { id: 'first_purchase', name: 'First Purchase', icon: '🛒', desc: 'Make your first store purchase' },
  { id: 'daily_checkin', name: 'Daily Check-In Complete', icon: '✅', desc: 'Claim daily check-in' },
  { id: 'hidden_nugget', name: 'Hidden Nugget Found', icon: '🪙', desc: 'Find the hidden nugget' },
  { id: 'teacher_spotlight', name: 'Teacher Spotlight', icon: '⭐', desc: 'Get spotlighted by a teacher' },
  { id: 'ten_nuggets', name: '10 Nuggets Earned', icon: '💰', desc: 'Earn 10 nuggets total' },
  { id: 'five_posts', name: '5 Posts Shared', icon: '📢', desc: 'Share 5 posts' },
  { id: 'thank_you_writer', name: 'Thank You Writer', icon: '💌', desc: 'Send your first thank-you letter' },
  { id: 'news_reporter', name: 'News Reporter', icon: '📰', desc: 'Get your first article published' },
  { id: '7_day_nugget_streak', name: '7-Day Nugget Streak', icon: '🔥', desc: 'Find the daily nugget 7 days in a row' },
  { id: 'daily_nugget_finder', name: 'Daily Nugget Finder', icon: '🪙', desc: 'Find the daily nugget for the first time' },
  { id: 'teacher_mission_finisher', name: 'Teacher Mission Finisher', icon: '✅', desc: 'Complete your first teacher mission' },
  { id: 'featured_creator', name: 'Featured Creator', icon: '🌟', desc: 'Get a creation featured by a teacher' },
  { id: 'teacher_pick', name: 'Teacher Pick', icon: '🏆', desc: 'Receive a Teacher Pick on a creation' },
  { id: 'kindness_writer', name: 'Kindness Writer', icon: '💝', desc: 'Have a thank-you letter accepted' },
  { id: 'creative_builder', name: 'Creative Builder', icon: '🛠️', desc: 'Share a project or web app' },
  { id: 'consistent_contributor', name: 'Consistent Contributor', icon: '📢', desc: 'Share 10 posts' },
];

const DEF_BY_ID = Object.fromEntries(ACHIEVEMENT_DEFS.map((d) => [d.id, d]));

function parseJsonArray(raw) {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch (_) {
    return [];
  }
}

function parseJsonObject(raw) {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch (_) {
    return {};
  }
}

function uniqueStrings(list) {
  const out = [];
  const seen = new Set();
  for (const item of list || []) {
    const s = String(item || '').trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

export async function fetchAchievementRows(db, characterName) {
  if (!characterName || !db) return [];
  try {
    const rows = await db
      .prepare(
        'SELECT id, character_name, achievement_id, unlocked_at, source, meta_json FROM lantern_achievements WHERE character_name = ? ORDER BY unlocked_at DESC'
      )
      .bind(characterName)
      .all();
    return rows.results || [];
  } catch (_) {
    return [];
  }
}

export function enrichAchievementItems(rows) {
  const unlockedIds = new Set((rows || []).map((r) => r.achievement_id));
  const unlockedItems = (rows || []).map((r) => {
    const def = DEF_BY_ID[r.achievement_id] || {};
    let meta = {};
    try {
      meta = r.meta_json ? JSON.parse(r.meta_json) : {};
    } catch (_) {}
    return {
      id: r.achievement_id,
      achievement_id: r.achievement_id,
      name: def.name || r.achievement_id,
      icon: def.icon || '🏆',
      desc: def.desc || '',
      unlocked: true,
      unlocked_at: r.unlocked_at,
      source: r.source || '',
      meta,
    };
  });
  const lockedItems = ACHIEVEMENT_DEFS.filter((d) => !unlockedIds.has(d.id)).map((d) => ({
    id: d.id,
    achievement_id: d.id,
    name: d.name,
    icon: d.icon,
    desc: d.desc,
    unlocked: false,
    unlocked_at: null,
    source: null,
    meta: {},
  }));
  return [...unlockedItems, ...lockedItems];
}

export async function unlockAchievement(db, characterName, achievementId, source, meta) {
  const key = String(characterName || '').trim();
  const achId = String(achievementId || '').trim();
  if (!key || !achId || !db) return { ok: false, error: 'missing_fields' };
  if (!DEF_BY_ID[achId]) return { ok: false, error: 'unknown_achievement' };
  const existing = await db
    .prepare('SELECT id FROM lantern_achievements WHERE character_name = ? AND achievement_id = ?')
    .bind(key, achId)
    .first();
  if (existing) return { ok: true, already_unlocked: true, achievement_id: achId };
  const now = new Date().toISOString();
  const id = 'ach-' + crypto.randomUUID();
  await db
    .prepare(
      'INSERT INTO lantern_achievements (id, character_name, achievement_id, unlocked_at, source, meta_json) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .bind(id, key, achId, now, String(source || '').trim(), JSON.stringify(meta && typeof meta === 'object' ? meta : {}))
    .run();
  return { ok: true, created: true, achievement_id: achId, unlocked_at: now };
}

export async function fetchCosmeticOwnershipRow(db, characterName) {
  if (!characterName || !db) return { owned: [], equipped: {} };
  try {
    const row = await db
      .prepare('SELECT owned_json, equipped_json, updated_at FROM lantern_cosmetic_ownership WHERE character_name = ?')
      .bind(characterName)
      .first();
    if (!row) return { owned: [], equipped: {}, updated_at: null };
    return {
      owned: uniqueStrings(parseJsonArray(row.owned_json)),
      equipped: parseJsonObject(row.equipped_json),
      updated_at: row.updated_at || null,
    };
  } catch (_) {
    return { owned: [], equipped: {}, updated_at: null };
  }
}

export async function ensureCosmeticOwnershipRow(db, characterName) {
  const key = String(characterName || '').trim();
  if (!key || !db) return { owned: [], equipped: {} };
  const existing = await fetchCosmeticOwnershipRow(db, key);
  if (existing.updated_at != null) return existing;
  const now = new Date().toISOString();
  await db
    .prepare(
      'INSERT INTO lantern_cosmetic_ownership (character_name, owned_json, equipped_json, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(character_name) DO NOTHING'
    )
    .bind(key, '[]', '{}', now)
    .run();
  return fetchCosmeticOwnershipRow(db, key);
}

export async function grantCosmeticOwnership(db, characterName, cosmeticId) {
  const key = String(characterName || '').trim();
  const cid = String(cosmeticId || '').trim();
  if (!key || !cid || !db) return { ok: false, error: 'missing_fields' };
  const row = await ensureCosmeticOwnershipRow(db, key);
  const owned = uniqueStrings([...(row.owned || []), cid]);
  const now = new Date().toISOString();
  await db
    .prepare(
      'INSERT INTO lantern_cosmetic_ownership (character_name, owned_json, equipped_json, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(character_name) DO UPDATE SET owned_json = excluded.owned_json, updated_at = excluded.updated_at'
    )
    .bind(key, JSON.stringify(owned), JSON.stringify(row.equipped || {}), now)
    .run();
  return { ok: true, cosmetic_id: cid, owned };
}

export async function setEquippedCosmetic(db, characterName, category, cosmeticId) {
  const key = String(characterName || '').trim();
  const cat = String(category || '').trim();
  if (!key || !cat || !db) return { ok: false, error: 'missing_fields' };
  if (!isValidEquipSlot(cat)) return { ok: false, error: 'invalid_slot', category: cat };
  const row = await ensureCosmeticOwnershipRow(db, key);
  const equipped =
    row.equipped && typeof row.equipped === 'object' && !Array.isArray(row.equipped)
      ? { ...row.equipped }
      : {};
  const cid = cosmeticId != null ? String(cosmeticId).trim() : '';
  if (!cid) {
    delete equipped[cat];
  } else {
    const def = getCosmeticById(cid);
    if (!def) return { ok: false, error: 'unknown_cosmetic', cosmetic_id: cid };
    if (def.category !== cat) return { ok: false, error: 'category_mismatch', cosmetic_id: cid, category: cat };
    if ((row.owned || []).indexOf(cid) < 0) return { ok: false, error: 'not_owned', cosmetic_id: cid };
    equipped[cat] = cid;
  }
  const now = new Date().toISOString();
  await db
    .prepare(
      'INSERT INTO lantern_cosmetic_ownership (character_name, owned_json, equipped_json, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(character_name) DO UPDATE SET equipped_json = excluded.equipped_json, updated_at = excluded.updated_at'
    )
    .bind(key, JSON.stringify(row.owned || []), JSON.stringify(equipped), now)
    .run();
  return { ok: true, equipped };
}

export function mergeOwnedItemIds(tableOwned, txOwnedItems) {
  const ids = uniqueStrings([
    ...(tableOwned || []),
    ...(txOwnedItems || []).map((o) => o.item_id).filter(Boolean),
  ]);
  return ids;
}

export function equippedItemsList(equippedMap) {
  const map = equippedMap && typeof equippedMap === 'object' ? equippedMap : {};
  return Object.entries(map).map(([category, item_id]) => ({
    category,
    item_id: String(item_id || ''),
  }));
}

/**
 * Persist private Locker bio on the authenticated pilot account row.
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} username
 * @param {string|null} bio
 */
export async function updateAccountBio(db, username, bio) {
  const user = String(username || '').trim();
  if (!user || !db) return { ok: false, error: 'missing_fields' };
  const now = new Date().toISOString();
  const storedBio = bio == null ? null : String(bio);
  const result = await db
    .prepare('UPDATE lantern_pilot_accounts SET bio = ?, updated_at = ? WHERE username = ?')
    .bind(storedBio, now, user)
    .run();
  if (!result.success) return { ok: false, error: 'bio_update_failed' };
  return { ok: true, bio: normalizeBioFromDb(storedBio), updated_at: now };
}

/** @deprecated — bio no longer persisted on avatar profile rows */
export async function updateProfileBio(db, characterName, bio) {
  return updateAccountBio(db, characterName, bio);
}
