/**
 * Prompt #190 — Canonical content↔person relationships + People search.
 * Tags reference immutable person keys (student: mtss_student_id; staff: tms_staff_id or lantern_staff fallback).
 */

import { resolveTmsStaffIdForLanternAccount } from './staff-economy.js';

export const CONTENT_PEOPLE_MAX_TAGS = 40;
export const CONTENT_PEOPLE_RELATIONSHIPS = new Set(['recognized', 'tagged']);
export const CONTENT_PEOPLE_KINDS = new Set(['news', 'poll_contribution', 'poll', 'recognition']);

function trimStr(v) {
  return v != null ? String(v).trim() : '';
}

function lower(v) {
  return trimStr(v).toLowerCase();
}

export function parsePeopleToken(tokenRaw) {
  const token = trimStr(tokenRaw);
  if (!token) return null;
  const i = token.indexOf(':');
  if (i <= 0) return null;
  const prefix = token.slice(0, i).toLowerCase();
  const key = token.slice(i + 1).trim();
  if (!key) return null;
  if (prefix === 'student') return { person_kind: 'student', person_key: key, token: 'student:' + key };
  if (prefix === 'staff_tms') return { person_kind: 'staff', person_key: key, token: 'staff_tms:' + key };
  if (prefix === 'staff_lantern') {
    const n = Number(key);
    if (!Number.isFinite(n) || n <= 0) return null;
    return { person_kind: 'staff', person_key: 'lantern_staff:' + Math.floor(n), token: 'staff_lantern:' + Math.floor(n) };
  }
  return null;
}

export function privacySafeStudentLabel(row) {
  if (!row) return '';
  const idn = trimStr(row.identity_display);
  if (idn) return idn;
  const dn = trimStr(row.display_name);
  if (dn) return dn;
  const sc = trimStr(row.student_character_name);
  if (sc) return sc;
  return trimStr(row.username);
}

export function privacySafeStaffLabel(row) {
  if (!row) return '';
  const dn = trimStr(row.display_name);
  if (dn) return dn;
  const fn = trimStr(row.first_name);
  const ln = trimStr(row.last_name);
  if (fn || ln) return [fn, ln].filter(Boolean).join(' ').trim();
  return trimStr(row.username);
}

/**
 * Viewer person keys for My Lantern matching (student mtss id + staff tms / lantern_staff fallback).
 */
export async function personKeysForAccount(db, account) {
  const out = [];
  if (!account) return out;
  const role = lower(account.role);
  if (role === 'student') {
    const sid = trimStr(account.mtss_student_id);
    if (sid) out.push({ person_kind: 'student', person_key: sid });
  } else if (role === 'teacher' || role === 'admin' || role === 'staff') {
    const tms = await resolveTmsStaffIdForLanternAccount(db, account.username);
    if (tms) out.push({ person_kind: 'staff', person_key: tms });
    const lanternStaffId = account.staff_id != null ? Number(account.staff_id) : 0;
    if (Number.isFinite(lanternStaffId) && lanternStaffId > 0) {
      out.push({ person_kind: 'staff', person_key: 'lantern_staff:' + Math.floor(lanternStaffId) });
    }
  }
  return out;
}

export async function searchPeople(db, queryRaw, limitRaw) {
  const q = trimStr(queryRaw);
  const limit = Math.max(1, Math.min(40, Number(limitRaw) || 20));
  if (!db) return { ok: false, error: 'DB not configured', students: [], staff: [] };
  if (q.length < 1) return { ok: true, students: [], staff: [] };

  const like = '%' + q.replace(/%/g, '') + '%';
  const students = [];
  try {
    const rows = await db
      .prepare(
        `SELECT p.mtss_student_id AS mtss_student_id,
                p.username AS username,
                p.display_name AS display_name,
                p.student_character_name AS student_character_name,
                COALESCE(si.display_name, si2.display_name) AS identity_display
         FROM lantern_pilot_accounts p
         LEFT JOIN lantern_student_identities si
           ON lower(trim(si.character_name)) = lower(trim(p.mtss_student_id))
         LEFT JOIN lantern_student_identities si2
           ON lower(trim(si2.character_name)) = lower(trim(p.student_character_name))
         WHERE lower(trim(p.role)) = 'student'
           AND (p.is_active IS NULL OR CAST(p.is_active AS INTEGER) = 1)
           AND p.mtss_student_id IS NOT NULL AND trim(p.mtss_student_id) != ''
           AND (
             lower(COALESCE(si.display_name, '')) LIKE lower(?)
             OR lower(COALESCE(si2.display_name, '')) LIKE lower(?)
             OR lower(COALESCE(p.display_name, '')) LIKE lower(?)
             OR lower(COALESCE(p.student_character_name, '')) LIKE lower(?)
             OR lower(COALESCE(p.username, '')) LIKE lower(?)
           )
         ORDER BY
           CASE
             WHEN lower(COALESCE(si.display_name, si2.display_name, p.display_name, '')) LIKE lower(?) THEN 0
             ELSE 1
           END,
           lower(COALESCE(si.display_name, si2.display_name, p.display_name, p.username))
         LIMIT ?`
      )
      .bind(like, like, like, like, like, q.replace(/%/g, '') + '%', limit)
      .all();
    const seen = new Set();
    for (const r of rows.results || []) {
      const key = trimStr(r.mtss_student_id);
      if (!key || seen.has(key.toLowerCase())) continue;
      seen.add(key.toLowerCase());
      students.push({
        token: 'student:' + key,
        person_kind: 'student',
        label: privacySafeStudentLabel(r),
      });
    }
  } catch (_) {
    /* identities table optional */
  }

  const staff = [];
  const staffSeen = new Set();
  try {
    const linked = await db
      .prepare(
        `SELECT l.tms_staff_id AS tms_staff_id,
                MAX(CASE WHEN l.is_primary = 1 THEN p.display_name ELSE NULL END) AS primary_display,
                MAX(p.display_name) AS any_display,
                MAX(p.first_name) AS first_name,
                MAX(p.last_name) AS last_name,
                MAX(p.username) AS username
         FROM tms_identity_links l
         INNER JOIN lantern_pilot_accounts p
           ON lower(trim(p.username)) = lower(trim(l.lantern_username))
         WHERE (p.is_active IS NULL OR CAST(p.is_active AS INTEGER) = 1)
           AND lower(trim(p.role)) IN ('teacher', 'admin', 'staff')
           AND (
             lower(COALESCE(p.display_name, '')) LIKE lower(?)
             OR lower(COALESCE(p.first_name, '')) LIKE lower(?)
             OR lower(COALESCE(p.last_name, '')) LIKE lower(?)
             OR lower(COALESCE(p.username, '')) LIKE lower(?)
           )
         GROUP BY l.tms_staff_id
         ORDER BY lower(COALESCE(primary_display, any_display, username))
         LIMIT ?`
      )
      .bind(like, like, like, like, limit)
      .all();
    for (const r of linked.results || []) {
      const key = trimStr(r.tms_staff_id);
      if (!key || staffSeen.has('tms:' + key.toLowerCase())) continue;
      staffSeen.add('tms:' + key.toLowerCase());
      staff.push({
        token: 'staff_tms:' + key,
        person_kind: 'staff',
        label: privacySafeStaffLabel({
          display_name: r.primary_display || r.any_display,
          first_name: r.first_name,
          last_name: r.last_name,
          username: r.username,
        }),
      });
    }
  } catch (_) {}

  try {
    const unlinked = await db
      .prepare(
        `SELECT p.staff_id AS staff_id,
                p.display_name AS display_name,
                p.first_name AS first_name,
                p.last_name AS last_name,
                p.username AS username
         FROM lantern_pilot_accounts p
         LEFT JOIN tms_identity_links l
           ON lower(trim(l.lantern_username)) = lower(trim(p.username))
         WHERE (p.is_active IS NULL OR CAST(p.is_active AS INTEGER) = 1)
           AND lower(trim(p.role)) IN ('teacher', 'admin', 'staff')
           AND p.staff_id IS NOT NULL AND CAST(p.staff_id AS INTEGER) > 0
           AND l.tms_staff_id IS NULL
           AND (
             lower(COALESCE(p.display_name, '')) LIKE lower(?)
             OR lower(COALESCE(p.first_name, '')) LIKE lower(?)
             OR lower(COALESCE(p.last_name, '')) LIKE lower(?)
             OR lower(COALESCE(p.username, '')) LIKE lower(?)
           )
         ORDER BY lower(COALESCE(p.display_name, p.username))
         LIMIT ?`
      )
      .bind(like, like, like, like, limit)
      .all();
    for (const r of unlinked.results || []) {
      const sid = Number(r.staff_id);
      if (!Number.isFinite(sid) || sid <= 0) continue;
      const mark = 'lantern:' + Math.floor(sid);
      if (staffSeen.has(mark)) continue;
      staffSeen.add(mark);
      staff.push({
        token: 'staff_lantern:' + Math.floor(sid),
        person_kind: 'staff',
        label: privacySafeStaffLabel(r),
        fallback: 'lantern_staff_id',
      });
    }
  } catch (_) {}

  return { ok: true, students: students.slice(0, limit), staff: staff.slice(0, limit) };
}

async function resolveTokenAgainstDb(db, parsed) {
  if (!parsed || !db) return null;
  if (parsed.person_kind === 'student') {
    const row = await db
      .prepare(
        `SELECT p.mtss_student_id AS mtss_student_id,
                p.username AS username,
                p.display_name AS display_name,
                p.student_character_name AS student_character_name,
                si.display_name AS identity_display
         FROM lantern_pilot_accounts p
         LEFT JOIN lantern_student_identities si
           ON lower(trim(si.character_name)) = lower(trim(p.mtss_student_id))
         WHERE lower(trim(p.role)) = 'student'
           AND (p.is_active IS NULL OR CAST(p.is_active AS INTEGER) = 1)
           AND lower(trim(p.mtss_student_id)) = lower(trim(?))
         LIMIT 1`
      )
      .bind(parsed.person_key)
      .first();
    if (!row) return null;
    return {
      person_kind: 'student',
      person_key: trimStr(row.mtss_student_id),
      display_label: privacySafeStudentLabel(row),
    };
  }
  if (parsed.person_kind === 'staff' && parsed.person_key.indexOf('lantern_staff:') === 0) {
    const sid = Number(String(parsed.person_key).slice('lantern_staff:'.length));
    if (!Number.isFinite(sid) || sid <= 0) return null;
    const row = await db
      .prepare(
        `SELECT p.staff_id AS staff_id, p.display_name AS display_name, p.first_name AS first_name,
                p.last_name AS last_name, p.username AS username, l.tms_staff_id AS tms_staff_id
         FROM lantern_pilot_accounts p
         LEFT JOIN tms_identity_links l ON lower(trim(l.lantern_username)) = lower(trim(p.username))
         WHERE p.staff_id = ?
           AND (p.is_active IS NULL OR CAST(p.is_active AS INTEGER) = 1)
           AND lower(trim(p.role)) IN ('teacher', 'admin', 'staff')
         LIMIT 1`
      )
      .bind(Math.floor(sid))
      .first();
    if (!row) return null;
    if (row.tms_staff_id) {
      return {
        person_kind: 'staff',
        person_key: trimStr(row.tms_staff_id),
        display_label: privacySafeStaffLabel(row),
      };
    }
    return {
      person_kind: 'staff',
      person_key: 'lantern_staff:' + Math.floor(sid),
      display_label: privacySafeStaffLabel(row),
    };
  }
  if (parsed.person_kind === 'staff') {
    const row = await db
      .prepare(
        `SELECT l.tms_staff_id AS tms_staff_id,
                MAX(CASE WHEN l.is_primary = 1 THEN p.display_name ELSE NULL END) AS primary_display,
                MAX(p.display_name) AS any_display,
                MAX(p.first_name) AS first_name,
                MAX(p.last_name) AS last_name,
                MAX(p.username) AS username
         FROM tms_identity_links l
         INNER JOIN lantern_pilot_accounts p
           ON lower(trim(p.username)) = lower(trim(l.lantern_username))
         WHERE lower(trim(l.tms_staff_id)) = lower(trim(?))
           AND (p.is_active IS NULL OR CAST(p.is_active AS INTEGER) = 1)
         GROUP BY l.tms_staff_id
         LIMIT 1`
      )
      .bind(parsed.person_key)
      .first();
    if (!row) return null;
    return {
      person_kind: 'staff',
      person_key: trimStr(row.tms_staff_id),
      display_label: privacySafeStaffLabel({
        display_name: row.primary_display || row.any_display,
        first_name: row.first_name,
        last_name: row.last_name,
        username: row.username,
      }),
    };
  }
  return null;
}

/**
 * Normalize client people payload into validated rows.
 * @returns {{ ok: true, people: object[] } | { ok: false, error: string }}
 */
export async function normalizePeoplePayload(db, peopleRaw, opts) {
  opts = opts || {};
  const requireRecognizedOne = !!opts.requireRecognizedOne;
  const maxTags = opts.maxTags != null ? opts.maxTags : CONTENT_PEOPLE_MAX_TAGS;
  const list = Array.isArray(peopleRaw) ? peopleRaw : [];
  if (requireRecognizedOne) {
    if (list.length !== 1) return { ok: false, error: 'Shout-Out requires exactly one recognized person' };
  }
  if (list.length > maxTags) return { ok: false, error: 'Too many people tagged (max ' + maxTags + ')' };

  const out = [];
  const seen = new Set();
  for (let i = 0; i < list.length; i++) {
    const raw = list[i] || {};
    const relationship = lower(raw.relationship || (requireRecognizedOne ? 'recognized' : 'tagged'));
    if (!CONTENT_PEOPLE_RELATIONSHIPS.has(relationship)) {
      return { ok: false, error: 'Invalid people relationship' };
    }
    if (requireRecognizedOne && relationship !== 'recognized') {
      return { ok: false, error: 'Shout-Out requires relationship recognized' };
    }
    if (!requireRecognizedOne && relationship === 'recognized') {
      return { ok: false, error: 'recognized is only valid for Shout-Out' };
    }
    const parsed = parsePeopleToken(raw.token || raw.person_token || raw.id);
    if (!parsed) return { ok: false, error: 'Invalid people selection' };
    const resolved = await resolveTokenAgainstDb(db, parsed);
    if (!resolved) return { ok: false, error: 'Selected person is not available' };
    const uniq = [resolved.person_kind, lower(resolved.person_key), relationship].join('|');
    if (seen.has(uniq)) continue;
    seen.add(uniq);
    out.push({
      person_kind: resolved.person_kind,
      person_key: resolved.person_key,
      relationship,
      display_label: resolved.display_label,
    });
  }
  if (requireRecognizedOne && out.length !== 1) {
    return { ok: false, error: 'Shout-Out requires exactly one recognized person' };
  }
  return { ok: true, people: out };
}

export async function replaceContentPeople(db, contentKind, contentId, people, createdByUsername) {
  const kind = trimStr(contentKind);
  const cid = trimStr(contentId);
  if (!db || !kind || !cid) return { ok: false, error: 'missing content' };
  if (!CONTENT_PEOPLE_KINDS.has(kind)) return { ok: false, error: 'invalid content_kind' };
  const now = new Date().toISOString();
  await db.prepare('DELETE FROM lantern_content_people WHERE content_kind = ? AND content_id = ?').bind(kind, cid).run();
  const rows = Array.isArray(people) ? people : [];
  for (let i = 0; i < rows.length; i++) {
    const p = rows[i];
    const id = 'cp_' + crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO lantern_content_people
          (id, content_kind, content_id, person_kind, person_key, relationship, display_label, created_at, created_by_username)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        kind,
        cid,
        p.person_kind,
        p.person_key,
        p.relationship,
        p.display_label || null,
        now,
        createdByUsername || null
      )
      .run();
  }
  return { ok: true, count: rows.length };
}

export async function copyContentPeople(db, fromKind, fromId, toKind, toId, createdByUsername) {
  const rows = await listContentPeople(db, fromKind, fromId);
  if (!rows.length) return { ok: true, count: 0 };
  return replaceContentPeople(
    db,
    toKind,
    toId,
    rows.map((r) => ({
      person_kind: r.person_kind,
      person_key: r.person_key,
      relationship: r.relationship,
      display_label: r.display_label,
    })),
    createdByUsername
  );
}

export async function listContentPeople(db, contentKind, contentId) {
  if (!db) return [];
  try {
    const rows = await db
      .prepare(
        `SELECT person_kind, person_key, relationship, display_label
         FROM lantern_content_people
         WHERE content_kind = ? AND content_id = ?
         ORDER BY relationship, display_label`
      )
      .bind(trimStr(contentKind), trimStr(contentId))
      .all();
    return (rows.results || []).map((r) => ({
      person_kind: r.person_kind,
      person_key: r.person_key,
      relationship: r.relationship,
      display_label: r.display_label || '',
    }));
  } catch (_) {
    return [];
  }
}

/**
 * Map content_people rows for a viewer into Explore feed item ids (news:/poll:/shout_out:).
 */
export async function feedIdsRelatedToPersonKeys(db, personKeyRows) {
  const feedIds = new Set();
  if (!db || !personKeyRows || !personKeyRows.length) return feedIds;
  const kinds = [];
  const keys = [];
  personKeyRows.forEach((p) => {
    kinds.push(p.person_kind);
    keys.push(p.person_key);
  });
  // SQLite has no easy OR tuple bind — query per key (typically 1–2 keys).
  for (let i = 0; i < personKeyRows.length; i++) {
    const pk = personKeyRows[i];
    let rows;
    try {
      rows = await db
        .prepare(
          `SELECT content_kind, content_id, relationship
           FROM lantern_content_people
           WHERE person_kind = ? AND lower(trim(person_key)) = lower(trim(?))`
        )
        .bind(pk.person_kind, pk.person_key)
        .all();
    } catch (_) {
      continue;
    }
    for (const r of rows.results || []) {
      const ck = trimStr(r.content_kind);
      const cid = trimStr(r.content_id);
      if (!cid) continue;
      if (ck === 'news') feedIds.add('news:' + cid);
      else if (ck === 'poll') feedIds.add('poll:' + cid);
      else if (ck === 'recognition') feedIds.add('shout_out:' + cid);
      else if (ck === 'poll_contribution') {
        try {
          const poll = await db
            .prepare(
              `SELECT id FROM lantern_polls
               WHERE mission_submission_id = ? AND approved_at IS NOT NULL
               LIMIT 1`
            )
            .bind('contrib:' + cid)
            .first();
          if (poll && poll.id) feedIds.add('poll:' + poll.id);
        } catch (_) {}
      }
    }
  }
  return feedIds;
}

export function publicPeopleForReview(rows) {
  return (rows || []).map((r) => ({
    relationship: r.relationship,
    person_kind: r.person_kind,
    label: r.display_label || '',
  }));
}
