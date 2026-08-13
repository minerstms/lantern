/**
 * Prompt #170 — one existing durable Lantern account key.
 * Same authority as Locker / ticker avatar PK (not a parallel identity).
 *
 * Students: mtss_student_id || student_character_name || username
 * Staff / teacher / admin: login username
 *
 * Never use display_name, honorific, or public_display_name as identity.
 */

function trimStr(v) {
  return v == null ? '' : String(v).trim();
}

export function durableAccountKeyFromPilotAccount(row) {
  if (!row) return '';
  const role = trimStr(row.role).toLowerCase();
  if (role === 'student') {
    const mid = trimStr(row.mtss_student_id);
    if (mid) return mid;
    const scn = trimStr(row.student_character_name);
    if (scn) return scn;
    return trimStr(row.username);
  }
  return trimStr(row.username);
}

/** Numeric staff_id from a wallet/economy key such as staff_id:4. Empty if not that form. */
export function staffIdFromEconomyKey(raw) {
  const s = trimStr(raw);
  const low = s.toLowerCase();
  if (!low.startsWith('staff_id:')) return '';
  return s.slice(s.indexOf(':') + 1).trim();
}
