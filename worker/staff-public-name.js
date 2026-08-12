/**
 * Prompt #220/#223 — Staff public names (presentation only).
 * Priority: public_display_name override → Honorific + Last → safe full name.
 * Students remain First L. Free-text recognition unchanged. Web Admin stays Web Admin.
 */

export const STAFF_HONORIFICS = Object.freeze(['Mr.', 'Miss', 'Ms.', 'Mrs.', 'SRO']);
export const PUBLIC_DISPLAY_NAME_MAX_LEN = 80;

function trimStr(v) {
  return v == null ? '' : String(v).trim();
}

function lower(v) {
  return trimStr(v).toLowerCase();
}

/**
 * @param {unknown} raw
 * @param {{ required?: boolean }} [opts]
 * @returns {{ ok: true, value: string|null } | { ok: false, error: string, max?: number }}
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

/**
 * Optional public display override (exact string; not auto-prefixed with honorific).
 * Empty → null (use Honorific + Last fallback).
 */
export function validateStaffPublicDisplayName(raw) {
  if (raw == null || raw === undefined) return { ok: true, value: null };
  const value = String(raw).trim();
  if (!value) return { ok: true, value: null };
  if (value.length > PUBLIC_DISPLAY_NAME_MAX_LEN) {
    return { ok: false, error: 'public_display_name_too_long', max: PUBLIC_DISPLAY_NAME_MAX_LEN };
  }
  if (/[\x00-\x1F\x7F]/.test(value)) {
    return { ok: false, error: 'public_display_name_invalid_chars' };
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
 * 1) public_display_name (exact)
 * 2) honorific + last_name
 * 3) safe full display_name / first+last
 * Web Admin system account → "Web Admin" (session/account identity)
 */
export function formatPublicStaffName(row) {
  if (!row) return '';
  if (isSystemWebAdminAccount(row)) return 'Web Admin';
  const override = trimStr(row.public_display_name);
  if (override) return override;
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
        `SELECT username, display_name, public_display_name, first_name, last_name, honorific, role, staff_id
         FROM lantern_pilot_accounts
         WHERE lower(trim(role)) IN ('teacher', 'admin', 'staff')`
      )
      .all();
    return buildStaffPublicNameIndex(res.results || []);
  } catch (_) {
    try {
      const res = await db
        .prepare(
          `SELECT username, display_name, first_name, last_name, honorific, role, staff_id
           FROM lantern_pilot_accounts
           WHERE lower(trim(role)) IN ('teacher', 'admin', 'staff')`
        )
        .all();
      return buildStaffPublicNameIndex(res.results || []);
    } catch (e2) {
      try {
        const res = await db
          .prepare(
            `SELECT username, display_name, first_name, last_name, role, staff_id
             FROM lantern_pilot_accounts
             WHERE lower(trim(role)) IN ('teacher', 'admin', 'staff')`
          )
          .all();
        return buildStaffPublicNameIndex(res.results || []);
      } catch (e3) {
        return buildStaffPublicNameIndex([]);
      }
    }
  }
}

/**
 * Resolve public author label for a feed/news item.
 * Students: return '' so client applies First L. compact formatter.
 * Staff: return public override / honorific format / safe full name.
 */
/**
 * Prompt #158/#13 — student "First L." compact label (same rules as client formatCompactAuthor).
 * Never invent initials from numeric student ids.
 */
export function formatCompactPersonName(displayName) {
  let s = trimStr(displayName).replace(/\s+/g, ' ');
  if (!s) return '';
  if (/^\d{3,}$/.test(s)) return '';
  s = s
    .replace(/\s*[·•|]\s*\d{3,}\s*$/g, '')
    .replace(/\s+\d{6,}\s*$/g, '')
    .replace(/\s*\(\d{3,}\)\s*$/g, '')
    .trim();
  if (!s) return '';
  const low = s.toLowerCase();
  if (low === 'unknown' || low === 'anonymous' || low === 'poll' || low === 'staff') {
    if (low === 'staff') return 'Staff';
    if (low === 'anonymous') return 'Anonymous';
    return low === 'poll' ? '' : s;
  }
  const parts = s.split(' ').filter(Boolean);
  if (!parts.length) return '';
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  const last = parts[parts.length - 1];
  const ch = last.charAt(0);
  if (!/[A-Za-z]/.test(ch)) return first;
  return first + ' ' + ch.toUpperCase() + '.';
}

/**
 * Prompt #13 — never surface staff:<username> / internal keys in user-facing review UI.
 * Staff → formatPublicStaffName; students → First L. from display name when available.
 */
export function resolveMissionSubmitterPublicLabel(index, characterName, studentDisplayName) {
  const key = trimStr(characterName);
  if (!key) return '';
  const idx = index || buildStaffPublicNameIndex([]);
  const low = key.toLowerCase();
  if (low.startsWith('staff:')) {
    const u = key.slice(6).trim();
    const row = u ? idx.byUsername[lower(u)] : null;
    if (row) return formatPublicStaffName(row);
    return '';
  }
  if (low.startsWith('staff_id:')) return '';
  return formatCompactPersonName(studentDisplayName || key);
}

export function resolveMissionCreatorPublicLabel(index, teacherId, teacherName) {
  const idx = index || buildStaffPublicNameIndex([]);
  const tid = trimStr(teacherId);
  if (tid && idx.byUsername[lower(tid)]) {
    return formatPublicStaffName(idx.byUsername[lower(tid)]);
  }
  const name = trimStr(teacherName);
  if (!name) return '';
  // Prefer staff formatting when the raw name already looks honorific; else leave as stored mission creator label.
  if (/^(Mr\.|Miss|Ms\.|Mrs\.|SRO)\s+\S/i.test(name)) return name;
  return name;
}

export function resolveAuthorPublicLabel(index, fields) {
  const idx = index || buildStaffPublicNameIndex([]);
  const role = lower(fields && (fields.authorRole || fields.author_role || fields.author_type));
  let authorId = trimStr(fields && (fields.authorId || fields.author_id || fields.actor_id));
  const display = trimStr(fields && (fields.authorDisplayName || fields.author_display_name || fields.author_name));

  // Prompt #13 — mission feed rows may carry staff:<username> as author id/display.
  if (authorId.toLowerCase().startsWith('staff:')) authorId = authorId.slice(6).trim();
  let lookupDisplay = display;
  if (lookupDisplay.toLowerCase().startsWith('staff:')) lookupDisplay = lookupDisplay.slice(6).trim();

  let row = null;
  if (authorId && idx.byUsername[lower(authorId)]) row = idx.byUsername[lower(authorId)];
  if (!row && lookupDisplay && idx.byUsername[lower(lookupDisplay)]) row = idx.byUsername[lower(lookupDisplay)];

  if (row) {
    const rRole = lower(row.role);
    if (rRole === 'student') return '';
    return formatPublicStaffName(row);
  }

  if (role === 'teacher' || role === 'admin' || role === 'staff') {
    // Never leak internal staff: keys into Explore author labels.
    if (display.toLowerCase().startsWith('staff:')) return '';
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
 * After person-level field save, copy to sibling Lantern accounts sharing the same TMS staff id.
 * @param {'honorific'|'public_display_name'} column
 */
export async function propagateStaffPublicFieldToLinkedAccounts(db, username, column, valueRaw) {
  if (!db) return;
  const u = trimStr(username);
  if (!u) return;
  if (column !== 'honorific' && column !== 'public_display_name') return;
  const value = valueRaw == null || valueRaw === '' ? null : trimStr(valueRaw);
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
      .prepare(`SELECT lantern_username FROM tms_identity_links WHERE trim(tms_staff_id) = trim(?)`)
      .bind(tms)
      .all();
    for (const s of siblings.results || []) {
      const su = trimStr(s.lantern_username);
      if (!su || lower(su) === lower(u)) continue;
      // Store on sibling for person-level consistency; Web Admin public formatter still returns "Web Admin".
      await db
        .prepare(
          `UPDATE lantern_pilot_accounts SET ${column} = ?, updated_at = datetime('now') WHERE lower(trim(username)) = lower(trim(?))`
        )
        .bind(value, su)
        .run();
    }
  } catch (_) {
    /* best-effort person-level sync */
  }
}

/** @deprecated use propagateStaffPublicFieldToLinkedAccounts */
export async function propagateHonorificToLinkedAccounts(db, username, honorific) {
  return propagateStaffPublicFieldToLinkedAccounts(db, username, 'honorific', honorific);
}

export async function propagatePublicDisplayNameToLinkedAccounts(db, username, publicDisplayName) {
  return propagateStaffPublicFieldToLinkedAccounts(db, username, 'public_display_name', publicDisplayName);
}
