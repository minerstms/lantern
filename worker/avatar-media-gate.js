/**
 * Prompt #221 — student avatar activation + public serving gates.
 * Restricted (media_publicity_restricted = 1) is the only reliable negative signal.
 * Default 0 is NOT treated as confirmed parental consent.
 */
import { loadRestrictedStudentIdSet, studentIdIsRestricted } from './media-publicity.js';

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
