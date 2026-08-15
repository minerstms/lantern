/**
 * Prompt #221 — student avatar activation + public serving gates.
 * Restricted (media_publicity_restricted = 1) is the only reliable negative signal.
 * Default 0 is NOT treated as confirmed parental consent.
 */
import { loadRestrictedStudentIdSet, studentIdIsRestricted } from './media-publicity.js';

/**
 * Sole avatar-manager predicate.
 * Immutable identity is the locked primary admin username `admin`
 * (LANTERN_PRIMARY_ADMIN_USERNAME). Not role, not display name, not rick.radle.
 */
export function canManageLanternAvatars(account) {
  if (!account) return false;
  if (String(account.username || '').trim().toLowerCase() !== 'admin') return false;
  if (account.is_active === 0 || account.is_active === '0' || account.is_active === false) return false;
  return true;
}

export async function loadApprovedAvatarCharacterSet(db) {
  const set = new Set();
  if (!db) return set;
  try {
    const rows = await db
      .prepare(
        `SELECT character_name FROM lantern_avatar_profiles
         WHERE current_avatar_key IS NOT NULL AND TRIM(current_avatar_key) != ''`
      )
      .all();
    (rows.results || []).forEach((r) => {
      const k = String(r.character_name || '').trim().toLowerCase();
      if (k) set.add(k);
    });
  } catch (_) {}
  return set;
}

export function accountHasApprovedAvatar(row, avatarSet) {
  if (!row || !avatarSet) return false;
  const keys = [row.mtss_student_id, row.student_character_name, row.username, row.student_id, row.lantern_username];
  return keys.some((k) => {
    const s = String(k || '').trim().toLowerCase();
    return !!(s && avatarSet.has(s));
  });
}

export function matchRosterStudentsById(students, rawKey) {
  const key = String(rawKey || '').trim().toLowerCase();
  if (!key) return { error: 'roster_identity_unavailable' };
  const hits = (students || []).filter((s) => String((s && s.student_id) || '').trim().toLowerCase() === key);
  if (hits.length > 1) return { error: 'roster_identity_ambiguous' };
  if (hits.length === 0) return { error: 'roster_identity_unavailable' };
  return { student: hits[0] };
}

export function rosterStudentIsActive(row) {
  if (!row) return false;
  if (row.is_active != null) return Number(row.is_active) === 1;
  const st = String(row.tms_status || '').trim().toLowerCase();
  if (st === 'inactive' || st === 'archived') return false;
  return true;
}

export function rosterStudentAvatarKeyCandidates(row) {
  return [row && row.student_id, row && row.mtss_student_id, row && row.lantern_username, row && row.username]
    .map((k) => String(k || '').trim())
    .filter(Boolean);
}

export function resolveAvatarKeyFromMap(candidates, avatarByChar) {
  if (!avatarByChar) return '';
  const list = Array.isArray(candidates) ? candidates : [];
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (avatarByChar[c]) return c;
  }
  const keys = Object.keys(avatarByChar);
  for (let i = 0; i < list.length; i++) {
    const low = String(list[i] || '').toLowerCase();
    const hit = keys.find((k) => k.toLowerCase() === low);
    if (hit) return hit;
  }
  return '';
}

export async function findAvatarTargetAccount(db, rawKey) {
  const key = String(rawKey || '').trim();
  if (!db || !key) return null;
  const byUser = await db
    .prepare(
      `SELECT username, role, mtss_student_id, student_character_name, staff_id, is_active
       FROM lantern_pilot_accounts WHERE lower(trim(username)) = lower(trim(?)) LIMIT 1`
    )
    .bind(key)
    .first();
  if (byUser) return byUser;
  const bySid = await db
    .prepare(
      `SELECT username, role, mtss_student_id, student_character_name, staff_id, is_active
       FROM lantern_pilot_accounts
       WHERE lower(trim(COALESCE(mtss_student_id, ''))) = lower(trim(?)) LIMIT 2`
    )
    .bind(key)
    .all();
  const rows = (bySid && bySid.results) || [];
  return rows.length === 1 ? rows[0] : null;
}

export const ADMIN_STAGED_AVATAR_PREFIX = 'staged:';

export function isAdminStagedAvatarMarker(raw) {
  return String(raw || '').startsWith(ADMIN_STAGED_AVATAR_PREFIX);
}

export function adminStagedAvatarMarker(adminLabel) {
  const label = String(adminLabel || 'admin').trim() || 'admin';
  return ADMIN_STAGED_AVATAR_PREFIX + label;
}

export async function studentAvatarIsRestricted(db, characterName) {
  const id = String(characterName || '').trim();
  if (!db || !id) return false;
  const set = await loadRestrictedStudentIdSet(db);
  return studentIdIsRestricted(id, set);
}

export async function studentAvatarActivationBlocked(db, characterName) {
  if (await studentAvatarIsRestricted(db, characterName)) {
    return { blocked: true, error: 'media_restricted' };
  }
  return { blocked: false };
}

export async function writeCurrentAvatarKey(db, characterName, imageKey, now) {
  await db
    .prepare(
      `INSERT INTO lantern_avatar_profiles (character_name, current_avatar_key, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(character_name) DO UPDATE SET
         current_avatar_key = excluded.current_avatar_key,
         updated_at = excluded.updated_at`
    )
    .bind(characterName, imageKey, now)
    .run();
}
