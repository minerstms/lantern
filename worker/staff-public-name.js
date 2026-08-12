/**
 * Prompt #220 — Staff public name = Honorific + Last Name (presentation only).
 * Students remain First L. Free-text recognition unchanged.
 */

export const STAFF_HONORIFICS = Object.freeze(['Mr.', 'Miss', 'Ms.', 'Mrs.']);

function trimStr(v) {
  return v == null ? '' : String(v).trim();
}

function lower(v) {
  return trimStr(v).toLowerCase();
}

/**
 * @param {unknown} raw
 * @param {{ required?: boolean }} [opts]
 * @returns {{ ok: true, value: string|null } | { ok: false, error: string }}
 */
export function validateStaffHonorific(raw, opts) {
  const required = !!(opts && opts.required);
  if (raw == null || raw === undefined || String(raw).trim() === '') {
    if (required) return { ok: false, error: 'honorific_required' };
    return { ok: true, value: null };
  }
  const value = String(raw).trim();
  if (STAFF_HONORIFICS.indexOf(value) < 0) {
    return { ok: false, error: 'honorific_invalid' };
  }
  return { ok: true, value };
}

export function isSystemWebAdminAccount(row) {
  if (!row) return false;
  const u = lower(row.username);
  if (u !== 'admin') return false;
  const dn = lower(row.display_name);
  return !dn || dn === 'web admin' || dn === 'admin';
}

/**
 * Public-facing staff label for student/community surfaces.
 * - Web Admin system account → "Web Admin"
 * - honorific + last_name → "Mr. Radle"
 * - missing honorific → safe full display_name / first+last (no guessing)
 */
export function formatPublicStaffName(row) {
  if (!row) return '';
  if (isSystemWebAdminAccount(row)) return 'Web Admin';
  const honorific = trimStr(row.honorific);
  const last = trimStr(row.last_name);
  if (honorific && STAFF_HONORIFICS.indexOf(honorific) >= 0 && last) {
    return honorific + ' ' + last;
  }
  const dn = trimStr(row.display_name);
  if (dn) return dn;
  const fn = trimStr(row.first_name);
  if (fn || last) return [fn, last].filter(Boolean).join(' ').trim();
  return trimStr(row.username);
}

export function staffNeedsHonorific(row) {
  if (!row) return false;
  const role = lower(row.role);
  if (role !== 'teacher' && role !== 'admin' && role !== 'staff') return false;
  if (isSystemWebAdminAccount(row)) return false;
  const h = trimStr(row.honorific);
  return !h || STAFF_HONORIFICS.indexOf(h) < 0;
}

/**
 * Build username → pilot row map for public label enrichment.
 */
export function buildStaffPublicNameIndex(rows) {
  const byUsername = Object.create(null);
  (rows || []).forEach((row) => {
    const u = lower(row && row.username);
    if (!u) return;
    byUsername[u] = row;
  });
  return { byUsername };
}

export async function loadStaffPublicNameIndex(db) {
  if (!db) return buildStaffPublicNameIndex([]);
  try {
    const res = await db
      .prepare(
        `SELECT username, display_name, first_name, last_name, honorific, role, staff_id
         FROM lantern_pilot_accounts
         WHERE lower(trim(role)) IN ('teacher', 'admin', 'staff')`
      )
      .all();
    return buildStaffPublicNameIndex(res.results || []);
  } catch (_) {
    // Column may be missing pre-migration — fall back without honorific.
    try {
      const res = await db
        .prepare(
          `SELECT username, display_name, first_name, last_name, role, staff_id
           FROM lantern_pilot_accounts
           WHERE lower(trim(role)) IN ('teacher', 'admin', 'staff')`
        )
        .all();
      return buildStaffPublicNameIndex(res.results || []);
    } catch (e2) {
      return buildStaffPublicNameIndex([]);
    }
  }
}

/**
 * Resolve public author label for a feed/news item.
 * Students: return '' so client applies First L. compact formatter.
 * Staff: return honorific format or safe full name.
 */
export function resolveAuthorPublicLabel(index, fields) {
  const idx = index || buildStaffPublicNameIndex([]);
  const role = lower(fields && (fields.authorRole || fields.author_role || fields.author_type));
  const authorId = trimStr(fields && (fields.authorId || fields.author_id || fields.actor_id));
  const display = trimStr(fields && (fields.authorDisplayName || fields.author_display_name || fields.author_name));

  if (role === 'student' || (!role && !authorId && display)) {
    // If we can map authorId to a staff account, treat as staff; else student compact on client.
  }

  let row = null;
  if (authorId && idx.byUsername[lower(authorId)]) row = idx.byUsername[lower(authorId)];
  if (!row && display) {
    // Prefer username match only — do not fuzzy-match display strings across accounts.
  }

  if (row) {
    const rRole = lower(row.role);
    if (rRole === 'student') return '';
    return formatPublicStaffName(row);
  }

  if (role === 'teacher' || role === 'admin' || role === 'staff') {
    // Staff content without resolvable pilot row — keep full display name (not First L.).
    return display || '';
  }
  return '';
}

export function attachAuthorPublicLabels(items, index) {
  const list = Array.isArray(items) ? items : [];
  list.forEach((it) => {
    if (!it || typeof it !== 'object') return;
    const label = resolveAuthorPublicLabel(index, it);
    if (label) it.authorPublicLabel = label;
  });
  return list;
}

/**
 * After honorific save, copy to sibling Lantern accounts sharing the same TMS staff id.
 */
export async function propagateHonorificToLinkedAccounts(db, username, honorific) {
  if (!db) return;
  const u = trimStr(username);
  if (!u) return;
  const value = honorific == null || honorific === '' ? null : trimStr(honorific);
  try {
    const link = await db
      .prepare(
        `SELECT tms_staff_id FROM tms_identity_links WHERE lower(trim(lantern_username)) = lower(trim(?)) LIMIT 1`
      )
      .bind(u)
      .first();
    const tms = link && link.tms_staff_id != null ? trimStr(link.tms_staff_id) : '';
    if (!tms) return;
    const siblings = await db
      .prepare(
        `SELECT lantern_username FROM tms_identity_links WHERE trim(tms_staff_id) = trim(?)`
      )
      .bind(tms)
      .all();
    for (const s of siblings.results || []) {
      const su = trimStr(s.lantern_username);
      if (!su || lower(su) === lower(u)) continue;
      // Do not overwrite intentional Web Admin display identity with person honorific on admin row
      // when that account is the system admin — still store honorific for person-level consistency
      // but public formatter keeps "Web Admin" via isSystemWebAdminAccount.
      await db
        .prepare(`UPDATE lantern_pilot_accounts SET honorific = ?, updated_at = datetime('now') WHERE lower(trim(username)) = lower(trim(?))`)
        .bind(value, su)
        .run();
    }
  } catch (_) {
    /* best-effort person-level sync */
  }
}
