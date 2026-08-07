/**
 * Admin account First Name (display_name) validation.
 */

export const DISPLAY_NAME_MAX_LEN = 64;

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
 * Fetch a single admin-visible account row after create/update.
 */
export async function fetchAdminUserRow(db, username) {
  if (!db || !username) return null;
  return db
    .prepare(
      `SELECT username, display_name, role, student_character_name, teacher_id, mtss_student_id, is_active, updated_at, must_change_password, password_reset_at, password_reset_by FROM lantern_pilot_accounts WHERE lower(trim(username)) = lower(trim(?))`
    )
    .bind(String(username))
    .first();
}
