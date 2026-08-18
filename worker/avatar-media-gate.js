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

/**
 * Prompt #227 — lookup keys for one identity. Never uses public labels.
 * Staff economy keys (`staff_id:N`) are not avatar profile PKs.
 */
export function collectAvatarLookupCandidates(...values) {
  const out = [];
  const seen = new Set();
  values.forEach((raw) => {
    const s = String(raw || '').trim();
    if (!s) return;
    const low = s.toLowerCase();
    if (low.startsWith('staff_id:')) return;
    if (seen.has(low)) return;
    seen.add(low);
    out.push(s);
  });
  return out;
}

export function avatarCandidatesFromPilotAccount(row) {
  if (!row) return [];
  const role = String(row.role || '').trim().toLowerCase();
  if (role === 'student') {
    return collectAvatarLookupCandidates(
      row.mtss_student_id,
      row.student_character_name,
      row.username,
      row.student_id,
      row.lantern_username
    );
  }
  return collectAvatarLookupCandidates(row.username);
}

export function buildAvatarImageUrl(origin, imageKey, updatedAt) {
  if (!origin || !imageKey) return null;
  const key = String(imageKey).trim();
  if (!key) return null;
  const v = updatedAt ? String(updatedAt).replace(/[^\d]/g, '').slice(0, 14) : '';
  return origin + '/api/avatar/image?key=' + encodeURIComponent(key) + (v ? ('&v=' + encodeURIComponent(v)) : '');
}

export async function loadAvatarProfileByCandidates(db, candidates) {
  const list = collectAvatarLookupCandidates(...(Array.isArray(candidates) ? candidates : []));
  if (!db || !list.length) return null;
  for (let i = 0; i < list.length; i++) {
    try {
      const row = await db
        .prepare(
          'SELECT character_name, current_avatar_key, bio, updated_at FROM lantern_avatar_profiles WHERE character_name = ?'
        )
        .bind(list[i])
        .first();
      if (row && String(row.current_avatar_key || '').trim()) return row;
    } catch (_) {}
  }
  return null;
}

export async function loadLatestApprovedAvatarSubmission(db, candidates) {
  const list = collectAvatarLookupCandidates(...(Array.isArray(candidates) ? candidates : []));
  if (!db || !list.length) return null;
  for (let i = 0; i < list.length; i++) {
    try {
      const row = await db
        .prepare(
          `SELECT id, character_name, image_key, status, approved_at, created_at
           FROM lantern_avatar_submissions
           WHERE character_name = ? AND status = 'approved'
           ORDER BY COALESCE(approved_at, created_at) DESC LIMIT 1`
        )
        .bind(list[i])
        .first();
      if (row && String(row.image_key || '').trim()) return row;
    } catch (_) {}
  }
  return null;
}

export function isUnapprovedAvatarStatus(status) {
  const s = String(status || '').trim().toLowerCase();
  return s === 'pending' || s === 'rejected';
}

export async function loadAvatarSubmissionForImageKey(db, candidates, imageKey) {
  const key = String(imageKey || '').trim();
  const list = collectAvatarLookupCandidates(...(Array.isArray(candidates) ? candidates : []));
  if (!db || !key || !list.length) return null;
  for (let i = 0; i < list.length; i++) {
    try {
      const row = await db
        .prepare(
          `SELECT id, character_name, image_key, status, approved_at, created_at
           FROM lantern_avatar_submissions
           WHERE character_name = ? AND image_key = ?
           ORDER BY created_at DESC LIMIT 1`
        )
        .bind(list[i], key)
        .first();
      if (row && String(row.image_key || '').trim()) return row;
    } catch (_) {}
  }
  return null;
}

/**
 * Public surfaces may use current only when that key is not a pending/rejected submission.
 * A current key with no submission row remains valid (staff/legacy approved current).
 */
export function selectPublicAvatarKey(currentKey, approvedKey, currentSubmissionStatus) {
  const cur = String(currentKey || '').trim();
  const appr = String(approvedKey || '').trim();
  if (cur && !isUnapprovedAvatarStatus(currentSubmissionStatus)) return cur;
  return appr || '';
}

export async function loadLatestPendingAvatarSubmission(db, candidates) {
  const list = collectAvatarLookupCandidates(...(Array.isArray(candidates) ? candidates : []));
  if (!db || !list.length) return null;
  for (let i = 0; i < list.length; i++) {
    try {
      const row = await db
        .prepare(
          `SELECT id, image_key, created_at, approved_by FROM lantern_avatar_submissions
           WHERE character_name = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1`
        )
        .bind(list[i])
        .first();
      if (row && String(row.image_key || '').trim()) return row;
    } catch (_) {}
  }
  return null;
}

/**
 * Current = lantern_avatar_profiles.current_avatar_key (selection).
 * Approved = lantern_avatar_submissions.status = 'approved' (public-eligible).
 * Public surfaces use current when it is public-safe; otherwise an already-approved fallback.
 * Pending/rejected keys are never returned as publicImageKey, even if stored as current.
 */
export async function resolveCanonicalAvatarState(db, requestedName, opts) {
  const requested = String(requestedName || '').trim();
  const extra = opts && Array.isArray(opts.candidates) ? opts.candidates : [];
  const candidates = collectAvatarLookupCandidates(requested, ...extra);
  const profile = await loadAvatarProfileByCandidates(db, candidates);
  const approved = await loadLatestApprovedAvatarSubmission(db, candidates);
  const pending = opts && opts.includePending ? await loadLatestPendingAvatarSubmission(db, candidates) : null;
  const currentKey = profile && String(profile.current_avatar_key || '').trim() ? String(profile.current_avatar_key).trim() : '';
  const approvedKey = approved && String(approved.image_key || '').trim() ? String(approved.image_key).trim() : '';
  const currentSubmission = currentKey ? await loadAvatarSubmissionForImageKey(db, candidates, currentKey) : null;
  const currentStatus = currentSubmission ? String(currentSubmission.status || '') : '';
  const publicImageKey = selectPublicAvatarKey(currentKey, approvedKey, currentStatus);
  const currentIsPublicSafe = !!(currentKey && publicImageKey === currentKey);
  return {
    requested,
    candidates,
    profile,
    approved,
    pending,
    currentKey: currentKey || null,
    approvedKey: approvedKey || null,
    publicImageKey: publicImageKey || null,
    currentIsPublicSafe,
    source: currentIsPublicSafe ? 'current' : publicImageKey && approvedKey ? 'approved_fallback' : null,
    resolvedCharacterName:
      (profile && profile.character_name) ||
      (approved && approved.character_name) ||
      (pending && pending.character_name) ||
      requested,
  };
}
