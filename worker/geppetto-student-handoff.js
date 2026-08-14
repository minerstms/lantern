/**
 * Lantern → Geppetto student SSO handoff helpers.
 * Browser authorize + server-to-server redeem. Hash-only storage. 90s TTL.
 * Do not reuse TMS staff lantern_handoffs or TMS_LANTERN_BRIDGE_SECRET.
 */

import { generateOpaqueSecret, hashOpaqueSecret } from './device-enrollment.js';

export const GEPPETTO_STUDENT_AUDIENCE = 'geppetto_student';
export const GEPPETTO_STUDENT_HANDOFF_TTL_SEC = 90;

export const GEPPETTO_STUDENT_CALLBACK_ALLOWLIST = [
  'https://mrradle.us/api/stem-daily/student/lantern-callback',
  'https://geppetto-full-deploy-v6.pages.dev/api/stem-daily/student/lantern-callback',
];

const ALLOWED_CALLBACK_HOSTS = ['mrradle.us', 'geppetto-full-deploy-v6.pages.dev'];
const CALLBACK_PATH = '/api/stem-daily/student/lantern-callback';

export function isSafeGeppettoNextPath(raw) {
  const s = String(raw || '').trim();
  if (!s || s.charAt(0) !== '/') return false;
  if (s.indexOf('//') === 0) return false;
  if (s.indexOf('\\') >= 0) return false;
  if (s.indexOf('://') >= 0) return false;
  const pathOnly = s.split('?')[0].split('#')[0];
  if (pathOnly === '/api/stem-daily/student/lantern-start') return false;
  if (pathOnly === '/api/stem-daily/student/lantern-callback') return false;
  if (s.length > 500) return false;
  return true;
}

/** Allow only the two Geppetto callback URLs. No default redirect. No open redirect. */
export function sanitizeGeppettoStudentReturn(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  let u;
  try {
    u = new URL(s);
  } catch (_) {
    return '';
  }
  if (u.protocol !== 'https:') return '';
  const host = String(u.hostname || '').toLowerCase();
  if (ALLOWED_CALLBACK_HOSTS.indexOf(host) === -1) return '';
  if (u.pathname !== CALLBACK_PATH) return '';
  const originPath = 'https://' + host + CALLBACK_PATH;
  const next = String(u.searchParams.get('next') || '').trim();
  if (!isSafeGeppettoNextPath(next)) return originPath;
  return originPath + '?next=' + encodeURIComponent(next);
}

export function appendHandoffCodeToReturn(returnUrl, code) {
  const base = String(returnUrl || '').trim();
  if (!base) return '';
  const sep = base.indexOf('?') >= 0 ? '&' : '?';
  return base + sep + 'code=' + encodeURIComponent(String(code || ''));
}

export function lanternStudentDisplaySnapshot(account) {
  if (!account) return '';
  const character = String(account.student_character_name || '').trim();
  const display = String(account.display_name || '').trim();
  const username = String(account.username || '').trim();
  return character || display || username;
}

export function geppettoStudentAuthorizeFailurePage(errorCode, cors) {
  const messages = {
    return_not_allowed: 'This sign-in link is not valid. Return to your STEM page and try Continue with Lantern again.',
    lantern_account_not_student: 'STEM Daily Work sign-in is for student accounts only.',
    lantern_account_disabled: 'This Lantern account is inactive. Ask your teacher for help.',
    missing_roster_id:
      'Your Lantern account is not linked to a school student ID yet. Ask your teacher or school admin to link it before using STEM Daily Work.',
    mint_failed: 'Could not start STEM sign-in. Try again from your STEM page.',
    handoff_unavailable: 'STEM sign-in is temporarily unavailable. Try again shortly.',
  };
  const msg = messages[errorCode] || 'Could not sign in to STEM Daily Work. Ask your teacher for help.';
  const html =
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>STEM sign-in</title></head><body style="font-family:system-ui;padding:24px;max-width:560px;margin:40px auto;line-height:1.45;">' +
    '<h1 style="font-size:28px;">Could not continue to STEM</h1><p style="font-size:20px;">' +
    msg +
    '</p><p style="font-size:18px;"><a href="/login.html">Sign in to Lantern</a></p></body></html>';
  return new Response(html, {
    status: 401,
    headers: { ...(cors || {}), 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export function bearerTokenFromRequest(request) {
  const auth = String((request && request.headers && request.headers.get('Authorization')) || '');
  if (auth.slice(0, 7).toLowerCase() === 'bearer ') return auth.slice(7).trim();
  return '';
}

export async function mintGeppettoStudentHandoff(db, identity) {
  const mtssStudentId = String((identity && identity.mtssStudentId) || '').trim();
  if (!mtssStudentId) return { ok: false, error: 'missing_roster_id' };
  const lanternUsername = String((identity && identity.lanternUsername) || '').trim().slice(0, 128);
  const displayName = String((identity && identity.displayName) || '').trim().slice(0, 200);
  const code = generateOpaqueSecret();
  const codeHash = await hashOpaqueSecret(code);
  const id = crypto.randomUUID();
  const now = new Date();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + GEPPETTO_STUDENT_HANDOFF_TTL_SEC * 1000).toISOString();
  try {
    await db
      .prepare(
        `INSERT INTO geppetto_student_handoffs (
          id, code_hash, lantern_username, mtss_student_id, display_name,
          audience, created_at, expires_at, consumed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`
      )
      .bind(
        id,
        codeHash,
        lanternUsername || null,
        mtssStudentId,
        displayName || null,
        GEPPETTO_STUDENT_AUDIENCE,
        createdAt,
        expiresAt
      )
      .run();
  } catch (_) {
    return { ok: false, error: 'mint_failed' };
  }
  return { ok: true, code, expires_at: expiresAt, ttl_seconds: GEPPETTO_STUDENT_HANDOFF_TTL_SEC };
}

export async function redeemGeppettoStudentHandoff(db, code, audience) {
  const raw = String(code || '').trim();
  if (!raw) return { ok: false, error: 'missing_code' };
  if (String(audience || '').trim() !== GEPPETTO_STUDENT_AUDIENCE) {
    return { ok: false, error: 'wrong_audience' };
  }
  const codeHash = await hashOpaqueSecret(raw);
  const now = new Date().toISOString();
  let result;
  try {
    result = await db
      .prepare(
        `UPDATE geppetto_student_handoffs
         SET consumed_at = ?
         WHERE code_hash = ?
           AND audience = ?
           AND consumed_at IS NULL
           AND expires_at > ?`
      )
      .bind(now, codeHash, GEPPETTO_STUDENT_AUDIENCE, now)
      .run();
  } catch (_) {
    return { ok: false, error: 'redeem_failed' };
  }
  const changes = result && result.meta && typeof result.meta.changes === 'number' ? result.meta.changes : 0;
  if (changes !== 1) {
    let row = null;
    try {
      row = await db
        .prepare(`SELECT consumed_at, expires_at, audience FROM geppetto_student_handoffs WHERE code_hash = ?`)
        .bind(codeHash)
        .first();
    } catch (_) {
      row = null;
    }
    if (!row) return { ok: false, error: 'invalid_or_expired_code' };
    if (String(row.audience || '') !== GEPPETTO_STUDENT_AUDIENCE) return { ok: false, error: 'wrong_audience' };
    if (row.consumed_at) return { ok: false, error: 'already_consumed' };
    if (String(row.expires_at || '') <= now) return { ok: false, error: 'expired' };
    return { ok: false, error: 'invalid_or_expired_code' };
  }
  const row = await db
    .prepare(
      `SELECT lantern_username, mtss_student_id, display_name, audience
       FROM geppetto_student_handoffs WHERE code_hash = ?`
    )
    .bind(codeHash)
    .first();
  if (!row || !row.mtss_student_id) return { ok: false, error: 'invalid_or_expired_code' };
  return {
    ok: true,
    audience: GEPPETTO_STUDENT_AUDIENCE,
    mtss_student_id: String(row.mtss_student_id),
    lantern_username: row.lantern_username != null ? String(row.lantern_username) : '',
    display_name: row.display_name != null ? String(row.display_name) : '',
  };
}
