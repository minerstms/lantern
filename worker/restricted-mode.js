/**
 * Restricted Access / Demo Mode (#262C).
 *
 * Authoritative storage: lantern_settings (no migration).
 *   access.restricted_mode.enabled  — "true" / "false" (default OFF)
 *   access.restricted_mode.allowlist — JSON array of canonical usernames
 *
 * Break-glass identity is the locked primary admin username `admin`
 * (LANTERN_PRIMARY_ADMIN_USERNAME / Prompt #209 / #221). Not role, not display name.
 */

export const CANONICAL_WEB_ADMIN_USERNAME = 'admin';

export const RESTRICTED_MODE_ENABLED_KEY = 'access.restricted_mode.enabled';
export const RESTRICTED_MODE_ALLOWLIST_KEY = 'access.restricted_mode.allowlist';
export const RESTRICTED_MODE_DEFAULT = false;

export const RESTRICTED_MODE_EXEMPT_PATH_PREFIXES = ['/api/health', '/api/auth'];
export const RESTRICTED_MODE_EXEMPT_EXACT_PATHS = ['/api/class-access/state'];

export const RESTRICTED_LOCKED_MESSAGE =
  'Lantern is temporarily unavailable. Access is currently limited by school staff. Please try again later.';

export function normalizeAccountUsername(raw) {
  return String(raw || '').trim().toLowerCase();
}

export function isCanonicalWebAdminAccount(account) {
  if (!account) return false;
  return normalizeAccountUsername(account.username) === CANONICAL_WEB_ADMIN_USERNAME;
}

export function parseRestrictedModeEnabled(raw) {
  if (raw == null || raw === '') return { ok: false, error: 'missing_value' };
  if (typeof raw === 'boolean') return { ok: true, value: raw };
  const s = String(raw).trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'on' || s === 'yes') return { ok: true, value: true };
  if (s === 'false' || s === '0' || s === 'off' || s === 'no') return { ok: true, value: false };
  return { ok: false, error: 'malformed' };
}

export function parseRestrictedModeAllowlist(raw) {
  if (raw == null || raw === '') return [];
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  const out = [];
  const seen = new Set();
  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i];
    const username = normalizeAccountUsername(typeof item === 'string' ? item : item && item.username);
    if (!username || username === CANONICAL_WEB_ADMIN_USERNAME || seen.has(username)) continue;
    seen.add(username);
    out.push(username);
  }
  return out;
}

export function allowlistHasUsername(allowlist, username) {
  const key = normalizeAccountUsername(username);
  if (!key) return false;
  return (allowlist || []).indexOf(key) >= 0;
}

export function isRestrictedModeExemptPath(path) {
  const p = String(path || '');
  if (RESTRICTED_MODE_EXEMPT_EXACT_PATHS.indexOf(p) >= 0) return true;
  return RESTRICTED_MODE_EXEMPT_PATH_PREFIXES.some((prefix) => p === prefix || p.startsWith(prefix + '/'));
}

export function isStaffLikeRole(role) {
  const r = String(role || '').trim().toLowerCase();
  return r === 'teacher' || r === 'admin' || r === 'staff';
}

export function isStudentRole(role) {
  return String(role || '').trim().toLowerCase() === 'student';
}

function accountIsActive(row) {
  if (!row) return false;
  const ia = row.is_active != null ? Number(row.is_active) : 1;
  return ia !== 0;
}

async function readSetting(db, key) {
  if (!db) return null;
  try {
    const row = await db.prepare('SELECT value FROM lantern_settings WHERE key = ?').bind(key).first();
    return row && row.value != null ? row.value : null;
  } catch (_) {
    return null;
  }
}

async function writeSetting(db, key, value, updatedBy) {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO lantern_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
    )
    .bind(key, value, now, updatedBy || null)
    .run();
  return now;
}

export async function resolveRestrictedModeState(db) {
  const enabledRaw = await readSetting(db, RESTRICTED_MODE_ENABLED_KEY);
  const parsed = parseRestrictedModeEnabled(enabledRaw);
  const enabled = parsed.ok ? parsed.value : RESTRICTED_MODE_DEFAULT;
  const allowlist = parseRestrictedModeAllowlist(await readSetting(db, RESTRICTED_MODE_ALLOWLIST_KEY));
  return { enabled, allowlist, source: parsed.ok ? 'settings' : 'default' };
}

export async function setRestrictedModeEnabled(db, enabled, updatedBy) {
  return writeSetting(db, RESTRICTED_MODE_ENABLED_KEY, enabled ? 'true' : 'false', updatedBy);
}

export async function setRestrictedModeAllowlist(db, usernames, updatedBy) {
  const list = parseRestrictedModeAllowlist(usernames);
  return writeSetting(db, RESTRICTED_MODE_ALLOWLIST_KEY, JSON.stringify(list), updatedBy);
}

export function evaluateRestrictedModeForAccount(account, state) {
  const active = !!(state && state.enabled);
  if (!active) {
    return { active: false, allowed: true, reason: 'restricted_mode_off' };
  }
  if (isCanonicalWebAdminAccount(account)) {
    return { active: true, allowed: true, reason: 'restricted_break_glass' };
  }
  if (account && allowlistHasUsername(state.allowlist, account.username)) {
    return { active: true, allowed: true, reason: 'restricted_bypass' };
  }
  if (account) {
    return { active: true, allowed: false, reason: 'restricted_mode_locked' };
  }
  return { active: true, allowed: false, reason: 'restricted_unauthenticated' };
}

export function publicRestrictedModeView(decision) {
  return {
    active: !!(decision && decision.active),
    allowed: !!(decision && decision.allowed),
  };
}

export async function loadPilotAccountByUsername(db, username) {
  const key = String(username || '').trim();
  if (!db || !key) return null;
  try {
    return await db
      .prepare(
        `SELECT username, display_name, role, mtss_student_id, staff_id, is_active
         FROM lantern_pilot_accounts WHERE lower(trim(username)) = lower(trim(?))`
      )
      .bind(key)
      .first();
  } catch (_) {
    return null;
  }
}

function publicAccountLabel(row) {
  if (!row) return '';
  const display = String(row.display_name || '').trim();
  return display || String(row.username || '').trim();
}

function serializeBypassAccount(row, opts) {
  const role = String((row && row.role) || '').trim().toLowerCase();
  const staff = isStaffLikeRole(role);
  return {
    username: String(row.username || '').trim(),
    display_name: publicAccountLabel(row),
    role,
    kind: staff ? 'staff' : 'student',
    student_id: staff ? '' : String(row.mtss_student_id || '').trim(),
    is_active: accountIsActive(row) ? 1 : 0,
    protected: !!(opts && opts.protected),
    allow_during_restricted: !!(opts && opts.allowed),
  };
}

export async function hydrateRestrictedAllowlist(db, allowlist) {
  const staff = [];
  const students = [];
  const missing = [];
  for (let i = 0; i < (allowlist || []).length; i++) {
    const username = allowlist[i];
    const row = await loadPilotAccountByUsername(db, username);
    if (!row) {
      missing.push(username);
      continue;
    }
    const item = serializeBypassAccount(row, { allowed: true });
    if (item.kind === 'staff') staff.push(item);
    else students.push(item);
  }
  return { staff, students, missing };
}

export async function searchRestrictedModeCandidates(db, query, kind, allowlist) {
  const q = String(query || '').trim().toLowerCase();
  const filter = String(kind || 'all').trim().toLowerCase();
  const allowedSet = new Set(allowlist || []);
  if (!db) return [];
  let rows = [];
  try {
    const res = await db
      .prepare(
        `SELECT username, display_name, role, mtss_student_id, staff_id, is_active
         FROM lantern_pilot_accounts
         ORDER BY display_name, username
         LIMIT 300`
      )
      .all();
    rows = (res && res.results) || [];
  } catch (_) {
    return [];
  }
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const username = normalizeAccountUsername(row.username);
    if (!username || username === CANONICAL_WEB_ADMIN_USERNAME) continue;
    const role = String(row.role || '').trim().toLowerCase();
    const staff = isStaffLikeRole(role);
    const student = isStudentRole(role);
    if (!staff && !student) continue;
    const allowed = allowedSet.has(username);
    if (filter === 'staff' && !staff) continue;
    if (filter === 'students' && !student) continue;
    if (filter === 'allowed' && !allowed) continue;
    if (filter !== 'allowed' && !accountIsActive(row) && !allowed) continue;
    const hay = (
      String(row.username || '') +
      ' ' +
      String(row.display_name || '') +
      ' ' +
      String(row.mtss_student_id || '') +
      ' ' +
      String(row.staff_id || '')
    ).toLowerCase();
    if (q && hay.indexOf(q) === -1) continue;
    out.push(serializeBypassAccount(row, { allowed }));
    if (out.length >= 25) break;
  }
  return out;
}

export async function addRestrictedBypassUsername(db, rawUsername, updatedBy) {
  const username = String(rawUsername || '').trim();
  if (!username) return { ok: false, error: 'missing_username' };
  if (normalizeAccountUsername(username) === CANONICAL_WEB_ADMIN_USERNAME) {
    return { ok: false, error: 'protected_web_admin' };
  }
  const row = await loadPilotAccountByUsername(db, username);
  if (!row) return { ok: false, error: 'unknown_account' };
  if (!accountIsActive(row)) return { ok: false, error: 'account_inactive' };
  const role = String(row.role || '').trim().toLowerCase();
  if (!isStaffLikeRole(role) && !isStudentRole(role)) return { ok: false, error: 'unsupported_role' };
  const state = await resolveRestrictedModeState(db);
  if (allowlistHasUsername(state.allowlist, row.username)) {
    return { ok: true, added: false, username: normalizeAccountUsername(row.username), already: true };
  }
  const next = state.allowlist.concat([normalizeAccountUsername(row.username)]);
  const updatedAt = await setRestrictedModeAllowlist(db, next, updatedBy);
  return { ok: true, added: true, username: normalizeAccountUsername(row.username), role, updatedAt };
}

export async function removeRestrictedBypassUsername(db, rawUsername, updatedBy) {
  const username = normalizeAccountUsername(rawUsername);
  if (!username) return { ok: false, error: 'missing_username' };
  if (username === CANONICAL_WEB_ADMIN_USERNAME) {
    return { ok: false, error: 'protected_web_admin' };
  }
  const state = await resolveRestrictedModeState(db);
  if (!allowlistHasUsername(state.allowlist, username)) {
    return { ok: true, removed: false, username, already: true };
  }
  const next = state.allowlist.filter((u) => u !== username);
  const updatedAt = await setRestrictedModeAllowlist(db, next, updatedBy);
  return { ok: true, removed: true, username, updatedAt };
}

export async function buildRestrictedModeAdminStatus(db) {
  const state = await resolveRestrictedModeState(db);
  const hydrated = await hydrateRestrictedAllowlist(db, state.allowlist);
  return {
    enabled: state.enabled,
    default: RESTRICTED_MODE_DEFAULT,
    web_admin: {
      username: CANONICAL_WEB_ADMIN_USERNAME,
      display_name: 'Web Admin',
      protected: true,
      allow_during_restricted: true,
    },
    selected_staff_count: hydrated.staff.length,
    selected_student_count: hydrated.students.length,
    selected_staff: hydrated.staff,
    selected_students: hydrated.students,
    total_allowed_plus_web_admin: hydrated.staff.length + hydrated.students.length + 1,
  };
}
