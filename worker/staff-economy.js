/**
 * Prompt #107/#176/#184 — resolve Lantern staff economy key to TMS staff principal.
 *
 * Supported keys:
 *   staff:<lantern_username>   — legacy / Games session key
 *   staff_id:<lantern_staff_id> — durable Admin Nugget Adjustment key
 *
 * Lookup order (fail closed; never invent a link):
 *   1) direct username match on tms_identity_links (lower/trim)
 *   2) lantern_staff_id on tms_identity_links
 *   3) username → pilot.staff_id → lantern_staff_id on links
 *
 * Prompt #184: multiple Lantern accounts may share one tms_staff_id; lantern_username
 * and lantern_staff_id remain unique. Reverse SSO uses is_primary (not .first()).
 */

export function parseStaffEconomyKey(characterName) {
  const raw = String(characterName || '').trim();
  const lower = raw.toLowerCase();
  if (lower.startsWith('staff_id:')) return '';
  if (!lower.startsWith('staff:')) return '';
  return raw.slice(6).trim();
}

export function parseStaffIdEconomyKey(characterName) {
  const raw = String(characterName || '').trim();
  if (!raw.toLowerCase().startsWith('staff_id:')) return 0;
  const n = Number(String(raw.slice(9).trim()));
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) return 0;
  return n;
}

export function isStaffEconomyKey(characterName) {
  return !!(parseStaffEconomyKey(characterName) || parseStaffIdEconomyKey(characterName));
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

export async function lookupTmsStaffIdForLanternStaffId(db, lanternStaffId) {
  const sid = Number(lanternStaffId);
  if (!db || !Number.isFinite(sid) || sid <= 0) return '';
  try {
    const row = await db
      .prepare('SELECT tms_staff_id FROM tms_identity_links WHERE lantern_staff_id = ?')
      .bind(Math.floor(sid))
      .first();
    if (row && row.tms_staff_id) return String(row.tms_staff_id).trim();
  } catch (_) {
    /* Column may be absent before migration 062 — fall through. */
  }
  // Fallback join when lantern_staff_id not yet backfilled / column missing.
  const viaJoin = await db
    .prepare(
      `SELECT l.tms_staff_id AS tms_staff_id
       FROM tms_identity_links l
       INNER JOIN lantern_pilot_accounts p
         ON lower(trim(p.username)) = lower(trim(l.lantern_username))
       WHERE p.staff_id = ?
       LIMIT 1`
    )
    .bind(Math.floor(sid))
    .first();
  return viaJoin && viaJoin.tms_staff_id ? String(viaJoin.tms_staff_id).trim() : '';
}

/**
 * Canonical Lantern account → TMS staff id (shared by economy, Remember, Nuggets bridge).
 */
export async function resolveTmsStaffIdForLanternAccount(db, username) {
  const u = String(username || '').trim();
  if (!u || !db) return '';
  const direct = await lookupTmsStaffIdForLanternUsername(db, u);
  if (direct) return direct;
  const account = await db
    .prepare(
      `SELECT staff_id FROM lantern_pilot_accounts WHERE lower(trim(username)) = lower(trim(?)) LIMIT 1`
    )
    .bind(u)
    .first();
  const sid = account && account.staff_id != null ? Number(account.staff_id) : 0;
  if (Number.isFinite(sid) && sid > 0) {
    return lookupTmsStaffIdForLanternStaffId(db, sid);
  }
  return '';
}

/**
 * Prompt #184 — TMS→Lantern reverse SSO must use explicit primary link (never .first()).
 * @returns {{ ok: true, lantern_username: string } | { ok: false, error: 'not_linked'|'no_primary' }}
 */
export async function resolvePrimaryLanternUsernameForTmsStaff(db, tmsStaffIdRaw) {
  const tmsStaffId = String(tmsStaffIdRaw || '').trim();
  if (!tmsStaffId || !db) return { ok: false, error: 'not_linked' };
  try {
    const primary = await db
      .prepare(
        `SELECT lantern_username FROM tms_identity_links
         WHERE tms_staff_id = ? AND is_primary = 1
         LIMIT 1`
      )
      .bind(tmsStaffId)
      .first();
    if (primary && primary.lantern_username) {
      return { ok: true, lantern_username: String(primary.lantern_username).trim() };
    }
    const any = await db
      .prepare(`SELECT COUNT(*) AS n FROM tms_identity_links WHERE tms_staff_id = ?`)
      .bind(tmsStaffId)
      .first();
    if (any && Number(any.n) > 0) return { ok: false, error: 'no_primary' };
    return { ok: false, error: 'not_linked' };
  } catch (_) {
    // Pre-migration 063: is_primary absent — fall back to single 1:1 row.
    const legacy = await db
      .prepare(`SELECT lantern_username FROM tms_identity_links WHERE tms_staff_id = ? LIMIT 1`)
      .bind(tmsStaffId)
      .first();
    if (legacy && legacy.lantern_username) {
      return { ok: true, lantern_username: String(legacy.lantern_username).trim() };
    }
    return { ok: false, error: 'not_linked' };
  }
}

export async function resolveStaffTmsPrincipal(db, characterName) {
  const staffIdKey = parseStaffIdEconomyKey(characterName);
  if (staffIdKey) {
    const tmsStaffId = await lookupTmsStaffIdForLanternStaffId(db, staffIdKey);
    if (!tmsStaffId) {
      return { ok: false, error: 'tms_identity_not_linked', lanternStaffId: staffIdKey };
    }
    return { ok: true, lanternStaffId: staffIdKey, tmsStaffId };
  }

  const lanternUsername = parseStaffEconomyKey(characterName);
  if (!lanternUsername) {
    return { ok: false, error: 'not_staff_key' };
  }
  const tmsStaffId = await resolveTmsStaffIdForLanternAccount(db, lanternUsername);
  if (!tmsStaffId) {
    return { ok: false, error: 'tms_identity_not_linked', lanternUsername };
  }
  return { ok: true, lanternUsername, tmsStaffId };
}
