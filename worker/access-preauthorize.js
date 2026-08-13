/**
 * Prompt #142 — teacher pre-authorization for Individual Access.
 *
 * A pre-authorization is teacher INTENT only. It never unlocks Lantern by itself.
 * Claim happens after successful authenticated student identity, then converts into the
 * existing device-bound lantern_access_requests grant (cookie hash, not bare login).
 */
import {
  ACCESS_DEVICE_COOKIE_NAME,
  ACCESS_REQUEST_PENDING_TTL_SEC,
  ACCESS_REQUEST_ALLOWED_GRANT_MINUTES,
  generateRequestPhrase,
  generateDeviceSecret,
  hashOpaqueSecret,
  buildAccessDeviceCookieHeader,
  derivedRequestStatus,
} from './access-requests.js';

export const ACCESS_PREAUTH_CLAIM_TTL_SEC = ACCESS_REQUEST_PENDING_TTL_SEC;

function trimStr(v) {
  return v == null ? '' : String(v).trim();
}

export function studentPublicLabel(row) {
  if (!row) return 'Student';
  const display = trimStr(row.student_display_name || row.display_name || row.student_character_name);
  const sid = trimStr(row.student_id || row.mtss_student_id);
  const username = trimStr(row.student_username || row.username);
  return display || sid || username || 'Student';
}

export function studentIdLabel(row) {
  if (!row) return '';
  return trimStr(row.student_id || row.mtss_student_id || row.username || row.student_username);
}

function readCookie(request, name) {
  const header = request && request.headers ? request.headers.get('Cookie') || '' : '';
  if (!header || !name) return '';
  const parts = header.split(';');
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i].trim();
    const eq = seg.indexOf('=');
    if (eq === -1) continue;
    if (seg.slice(0, eq).trim() !== name) continue;
    let v = seg.slice(eq + 1).trim();
    try {
      v = decodeURIComponent(v);
    } catch (_) {}
    return v;
  }
  return '';
}

export async function loadActiveStudentAccount(db, rawUsername) {
  const username = trimStr(rawUsername);
  if (!username || !db) return null;
  const row = await db
    .prepare(
      `SELECT username, display_name, student_character_name, mtss_student_id, role, is_active
       FROM lantern_pilot_accounts WHERE lower(trim(username)) = lower(trim(?)) LIMIT 1`
    )
    .bind(username)
    .first();
  if (!row) return null;
  if (String(row.role || '').trim().toLowerCase() !== 'student') return null;
  const ia = row.is_active != null ? Number(row.is_active) : 1;
  if (ia === 0) return null;
  return row;
}

export async function searchActiveStudents(db, query, limit) {
  const q = trimStr(query).toLowerCase();
  const cap = Math.min(25, Math.max(1, parseInt(limit, 10) || 12));
  if (!db) return [];
  const rows = await db
    .prepare(
      `SELECT username, display_name, student_character_name, mtss_student_id, is_active, role
       FROM lantern_pilot_accounts
       WHERE lower(trim(role)) = 'student'
       ORDER BY display_name, username
       LIMIT 200`
    )
    .all();
  const out = [];
  for (const r of rows.results || []) {
    const ia = r.is_active != null ? Number(r.is_active) : 1;
    if (ia === 0) continue;
    const username = trimStr(r.username);
    const display = trimStr(r.display_name || r.student_character_name);
    const sid = trimStr(r.mtss_student_id);
    const hay = (username + ' ' + display + ' ' + sid).toLowerCase();
    if (q && hay.indexOf(q) === -1) continue;
    out.push({
      username,
      display_name: display || username,
      student_id: sid,
    });
    if (out.length >= cap) break;
  }
  return out;
}

export async function findUnclaimedPreauth(db, studentUsername, nowIso) {
  const username = trimStr(studentUsername);
  if (!username) return null;
  return db
    .prepare(
      `SELECT id, student_username, student_display_name, student_id, duration_minutes,
              created_at, created_by_staff_id, created_by_staff_name, claim_expires_at, claimed_at, claimed_request_id, cancelled_at
       FROM lantern_access_pre_authorizations
       WHERE lower(trim(student_username)) = lower(trim(?))
         AND claimed_at IS NULL
         AND cancelled_at IS NULL
         AND claim_expires_at > ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .bind(username, nowIso)
    .first();
}

export async function listUnclaimedPreauths(db, nowIso) {
  const rows = await db
    .prepare(
      `SELECT id, student_username, student_display_name, student_id, duration_minutes,
              created_at, created_by_staff_name, claim_expires_at
       FROM lantern_access_pre_authorizations
       WHERE claimed_at IS NULL AND cancelled_at IS NULL AND claim_expires_at > ?
       ORDER BY created_at ASC`
    )
    .bind(nowIso)
    .all();
  return rows.results || [];
}

export async function mapClaimedRequestSources(db, requestIds) {
  const ids = (requestIds || []).map((id) => trimStr(id)).filter(Boolean);
  const out = {};
  if (!ids.length) return out;
  const rows = await db
    .prepare(
      `SELECT claimed_request_id FROM lantern_access_pre_authorizations
       WHERE claimed_request_id IS NOT NULL AND claimed_request_id != ''`
    )
    .all();
  const claimed = new Set((rows.results || []).map((r) => trimStr(r.claimed_request_id)));
  ids.forEach((id) => {
    out[id] = claimed.has(id) ? 'Teacher' : 'Student Request';
  });
  return out;
}

export async function upsertStudentPreauthorization(db, params) {
  const studentRow = params && params.studentRow;
  const durationMinutes = Number(params && params.durationMinutes);
  const nowDate = params && params.nowDate instanceof Date ? params.nowDate : new Date();
  const username = trimStr(studentRow && studentRow.username);
  if (!db || !username) return { ok: false, error: 'missing_student' };
  if (!ACCESS_REQUEST_ALLOWED_GRANT_MINUTES.includes(durationMinutes)) {
    return { ok: false, error: 'duration_minutes must be 15 or 30' };
  }
  const nowIso = nowDate.toISOString();
  const claimExpiresAt = new Date(nowDate.getTime() + ACCESS_PREAUTH_CLAIM_TTL_SEC * 1000).toISOString();
  const display = trimStr(studentRow.display_name || studentRow.student_character_name) || username;
  const studentId = trimStr(studentRow.mtss_student_id) || username;
  const staffId = trimStr(params.staffId) || null;
  const staffName = trimStr(params.staffName) || 'Teacher';
  const existing = await findUnclaimedPreauth(db, username, nowIso);
  if (existing) {
    await db
      .prepare(
        `UPDATE lantern_access_pre_authorizations
         SET duration_minutes = ?, created_at = ?, created_by_staff_id = ?, created_by_staff_name = ?, claim_expires_at = ?
         WHERE id = ? AND claimed_at IS NULL AND cancelled_at IS NULL`
      )
      .bind(durationMinutes, nowIso, staffId, staffName, claimExpiresAt, existing.id)
      .run();
    return {
      ok: true,
      replaced: true,
      id: existing.id,
      student_username: username,
      student_display_name: display,
      student_id: studentId,
      durationMinutes,
      claimExpiresAt,
      createdAt: nowIso,
    };
  }
  const id = 'accpre_' + crypto.randomUUID().replace(/-/g, '');
  await db
    .prepare(
      `INSERT INTO lantern_access_pre_authorizations (
         id, student_username, student_display_name, student_id, duration_minutes,
         created_at, created_by_staff_id, created_by_staff_name, claim_expires_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, username, display, studentId, durationMinutes, nowIso, staffId, staffName, claimExpiresAt)
    .run();
  return {
    ok: true,
    replaced: false,
    id,
    student_username: username,
    student_display_name: display,
    student_id: studentId,
    durationMinutes,
    claimExpiresAt,
    createdAt: nowIso,
  };
}

export async function cancelUnclaimedPreauthorization(db, preauthId, nowIso) {
  const id = trimStr(preauthId);
  if (!db || !id) return { ok: false, error: 'Missing id' };
  const stamp = nowIso || new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE lantern_access_pre_authorizations
       SET cancelled_at = ?
       WHERE id = ? AND claimed_at IS NULL AND cancelled_at IS NULL`
    )
    .bind(stamp, id)
    .run();
  if (!result || !result.meta || !result.meta.changes) {
    return { ok: false, error: 'preauth_not_cancellable' };
  }
  return { ok: true, id, status: 'cancelled' };
}

/**
 * Convert a valid unclaimed pre-authorization into a canonical approved device-bound grant.
 * Returns { claimed, reason, grantExpiresAt, durationMinutes, deviceCookie, requestId }.
 * Does not grant on bare username. Caller must have already authenticated the student.
 */
export async function claimPreauthorizationAfterLogin(db, request, account, secure) {
  const empty = { claimed: false, reason: 'no_preauth' };
  if (!db || !account) return empty;
  if (String(account.role || '').trim().toLowerCase() !== 'student') return { claimed: false, reason: 'not_student' };
  const username = trimStr(account.username);
  if (!username) return empty;

  const nowDate = new Date();
  const nowIso = nowDate.toISOString();
  const pre = await findUnclaimedPreauth(db, username, nowIso);
  if (!pre) return empty;

  const existingSecret = readCookie(request, ACCESS_DEVICE_COOKIE_NAME);
  if (existingSecret) {
    const existingHash = await hashOpaqueSecret(existingSecret);
    const grantRow = await db
      .prepare(
        'SELECT status, grant_expires_at, revoked_at FROM lantern_access_requests WHERE device_secret_hash = ? ORDER BY created_at DESC LIMIT 1'
      )
      .bind(existingHash)
      .first();
    if (grantRow && derivedRequestStatus(grantRow, nowIso) === 'approved') {
      return { claimed: false, reason: 'existing_active_grant' };
    }
  }

  const claimStamp = nowIso;
  const consume = await db
    .prepare(
      `UPDATE lantern_access_pre_authorizations
       SET claimed_at = ?
       WHERE id = ? AND claimed_at IS NULL AND cancelled_at IS NULL AND claim_expires_at > ?`
    )
    .bind(claimStamp, pre.id, nowIso)
    .run();
  if (!consume || !consume.meta || !consume.meta.changes) {
    return { claimed: false, reason: 'lost_race' };
  }

  const deviceSecret = existingSecret || generateDeviceSecret();
  const deviceHash = await hashOpaqueSecret(deviceSecret);
  const durationMinutes = ACCESS_REQUEST_ALLOWED_GRANT_MINUTES.includes(Number(pre.duration_minutes))
    ? Number(pre.duration_minutes)
    : 15;
  const grantExpiresAt = new Date(nowDate.getTime() + durationMinutes * 60 * 1000).toISOString();
  const requestId = 'accreq_' + crypto.randomUUID().replace(/-/g, '');
  let phrase = '';
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = generateRequestPhrase();
    const clash = await db
      .prepare(
        "SELECT id FROM lantern_access_requests WHERE request_phrase = ? AND status = 'pending' AND request_expires_at > ?"
      )
      .bind(candidate, nowIso)
      .first();
    if (!clash) {
      phrase = candidate;
      break;
    }
  }
  if (!phrase) phrase = generateRequestPhrase();
  const displayName =
    trimStr(pre.student_display_name) ||
    trimStr(account.display_name) ||
    trimStr(account.student_character_name) ||
    username;

  try {
    await db
      .prepare(
        `INSERT INTO lantern_access_requests (
           id, request_phrase, student_username, student_character_name, proposed_name,
           device_secret_hash, requester_ip_hash, status, requested_at, request_expires_at,
           decided_at, decided_by_staff_id, decided_by_staff_name, grant_expires_at, created_at
         ) VALUES (?, ?, ?, ?, NULL, ?, NULL, 'approved', ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        requestId,
        phrase,
        username,
        displayName,
        deviceHash,
        nowIso,
        nowIso,
        nowIso,
        trimStr(pre.created_by_staff_id) || null,
        trimStr(pre.created_by_staff_name) || 'Teacher',
        grantExpiresAt,
        nowIso
      )
      .run();
  } catch (_) {
    await db
      .prepare(
        `UPDATE lantern_access_pre_authorizations SET claimed_at = NULL WHERE id = ? AND claimed_at = ? AND claimed_request_id IS NULL`
      )
      .bind(pre.id, claimStamp)
      .run();
    return { claimed: false, reason: 'grant_insert_failed' };
  }

  await db
    .prepare('UPDATE lantern_access_pre_authorizations SET claimed_request_id = ? WHERE id = ?')
    .bind(requestId, pre.id)
    .run();

  return {
    claimed: true,
    reason: 'claimed',
    preauthId: pre.id,
    requestId,
    grantExpiresAt,
    durationMinutes,
    deviceCookie: buildAccessDeviceCookieHeader(deviceSecret, !!secure),
  };
}
