/**
 * Prompt #220/#223/#133 — Staff public names (presentation only).
 * Priority: public_display_name override → Honorific + Last → established professional
 * label already stored on display_name → last_name (never inferred honorific, never first+last).
 * Prompt #147 — ordinary UI identity is resolvePublicDisplayName (stored public_display_name).
 * Default generation is for provisioning/legacy only, not a competing render policy.
 * Ticker/marquee must call formatPublicStaffName (alias formatTickerStaffName) — do not
 * format staff first names from upstream records.
 */

export const STAFF_HONORIFICS = Object.freeze(['Mr.', 'Miss', 'Ms.', 'Mrs.', 'SRO']);
export const PUBLIC_DISPLAY_NAME_MAX_LEN = 80;
/** Prefixes already stored on a label (not inferred / not applied as honorifics). */
const ESTABLISHED_PUBLIC_LABEL_RE = /^(Mr\.|Miss|Ms\.|Mrs\.|SRO|Dr\.|Coach)\s+\S/i;

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

export function firstLastStaffCombo(row) {
  if (!row) return '';
  const fn = trimStr(row.first_name);
  const last = trimStr(row.last_name);
  if (fn && last) return fn + ' ' + last;
  return '';
}

export function isEstablishedProfessionalStaffLabel(name) {
  return ESTABLISHED_PUBLIC_LABEL_RE.test(trimStr(name));
}

/**
 * Public-facing staff label for student/community surfaces.
 * 1) public_display_name (exact stored override, e.g. Coach Colorado / Miss Becky)
 * 2) explicit valid honorific + last_name
 * 3) display_name only when it already is an established professional label
 * 4) last_name (no first-name leak; no honorific inference)
 * Web Admin system account → "Web Admin" (session/account identity)
 */
/** Provisioning / legacy default. Not used when public_display_name is already stored. */
export function defaultPublicDisplayName(row) {
  if (!row) return '';
  if (isSystemWebAdminAccount(row)) return 'Web Admin';
  const role = lower(row.role);
  if (role === 'student') {
    const first = trimStr(row.first_name);
    const last = trimStr(row.last_name);
    if (first && last && /[A-Za-z]/.test(last.charAt(0))) {
      return first + ' ' + last.charAt(0).toUpperCase() + '.';
    }
    if (first) return first;
    return formatCompactPersonName(row.display_name) || trimStr(row.display_name);
  }
  const honorific = trimStr(row.honorific);
  const last = trimStr(row.last_name);
  if (honorific && STAFF_HONORIFICS.indexOf(honorific) >= 0 && last) {
    return honorific + ' ' + last;
  }
  const dn = trimStr(row.display_name);
  if (isEstablishedProfessionalStaffLabel(dn)) return dn;
  if (last) return last;
  if (dn) return dn;
  return '';
}

/**
 * Canonical ordinary UI identity. Stored public_display_name wins.
 * Reconstructs only when the stored field is empty (legacy / pre-population).
 */
export function resolvePublicDisplayName(row) {
  if (!row) return '';
  if (isSystemWebAdminAccount(row)) return 'Web Admin';
  const stored = trimStr(row.public_display_name);
  if (stored) return stored;
  return defaultPublicDisplayName(row);
}

export function formatPublicStaffName(row) {
  return resolvePublicDisplayName(row);
}

/** Same canonical formatter for ticker / marquee / event-feed work. */
export function formatTickerStaffName(row) {
  return formatPublicStaffName(row);
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
 * Build username / staff_id / TMS staff id / teacher_id → pilot row maps.
 * @param {object[]} rows
 * @param {object[]} [linkRows] tms_identity_links rows { lantern_username, tms_staff_id, is_primary }
 */
export function buildStaffPublicNameIndex(rows, linkRows) {
  const byUsername = Object.create(null);
  const byStaffId = Object.create(null);
  const byTmsStaffId = Object.create(null);
  const byTeacherId = Object.create(null);
  const byStudentKey = Object.create(null);
  (rows || []).forEach((row) => {
    if (!row) return;
    const u = lower(row.username);
    if (u) byUsername[u] = row;
    const sid = row.staff_id != null ? String(row.staff_id).trim() : '';
    if (sid) byStaffId[sid] = row;
    const tid = lower(row.teacher_id);
    if (tid) byTeacherId[tid] = row;
    const scn = lower(row.student_character_name);
    if (scn) byStudentKey[scn] = row;
    const mid = row.mtss_student_id != null ? String(row.mtss_student_id).trim().toLowerCase() : '';
    if (mid) byStudentKey[mid] = row;
  });
  (linkRows || []).forEach((link) => {
    if (!link) return;
    const tms = trimStr(link.tms_staff_id);
    const u = lower(link.lantern_username);
    const row = u ? byUsername[u] : null;
    if (!tms || !row) return;
    const k = lower(tms);
    const primary = Number(link.is_primary) === 1;
    if (!byTmsStaffId[k] || primary) byTmsStaffId[k] = row;
  });
  return { byUsername, byStaffId, byTmsStaffId, byTeacherId, byStudentKey };
}

export async function loadStaffPublicNameIndex(db) {
  if (!db) return buildStaffPublicNameIndex([]);
  let accountRows = [];
  try {
    const res = await db
      .prepare(
        `SELECT username, display_name, public_display_name, first_name, last_name, honorific, role, staff_id, teacher_id, student_character_name, mtss_student_id
         FROM lantern_pilot_accounts
         WHERE lower(trim(role)) IN ('teacher', 'admin', 'staff', 'student')`
      )
      .all();
    accountRows = res.results || [];
  } catch (_) {
    try {
      const res = await db
        .prepare(
          `SELECT username, display_name, first_name, last_name, honorific, role, staff_id, teacher_id
           FROM lantern_pilot_accounts
           WHERE lower(trim(role)) IN ('teacher', 'admin', 'staff')`
        )
        .all();
      accountRows = res.results || [];
    } catch (e2) {
      try {
        const res = await db
          .prepare(
            `SELECT username, display_name, first_name, last_name, role, staff_id
             FROM lantern_pilot_accounts
             WHERE lower(trim(role)) IN ('teacher', 'admin', 'staff')`
          )
          .all();
        accountRows = res.results || [];
      } catch (e3) {
        return buildStaffPublicNameIndex([]);
      }
    }
  }
  let linkRows = [];
  try {
    const links = await db
      .prepare(`SELECT lantern_username, tms_staff_id, is_primary FROM tms_identity_links`)
      .all();
    linkRows = links.results || [];
  } catch (_) {
    linkRows = [];
  }
  return buildStaffPublicNameIndex(accountRows, linkRows);
}

/**
 * Durable staff person_key from lantern_content_people (tms_staff_id or lantern_staff:N).
 * Students and unknown keys return null — never fuzzy-match free text.
 */
export function resolveStaffRowByPersonKey(index, personKeyRaw) {
  const idx = index || buildStaffPublicNameIndex([]);
  const key = trimStr(personKeyRaw);
  if (!key) return null;
  const low = key.toLowerCase();
  if (low.startsWith('lantern_staff:')) {
    const sid = key.slice('lantern_staff:'.length).trim();
    return (sid && idx.byStaffId && idx.byStaffId[sid]) || null;
  }
  if (idx.byTmsStaffId && idx.byTmsStaffId[low]) return idx.byTmsStaffId[low];
  if (idx.byUsername && idx.byUsername[low]) return idx.byUsername[low];
  return null;
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
    if (row) return resolvePublicDisplayName(row);
    return '';
  }
  if (low.startsWith('staff_id:')) return '';
  const studentRow =
    (idx.byUsername && idx.byUsername[low]) ||
    (idx.byStudentKey && idx.byStudentKey[low]) ||
    null;
  if (studentRow) return resolvePublicDisplayName(studentRow);
  if (studentDisplayName) return formatCompactPersonName(studentDisplayName);
  return '';
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
  let avatarKey = trimStr(fields && (fields.authorAvatarKey || fields.author_avatar_key));

  // Prompt #13 — mission feed rows may carry staff:<username> as author id/display.
  if (authorId.toLowerCase().startsWith('staff:')) authorId = authorId.slice(6).trim();
  if (avatarKey.toLowerCase().startsWith('staff:')) avatarKey = avatarKey.slice(6).trim();
  let lookupDisplay = display;
  if (lookupDisplay.toLowerCase().startsWith('staff:')) lookupDisplay = lookupDisplay.slice(6).trim();

  let row = null;
  if (authorId && idx.byUsername[lower(authorId)]) row = idx.byUsername[lower(authorId)];
  if (!row && authorId && idx.byTeacherId && idx.byTeacherId[lower(authorId)]) {
    row = idx.byTeacherId[lower(authorId)];
  }
  if (!row && lookupDisplay && idx.byUsername[lower(lookupDisplay)]) row = idx.byUsername[lower(lookupDisplay)];

  if (!row && authorId && idx.byStudentKey && idx.byStudentKey[lower(authorId)]) {
    row = idx.byStudentKey[lower(authorId)];
  }
  if (!row && lookupDisplay && idx.byStudentKey && idx.byStudentKey[lower(lookupDisplay)]) {
    row = idx.byStudentKey[lower(lookupDisplay)];
  }
  // Prompt #151 — polls often store legal display snapshots with authorId null.
  // After attachAuthorAvatarKeys, authorAvatarKey is the durable username; use it (exact), never fuzzy name match.
  if (!row && avatarKey && idx.byUsername[lower(avatarKey)]) {
    row = idx.byUsername[lower(avatarKey)];
  }
  if (!row && avatarKey && idx.byStudentKey && idx.byStudentKey[lower(avatarKey)]) {
    row = idx.byStudentKey[lower(avatarKey)];
  }

  if (row) {
    return resolvePublicDisplayName(row);
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

export function rewriteRecognizingLine(text, canonical) {
  const s = String(text == null ? '' : text);
  const label = trimStr(canonical);
  if (!label || !/Recognizing:\s*/i.test(s)) return s;
  return s.replace(/Recognizing:\s*[^\n\r]+/i, 'Recognizing: ' + label);
}

function replaceExactLabels(text, previousLabels, canonical) {
  let t = String(text == null ? '' : text);
  const next = trimStr(canonical);
  if (!next) return t;
  (previousLabels || []).forEach((old) => {
    const from = trimStr(old);
    if (!from || from === next) return;
    if (t.indexOf(from) >= 0) t = t.split(from).join(next);
  });
  return t;
}

/**
 * Presentation overlay for a recognized staff person (no D1 write).
 * Rewrites Recognizing: metadata line + title snapshots; leaves free-text body copy.
 */
export function overlayRecognizedStaffPresentation(item, canonical, previousLabels) {
  if (!item || typeof item !== 'object') return item;
  const label = trimStr(canonical);
  if (!label) return item;
  if (!item.contentSlot || typeof item.contentSlot !== 'object') item.contentSlot = {};
  item.contentSlot.recipient = label;
  item.contentSlot.recognition_label = label;
  if (item.body) item.body = rewriteRecognizingLine(item.body, label);
  if (item.summary) item.summary = rewriteRecognizingLine(item.summary, label);
  if (item.title) item.title = replaceExactLabels(item.title, previousLabels, label);
  return item;
}

export function liveStaffPersonLabel(personRow, index) {
  if (!personRow) return '';
  if (lower(personRow.person_kind) !== 'staff') return trimStr(personRow.display_label);
  const row = resolveStaffRowByPersonKey(index, personRow.person_key);
  if (row) return formatPublicStaffName(row);
  return trimStr(personRow.display_label);
}

export function contentKeyFromFeedItem(item) {
  if (!item || typeof item !== 'object') return null;
  const id = trimStr(item.id);
  const slot = item.contentSlot && typeof item.contentSlot === 'object' ? item.contentSlot : {};
  const low = id.toLowerCase();
  if (low.startsWith('news:')) return { kind: 'news', id: id.slice(5) };
  if (low.startsWith('shout_out:')) return { kind: 'recognition', id: id.slice(10) };
  if (low.startsWith('poll:')) return { kind: 'poll', id: id.slice(5) };
  if (slot.newsId) return { kind: 'news', id: trimStr(slot.newsId) };
  if (slot.recognitionId) return { kind: 'recognition', id: trimStr(slot.recognitionId) };
  if (slot.pollId) return { kind: 'poll', id: trimStr(slot.pollId) };
  return null;
}

function previousStaffLeakLabels(personRow, staffRow) {
  const out = [];
  const snap = trimStr(personRow && personRow.display_label);
  if (snap) out.push(snap);
  const combo = firstLastStaffCombo(staffRow);
  if (combo && out.indexOf(combo) < 0) out.push(combo);
  return out;
}

/**
 * Prompt #133 — at serialize time, recognized staff with a durable person_key
 * render the current professional label. Free-text / unmatched keys are left as stored.
 */
export function attachRecognizedStaffPublicLabels(items, index, peopleByContent) {
  const list = Array.isArray(items) ? items : [];
  const map = peopleByContent || new Map();
  list.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const key = contentKeyFromFeedItem(item);
    if (!key) return;
    const people = map.get(key.kind + '|' + key.id) || [];
    if (!people.length) return;
    const recognizedStaff = people.filter(
      (p) => lower(p.person_kind) === 'staff' && lower(p.relationship) === 'recognized'
    );
    const target = recognizedStaff[0];
    if (target) {
      const row = resolveStaffRowByPersonKey(index, target.person_key);
      if (row) {
        overlayRecognizedStaffPresentation(item, formatPublicStaffName(row), previousStaffLeakLabels(target, row));
      }
    }
    item.people = people.map((p) => ({
      relationship: p.relationship,
      person_kind: p.person_kind,
      label: liveStaffPersonLabel(p, index),
    }));
  });
  return list;
}

export function overlayNewsRowRecognizedStaff(row, index, people) {
  if (!row || typeof row !== 'object') return row;
  const recognized = (people || []).find(
    (p) => lower(p.person_kind) === 'staff' && lower(p.relationship) === 'recognized'
  );
  if (!recognized) return row;
  const staffRow = resolveStaffRowByPersonKey(index, recognized.person_key);
  if (!staffRow) return row;
  const canonical = formatPublicStaffName(staffRow);
  if (!canonical) return row;
  const previous = previousStaffLeakLabels(recognized, staffRow);
  if (row.body) row.body = rewriteRecognizingLine(row.body, canonical);
  if (row.title) row.title = replaceExactLabels(row.title, previous, canonical);
  row.recognition_public_label = canonical;
  return row;
}

export function overlayRecognitionListRow(row, index, people) {
  if (!row || typeof row !== 'object') return row;
  const recognized = (people || []).find(
    (p) => lower(p.person_kind) === 'staff' && lower(p.relationship) === 'recognized'
  );
  if (recognized) {
    const staffRow = resolveStaffRowByPersonKey(index, recognized.person_key);
    if (staffRow) {
      const canonical = formatPublicStaffName(staffRow);
      if (canonical) row.character_public_label = canonical;
    }
  }
  const authorLabel = resolveAuthorPublicLabel(index, {
    authorId: row.created_by_teacher_id,
    authorRole: 'teacher',
    authorDisplayName: row.created_by_teacher_name,
  });
  if (authorLabel) row.created_by_teacher_public_label = authorLabel;
  return row;
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
