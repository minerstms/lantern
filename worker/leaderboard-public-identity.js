/**
 * Prompt #241 — leaderboard public labels + viewer matching keys.
 * Internal matching uses durable account / economy keys. Public UI gets only a safe name.
 */
import { staffIdFromEconomyKey } from './durable-account-key.js';
import { resolveMarqueeActorIdentity } from './marquee-events.js';

function trimStr(v) {
  return v == null ? '' : String(v).trim();
}

function addKey(set, raw) {
  const k = trimStr(raw);
  if (k) set.add(k);
}

/** Resolve public-safe display name from a stored leaderboard character_name. Empty → caller shows Player. */
export function resolveLeaderboardPublicName(nameIndex, characterName) {
  const actor = resolveMarqueeActorIdentity(nameIndex, [characterName]);
  return actor && actor.public_display_name ? String(actor.public_display_name).trim() : '';
}

/**
 * All durable keys that may have been written as lantern_leaderboard_entries.character_name
 * for this authenticated account. Never includes display / public names.
 */
export function viewerLeaderboardIdentityKeys(account, economyCharacterName) {
  const keys = new Set();
  addKey(keys, economyCharacterName);
  if (!account) return Array.from(keys);
  addKey(keys, account.username);
  addKey(keys, account.mtss_student_id);
  addKey(keys, account.student_character_name);
  addKey(keys, account.teacher_id);
  if (account.staff_id != null && String(account.staff_id).trim()) {
    addKey(keys, 'staff_id:' + String(account.staff_id).trim());
  }
  const fromEconomy = staffIdFromEconomyKey(economyCharacterName);
  if (fromEconomy) addKey(keys, 'staff_id:' + fromEconomy);
  return Array.from(keys);
}

export function entryMatchesViewer(characterName, viewerKeys) {
  const key = trimStr(characterName);
  if (!key || !viewerKeys || !viewerKeys.length) return false;
  const low = key.toLowerCase();
  return viewerKeys.some((k) => String(k || '').trim().toLowerCase() === low);
}

export function publicLeaderboardEntry(row) {
  const label = row && row.public_display_name ? String(row.public_display_name).trim() : '';
  return {
    rank: row.rank,
    public_display_name: label || null,
    display_name: label || null,
    game_name: row.game_name || '',
    score: row.score,
    score_display: row.score_display,
  };
}

export function publicLeaderboardYou(you) {
  if (!you) return null;
  const label = you.public_display_name ? String(you.public_display_name).trim() : '';
  return {
    rank: you.rank != null ? you.rank : null,
    score: you.score,
    score_display: you.score_display,
    public_display_name: label || null,
  };
}
