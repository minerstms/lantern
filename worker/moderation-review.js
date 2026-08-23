/**
 * Prompt #251A — unified review queue, action counts, report resolution, staff history.
 *
 * Legacy Return routes (/api/approvals/return, /api/missions/submissions/return,
 * /api/feed/return) still accept blank notes for backward compatibility until #251B
 * migrates Teacher Tools / feed-review UI onto POST /api/review/action.
 * The new unified action route REQUIRES non-empty feedback for return / report_return.
 *
 * Current content tables remain authoritative. Events are append-only history.
 */

import {
  actorFromAccount,
  canonicalItemType,
  isModerationSchemaError,
  ModerationSchemaError,
  isResubmittedFromEvents,
  listModerationEvents,
  listModerationEventsForItems,
  latestReturnEvent,
  parseSnapshotJson,
  recordModerationEvent,
  REPORT_RESOLUTIONS,
  schemaErrorResponse,
} from './moderation-events.js';
import {
  isReportQuarantineLabel,
  normalizeReportItemType,
  restoreReportCreatedHide,
  clearReportHideIfPresent,
} from './content-report-quarantine.js';
import { isAdminRole, isTeacherLike, sessionTeacherId, teacherOwnsMission, reviewerLabelFromAccount } from './missions-auth.js';
import { canManageLanternAvatars } from './avatar-media-gate.js';
import { finalizePollContributionPublish } from './poll-publish.js';
import { resolveStoredMissionPayout } from './nugget-economy-settings.js';
import { archivedRefSet, isOwnerArchivedRef, listArchivedLockerRefs } from './locker-item-state.js';

export const QUEUE_STATES = Object.freeze({
  PENDING_REVIEW: 'PENDING_REVIEW',
  RESUBMITTED: 'RESUBMITTED',
  REPORTED: 'REPORTED',
});

const REVISION_CAPABLE = Object.freeze({
  news: true,
  poll_contribution: true,
  mission_submission: true,
  feed_item: true,
  avatar: false,
  poll: false,
});

const STUDENT_HISTORY_EVENT_TYPES = Object.freeze([
  'submitted',
  'returned',
  'resubmitted',
  'approved',
  'rejected',
  'owner_archived',
  'owner_reopened',
]);

function clipNote(raw) {
  return String(raw || '').trim().slice(0, 500);
}

function isBlankNote(raw) {
  return !String(raw || '').trim();
}

export function studentIdentityKeys(account, deps) {
  const keys = [];
  const add = (v) => {
    const s = String(v || '').trim();
    if (s && keys.indexOf(s) < 0) keys.push(s);
  };
  if (!account) return keys;
  if (deps && typeof deps.pilotEconomyCharacterName === 'function') {
    add(deps.pilotEconomyCharacterName(account));
  }
  if (deps && typeof deps.durableAccountKeyFromPilotAccount === 'function') {
    add(deps.durableAccountKeyFromPilotAccount(account));
  }
  add(account.student_character_name);
  add(account.username);
  add(account.display_name);
  add(account.mtss_student_id);
  return keys;
}

export function queueItemKey(itemType, itemId) {
  return canonicalItemType(itemType) + ':' + String(itemId || '').trim();
}

function flagCanonicalType(raw) {
  const norm = normalizeReportItemType(raw);
  if (norm) {
    if (norm.canonical === 'poll') return 'poll';
    return canonicalItemType(norm.canonical);
  }
  return canonicalItemType(raw);
}

function hideKindForItemType(itemType) {
  const t = canonicalItemType(itemType);
  if (t === 'news') return 'news';
  if (t === 'poll' || t === 'poll_contribution') return t === 'poll_contribution' ? null : 'poll';
  if (t === 'mission_submission') return 'mission';
  if (t === 'feed_item') return 'feed';
  const norm = normalizeReportItemType(itemType);
  return norm ? norm.hideKind : null;
}

function placeholders(n) {
  return Array.from({ length: n }, () => '?').join(',');
}

async function allRows(db, sql, binds) {
  const stmt = db.prepare(sql);
  const q = binds && binds.length ? stmt.bind(...binds) : stmt;
  const rows = await q.all();
  return (rows && rows.results) || [];
}

async function countStar(db, sql, binds) {
  const row = await db.prepare(sql).bind(...(binds || [])).first();
  if (!row) return 0;
  if (row.c != null) return Number(row.c) || 0;
  const k = Object.keys(row).find((key) => /count/i.test(key));
  return k ? Number(row[k]) || 0 : 0;
}

export function snapshotFromNews(row) {
  if (!row) return null;
  return {
    content_type: 'news',
    status: row.status,
    title: row.title,
    body: row.body,
    image_r2_key: row.image_r2_key,
    full_image_r2_key: row.full_image_r2_key,
    video_r2_key: row.video_r2_key,
    category: row.category,
  };
}

export function snapshotFromPollContribution(row) {
  if (!row) return null;
  let choices = row.choices;
  if (!choices && row.choices_json) {
    try {
      choices = JSON.parse(row.choices_json);
    } catch (_) {
      choices = [];
    }
  }
  return {
    content_type: 'poll_contribution',
    status: row.status,
    title: row.question,
    image_url: row.image_url,
    choices,
  };
}

export function snapshotFromMission(row) {
  if (!row) return null;
  return {
    content_type: 'mission_submission',
    status: row.status,
    body: row.submission_content,
    submission_type: row.submission_type,
  };
}

export function snapshotFromFeed(row) {
  if (!row) return null;
  return {
    content_type: 'feed_item',
    status: row.status,
    title: row.title,
    body: row.body || row.summary,
    image_r2_key: row.image_r2_key,
    video_r2_key: row.video_r2_key,
  };
}

export async function recordEventForAccount(db, account, fields) {
  return recordModerationEvent(db, {
    itemType: fields.itemType,
    itemId: fields.itemId,
    eventType: fields.eventType,
    actor: actorFromAccount(account),
    note: fields.note,
    snapshot: fields.snapshot,
    now: fields.now,
  });
}

export async function resolveOpenFlags(db, itemType, itemId, resolution, actor, staffNote, now) {
  const res = String(resolution || '').trim().toLowerCase();
  if (REPORT_RESOLUTIONS.indexOf(res) < 0) throw new Error('invalid_resolution');
  const id = String(itemId || '').trim();
  const storedTypes = [];
  const canon = flagCanonicalType(itemType);
  storedTypes.push(canon);
  const norm = normalizeReportItemType(itemType);
  if (norm && storedTypes.indexOf(norm.canonical) < 0) storedTypes.push(norm.canonical);
  const resolvedBy = (actor && (actor.actor_key || actor.actor_label)) || '';
  try {
    for (let i = 0; i < storedTypes.length; i++) {
      await db
        .prepare(
          "UPDATE lantern_content_flags SET resolved_at = ?, resolved_by = ?, resolution = ?, staff_note = ? WHERE item_id = ? AND item_type = ? AND (resolved_at IS NULL OR resolved_at = '')"
        )
        .bind(now, resolvedBy || null, res, clipNote(staffNote) || null, id, storedTypes[i])
        .run();
    }
  } catch (err) {
    if (isModerationSchemaError(err)) throw new ModerationSchemaError();
    throw err;
  }
  return { ok: true };
}

function approvalVisibleToReviewer(approval, account, isAdmin) {
  if (isAdmin) return true;
  const staffId = sessionTeacherId(account);
  if (!staffId) return true;
  const assigned = String(approval.assigned_to_staff_id || '').trim();
  const suggested = String(approval.suggested_staff_id || '').trim();
  if (!assigned) return true;
  if (assigned === staffId || suggested === staffId) return true;
  return false;
}

async function loadUnresolvedFlags(db) {
  try {
    return await allRows(
      db,
      "SELECT id, item_type, item_id, reported_by, reason, created_at, resolved_at, resolved_by, resolution, staff_note FROM lantern_content_flags WHERE resolved_at IS NULL OR resolved_at = '' ORDER BY created_at ASC"
    );
  } catch (err) {
    if (isModerationSchemaError(err)) throw new ModerationSchemaError();
    throw err;
  }
}

async function reviewerMayActOnReportedItem(db, account, itemType, itemId) {
  const t = flagCanonicalType(itemType);
  if (t === 'mission_submission') {
    const sub = await db
      .prepare('SELECT mission_id FROM lantern_mission_submissions WHERE id = ?')
      .bind(itemId)
      .first();
    if (!sub) return false;
    const mission = await db.prepare('SELECT teacher_id FROM lantern_missions WHERE id = ?').bind(sub.mission_id).first();
    return !!(mission && teacherOwnsMission(account, mission.teacher_id));
  }
  return isTeacherLike(account.role);
}

async function attachTitles(db, card) {
  const t = card.item_type;
  const id = card.item_id;
  try {
    if (t === 'news') {
      const row = await db
        .prepare('SELECT title, body, author_name, status, hidden_at, hidden_by FROM lantern_news_submissions WHERE id = ?')
        .bind(id)
        .first();
      if (row) {
        card.title = row.title || card.title;
        card.submitter = row.author_name || card.submitter;
        card.status = row.status || card.status;
        card.hidden_at = row.hidden_at || null;
        card.hidden_by = row.hidden_by || null;
      }
    } else if (t === 'poll_contribution') {
      const row = await db
        .prepare('SELECT question, character_name, status FROM lantern_poll_contributions WHERE id = ?')
        .bind(id)
        .first();
      if (row) {
        card.title = row.question || card.title;
        card.submitter = row.character_name || card.submitter;
        card.status = row.status || card.status;
      }
    } else if (t === 'poll') {
      const row = await db.prepare('SELECT question, hidden_at, hidden_by FROM lantern_polls WHERE id = ?').bind(id).first();
      if (row) {
        card.title = row.question || card.title;
        card.hidden_at = row.hidden_at || null;
        card.hidden_by = row.hidden_by || null;
      }
    } else if (t === 'mission_submission') {
      const row = await db
        .prepare(
          'SELECT mission_id, character_name, status, submission_content, hidden_at, hidden_by FROM lantern_mission_submissions WHERE id = ?'
        )
        .bind(id)
        .first();
      if (row) {
        card.submitter = row.character_name || card.submitter;
        card.status = row.status || card.status;
        card.hidden_at = row.hidden_at || null;
        card.hidden_by = row.hidden_by || null;
        const mission = await db.prepare('SELECT title FROM lantern_missions WHERE id = ?').bind(row.mission_id).first();
        if (mission) card.title = mission.title || card.title;
      }
    } else if (t === 'feed_item') {
      const row = await db
        .prepare('SELECT title, body, author_display_name, status, hidden_at, hidden_by FROM lantern_feed_items WHERE id = ?')
        .bind(id)
        .first();
      if (row) {
        card.title = row.title || card.title;
        card.submitter = row.author_display_name || card.submitter;
        card.status = row.status || card.status;
        card.hidden_at = row.hidden_at || null;
        card.hidden_by = row.hidden_by || null;
      }
    } else if (t === 'avatar') {
      const row = await db
        .prepare('SELECT character_name, status FROM lantern_avatar_submissions WHERE id = ?')
        .bind(id)
        .first();
      if (row) {
        card.submitter = row.character_name || card.submitter;
        card.status = row.status || card.status;
        card.title = card.title || 'Avatar';
      }
    }
  } catch (_) {}
  return card;
}

function redactReporter(card, isAdmin) {
  const out = Object.assign({}, card);
  if (!isAdmin) {
    delete out.reporters;
    if (out.flags) {
      out.flags = out.flags.map((f) => {
        const copy = Object.assign({}, f);
        delete copy.reported_by;
        return copy;
      });
    }
  }
  return out;
}

/**
 * Shared authority for GET /api/review/queue and GET /api/action-counts staff count.
 */
export async function buildReviewQueue(db, account, opts) {
  const includeDetails = !opts || opts.includeDetails !== false;
  const isAdmin = isAdminRole(account && account.role);
  if (!isTeacherLike(account && account.role)) return [];

  const cards = Object.create(null);

  function upsert(partial) {
    const key = queueItemKey(partial.item_type, partial.item_id);
    if (!key || key.endsWith(':')) return null;
    if (!cards[key]) {
      cards[key] = {
        queue_key: key,
        item_type: canonicalItemType(partial.item_type),
        item_id: String(partial.item_id),
        queue_state: partial.queue_state || QUEUE_STATES.PENDING_REVIEW,
        status: partial.status || '',
        title: partial.title || '',
        submitter: partial.submitter || '',
        created_at: partial.created_at || '',
        approval_id: partial.approval_id || null,
        report_count: 0,
        reasons: [],
        flags: [],
      };
    }
    const card = cards[key];
    if (partial.approval_id) card.approval_id = partial.approval_id;
    if (partial.title) card.title = partial.title;
    if (partial.submitter) card.submitter = partial.submitter;
    if (partial.status) card.status = partial.status;
    if (partial.created_at && !card.created_at) card.created_at = partial.created_at;
    if (partial.queue_state === QUEUE_STATES.REPORTED) card.queue_state = QUEUE_STATES.REPORTED;
    return card;
  }

  const pendingMissions = await allRows(
    db,
    "SELECT id, mission_id, character_name, submission_type, submission_content, status, created_at FROM lantern_mission_submissions WHERE LOWER(TRIM(status)) = 'pending'"
  );
  const missionIds = [...new Set(pendingMissions.map((s) => s.mission_id).filter(Boolean))];
  const missionById = Object.create(null);
  if (missionIds.length) {
    const mrows = await allRows(
      db,
      'SELECT id, title, teacher_id FROM lantern_missions WHERE id IN (' + placeholders(missionIds.length) + ')',
      missionIds
    );
    mrows.forEach((m) => {
      missionById[m.id] = m;
    });
  }
  pendingMissions.forEach((s) => {
    const mission = missionById[s.mission_id];
    if (!mission || !teacherOwnsMission(account, mission.teacher_id)) return;
    upsert({
      item_type: 'mission_submission',
      item_id: s.id,
      queue_state: QUEUE_STATES.PENDING_REVIEW,
      status: s.status,
      title: mission.title || '',
      submitter: s.character_name || '',
      created_at: s.created_at,
    });
  });

  const pendingApprovals = await allRows(
    db,
    'SELECT id, item_type, item_id, status, submitted_by_actor_name, assigned_to_staff_id, assigned_to_staff_name, suggested_staff_id, suggested_staff_name, created_at FROM lantern_approvals WHERE LOWER(TRIM(status)) = ?',
    ['pending']
  );
  pendingApprovals.forEach((a) => {
    if (a.item_type === 'avatar' && !canManageLanternAvatars(account)) return;
    if (!approvalVisibleToReviewer(a, account, isAdmin)) return;
    upsert({
      item_type: a.item_type,
      item_id: a.item_id,
      queue_state: QUEUE_STATES.PENDING_REVIEW,
      status: a.status,
      submitter: a.submitted_by_actor_name || '',
      created_at: a.created_at,
      approval_id: a.id,
    });
  });

  const submittedFeed = await allRows(
    db,
    "SELECT id, title, body, author_display_name, status, created_at, submitted_at FROM lantern_feed_items WHERE LOWER(TRIM(status)) = 'submitted'"
  );
  submittedFeed.forEach((f) => {
    upsert({
      item_type: 'feed_item',
      item_id: f.id,
      queue_state: QUEUE_STATES.PENDING_REVIEW,
      status: f.status,
      title: f.title || '',
      submitter: f.author_display_name || '',
      created_at: f.submitted_at || f.created_at,
    });
  });

  const flags = await loadUnresolvedFlags(db);
  for (const f of flags) {
    const itemType = flagCanonicalType(f.item_type);
    const itemId = String(f.item_id || '').trim();
    if (!itemType || !itemId) continue;
    const allowed = await reviewerMayActOnReportedItem(db, account, f.item_type, itemId);
    if (!allowed) continue;
    const card = upsert({
      item_type: itemType,
      item_id: itemId,
      queue_state: QUEUE_STATES.REPORTED,
      created_at: f.created_at,
    });
    if (!card) continue;
    card.queue_state = QUEUE_STATES.REPORTED;
    card.report_count += 1;
    if (f.reason && card.reasons.indexOf(f.reason) < 0) card.reasons.push(f.reason);
    card.flags.push({
      id: f.id,
      reason: f.reason || '',
      created_at: f.created_at,
      reported_by: f.reported_by || '',
    });
  }

  const pairs = Object.keys(cards).map((k) => {
    const c = cards[k];
    return { item_type: c.item_type, item_id: c.item_id };
  });
  const events = await listModerationEventsForItems(db, pairs);
  const eventsByKey = Object.create(null);
  events.forEach((ev) => {
    const key = queueItemKey(ev.item_type, ev.item_id);
    if (!eventsByKey[key]) eventsByKey[key] = [];
    eventsByKey[key].push(ev);
  });

  const out = [];
  for (const key of Object.keys(cards)) {
    const card = cards[key];
    if (card.queue_state !== QUEUE_STATES.REPORTED) {
      const evs = eventsByKey[key] || [];
      if (isResubmittedFromEvents(evs)) card.queue_state = QUEUE_STATES.RESUBMITTED;
    }
    if (includeDetails) await attachTitles(db, card);
    if (card.report_count > 0) {
      card.reporters = card.flags.map((f) => f.reported_by).filter(Boolean);
    }
    out.push(includeDetails ? redactReporter(card, isAdmin) : { queue_key: card.queue_key, item_type: card.item_type, item_id: card.item_id, queue_state: card.queue_state });
  }
  out.sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
  return out;
}

export async function countStudentRevisions(db, account, deps) {
  const keys = studentIdentityKeys(account, deps);
  if (!keys.length) return 0;
  const ph = placeholders(keys.length);
  const news = await countStar(
    db,
    `SELECT COUNT(*) AS c FROM lantern_news_submissions WHERE LOWER(TRIM(status)) = 'returned' AND (author_name IN (${ph}) OR actor_id IN (${ph}))`,
    keys.concat(keys)
  );
  const polls = await countStar(
    db,
    `SELECT COUNT(*) AS c FROM lantern_poll_contributions WHERE LOWER(TRIM(status)) = 'returned' AND character_name IN (${ph})`,
    keys
  );
  const missions = await countStar(
    db,
    `SELECT COUNT(*) AS c FROM lantern_mission_submissions WHERE LOWER(TRIM(status)) = 'returned' AND character_name IN (${ph})`,
    keys
  );
  const feed = await countStar(
    db,
    `SELECT COUNT(*) AS c FROM lantern_feed_items WHERE LOWER(TRIM(status)) = 'returned' AND (author_display_name IN (${ph}) OR author_id IN (${ph}))`,
    keys.concat(keys)
  );
  const raw = news + polls + missions + feed;
  if (!raw) return 0;
  let archived = [];
  try {
    archived = await listArchivedLockerRefs(db, keys);
  } catch (_) {
    archived = [];
  }
  if (!archived.length) return raw;
  const seen = archivedRefSet(archived);
  let subtract = 0;
  for (let i = 0; i < archived.length; i++) {
    const ref = archived[i];
    if (!isOwnerArchivedRef(seen, ref.item_type, ref.item_id)) continue;
    const loaded = await loadOwnedContent(db, ref.item_type, ref.item_id);
    if (!loaded.row) continue;
    if (String(loaded.row.status || '').trim().toLowerCase() !== 'returned') continue;
    if (!studentOwnsRow(loaded.type, loaded.row, keys)) continue;
    subtract += 1;
  }
  return Math.max(0, raw - subtract);
}

export async function countStaffReviewItems(db, account) {
  const items = await buildReviewQueue(db, account, { includeDetails: false });
  return items.length;
}

async function loadOwnedContent(db, itemType, itemId) {
  const t = canonicalItemType(itemType);
  const id = String(itemId || '').trim();
  if (t === 'news') {
    return { type: t, row: await db.prepare('SELECT * FROM lantern_news_submissions WHERE id = ?').bind(id).first() };
  }
  if (t === 'poll_contribution') {
    return { type: t, row: await db.prepare('SELECT * FROM lantern_poll_contributions WHERE id = ?').bind(id).first() };
  }
  if (t === 'poll') {
    return { type: t, row: await db.prepare('SELECT * FROM lantern_polls WHERE id = ?').bind(id).first() };
  }
  if (t === 'mission_submission') {
    return { type: t, row: await db.prepare('SELECT * FROM lantern_mission_submissions WHERE id = ?').bind(id).first() };
  }
  if (t === 'feed_item') {
    return { type: t, row: await db.prepare('SELECT * FROM lantern_feed_items WHERE id = ?').bind(id).first() };
  }
  if (t === 'avatar') {
    return { type: t, row: await db.prepare('SELECT * FROM lantern_avatar_submissions WHERE id = ?').bind(id).first() };
  }
  return { type: t, row: null };
}

function studentOwnsRow(type, row, keys) {
  if (!row || !keys.length) return false;
  const hit = (v) => keys.indexOf(String(v || '').trim()) >= 0;
  if (type === 'news') return hit(row.author_name) || hit(row.actor_id);
  if (type === 'poll_contribution') return hit(row.character_name);
  if (type === 'mission_submission') return hit(row.character_name);
  if (type === 'feed_item') return hit(row.author_display_name) || hit(row.author_id);
  return false;
}

async function staffMayReviewItem(db, account, itemType, itemId) {
  if (!isTeacherLike(account && account.role)) return false;
  const t = canonicalItemType(itemType);
  if (t === 'mission_submission') {
    const sub = await db.prepare('SELECT mission_id FROM lantern_mission_submissions WHERE id = ?').bind(itemId).first();
    if (!sub) return false;
    const mission = await db.prepare('SELECT teacher_id FROM lantern_missions WHERE id = ?').bind(sub.mission_id).first();
    return !!(mission && teacherOwnsMission(account, mission.teacher_id));
  }
  if (t === 'avatar') return canManageLanternAvatars(account);
  return true;
}

export function redactEventsForStudent(events) {
  return (events || [])
    .filter((ev) => STUDENT_HISTORY_EVENT_TYPES.indexOf(String(ev.event_type || '').toLowerCase()) >= 0)
    .map((ev) => ({
      id: ev.id,
      item_type: ev.item_type,
      item_id: ev.item_id,
      event_type: ev.event_type,
      actor_role: ev.actor_role === 'student' ? 'student' : ev.actor_role === 'teacher' || ev.actor_role === 'admin' ? ev.actor_role : 'staff',
      actor_label: ev.event_type === 'returned' || ev.event_type === 'approved' || ev.event_type === 'rejected' ? ev.actor_label : null,
      note: ev.note || null,
      snapshot: parseSnapshotJson(ev.snapshot_json),
      created_at: ev.created_at,
    }));
}

export function presentStaffEvents(events) {
  return (events || []).map((ev) => ({
    id: ev.id,
    item_type: ev.item_type,
    item_id: ev.item_id,
    event_type: ev.event_type,
    actor_key: ev.actor_key,
    actor_role: ev.actor_role,
    actor_label: ev.actor_label,
    note: ev.note,
    snapshot: parseSnapshotJson(ev.snapshot_json),
    created_at: ev.created_at,
  }));
}

async function upsertNewsApproval(db, newsId, status, now, submitter) {
  const existing = await db.prepare('SELECT id FROM lantern_approvals WHERE item_type = ? AND item_id = ?').bind('news', newsId).first();
  if (existing) {
    await db
      .prepare('UPDATE lantern_approvals SET status = ?, reviewed_at = ?, decision_note = ? WHERE id = ?')
      .bind(status, now, status === 'pending' ? null : undefined, existing.id)
      .run();
    return existing.id;
  }
  const approvalId = 'approval-' + (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now());
  await db
    .prepare(
      'INSERT INTO lantern_approvals (id, item_type, item_id, status, submitted_by_actor_id, submitted_by_actor_name, school_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(approvalId, 'news', newsId, status, null, submitter || null, null, now)
    .run();
  return approvalId;
}

async function performApprove(db, account, itemType, itemId, now, deps) {
  const t = canonicalItemType(itemType);
  const staffName = reviewerLabelFromAccount(account);
  const staffId = sessionTeacherId(account);
  if (t === 'news') {
    const row = await db.prepare('SELECT * FROM lantern_news_submissions WHERE id = ?').bind(itemId).first();
    if (!row) return { ok: false, error: 'Not found', code: 404 };
    await recordEventForAccount(db, account, { itemType: 'news', itemId, eventType: 'approved', snapshot: snapshotFromNews(row), now });
    await db
      .prepare('UPDATE lantern_news_submissions SET status = ?, reviewed_at = ?, reviewed_by_staff_id = ?, reviewed_by_staff_name = ? WHERE id = ?')
      .bind('approved', now, staffId || null, staffName, itemId)
      .run();
    const appr = await db.prepare('SELECT id FROM lantern_approvals WHERE item_type = ? AND item_id = ?').bind('news', itemId).first();
    if (appr) {
      await db
        .prepare('UPDATE lantern_approvals SET status = ?, reviewed_at = ?, reviewed_by_staff_id = ?, reviewed_by_staff_name = ?, decision_note = ? WHERE id = ?')
        .bind('approved', now, staffId || null, staffName, null, appr.id)
        .run();
    }
    await clearReportHideIfPresent(db, 'news', itemId);
    return { ok: true, status: 'approved' };
  }
  if (t === 'poll_contribution') {
    const row = await db.prepare('SELECT * FROM lantern_poll_contributions WHERE id = ?').bind(itemId).first();
    if (!row) return { ok: false, error: 'Not found', code: 404 };
    await recordEventForAccount(db, account, { itemType: 'poll_contribution', itemId, eventType: 'approved', snapshot: snapshotFromPollContribution(row), now });
    if (deps && typeof deps.finalizePollContributionPublish === 'function') {
      const pub = await deps.finalizePollContributionPublish(db, (deps.origin || ''), row, { now, reviewedBy: staffName });
      if (!pub.ok) return { ok: false, error: pub.error || 'poll_publish_failed', code: 503 };
    } else {
      try {
        const pub = await finalizePollContributionPublish(db, (deps && deps.origin) || '', row, { now, reviewedBy: staffName });
        if (pub && pub.ok === false) return { ok: false, error: pub.error || 'poll_publish_failed', code: 503 };
      } catch (_) {
        await db
          .prepare('UPDATE lantern_poll_contributions SET status = ?, reviewed_at = ?, reviewed_by = ?, decision_note = ? WHERE id = ?')
          .bind('approved', now, staffName, null, itemId)
          .run();
      }
    }
    const appr = await db.prepare('SELECT id FROM lantern_approvals WHERE item_type = ? AND item_id = ?').bind('poll_contribution', itemId).first();
    if (appr) {
      await db
        .prepare('UPDATE lantern_approvals SET status = ?, reviewed_at = ?, reviewed_by_staff_id = ?, reviewed_by_staff_name = ?, decision_note = ? WHERE id = ?')
        .bind('approved', now, staffId || null, staffName, null, appr.id)
        .run();
    }
    return { ok: true, status: 'approved' };
  }
  if (t === 'mission_submission') {
    const row = await db.prepare('SELECT * FROM lantern_mission_submissions WHERE id = ?').bind(itemId).first();
    if (!row) return { ok: false, error: 'Not found', code: 404 };
    const mission = await db.prepare('SELECT teacher_id, reward_amount FROM lantern_missions WHERE id = ?').bind(row.mission_id).first();
    if (!mission || !teacherOwnsMission(account, mission.teacher_id)) {
      return { ok: false, error: 'forbidden', code: 403 };
    }
    await recordEventForAccount(db, account, { itemType: 'mission_submission', itemId, eventType: 'approved', snapshot: snapshotFromMission(row), now });
    if (deps && typeof deps.finalizeMissionSubmission === 'function') {
      const reward = await resolveStoredMissionPayout(db, mission.reward_amount);
      const result = await deps.finalizeMissionSubmission(db, deps.env, {
        submissionRow: row,
        rewardAmount: reward,
        reviewerLabel: staffName,
      });
      await clearReportHideIfPresent(db, 'mission', itemId);
      if (!result.ok) return { ok: false, error: result.error, code: result.code || 500 };
      return { ok: true, status: 'accepted' };
    }
    await db
      .prepare('UPDATE lantern_mission_submissions SET status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?')
      .bind('accepted', staffName, now, itemId)
      .run();
    await clearReportHideIfPresent(db, 'mission', itemId);
    return { ok: true, status: 'accepted' };
  }
  if (t === 'feed_item') {
    const row = await db.prepare('SELECT * FROM lantern_feed_items WHERE id = ?').bind(itemId).first();
    if (!row) return { ok: false, error: 'Not found', code: 404 };
    await recordEventForAccount(db, account, { itemType: 'feed_item', itemId, eventType: 'approved', snapshot: snapshotFromFeed(row), now });
    await db
      .prepare(
        "UPDATE lantern_feed_items SET status = 'approved', approved_at = ?, approved_by = ?, private_feedback = NULL, hidden_at = NULL, hidden_by = NULL WHERE id = ?"
      )
      .bind(now, staffName, itemId)
      .run();
    return { ok: true, status: 'approved' };
  }
  if (t === 'avatar') {
    if (!canManageLanternAvatars(account)) return { ok: false, error: 'forbidden', code: 403 };
    return { ok: false, error: 'use_legacy_approvals', code: 400 };
  }
  return { ok: false, error: 'unsupported_item_type', code: 400 };
}

async function performReturn(db, account, itemType, itemId, note, now, fromReport) {
  const t = canonicalItemType(itemType);
  if (!REVISION_CAPABLE[t]) return { ok: false, error: 'not_revision_capable', code: 400 };
  const staffName = reviewerLabelFromAccount(account);
  const staffId = sessionTeacherId(account);
  if (t === 'news') {
    const row = await db.prepare('SELECT * FROM lantern_news_submissions WHERE id = ?').bind(itemId).first();
    if (!row) return { ok: false, error: 'Not found', code: 404 };
    await recordEventForAccount(db, account, { itemType: 'news', itemId, eventType: 'returned', note, snapshot: snapshotFromNews(row), now });
    if (fromReport) {
      await recordEventForAccount(db, account, { itemType: 'news', itemId, eventType: 'report_returned', note, snapshot: snapshotFromNews(row), now });
    }
    await db
      .prepare(
        'UPDATE lantern_news_submissions SET status = ?, reviewed_at = ?, reviewed_by_staff_id = ?, reviewed_by_staff_name = ?, decision_note = ? WHERE id = ?'
      )
      .bind('returned', now, staffId || null, staffName, note, itemId)
      .run();
    const appr = await db.prepare('SELECT id FROM lantern_approvals WHERE item_type = ? AND item_id = ?').bind('news', itemId).first();
    if (appr) {
      await db
        .prepare('UPDATE lantern_approvals SET status = ?, reviewed_at = ?, reviewed_by_staff_id = ?, reviewed_by_staff_name = ?, decision_note = ? WHERE id = ?')
        .bind('returned', now, staffId || null, staffName, note, appr.id)
        .run();
    } else {
      await upsertNewsApproval(db, itemId, 'returned', now, row.author_name);
    }
    return { ok: true, status: 'returned' };
  }
  if (t === 'poll_contribution') {
    const row = await db.prepare('SELECT * FROM lantern_poll_contributions WHERE id = ?').bind(itemId).first();
    if (!row) return { ok: false, error: 'Not found', code: 404 };
    await recordEventForAccount(db, account, { itemType: 'poll_contribution', itemId, eventType: 'returned', note, snapshot: snapshotFromPollContribution(row), now });
    if (fromReport) {
      await recordEventForAccount(db, account, { itemType: 'poll_contribution', itemId, eventType: 'report_returned', note, snapshot: snapshotFromPollContribution(row), now });
    }
    await db
      .prepare('UPDATE lantern_poll_contributions SET status = ?, reviewed_at = ?, reviewed_by = ?, decision_note = ? WHERE id = ?')
      .bind('returned', now, staffName, note, itemId)
      .run();
    const appr = await db.prepare('SELECT id FROM lantern_approvals WHERE item_type = ? AND item_id = ?').bind('poll_contribution', itemId).first();
    if (appr) {
      await db
        .prepare('UPDATE lantern_approvals SET status = ?, reviewed_at = ?, reviewed_by_staff_id = ?, reviewed_by_staff_name = ?, decision_note = ? WHERE id = ?')
        .bind('returned', now, staffId || null, staffName, note, appr.id)
        .run();
    }
    return { ok: true, status: 'returned' };
  }
  if (t === 'mission_submission') {
    const row = await db.prepare('SELECT * FROM lantern_mission_submissions WHERE id = ?').bind(itemId).first();
    if (!row) return { ok: false, error: 'Not found', code: 404 };
    const mission = await db.prepare('SELECT teacher_id FROM lantern_missions WHERE id = ?').bind(row.mission_id).first();
    if (!mission || !teacherOwnsMission(account, mission.teacher_id)) {
      return { ok: false, error: 'forbidden', code: 403 };
    }
    await recordEventForAccount(db, account, { itemType: 'mission_submission', itemId, eventType: 'returned', note, snapshot: snapshotFromMission(row), now });
    if (fromReport) {
      await recordEventForAccount(db, account, { itemType: 'mission_submission', itemId, eventType: 'report_returned', note, snapshot: snapshotFromMission(row), now });
    }
    await db
      .prepare('UPDATE lantern_mission_submissions SET status = ?, returned_reason = ?, returned_by = ?, returned_at = ? WHERE id = ?')
      .bind('returned', note, staffName, now, itemId)
      .run();
    return { ok: true, status: 'returned' };
  }
  if (t === 'feed_item') {
    const row = await db.prepare('SELECT * FROM lantern_feed_items WHERE id = ?').bind(itemId).first();
    if (!row) return { ok: false, error: 'Not found', code: 404 };
    await recordEventForAccount(db, account, { itemType: 'feed_item', itemId, eventType: 'returned', note, snapshot: snapshotFromFeed(row), now });
    if (fromReport) {
      await recordEventForAccount(db, account, { itemType: 'feed_item', itemId, eventType: 'report_returned', note, snapshot: snapshotFromFeed(row), now });
    }
    await db.prepare('UPDATE lantern_feed_items SET status = ?, private_feedback = ? WHERE id = ?').bind('returned', note, itemId).run();
    return { ok: true, status: 'returned' };
  }
  return { ok: false, error: 'unsupported_item_type', code: 400 };
}

async function performReject(db, account, itemType, itemId, note, now) {
  const t = canonicalItemType(itemType);
  const staffName = reviewerLabelFromAccount(account);
  const staffId = sessionTeacherId(account);
  if (t === 'news') {
    const row = await db.prepare('SELECT * FROM lantern_news_submissions WHERE id = ?').bind(itemId).first();
    if (!row) return { ok: false, error: 'Not found', code: 404 };
    await recordEventForAccount(db, account, { itemType: 'news', itemId, eventType: 'rejected', note, snapshot: snapshotFromNews(row), now });
    await db
      .prepare('UPDATE lantern_news_submissions SET status = ?, reviewed_at = ?, reviewed_by_staff_id = ?, reviewed_by_staff_name = ? WHERE id = ?')
      .bind('rejected', now, staffId || null, staffName, itemId)
      .run();
    const appr = await db.prepare('SELECT id FROM lantern_approvals WHERE item_type = ? AND item_id = ?').bind('news', itemId).first();
    if (appr) {
      await db
        .prepare('UPDATE lantern_approvals SET status = ?, reviewed_at = ?, reviewed_by_staff_id = ?, reviewed_by_staff_name = ?, decision_note = ? WHERE id = ?')
        .bind('rejected', now, staffId || null, staffName, note || null, appr.id)
        .run();
    }
    return { ok: true, status: 'rejected' };
  }
  if (t === 'poll_contribution') {
    const row = await db.prepare('SELECT * FROM lantern_poll_contributions WHERE id = ?').bind(itemId).first();
    if (!row) return { ok: false, error: 'Not found', code: 404 };
    await recordEventForAccount(db, account, { itemType: 'poll_contribution', itemId, eventType: 'rejected', note, snapshot: snapshotFromPollContribution(row), now });
    await db
      .prepare('UPDATE lantern_poll_contributions SET status = ?, reviewed_at = ?, reviewed_by = ?, decision_note = ? WHERE id = ?')
      .bind('rejected', now, staffName, note || null, itemId)
      .run();
    return { ok: true, status: 'rejected' };
  }
  if (t === 'mission_submission') {
    const row = await db.prepare('SELECT * FROM lantern_mission_submissions WHERE id = ?').bind(itemId).first();
    if (!row) return { ok: false, error: 'Not found', code: 404 };
    const mission = await db.prepare('SELECT teacher_id FROM lantern_missions WHERE id = ?').bind(row.mission_id).first();
    if (!mission || !teacherOwnsMission(account, mission.teacher_id)) {
      return { ok: false, error: 'forbidden', code: 403 };
    }
    await recordEventForAccount(db, account, { itemType: 'mission_submission', itemId, eventType: 'rejected', note, snapshot: snapshotFromMission(row), now });
    await db
      .prepare('UPDATE lantern_mission_submissions SET status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?')
      .bind('rejected', staffName, now, itemId)
      .run();
    return { ok: true, status: 'rejected' };
  }
  if (t === 'feed_item') {
    const row = await db.prepare('SELECT * FROM lantern_feed_items WHERE id = ?').bind(itemId).first();
    if (!row) return { ok: false, error: 'Not found', code: 404 };
    await recordEventForAccount(db, account, { itemType: 'feed_item', itemId, eventType: 'rejected', note, snapshot: snapshotFromFeed(row), now });
    await db
      .prepare("UPDATE lantern_feed_items SET status = 'rejected', private_feedback = ?, approved_at = NULL, approved_by = ? WHERE id = ?")
      .bind(note || null, staffName, itemId)
      .run();
    return { ok: true, status: 'rejected' };
  }
  return { ok: false, error: 'unsupported_item_type', code: 400 };
}

async function openFlagsForItem(db, itemType, itemId) {
  const flags = await loadUnresolvedFlags(db);
  const want = flagCanonicalType(itemType);
  const id = String(itemId || '').trim();
  return flags.filter((f) => String(f.item_id) === id && flagCanonicalType(f.item_type) === want);
}

export async function performReviewAction(db, account, body, deps) {
  const action = String((body && body.action) || '').trim().toLowerCase();
  const itemType = canonicalItemType((body && (body.item_type || body.type)) || '');
  const itemId = String((body && (body.item_id || body.id)) || '').trim();
  const note = clipNote((body && (body.note || body.decision_note || body.reason || body.private_feedback || body.feedback)) || '');
  const now = (body && body.now) || new Date().toISOString();
  const actor = actorFromAccount(account);
  if (!action || !itemType || !itemId) return { ok: false, error: 'missing_action_target', code: 400 };
  if (!isTeacherLike(account && account.role)) return { ok: false, error: 'forbidden', code: 403 };
  const may = await staffMayReviewItem(db, account, itemType, itemId);
  if (!may) return { ok: false, error: 'forbidden', code: 403 };

  if (action === 'approve') {
    return performApprove(db, account, itemType, itemId, now, deps);
  }
  if (action === 'return') {
    if (isBlankNote(note)) return { ok: false, error: 'feedback_required', code: 400 };
    return performReturn(db, account, itemType, itemId, note, now, false);
  }
  if (action === 'reject') {
    return performReject(db, account, itemType, itemId, note, now);
  }
  if (action === 'report_dismiss') {
    const flags = await openFlagsForItem(db, itemType, itemId);
    if (!flags.length) return { ok: false, error: 'no_open_report', code: 404 };
    const hideKind = hideKindForItemType(itemType);
    if (hideKind) {
      const restored = await restoreReportCreatedHide(db, hideKind, itemId);
      if (!restored.ok && restored.error === 'not_report_quarantine') {
        return { ok: false, error: 'not_report_quarantine', code: 403 };
      }
      if (!restored.ok && restored.error !== 'not_found') return restored;
    }
    await resolveOpenFlags(db, itemType, itemId, 'dismissed', actor, note, now);
    const loaded = await loadOwnedContent(db, itemType, itemId);
    await recordEventForAccount(db, account, {
      itemType,
      itemId,
      eventType: 'report_dismissed',
      note,
      snapshot: loaded.row
        ? itemType === 'news'
          ? snapshotFromNews(loaded.row)
          : itemType === 'feed_item'
            ? snapshotFromFeed(loaded.row)
            : itemType === 'mission_submission'
              ? snapshotFromMission(loaded.row)
              : null
        : null,
      now,
    });
    await recordEventForAccount(db, account, { itemType, itemId, eventType: 'restored', note, now });
    return { ok: true, resolution: 'dismissed' };
  }
  if (action === 'report_return') {
    if (isBlankNote(note)) return { ok: false, error: 'feedback_required', code: 400 };
    const flags = await openFlagsForItem(db, itemType, itemId);
    if (!flags.length) return { ok: false, error: 'no_open_report', code: 404 };
    if (!REVISION_CAPABLE[itemType]) return { ok: false, error: 'not_revision_capable', code: 400 };
    const returned = await performReturn(db, account, itemType, itemId, note, now, true);
    if (!returned.ok) return returned;
    await resolveOpenFlags(db, itemType, itemId, 'returned', actor, note, now);
    return { ok: true, status: 'returned', resolution: 'returned' };
  }
  if (action === 'report_remove') {
    const flags = await openFlagsForItem(db, itemType, itemId);
    if (!flags.length) return { ok: false, error: 'no_open_report', code: 404 };
    const isAdmin = isAdminRole(account.role);
    const resolution = isAdmin && String((body && body.resolution) || '').toLowerCase() === 'removed' ? 'removed' : 'hidden';
    if (resolution === 'removed' && !isAdmin) return { ok: false, error: 'forbidden', code: 403 };
    await resolveOpenFlags(db, itemType, itemId, resolution, actor, note, now);
    const loaded = await loadOwnedContent(db, itemType, itemId);
    await recordEventForAccount(db, account, {
      itemType,
      itemId,
      eventType: 'report_removed',
      note,
      snapshot: loaded.row && itemType === 'news' ? snapshotFromNews(loaded.row) : null,
      now,
    });
    return { ok: true, resolution };
  }
  return { ok: false, error: 'invalid_action', code: 400 };
}

export function stripFlaggedReporter(flag, isAdmin) {
  const out = Object.assign({}, flag);
  if (!isAdmin) delete out.reported_by;
  return out;
}

export async function handleReviewFoundationRoutes(request, url, path, env, cors, deps) {
  const jsonResponse = deps.jsonResponse;
  const db = env.DB;
  if (!db) return jsonResponse({ ok: false, error: 'DB not configured' }, 503, cors);

  try {
    if (request.method === 'GET' && path === '/api/review/queue') {
      const auth = await deps.requireStaffPilotSession(request, env, cors);
      if (auth.response) return auth.response;
      const items = await buildReviewQueue(db, auth.account, { includeDetails: true });
      return jsonResponse({ ok: true, items, count: items.length }, 200, cors);
    }

    if (request.method === 'GET' && path === '/api/action-counts') {
      const account = await deps.getPilotAccountFromRequest(request, env);
      if (!account) return jsonResponse({ ok: false, error: 'not_authenticated' }, 401, cors);
      if (deps.pilotAccountRequiresChangePassword && deps.pilotAccountRequiresChangePassword(account)) {
        return jsonResponse({ ok: false, error: 'must_change_password', redirect: '/change-password.html' }, 403, cors);
      }
      const role = String(account.role || '').trim().toLowerCase();
      if (isTeacherLike(account.role)) {
        const staff_review_count = await countStaffReviewItems(db, account);
        return jsonResponse({ ok: true, staff_review_count }, 200, cors);
      }
      if (role === 'student') {
        const student_revision_count = await countStudentRevisions(db, account, deps);
        return jsonResponse({ ok: true, student_revision_count }, 200, cors);
      }
      return jsonResponse({ ok: true }, 200, cors);
    }

    if (request.method === 'POST' && path === '/api/review/action') {
      const auth = await deps.requireStaffPilotSession(request, env, cors);
      if (auth.response) return auth.response;
      let body;
      try {
        body = JSON.parse((await request.text()) || '{}');
      } catch (_) {
        return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, cors);
      }
      const result = await performReviewAction(db, auth.account, body, deps);
      if (!result.ok) return jsonResponse({ ok: false, error: result.error }, result.code || 400, cors);
      return jsonResponse(Object.assign({ ok: true }, result), 200, cors);
    }

    if (request.method === 'GET' && path === '/api/moderation/history') {
      const account = await deps.getPilotAccountFromRequest(request, env);
      if (!account) return jsonResponse({ ok: false, error: 'not_authenticated' }, 401, cors);
      if (deps.pilotAccountRequiresChangePassword && deps.pilotAccountRequiresChangePassword(account)) {
        return jsonResponse({ ok: false, error: 'must_change_password', redirect: '/change-password.html' }, 403, cors);
      }
      const itemType = url.searchParams.get('item_type') || url.searchParams.get('type') || '';
      const itemId = url.searchParams.get('item_id') || url.searchParams.get('id') || '';
      if (!itemType || !itemId) return jsonResponse({ ok: false, error: 'missing_item' }, 400, cors);
      const loaded = await loadOwnedContent(db, itemType, itemId);
      if (!loaded.row) return jsonResponse({ ok: false, error: 'Not found' }, 404, cors);
      const role = String(account.role || '').trim().toLowerCase();
      if (isTeacherLike(account.role)) {
        const may = await staffMayReviewItem(db, account, itemType, itemId);
        if (!may) return jsonResponse({ ok: false, error: 'forbidden' }, 403, cors);
        const events = await listModerationEvents(db, itemType, itemId);
        return jsonResponse({ ok: true, item_type: canonicalItemType(itemType), item_id: String(itemId), events: presentStaffEvents(events) }, 200, cors);
      }
      if (role === 'student') {
        const keys = studentIdentityKeys(account, deps);
        if (!studentOwnsRow(loaded.type, loaded.row, keys)) {
          return jsonResponse({ ok: false, error: 'forbidden' }, 403, cors);
        }
        const events = await listModerationEvents(db, itemType, itemId);
        const safe = redactEventsForStudent(events);
        const lastReturn = latestReturnEvent(events);
        return jsonResponse(
          {
            ok: true,
            item_type: canonicalItemType(itemType),
            item_id: String(itemId),
            events: safe,
            latest_return: lastReturn
              ? { note: lastReturn.note || null, created_at: lastReturn.created_at, actor_label: lastReturn.actor_label || null }
              : null,
          },
          200,
          cors
        );
      }
      return jsonResponse({ ok: false, error: 'forbidden' }, 403, cors);
    }
  } catch (err) {
    if (isModerationSchemaError(err)) return schemaErrorResponse(jsonResponse, cors);
    throw err;
  }

  return jsonResponse({ ok: false, error: 'Method or path not allowed' }, 405, cors);
}
