/**
 * Prompt #3 — Media/Publicity Restriction + external publication eligibility.
 *
 * Restriction is presentation/publication safety for EXTERNAL / SEMI-PUBLIC surfaces
 * (Hallway TV, future YouTube Unlisted). It does NOT disable internal Lantern participation.
 *
 * Canonical store: lantern_student_identities.character_name (= MTSS Student ID).
 */
import { listContentPeople } from './content-people.js';

function trimStr(v) {
  return v == null ? '' : String(v).trim();
}

function lower(v) {
  return trimStr(v).toLowerCase();
}

export function isMediaPublicityRestrictedValue(raw) {
  return Number(raw) === 1 || raw === true || String(raw).trim() === '1';
}

/**
 * Load Set of restricted student ids (lowercase character_name / MTSS id).
 */
export async function loadRestrictedStudentIdSet(db) {
  const set = new Set();
  if (!db) return set;
  try {
    const rows = await db
      .prepare(
        `SELECT character_name FROM lantern_student_identities
         WHERE CAST(COALESCE(media_publicity_restricted, 0) AS INTEGER) = 1`
      )
      .all();
    (rows.results || []).forEach((r) => {
      const id = lower(r.character_name);
      if (id) set.add(id);
    });
  } catch (_) {
    /* column may not exist until migration */
  }
  return set;
}

export function studentIdIsRestricted(studentId, restrictedSet) {
  const id = lower(studentId);
  return !!(id && restrictedSet && restrictedSet.has(id));
}

/**
 * Upsert restriction on lantern_student_identities (creates row if needed).
 */
export async function setStudentMediaPublicityRestriction(db, opts) {
  const studentId = trimStr(opts && opts.studentId);
  const restricted = !!(opts && opts.restricted);
  const updatedBy = trimStr(opts && opts.updatedBy) || 'admin';
  const displayName = trimStr(opts && opts.displayName) || studentId;
  const now = (opts && opts.now) || new Date().toISOString();
  if (!db || !studentId) return { ok: false, error: 'student_id_required' };

  try {
    const existing = await db
      .prepare(`SELECT character_name, display_name FROM lantern_student_identities WHERE lower(trim(character_name)) = lower(trim(?))`)
      .bind(studentId)
      .first();
    if (existing) {
      await db
        .prepare(
          `UPDATE lantern_student_identities
           SET media_publicity_restricted = ?, media_publicity_updated_at = ?, media_publicity_updated_by = ?,
               display_name = COALESCE(NULLIF(trim(display_name), ''), ?)
           WHERE lower(trim(character_name)) = lower(trim(?))`
        )
        .bind(restricted ? 1 : 0, now, updatedBy, displayName, studentId)
        .run();
    } else {
      await db
        .prepare(
          `INSERT INTO lantern_student_identities
             (character_name, display_name, created_at, media_publicity_restricted, media_publicity_updated_at, media_publicity_updated_by)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(studentId, displayName || studentId, now, restricted ? 1 : 0, now, updatedBy)
        .run();
    }
    return {
      ok: true,
      student_id: studentId,
      media_publicity_restricted: restricted ? 1 : 0,
      media_publicity_status: restricted ? 'Restricted' : 'Allowed',
      media_publicity_updated_at: now,
      media_publicity_updated_by: updatedBy,
    };
  } catch (e) {
    return { ok: false, error: 'media_publicity_write_failed', detail: e && e.message ? String(e.message) : '' };
  }
}

/**
 * Map of student_id(lower) → restriction flags for Admin roster merge.
 */
export async function loadMediaPublicityMap(db) {
  const map = Object.create(null);
  if (!db) return map;
  try {
    const rows = await db
      .prepare(
        `SELECT character_name, media_publicity_restricted, media_publicity_updated_at, media_publicity_updated_by, display_name
         FROM lantern_student_identities
         WHERE media_publicity_restricted IS NOT NULL`
      )
      .all();
    (rows.results || []).forEach((r) => {
      const id = lower(r.character_name);
      if (!id) return;
      map[id] = {
        media_publicity_restricted: isMediaPublicityRestrictedValue(r.media_publicity_restricted) ? 1 : 0,
        media_publicity_updated_at: r.media_publicity_updated_at || null,
        media_publicity_updated_by: r.media_publicity_updated_by || null,
        display_name: r.display_name || null,
      };
    });
  } catch (_) {}
  return map;
}

/**
 * Staff-safe roster of restricted students (no parent/waiver notes).
 * Enrich with optional TMS rows: { student_id, first_name, last_name, student_name, grade }.
 */
export async function listRestrictedStudentsForStaff(db, tmsStudents) {
  const restrictedSet = await loadRestrictedStudentIdSet(db);
  const byId = Object.create(null);
  (Array.isArray(tmsStudents) ? tmsStudents : []).forEach((s) => {
    const id = lower(s && s.student_id);
    if (id) byId[id] = s;
  });
  const out = [];
  for (const id of restrictedSet) {
    const tms = byId[id] || null;
    let first = trimStr(tms && tms.first_name);
    let last = trimStr(tms && tms.last_name);
    let full = trimStr(tms && tms.student_name);
    if (!first && !last && full) {
      const parts = full.split(/\s+/);
      first = parts[0] || '';
      last = parts.slice(1).join(' ');
    }
    if (!first && !last) {
      try {
        const row = await db
          .prepare(`SELECT display_name FROM lantern_student_identities WHERE lower(trim(character_name)) = ?`)
          .bind(id)
          .first();
        full = trimStr(row && row.display_name) || id;
        const parts = full.split(/\s+/);
        first = parts[0] || full;
        last = parts.slice(1).join(' ');
      } catch (_) {
        first = id;
      }
    }
    const grade = trimStr(tms && tms.grade).replace(/^grade-/i, '');
    out.push({
      student_id: trimStr(tms && tms.student_id) || id,
      first_name: first,
      last_name: last,
      grade: grade || null,
      media_publicity_status: 'Restricted',
    });
  }
  out.sort((a, b) => {
    const la = lower(a.last_name || a.first_name);
    const lb = lower(b.last_name || b.first_name);
    return la.localeCompare(lb) || lower(a.first_name).localeCompare(lower(b.first_name));
  });
  return out;
}

export function computeExternalAssetFingerprint(opts) {
  const video = trimStr(opts && (opts.videoKey || opts.video_r2_key));
  const image = trimStr(opts && (opts.imageKey || opts.image_r2_key));
  const people = (opts && opts.peopleKeys) || [];
  const sorted = people
    .map((k) => lower(k))
    .filter(Boolean)
    .sort();
  return [video, image, sorted.join(',')].join('|');
}

export async function getExternalMediaClearance(db, contentKind, contentId) {
  if (!db) return null;
  try {
    return await db
      .prepare(
        `SELECT content_kind, content_id, cleared_at, cleared_by, asset_fingerprint
         FROM lantern_external_media_clearance
         WHERE content_kind = ? AND content_id = ?`
      )
      .bind(trimStr(contentKind), trimStr(contentId))
      .first();
  } catch (_) {
    return null;
  }
}

export async function recordExternalMediaClearance(db, opts) {
  const contentKind = trimStr(opts && opts.contentKind);
  const contentId = trimStr(opts && opts.contentId);
  const clearedBy = trimStr(opts && opts.clearedBy) || 'staff';
  const fingerprint = trimStr(opts && opts.assetFingerprint);
  const now = (opts && opts.now) || new Date().toISOString();
  if (!db || !contentKind || !contentId || !fingerprint) {
    return { ok: false, error: 'clearance_fields_required' };
  }
  try {
    await db
      .prepare(
        `INSERT INTO lantern_external_media_clearance (content_kind, content_id, cleared_at, cleared_by, asset_fingerprint)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(content_kind, content_id) DO UPDATE SET
           cleared_at = excluded.cleared_at,
           cleared_by = excluded.cleared_by,
           asset_fingerprint = excluded.asset_fingerprint`
      )
      .bind(contentKind, contentId, now, clearedBy, fingerprint)
      .run();
    return { ok: true, content_kind: contentKind, content_id: contentId, cleared_at: now, cleared_by: clearedBy, asset_fingerprint: fingerprint };
  } catch (e) {
    return { ok: false, error: 'clearance_write_failed', detail: e && e.message ? String(e.message) : '' };
  }
}

/**
 * Resolve candidate student ids for an author (actor_id / author_name / submitter).
 */
export async function resolveAuthorStudentCandidates(db, fields) {
  const out = new Set();
  const add = (v) => {
    const s = trimStr(v);
    if (s) out.add(s);
  };
  add(fields && fields.actor_id);
  add(fields && fields.actorId);
  add(fields && fields.author_name);
  add(fields && fields.authorName);
  add(fields && fields.submitted_by_actor_id);
  add(fields && fields.character_name);
  add(fields && fields.submitter);
  // Pilot lookup: username → mtss_student_id
  const usernames = [...out];
  for (const u of usernames) {
    try {
      const row = await db
        .prepare(
          `SELECT mtss_student_id, student_character_name, username FROM lantern_pilot_accounts
           WHERE lower(trim(role)) = 'student'
             AND (
               lower(trim(username)) = lower(trim(?))
               OR (mtss_student_id IS NOT NULL AND lower(trim(mtss_student_id)) = lower(trim(?)))
               OR (student_character_name IS NOT NULL AND lower(trim(student_character_name)) = lower(trim(?)))
             )
           LIMIT 1`
        )
        .bind(u, u, u)
        .first();
      if (row) {
        add(row.mtss_student_id);
        add(row.student_character_name);
        add(row.username);
      }
    } catch (_) {}
  }
  return [...out];
}

/**
 * Known restricted subjects from structured People rows (student person_key only).
 * Free-text recognition is ignored (no fuzzy match).
 */
export function knownRestrictedPeopleFromRows(peopleRows, restrictedSet) {
  const out = [];
  const seen = new Set();
  (peopleRows || []).forEach((p) => {
    if (!p) return;
    const kind = lower(p.person_kind || p.personKind);
    if (kind && kind !== 'student') return;
    const key = trimStr(p.person_key || p.personKey);
    if (!studentIdIsRestricted(key, restrictedSet)) return;
    const lk = lower(key);
    if (seen.has(lk)) return;
    seen.add(lk);
    out.push({
      person_key: key,
      label: trimStr(p.display_label || p.label) || key,
      relationship: trimStr(p.relationship) || null,
    });
  });
  return out;
}

/**
 * Hallway TV / external identification eligibility.
 * Restricted author OR restricted tagged/recognized student → exclude identifying content.
 * Restricted creator alone is enough for Hallway (student-identifying author credit).
 */
export function evaluateHallwayTvEligibility(opts) {
  const restrictedSet = opts && opts.restrictedSet;
  const authorCandidates = opts && opts.authorStudentIds ? opts.authorStudentIds : [];
  const authorType = lower(opts && opts.authorType);
  const isStudentAuthor = !authorType || authorType === 'student';
  const authorRestricted =
    isStudentAuthor && authorCandidates.some((id) => studentIdIsRestricted(id, restrictedSet));
  const knownRestricted = Array.isArray(opts && opts.knownRestrictedPeople) ? opts.knownRestrictedPeople : [];
  const blocked = authorRestricted || knownRestricted.length > 0;
  return {
    hallway_eligible: !blocked,
    author_restricted: authorRestricted,
    known_restricted_people: knownRestricted,
    reason: blocked
      ? authorRestricted
        ? 'restricted_author'
        : 'restricted_tagged_or_recognized'
      : null,
  };
}

/**
 * External hosting (YouTube Unlisted, etc.).
 * Known restricted SUBJECT blocks. Restricted CREATOR alone does not.
 * Video/image external publish requires durable clearance matching fingerprint.
 */
export function evaluateExternalPublicationEligibility(opts) {
  const knownRestricted = Array.isArray(opts && opts.knownRestrictedPeople) ? opts.knownRestrictedPeople : [];
  const authorRestricted = !!(opts && opts.authorRestricted);
  const hasExternalMedia = !!(opts && opts.hasExternalMedia);
  const clearance = opts && opts.clearance;
  const fingerprint = trimStr(opts && opts.assetFingerprint);
  const clearanceValid = !!(
    clearance &&
    fingerprint &&
    trimStr(clearance.asset_fingerprint) === fingerprint
  );

  if (knownRestricted.length > 0) {
    return {
      external_eligible: false,
      blocked: true,
      reason: 'known_restricted_student_associated',
      author_restricted: authorRestricted,
      known_restricted_people: knownRestricted,
      requires_clearance: hasExternalMedia,
      clearance_valid: clearanceValid,
      message:
        'A restricted student is associated with this submission and is restricted from external publication.',
    };
  }

  if (hasExternalMedia && !clearanceValid) {
    return {
      external_eligible: false,
      blocked: true,
      reason: 'external_media_clearance_required',
      author_restricted: authorRestricted,
      known_restricted_people: [],
      requires_clearance: true,
      clearance_valid: false,
      message: 'External media clearance required before YouTube or other external hosting.',
    };
  }

  return {
    external_eligible: true,
    blocked: false,
    reason: null,
    author_restricted: authorRestricted,
    known_restricted_people: [],
    requires_clearance: hasExternalMedia,
    clearance_valid: clearanceValid || !hasExternalMedia,
    message: null,
  };
}

/**
 * Server authority for future YouTube upload (and any external export hook).
 */
export async function assertExternalPublicationAllowed(db, opts) {
  const contentKind = trimStr(opts && opts.contentKind);
  const contentId = trimStr(opts && opts.contentId);
  if (!db || !contentKind || !contentId) {
    return { ok: false, error: 'missing_content', code: 400 };
  }
  const restrictedSet = await loadRestrictedStudentIdSet(db);
  let peopleRows = [];
  try {
    peopleRows = await listContentPeople(db, contentKind === 'poll' ? 'poll_contribution' : contentKind, contentId);
  } catch (_) {
    peopleRows = [];
  }
  const knownRestricted = knownRestrictedPeopleFromRows(peopleRows, restrictedSet);
  const peopleKeys = (peopleRows || []).map((p) => p.person_key).filter(Boolean);

  let videoKey = '';
  let imageKey = '';
  let authorType = 'student';
  let authorFields = {};
  if (contentKind === 'news') {
    const row = await db
      .prepare(
        `SELECT id, actor_id, author_name, author_type, video_r2_key, image_r2_key FROM lantern_news_submissions WHERE id = ?`
      )
      .bind(contentId)
      .first();
    if (!row) return { ok: false, error: 'not_found', code: 404 };
    videoKey = trimStr(row.video_r2_key);
    imageKey = trimStr(row.image_r2_key);
    authorType = row.author_type;
    authorFields = { actor_id: row.actor_id, author_name: row.author_name };
  } else if (contentKind === 'poll_contribution' || contentKind === 'poll') {
    const row = await db
      .prepare(`SELECT id, character_name, image_url FROM lantern_poll_contributions WHERE id = ?`)
      .bind(contentId)
      .first();
    if (!row) return { ok: false, error: 'not_found', code: 404 };
    imageKey = trimStr(row.image_url);
    authorFields = { character_name: row.character_name, author_name: row.character_name };
  } else {
    return { ok: false, error: 'unsupported_content_kind', code: 400 };
  }

  const authorCandidates = await resolveAuthorStudentCandidates(db, authorFields);
  const authorRestricted =
    lower(authorType) === 'student' &&
    authorCandidates.some((id) => studentIdIsRestricted(id, restrictedSet));
  const fingerprint = computeExternalAssetFingerprint({
    videoKey,
    imageKey,
    peopleKeys,
  });
  const clearance = await getExternalMediaClearance(db, contentKind === 'poll' ? 'poll_contribution' : contentKind, contentId);
  const hasExternalMedia = !!(videoKey || (opts && opts.requireImageClearance && imageKey));
  // YouTube path is video-focused; treat video as requiring clearance. Photos for Hallway don't use this gate.
  const evalOpts = {
    knownRestrictedPeople: knownRestricted,
    authorRestricted,
    hasExternalMedia: !!(videoKey || (opts && opts.forceMediaClearance)),
    clearance,
    assetFingerprint: fingerprint,
  };
  // Default: video requires clearance; still block known restricted subjects always.
  if (videoKey) evalOpts.hasExternalMedia = true;
  const result = evaluateExternalPublicationEligibility(evalOpts);
  if (!result.external_eligible) {
    return { ok: false, error: result.reason, code: 403, eligibility: result };
  }
  return { ok: true, eligibility: result, asset_fingerprint: fingerprint };
}

/**
 * Attach review-facing media/publicity summary for a pending approval item.
 */
export async function buildReviewMediaPublicitySummary(db, opts) {
  const restrictedSet = opts.restrictedSet || (await loadRestrictedStudentIdSet(db));
  const peopleRows = opts.peopleRows || [];
  const knownRestricted = knownRestrictedPeopleFromRows(peopleRows, restrictedSet);
  const authorCandidates = await resolveAuthorStudentCandidates(db, opts.authorFields || {});
  const authorType = lower(opts.authorType) || 'student';
  const authorRestricted =
    authorType === 'student' &&
    authorCandidates.some((id) => studentIdIsRestricted(id, restrictedSet));
  const videoKey = trimStr(opts.videoKey);
  const imageKey = trimStr(opts.imageKey);
  const peopleKeys = peopleRows.map((p) => p.person_key).filter(Boolean);
  const fingerprint = computeExternalAssetFingerprint({ videoKey, imageKey, peopleKeys });
  const contentKind = trimStr(opts.contentKind);
  const contentId = trimStr(opts.contentId);
  const clearance = contentKind && contentId ? await getExternalMediaClearance(db, contentKind, contentId) : null;
  const hasVideo = !!videoKey;
  const external = evaluateExternalPublicationEligibility({
    knownRestrictedPeople: knownRestricted,
    authorRestricted,
    hasExternalMedia: hasVideo,
    clearance,
    assetFingerprint: fingerprint,
  });
  const hallway = evaluateHallwayTvEligibility({
    restrictedSet,
    authorStudentIds: authorCandidates,
    authorType,
    knownRestrictedPeople: knownRestricted,
  });

  return {
    author_restricted: authorRestricted,
    known_restricted_people: knownRestricted,
    warning: authorRestricted || knownRestricted.length > 0,
    warning_message:
      authorRestricted || knownRestricted.length > 0
        ? 'Media/Publicity restriction on file. This student may participate in internal Lantern, but identifiable content must not be sent to Hallway TV, YouTube, or other external/public surfaces.'
        : null,
    has_video: hasVideo,
    requires_external_check: hasVideo,
    external_hosting_label: hasVideo ? 'YouTube Unlisted (when pipeline is enabled)' : null,
    external_eligible: external.external_eligible,
    external_blocked_reason: external.reason,
    clearance_valid: external.clearance_valid,
    clearance: clearance
      ? { cleared_at: clearance.cleared_at, cleared_by: clearance.cleared_by }
      : null,
    asset_fingerprint: fingerprint,
    hallway_eligible: hallway.hallway_eligible,
  };
}

/**
 * Filter news rows for Hallway TV / display surfaces.
 */
export async function filterNewsRowsForHallwayTv(db, rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return list;
  const restrictedSet = await loadRestrictedStudentIdSet(db);
  if (!restrictedSet.size) return list;
  const out = [];
  for (const r of list) {
    const peopleRows = await listContentPeople(db, 'news', r.id).catch(() => []);
    const knownRestricted = knownRestrictedPeopleFromRows(peopleRows, restrictedSet);
    const authorCandidates = await resolveAuthorStudentCandidates(db, {
      actor_id: r.actor_id,
      author_name: r.author_name,
    });
    const hallway = evaluateHallwayTvEligibility({
      restrictedSet,
      authorStudentIds: authorCandidates,
      authorType: r.author_type,
      knownRestrictedPeople: knownRestricted,
    });
    if (hallway.hallway_eligible) out.push(r);
  }
  return out;
}

/**
 * Filter recognition rows (character_name is the recognized student identity key).
 */
export async function filterRecognitionRowsForHallwayTv(db, rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return list;
  const restrictedSet = await loadRestrictedStudentIdSet(db);
  if (!restrictedSet.size) return list;
  return list.filter((r) => !studentIdIsRestricted(r.character_name, restrictedSet));
}

/**
 * Filter feed items for slideshow / Hallway.
 */
export async function filterFeedItemsForHallwayTv(db, items) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return list;
  const restrictedSet = await loadRestrictedStudentIdSet(db);
  if (!restrictedSet.size) return list;
  const out = [];
  for (const it of list) {
    const authorCandidates = await resolveAuthorStudentCandidates(db, {
      actor_id: it.authorId || it.author_id || it.actor_id,
      author_name: it.authorDisplayName || it.author_display_name || it.author,
      character_name: it.characterName || it.character_name,
    });
    let peopleRows = [];
    const id = trimStr(it.id || it.itemId);
    if (id) {
      const kind =
        it.type === 'poll' || String(id).indexOf('poll') === 0
          ? 'poll'
          : String(id).indexOf('news') >= 0
            ? 'news'
            : null;
      if (kind === 'news') {
        const newsId = id.replace(/^news:/, '');
        peopleRows = await listContentPeople(db, 'news', newsId).catch(() => []);
      } else if (kind === 'poll') {
        const pollId = id.replace(/^poll:/, '');
        peopleRows = await listContentPeople(db, 'poll', pollId).catch(() => []);
      }
    }
    const knownRestricted = knownRestrictedPeopleFromRows(peopleRows, restrictedSet);
    const authorType = lower(it.authorRole || it.author_role || it.authorType || it.author_type) || 'student';
    const hallway = evaluateHallwayTvEligibility({
      restrictedSet,
      authorStudentIds: authorCandidates,
      authorType,
      knownRestrictedPeople: knownRestricted,
    });
    if (hallway.hallway_eligible) out.push(it);
  }
  return out;
}
