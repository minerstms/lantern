/**
 * Lantern → Geppetto student SSO handoff helpers.
 * Browser authorize + server-to-server redeem. Hash-only storage. 90s TTL.
 * Do not reuse TMS staff lantern_handoffs or TMS_LANTERN_BRIDGE_SECRET.
 */

import { generateOpaqueSecret, hashOpaqueSecret } from './device-enrollment.js';

export const GEPPETTO_STUDENT_AUDIENCE = 'geppetto_student';
export const GEPPETTO_STUDENT_PREVIEW_AUDIENCE = 'geppetto_student_preview';
export const GEPPETTO_STUDENT_HANDOFF_TTL_SEC = 90;
export const GEPPETTO_STUDENT_ROSTER_PATH = '/api/auth/geppetto-student-roster';
export const GEPPETTO_STUDENT_LOGOUT_PATH = '/api/auth/geppetto-student-logout';
export const GEPPETTO_STUDENT_FRESH_PARAM = 'fresh';
export const GEPPETTO_S2S_HEADERS = { 'Cache-Control': 'no-store' };

export const GEPPETTO_STUDENT_CALLBACK_ALLOWLIST = [
  'https://mrradle.us/api/stem-daily/student/lantern-callback',
  'https://geppetto-full-deploy-v6.pages.dev/api/stem-daily/student/lantern-callback',
];

export const GEPPETTO_CANONICAL_HOST = 'mrradle.us';
export const GEPPETTO_PAGES_PROJECT_HOST = 'geppetto-full-deploy-v6.pages.dev';
export const GEPPETTO_PAGES_PROJECT_SUFFIX = '.geppetto-full-deploy-v6.pages.dev';
export const GEPPETTO_STUDENT_CALLBACK_PATH = '/api/stem-daily/student/lantern-callback';

const CALLBACK_PATH = GEPPETTO_STUDENT_CALLBACK_PATH;

/** Exact production hosts plus one-label Geppetto Pages Preview. No loose suffix match. */
export function isAllowedGeppettoCallbackHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
  if (host === GEPPETTO_CANONICAL_HOST) return true;
  if (host === GEPPETTO_PAGES_PROJECT_HOST) return true;
  if (!host.endsWith(GEPPETTO_PAGES_PROJECT_SUFFIX)) return false;
  const sub = host.slice(0, -GEPPETTO_PAGES_PROJECT_SUFFIX.length);
  if (!sub || sub.includes('.') || sub.includes('/') || sub.includes('\\')) return false;
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(sub);
}

/** Server-side only. Derived from an already-sanitized HTTPS callback URL. */
export function geppettoBridgeScopeFromSafeReturn(safeReturn) {
  try {
    const host = String(new URL(String(safeReturn || '')).hostname || '').toLowerCase();
    if (host === GEPPETTO_CANONICAL_HOST) return 'production';
    if (isAllowedGeppettoCallbackHost(host)) return 'preview';
  } catch (_) {
    /* invalid */
  }
  return '';
}

export function geppettoStudentAudienceForScope(scope) {
  if (scope === 'preview') return GEPPETTO_STUDENT_PREVIEW_AUDIENCE;
  if (scope === 'production') return GEPPETTO_STUDENT_AUDIENCE;
  return '';
}

export function isGeppettoStudentAudience(audience) {
  const a = String(audience || '').trim();
  return a === GEPPETTO_STUDENT_AUDIENCE || a === GEPPETTO_STUDENT_PREVIEW_AUDIENCE;
}

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

/** Allow only HTTPS Geppetto callback URLs on approved hosts. No default redirect. No open redirect. */
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
  if (!isAllowedGeppettoCallbackHost(host)) return '';
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

/** True when a string is only a school roster ID (digits), not a human name. */
export function isRosterIdLikeDisplayToken(value) {
  return /^\d{3,}$/.test(String(value || '').trim());
}

/**
 * Presentation-only. Never treat roster/login IDs as a student name.
 * student_character_name is an identity/economy key and is not used here.
 */
export function isHumanStudentDisplayName(value, mtssStudentId, username) {
  const v = String(value || '').trim();
  if (!v) return false;
  const id = String(mtssStudentId || '').trim();
  const user = String(username || '').trim();
  if (id && v === id) return false;
  if (user && v === user && isRosterIdLikeDisplayToken(user)) return false;
  if (isRosterIdLikeDisplayToken(v) && id && v === id) return false;
  return true;
}

function splitGeppettoRosterDisplayName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first_name: '', last_name: '' };
  if (parts.length === 1) return { first_name: parts[0], last_name: '' };
  return { first_name: parts[0], last_name: parts.slice(1).join(' ') };
}

/**
 * Strip TMS roster/list rows down to Geppetto prepopulation identities.
 * Active + non-empty student_id only. Duplicate IDs are omitted, not resolved by name.
 */
export function buildGeppettoStudentRosterPayload(tmsStudents) {
  const rows = Array.isArray(tmsStudents) ? tmsStudents : [];
  let skipped_missing_id = 0;
  const byId = new Map();

  for (let i = 0; i < rows.length; i++) {
    const s = rows[i] || {};
    const isActive = s.is_active != null ? Number(s.is_active) === 1 : true;
    if (!isActive) continue;
    const sid = String(s.student_id ?? '').trim();
    if (!sid) {
      skipped_missing_id += 1;
      continue;
    }
    if (!byId.has(sid)) byId.set(sid, []);
    byId.get(sid).push(s);
  }

  const students = [];
  const conflicts = [];
  byId.forEach((group, sid) => {
    if (group.length > 1) {
      conflicts.push({ student_id: sid, count: group.length });
      return;
    }
    const s = group[0];
    const hasParts = s.first_name != null || s.last_name != null;
    const givenFirst = String(s.first_name || '').trim();
    const givenLast = String(s.last_name || '').trim();
    const display = String(s.student_name || s.display_name || '').trim()
      || [givenFirst, givenLast].filter(Boolean).join(' ');
    const split = splitGeppettoRosterDisplayName(display);
    const first_name = hasParts ? givenFirst : (givenFirst || split.first_name);
    const last_name = hasParts ? givenLast : (givenLast || split.last_name);
    // Additive Grade for Geppetto admin tools (Login Sheet). TMS authoritative;
    // strip grade- prefix if present. Empty string when TMS has no grade.
    const grade = String(s.grade != null ? s.grade : '').trim().replace(/^grade-/i, '');
    students.push({
      student_id: sid,
      first_name,
      last_name,
      display_name: display || [first_name, last_name].filter(Boolean).join(' '),
      grade,
    });
  });

  return {
    ok: true,
    students,
    counts: {
      active_with_id: students.length,
      skipped_missing_id,
      duplicate_id_conflicts: conflicts.length,
    },
    conflicts,
  };
}

export function lanternStudentDisplaySnapshot(account) {
  if (!account) return '';
  const mtss = account.mtss_student_id != null ? String(account.mtss_student_id).trim() : '';
  const user = String(account.username || '').trim();
  const display = String(account.display_name || '').trim();
  if (isHumanStudentDisplayName(display, mtss, user)) return display;
  const first = String(account.first_name || '').trim();
  const last = String(account.last_name || '').trim();
  const composed = [first, last].filter(Boolean).join(' ');
  if (isHumanStudentDisplayName(composed, mtss, user)) return composed;
  return '';
}

/** After exact mtss_student_id resolution, pick a human display name for Geppetto UI only. */
export async function resolveGeppettoStudentDisplayName(db, account) {
  const snapshot = lanternStudentDisplaySnapshot(account);
  if (snapshot) return snapshot;
  const mtss = account && account.mtss_student_id != null ? String(account.mtss_student_id).trim() : '';
  if (db && mtss) {
    try {
      const row = await db
        .prepare(
          `SELECT display_name FROM lantern_student_identities WHERE lower(trim(character_name)) = lower(trim(?))`
        )
        .bind(mtss)
        .first();
      const ident = row && row.display_name != null ? String(row.display_name).trim() : '';
      if (isHumanStudentDisplayName(ident, mtss, account && account.username)) return ident;
    } catch (_) {
      /* identities table missing in some test envs */
    }
  }
  return 'Student';
}

export function isGeppettoStudentAuthorizePath(raw) {
  const pathOnly = String(raw || '').split('?')[0].split('#')[0];
  return pathOnly === '/api/auth/geppetto-student-authorize';
}

export function isMakeupQueryFlag(raw) {
  const s = String(raw || '');
  try {
    return new URL(s, 'https://mrradle.us').searchParams.get('makeup') === '1';
  } catch (_) {
    return /(?:^|[?&])makeup=1(?:&|#|$)/.test(s);
  }
}

/** Unwrap authorize?return=… then read callback next. Makeup only when next has makeup=1. */
export function classWebsiteSsoPurposeFromReturn(raw) {
  const s = String(raw || '').trim();
  if (!s) return 'class-website';
  let candidate = s;
  try {
    const base = s.indexOf('://') >= 0 ? s : 'https://tmslantern.org' + (s.charAt(0) === '/' ? s : '/' + s);
    const u = new URL(base);
    if (isGeppettoStudentAuthorizePath(u.pathname)) {
      candidate = String(u.searchParams.get('return') || '').trim();
    }
  } catch (_) {
    /* keep candidate */
  }
  let next = '';
  if (!candidate) return 'class-website';
  try {
    const cb = new URL(candidate);
    next =
      cb.pathname === '/api/stem-daily/student/lantern-callback'
        ? String(cb.searchParams.get('next') || '')
        : cb.pathname + cb.search + cb.hash;
  } catch (_) {
    next = candidate.charAt(0) === '/' ? candidate : '';
  }
  return isMakeupQueryFlag(next) ? 'makeup' : 'class-website';
}

export function isGeppettoMakeupReturn(raw) {
  return classWebsiteSsoPurposeFromReturn(raw) === 'makeup';
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Only a first-party authorize path whose callback already passes the
 * Geppetto allowlist. Never an arbitrary external URL.
 */
export function sanitizeGeppettoStudentAuthorizeContinue(raw) {
  const s = String(raw || '').trim();
  if (!s || s.length > 800) return '';
  let u;
  try {
    u = s.indexOf('://') >= 0 ? new URL(s) : new URL(s, 'https://tmslantern.org');
  } catch (_) {
    return '';
  }
  if (!isGeppettoStudentAuthorizePath(u.pathname)) return '';
  if (s.indexOf('://') >= 0) {
    const host = String(u.hostname || '').toLowerCase();
    if (host && host !== 'tmslantern.org' && host !== 'www.tmslantern.org') return '';
  }
  const safeReturn = sanitizeGeppettoStudentReturn(u.searchParams.get('return'));
  if (!safeReturn) return '';
  return '/api/auth/geppetto-student-authorize?return=' + encodeURIComponent(safeReturn);
}

export function geppettoStudentAuthorizeSelfHref(safeReturn) {
  const cleaned = sanitizeGeppettoStudentReturn(safeReturn);
  if (!cleaned) return '';
  return '/api/auth/geppetto-student-authorize?return=' + encodeURIComponent(cleaned);
}

export function isGeppettoFreshStudentLogin(url) {
  try {
    const u = url instanceof URL ? url : new URL(String(url || ''), 'https://tmslantern.org');
    return u.searchParams.get(GEPPETTO_STUDENT_FRESH_PARAM) === '1';
  } catch (_) {
    return false;
  }
}

/** Allow only HTTPS returns to approved Geppetto hosts after coordinated student logout. */
export function sanitizeGeppettoStudentLogoutReturn(raw) {
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
  if (!isAllowedGeppettoCallbackHost(host)) return '';
  return u.toString();
}

export function geppettoStudentAuthorizeLoginLocation(authorizeHref) {
  const cont = sanitizeGeppettoStudentAuthorizeContinue(authorizeHref);
  if (!cont) return '';
  return '/login.html?return=' + encodeURIComponent(cont) + '&intent=class-website';
}

export function geppettoStudentAuthorizeFailurePage(errorCode, cors, retryHref) {
  const continueHref = sanitizeGeppettoStudentAuthorizeContinue(retryHref);
  const makeup = isGeppettoMakeupReturn(continueHref || retryHref);
  const messages = {
    return_not_allowed: 'This sign-in link is not valid. Return to the class website and try Student Sign In again.',
    lantern_account_disabled: 'This student account is inactive. Ask your teacher for help.',
    missing_roster_id: makeup
      ? 'This student account is not linked to a school student ID yet. Ask your teacher or school admin to link it before using Make Up Assignment.'
      : 'This student account is not linked to a school student ID yet. Ask your teacher or school admin to link it before using the class website.',
    mint_failed: 'Could not finish Student Sign In. Return to the class website and try again.',
    handoff_unavailable: 'Student Sign In is temporarily unavailable. Try again shortly.',
  };
  const msg = messages[errorCode] || 'Could not finish Student Sign In. Ask your teacher for help.';
  const heading = makeup ? 'Could not continue to Make Up Assignment' : 'Could not continue to Class Website';
  const retry = continueHref
    ? '<a class="btn secondary" href="' + escapeHtml(continueHref) + '">Try Again</a>'
    : '';
  const html =
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/>' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"/>' +
    '<title>Student Sign In</title><style>' +
    ':root{--ink:#eaf0ff;--muted:#b9c6ea;--accent:#5aa7ff;--line:rgba(255,255,255,.12);}' +
    'html,body{margin:0;min-height:100%;background:#0b1220;color:var(--ink);}' +
    'body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:22px;' +
    'padding:24px 16px 48px;line-height:1.45;}' +
    '.wrap{max-width:440px;margin:0 auto;}' +
    'h1{font-size:28px;font-weight:900;margin:0 0 14px;line-height:1.25;}' +
    'p{font-size:22px;margin:0 0 16px;}' +
    '.btn{display:block;width:100%;box-sizing:border-box;margin:12px 0 0;padding:16px 18px;' +
    'border-radius:14px;font-size:24px;font-weight:800;text-align:center;text-decoration:none;' +
    'font-family:inherit;cursor:pointer;min-height:56px;}' +
    '.btn.secondary{border:2px solid var(--line);background:transparent;color:var(--ink);}' +
    '</style></head><body><div class="wrap"><h1>' +
    escapeHtml(heading) +
    '</h1><p>' +
    escapeHtml(msg) +
    '</p>' +
    '<a class="btn secondary" href="https://mrradle.us">Back to Class Website</a>' +
    retry +
    '</div></body></html>';
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
  const requestedAudience = String((identity && identity.audience) || GEPPETTO_STUDENT_AUDIENCE).trim();
  if (!isGeppettoStudentAudience(requestedAudience)) return { ok: false, error: 'wrong_audience' };
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
        requestedAudience,
        createdAt,
        expiresAt
      )
      .run();
  } catch (_) {
    return { ok: false, error: 'mint_failed' };
  }
  return { ok: true, code, expires_at: expiresAt, ttl_seconds: GEPPETTO_STUDENT_HANDOFF_TTL_SEC, audience: requestedAudience };
}

export async function redeemGeppettoStudentHandoff(db, code, audience) {
  const raw = String(code || '').trim();
  if (!raw) return { ok: false, error: 'missing_code' };
  const requiredAudience = String(audience || '').trim();
  if (!isGeppettoStudentAudience(requiredAudience)) {
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
      .bind(now, codeHash, requiredAudience, now)
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
    if (String(row.audience || '') !== requiredAudience) return { ok: false, error: 'wrong_audience' };
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
    audience: requiredAudience,
    mtss_student_id: String(row.mtss_student_id),
    lantern_username: row.lantern_username != null ? String(row.lantern_username) : '',
    display_name: row.display_name != null ? String(row.display_name) : '',
  };
}
