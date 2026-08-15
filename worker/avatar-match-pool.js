/**
 * Prompt #147 — Avatar Match pool from real active accounts with approved avatars.
 * No legacy/static roster. Labels are resolvePublicDisplayName only.
 */
import { resolvePublicDisplayName } from './staff-public-name.js';
import { isKnownDemoPersonaName } from './demo-persona-guard.js';
import { studentIdIsRestricted } from './media-publicity.js';

function trimStr(v) {
  return v == null ? '' : String(v).trim();
}

function lower(v) {
  return trimStr(v).toLowerCase();
}

export function isExcludedAvatarMatchAccount(row) {
  if (!row) return true;
  const active = row.is_active != null ? Number(row.is_active) : 1;
  if (active === 0) return true;
  const u = lower(row.username);
  if (!u) return true;
  if (u.startsWith('test_')) return true;
  if (u.startsWith('e2e_') || u.startsWith('verify_')) return true;
  if (isKnownDemoPersonaName(row.display_name) || isKnownDemoPersonaName(row.public_display_name)) return true;
  return false;
}

/**
 * @param {object[]} accounts
 * @param {Record<string, string>} avatarByChar character_name → current_avatar_key
 * @param {string} origin
 * @param {(row: object) => string} avatarKeyFn
 * @param {{ restrictedSet?: Set<string> }} [opts]
 */
export function buildAvatarMatchPool(accounts, avatarByChar, origin, avatarKeyFn, opts) {
  const restrictedSet = opts && opts.restrictedSet;
  const list = [];
  (accounts || []).forEach((row) => {
    if (isExcludedAvatarMatchAccount(row)) return;
    const charName = avatarKeyFn ? avatarKeyFn(row) : '';
    if (!charName) return;
    if (studentIdIsRestricted(charName, restrictedSet)) return;
    const avatarKey = avatarByChar && avatarByChar[charName];
    if (!avatarKey) return;
    const label = resolvePublicDisplayName(row);
    if (!label) return;
    list.push({
      display_name: label,
      public_display_name: label,
      avatar_url: origin ? origin + '/api/avatar/image?key=' + encodeURIComponent(avatarKey) : null,
    });
  });
  return list;
}

/** Unique public labels only. Ambiguous duplicate names are dropped from a question, not disambiguated with IDs. */
export function uniqueAvatarMatchByLabel(characters) {
  const seen = Object.create(null);
  const dupes = Object.create(null);
  (characters || []).forEach((c) => {
    const lab = lower(c && c.display_name);
    if (!lab) return;
    if (seen[lab]) dupes[lab] = true;
    else seen[lab] = c;
  });
  return (characters || []).filter((c) => {
    const lab = lower(c && c.display_name);
    return lab && seen[lab] === c && !dupes[lab];
  });
}
