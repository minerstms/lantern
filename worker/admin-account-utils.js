/**
 * Admin account identity helpers (Prompt #136).
 * Staff/admin: immutable staff_id + first_name/last_name; display_name kept in sync for compatibility.
 * Students: TMS-driven; staff_id stays NULL; do not force Lantern first/last.
 */

export const DISPLAY_NAME_MAX_LEN = 64;
export const STAFF_NAME_PART_MAX_LEN = 64;

/**
 * @param {unknown} raw
 * @param {{ required?: boolean }} opts
 */
export function validateDisplayName(raw, opts) {
  const required = !opts || opts.required !== false;
  if (raw == null || raw === undefined) {
    if (required) return { ok: false, error: 'display_name_required' };
    return { ok: true, value: null };
  }
  const value = String(raw).trim();
  if (!value) {
    return { ok: false, error: 'display_name_required' };
  }
  if (value.length > DISPLAY_NAME_MAX_LEN) {
    return { ok: false, error: 'display_name_too_long', max: DISPLAY_NAME_MAX_LEN };
  }
  if (/[\x00-\x1F\x7F]/.test(value)) {
    return { ok: false, error: 'display_name_invalid_chars' };
  }
  return { ok: true, value };
}

/**
 * @param {unknown} raw
 * @param {'first_name'|'last_name'} field
 * @param {{ required?: boolean }} opts
 */
export function validateStaffNamePart(raw, field, opts) {
  const required = !opts || opts.required !== false;
  const emptyError = field === 'last_name' ? 'last_name_required' : 'first_name_required';
  const tooLongError = field === 'last_name' ? 'last_name_too_long' : 'first_name_too_long';
  const invalidError = field === 'last_name' ? 'last_name_invalid_chars' : 'first_name_invalid_chars';
  if (raw == null || raw === undefined) {
    if (required) return { ok: false, error: emptyError };
    return { ok: true, value: null };
  }
  const value = String(raw).trim();
  if (!value) {
    return { ok: false, error: emptyError };
  }
  if (value.length > STAFF_NAME_PART_MAX_LEN) {
    return { ok: false, error: tooLongError, max: STAFF_NAME_PART_MAX_LEN };
  }
  if (/[\x00-\x1F\x7F]/.test(value)) {
    return { ok: false, error: invalidError };
  }
  return { ok: true, value };
}

/** @param {string} first @param {string} last */
export function composeStaffDisplayName(first, last) {
  return `${String(first || '').trim()} ${String(last || '').trim()}`.trim();
}

/** @param {unknown} role */
export function isStaffAccountRole(role) {
  const r = String(role || '')
    .trim()
    .toLowerCase();
  return r === 'teacher' || r === 'admin';
}

/**
 * Migrated staff with Staff ID but no structured names yet.
 * @param {{ role?: unknown, first_name?: unknown, last_name?: unknown }} row
 */
export function staffNeedsNameSetup(row) {
  if (!row || !isStaffAccountRole(row.role)) return false;
  const first = row.first_name != null ? String(row.first_name).trim() : '';
  const last = row.last_name != null ? String(row.last_name).trim() : '';
  return !first || !last;
}

/** Display formatting only — store canonical integer. */
export function formatStaffIdLabel(staffId) {
  if (staffId == null || staffId === '') return '';
  const n = Number(staffId);
  if (!Number.isFinite(n) || n <= 0) return '';
  return `Staff #${String(Math.trunc(n)).padStart(4, '0')}`;
}

const STAFF_EMAIL_MAX_LEN = 120;
const STAFF_EMAIL_DOMAIN = 'trinidad.k12.co.us';

/**
 * Optional school email for staff/admin (Prompt #170). Empty clears.
 * @param {unknown} raw
 * @param {{ required?: boolean }} opts
 */
export function validateStaffEmail(raw, opts) {
  const required = !!(opts && opts.required);
  if (raw == null || raw === undefined) {
    if (required) return { ok: false, error: 'email_required' };
    return { ok: true, value: null };
  }
  const value = String(raw).trim().toLowerCase();
  if (!value) {
    if (required) return { ok: false, error: 'email_required' };
    return { ok: true, value: null };
  }
  if (value.length > STAFF_EMAIL_MAX_LEN) {
    return { ok: false, error: 'email_too_long', max: STAFF_EMAIL_MAX_LEN };
  }
  // Allow known school domain addresses and existing legacy TMS values already stored.
  if (!/^[a-z0-9][a-z0-9._+-]*@[a-z0-9.-]+\.[a-z]{2,}$/i.test(value)) {
    return { ok: false, error: 'email_invalid' };
  }
  return { ok: true, value };
}

export { STAFF_EMAIL_DOMAIN, STAFF_EMAIL_MAX_LEN };

/**
 * Allocate next never-reused Staff ID via AUTOINCREMENT table.
 * Do NOT use MAX(staff_id)+1.
 * @param {any} db
 * @returns {Promise<number>}
 */
export async function allocateStaffId(db) {
  if (!db) throw new Error('allocateStaffId_missing_db');
  const ins = await db.prepare(`INSERT INTO lantern_staff_id_alloc DEFAULT VALUES`).run();
  const id = ins && ins.meta && ins.meta.last_row_id != null ? Number(ins.meta.last_row_id) : NaN;
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('staff_id_allocation_failed');
  }
  return Math.trunc(id);
}

/**
 * Safety net: assign Staff IDs to any teacher/admin still missing one (deterministic username order).
 * Does not split or invent first/last names.
 * @param {any} db
 */
export async function ensureStaffIdsAllocated(db) {
  if (!db) return { allocated: 0 };
  const rows = await db
    .prepare(
      `SELECT username FROM lantern_pilot_accounts
       WHERE lower(trim(role)) IN ('teacher', 'admin') AND staff_id IS NULL
       ORDER BY lower(trim(username)) ASC`
    )
    .all();
  const list = (rows && rows.results) || [];
  let allocated = 0;
  for (const row of list) {
    const username = row && row.username != null ? String(row.username) : '';
    if (!username) continue;
    const staffId = await allocateStaffId(db);
    await db
      .prepare(
        `UPDATE lantern_pilot_accounts SET staff_id = ?, updated_at = datetime('now')
         WHERE username = ? AND staff_id IS NULL AND lower(trim(role)) IN ('teacher', 'admin')`
      )
      .bind(staffId, username)
      .run();
    allocated += 1;
  }
  return { allocated };
}

/**
 * Cryptographically random one-time temporary password (plaintext returned once; only hash stored).
 */
export function generateStaffTempPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

/**
 * Fetch a single admin-visible account row after create/update.
 */
export async function fetchAdminUserRow(db, username) {
  if (!db || !username) return null;
  return db
    .prepare(
      `SELECT username, display_name, first_name, last_name, staff_id, email, role, student_character_name, teacher_id, mtss_student_id, is_active, updated_at, must_change_password, password_reset_at, password_reset_by FROM lantern_pilot_accounts WHERE lower(trim(username)) = lower(trim(?))`
    )
    .bind(String(username))
    .first();
}
