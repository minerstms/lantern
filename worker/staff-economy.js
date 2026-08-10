/**
 * Prompt #107 — resolve Lantern staff economy key (staff:<username>) to TMS staff principal.
 */

export function parseStaffEconomyKey(characterName) {
  const raw = String(characterName || '').trim();
  if (!raw.toLowerCase().startsWith('staff:')) return '';
  return raw.slice(6).trim();
}

export async function lookupTmsStaffIdForLanternUsername(db, lanternUsername) {
  const u = String(lanternUsername || '').trim().toLowerCase();
  if (!u || !db) return '';
  const row = await db
    .prepare('SELECT tms_staff_id FROM tms_identity_links WHERE lower(trim(lantern_username)) = ?')
    .bind(u)
    .first();
  return row && row.tms_staff_id ? String(row.tms_staff_id).trim() : '';
}

export async function resolveStaffTmsPrincipal(db, characterName) {
  const lanternUsername = parseStaffEconomyKey(characterName);
  if (!lanternUsername) {
    return { ok: false, error: 'not_staff_key' };
  }
  const tmsStaffId = await lookupTmsStaffIdForLanternUsername(db, lanternUsername);
  if (!tmsStaffId) {
    return { ok: false, error: 'tms_identity_not_linked', lanternUsername };
  }
  return { ok: true, lanternUsername, tmsStaffId };
}
