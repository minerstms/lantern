/**
 * Prompt #147/#236 — Avatar Match pool from real active accounts with public-safe avatars.
 * Public-safe = approved current OR canonical approved fallback (selectPublicAvatarKey).
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
 * @param {Record<string, string>} avatarByChar character_name → public-safe image key
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
    const role = lower(row.role);
    list.push({
      display_name: label,
      public_display_name: label,
      avatar_url: origin ? origin + '/api/avatar/image?key=' + encodeURIComponent(avatarKey) : null,
      person_type: role === 'student' ? 'student' : 'staff',
    });
  });
  return list;
}

export function isExcludedAvatarMatchRosterStudent(row) {
  if (!row) return true;
  const active = row.is_active != null ? Number(row.is_active) : 1;
  if (active === 0) return true;
  const sid = lower(row.student_id);
  if (!sid) return true;
  if (sid.startsWith('test_') || sid.startsWith('e2e_') || sid.startsWith('verify_')) return true;
  if (isKnownDemoPersonaName(row.student_name) || isKnownDemoPersonaName(row.display_name) || isKnownDemoPersonaName(row.public_display_name)) {
    return true;
  }
  return false;
}

function rosterStudentNameRow(row) {
  const first = trimStr(row && row.first_name);
  const last = trimStr(row && row.last_name);
  let firstName = first;
  let lastName = last;
  const full = trimStr((row && (row.student_name || row.display_name)) || '');
  if (!firstName && !lastName && full) {
    const parts = full.split(/\s+/).filter(Boolean);
    firstName = parts[0] || '';
    lastName = parts.slice(1).join(' ');
  }
  return {
    role: 'student',
    first_name: firstName,
    last_name: lastName,
    display_name: full,
    public_display_name: row && row.public_display_name,
  };
}

/**
 * Active TMS roster students with an approved avatar. No Lantern login required.
 * Avatar key prefers immutable student_id, then legacy username keys (read-compatible).
 */
export function buildRosterStudentAvatarMatchPool(students, avatarByChar, origin, opts) {
  const restrictedSet = opts && opts.restrictedSet;
  const list = [];
  (students || []).forEach((row) => {
    if (isExcludedAvatarMatchRosterStudent(row)) return;
    const sid = trimStr(row.student_id);
    if (!sid || studentIdIsRestricted(sid, restrictedSet)) return;
    const lookup = resolveRosterAvatarLookup(row, avatarByChar);
    if (!lookup) return;
    const label = resolvePublicDisplayName(rosterStudentNameRow(row));
    if (!label) return;
    list.push({
      display_name: label,
      public_display_name: label,
      avatar_url: origin ? origin + '/api/avatar/image?key=' + encodeURIComponent(lookup) : null,
      person_type: 'student',
    });
  });
  return list;
}

function resolveRosterAvatarLookup(row, avatarByChar) {
  if (!avatarByChar) return '';
  const candidates = [row.student_id, row.mtss_student_id, row.lantern_username, row.username]
    .map(trimStr)
    .filter(Boolean);
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (avatarByChar[c]) return avatarByChar[c];
  }
  const keys = Object.keys(avatarByChar);
  for (let i = 0; i < candidates.length; i++) {
    const low = candidates[i].toLowerCase();
    const hit = keys.find((k) => k.toLowerCase() === low);
    if (hit) return avatarByChar[hit];
  }
  return '';
}

/**
 * Same roster the Avatar Match API returns. Count must equal this array's length.
 * When TMS roster students are present, students come from that roster (no login required);
 * staff still come from active pilot accounts.
 */
export function buildAvatarMatchCharacters(accounts, rosterStudents, avatarByChar, origin, avatarKeyFn, opts) {
  const restrictedSet = opts && opts.restrictedSet;
  let pool;
  if (rosterStudents) {
    const staffAccounts = (accounts || []).filter((a) => String(a.role || '').trim().toLowerCase() !== 'student');
    pool = buildAvatarMatchPool(staffAccounts, avatarByChar, origin, avatarKeyFn, { restrictedSet }).concat(
      buildRosterStudentAvatarMatchPool(rosterStudents, avatarByChar, origin, { restrictedSet })
    );
  } else {
    pool = buildAvatarMatchPool(accounts, avatarByChar, origin, avatarKeyFn, { restrictedSet });
  }
  return uniqueAvatarMatchByLabel(pool);
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
