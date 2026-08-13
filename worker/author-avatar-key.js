/**
 * Prompt #218 — resolve the same avatar profile key Locker uses for an author.
 * Staff/admin: lantern_pilot_accounts.username (see avatarCharacterNameForPilotAccount).
 * Students: economy / MTSS / student_character_name / username.
 * Prefer immutable account keys (actor_id / authorId / username) over display names.
 */
import { durableAccountKeyFromPilotAccount } from './durable-account-key.js';

function trimStr(v) {
  return v == null ? '' : String(v).trim();
}

function pilotAvatarKeyFromRow(row) {
  return durableAccountKeyFromPilotAccount(row);
}

/**
 * Build lookup indexes from lantern_pilot_accounts rows.
 * @returns {{ byUsername: Object<string,string>, byDisplayName: Object<string,string>, byStaffId: Object<string,string> }}
 */
export function buildPilotAvatarKeyIndex(rows) {
  const byUsername = Object.create(null);
  const byDisplayName = Object.create(null);
  const byStaffId = Object.create(null);
  (rows || []).forEach((row) => {
    const key = pilotAvatarKeyFromRow(row);
    if (!key) return;
    const username = trimStr(row.username);
    const display = trimStr(row.display_name);
    const staffId = row.staff_id != null && String(row.staff_id).trim() !== '' ? String(row.staff_id).trim() : '';
    if (username) byUsername[username.toLowerCase()] = key;
    if (display) {
      const dk = display.toLowerCase();
      // First writer wins — do not merge rick.radle with admin if names ever collide.
      if (!byDisplayName[dk]) byDisplayName[dk] = key;
    }
    if (staffId) byStaffId[staffId] = key;
  });
  return { byUsername, byDisplayName, byStaffId };
}

export async function loadPilotAvatarKeyIndex(db) {
  if (!db) return buildPilotAvatarKeyIndex([]);
  try {
    const res = await db
      .prepare(
        'SELECT username, display_name, role, staff_id, teacher_id, student_character_name, mtss_student_id FROM lantern_pilot_accounts'
      )
      .all();
    return buildPilotAvatarKeyIndex(res.results || []);
  } catch (_) {
    return buildPilotAvatarKeyIndex([]);
  }
}

/**
 * Resolve avatar profile character_name for feed/ticker/LLHC (current Locker avatar key).
 */
function stripStaffPrefix(raw) {
  const s = trimStr(raw);
  const low = s.toLowerCase();
  if (low.startsWith('staff_id:')) return '';
  if (low.startsWith('staff:')) return s.slice(6).trim();
  return s;
}

export function resolveAuthorAvatarKey(index, fields) {
  const idx = index || buildPilotAvatarKeyIndex([]);
  const authorId = stripStaffPrefix(fields && (fields.authorId || fields.author_id || fields.actor_id));
  const display = trimStr(fields && (fields.authorDisplayName || fields.author_display_name || fields.author_name));
  const characterName = stripStaffPrefix(fields && fields.character_name);
  const staffId = trimStr(fields && (fields.staff_id || fields.authorStaffId));

  if (authorId) {
    const mapped = idx.byUsername[authorId.toLowerCase()];
    if (mapped) return mapped;
    // Already a durable account key (username / student economy id).
    return authorId;
  }
  if (staffId && idx.byStaffId[staffId]) return idx.byStaffId[staffId];
  if (characterName) {
    const asUser = idx.byUsername[characterName.toLowerCase()];
    if (asUser) return asUser;
    const asDisp = idx.byDisplayName[characterName.toLowerCase()];
    if (asDisp) return asDisp;
  }
  if (display) {
    const asUser = idx.byUsername[display.toLowerCase()];
    if (asUser) return asUser;
    const asDisp = idx.byDisplayName[display.toLowerCase()];
    if (asDisp) return asDisp;
  }
  return authorId || characterName || '';
}

export function attachAuthorAvatarKeys(items, index) {
  const list = Array.isArray(items) ? items : [];
  list.forEach((it) => {
    if (!it || typeof it !== 'object') return;
    const key = resolveAuthorAvatarKey(index, it);
    if (key) it.authorAvatarKey = key;
  });
  return list;
}
