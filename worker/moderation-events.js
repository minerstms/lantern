/**
 * Prompt #251A — append-only moderation history.
 * Current content tables remain authoritative for current state.
 */

export const MODERATION_EVENT_TYPES = Object.freeze([
  'submitted',
  'returned',
  'resubmitted',
  'approved',
  'rejected',
  'reported',
  'report_dismissed',
  'report_returned',
  'report_removed',
  'hidden',
  'restored',
  'owner_archived',
  'owner_reopened',
]);

export const REPORT_RESOLUTIONS = Object.freeze(['dismissed', 'returned', 'removed', 'hidden']);

export const SNAPSHOT_TEXT_MAX = 4000;
export const SNAPSHOT_JSON_MAX = 8000;

const CANONICAL_ITEM_TYPES = Object.freeze({
  news: 'news',
  shoutout: 'news',
  'shout-out': 'news',
  shout_out: 'news',
  poll: 'poll_contribution',
  polls: 'poll_contribution',
  poll_contribution: 'poll_contribution',
  mission: 'mission_submission',
  missions: 'mission_submission',
  mission_submission: 'mission_submission',
  feed: 'feed_item',
  feed_item: 'feed_item',
  creation: 'feed_item',
  article: 'feed_item',
  post: 'feed_item',
  avatar: 'avatar',
});

export class ModerationSchemaError extends Error {
  constructor(message) {
    super(message || 'moderation_schema_required');
    this.name = 'ModerationSchemaError';
    this.code = 503;
    this.error = 'moderation_schema_required';
  }
}

export function isModerationSchemaError(err) {
  if (err && err.name === 'ModerationSchemaError') return true;
  const m = String((err && err.message) || err || '');
  return (
    /no such table:\s*lantern_moderation_events/i.test(m) ||
    /no such column:\s*(resolved_at|resolved_by|resolution|staff_note)/i.test(m)
  );
}

export function schemaErrorResponse(jsonResponse, cors) {
  return jsonResponse({ ok: false, error: 'moderation_schema_required' }, 503, cors);
}

export function canonicalItemType(raw) {
  const t = String(raw || '')
    .trim()
    .toLowerCase();
  return CANONICAL_ITEM_TYPES[t] || t;
}

export function normalizeRole(role) {
  return String(role || '')
    .trim()
    .toLowerCase();
}

export function actorFromAccount(account) {
  if (!account) {
    return { actor_key: '', actor_role: '', actor_label: '' };
  }
  const role = normalizeRole(account.role);
  const username = account.username != null ? String(account.username).trim() : '';
  const display = account.display_name != null ? String(account.display_name).trim() : '';
  const economy =
    account.student_character_name != null ? String(account.student_character_name).trim() : '';
  return {
    actor_key: username || economy || display,
    actor_role: role,
    actor_label: display || username || economy || 'user',
  };
}

function clipText(value, max) {
  const s = value == null ? '' : String(value);
  if (s.length <= max) return s;
  return s.slice(0, max);
}

/**
 * Compact snapshot of the student version being acted on.
 * No image bytes/base64 — keys/URLs only.
 */
export function compactSnapshot(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  if (src.content_type || src.item_type || src.type) {
    out.content_type = String(src.content_type || src.item_type || src.type).trim().slice(0, 80);
  }
  if (src.status != null) out.status = String(src.status).trim().slice(0, 40);
  const title = src.title || src.question || src.poll_question;
  if (title != null && String(title).trim()) out.title = clipText(title, 500);
  const body = src.body || src.submission_content || src.text || src.summary;
  if (body != null && String(body).trim()) out.body = clipText(body, SNAPSHOT_TEXT_MAX);
  if (src.image_r2_key) out.image_r2_key = clipText(src.image_r2_key, 500);
  if (src.full_image_r2_key) out.full_image_r2_key = clipText(src.full_image_r2_key, 500);
  if (src.video_r2_key) out.video_r2_key = clipText(src.video_r2_key, 500);
  if (src.image_url) out.image_url = clipText(src.image_url, 500);
  if (src.video_url) out.video_url = clipText(src.video_url, 500);
  if (src.link_url) out.link_url = clipText(src.link_url, 500);
  if (src.category) out.category = clipText(src.category, 200);
  if (src.submission_type) out.submission_type = clipText(src.submission_type, 80);
  if (Array.isArray(src.choices) && src.choices.length) {
    out.choices = src.choices.map((c) => clipText(c, 200)).slice(0, 5);
  }
  let json = JSON.stringify(out);
  if (json.length > SNAPSHOT_JSON_MAX) {
    if (out.body) out.body = clipText(out.body, Math.max(200, SNAPSHOT_TEXT_MAX - (json.length - SNAPSHOT_JSON_MAX)));
    json = JSON.stringify(out);
    if (json.length > SNAPSHOT_JSON_MAX) {
      delete out.body;
      json = JSON.stringify(out);
    }
  }
  return out;
}

export function snapshotToJson(snapshot) {
  if (!snapshot) return null;
  const compact = compactSnapshot(snapshot);
  if (!Object.keys(compact).length) return null;
  return JSON.stringify(compact);
}

export function parseSnapshotJson(raw) {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    return o && typeof o === 'object' ? o : null;
  } catch (_) {
    return null;
  }
}

function newEventId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return 'mevt-' + crypto.randomUUID();
  return 'mevt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
}

/**
 * Authoritative write. Server-generated id/time. Actor from session object, not client identity fields.
 */
export async function recordModerationEvent(db, input) {
  if (!db) throw new ModerationSchemaError('moderation_schema_required');
  const itemType = canonicalItemType(input && input.itemType);
  const itemId = String((input && input.itemId) || '').trim();
  const eventType = String((input && input.eventType) || '').trim().toLowerCase();
  if (!itemType || !itemId) throw new Error('missing_moderation_event_target');
  if (MODERATION_EVENT_TYPES.indexOf(eventType) < 0) throw new Error('invalid_moderation_event_type');
  const actor = (input && input.actor) || {};
  const note = clipText((input && input.note) || '', 500) || null;
  const snapshotJson = snapshotToJson(input && input.snapshot);
  const createdAt = (input && input.now) || new Date().toISOString();
  const id = (input && input.id) || newEventId();
  try {
    await db
      .prepare(
        'INSERT INTO lantern_moderation_events (id, item_type, item_id, event_type, actor_key, actor_role, actor_label, note, snapshot_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(
        id,
        itemType,
        itemId,
        eventType,
        actor.actor_key ? String(actor.actor_key).trim().slice(0, 200) : null,
        actor.actor_role ? String(actor.actor_role).trim().slice(0, 40) : null,
        actor.actor_label ? String(actor.actor_label).trim().slice(0, 200) : null,
        note,
        snapshotJson,
        createdAt
      )
      .run();
  } catch (err) {
    if (isModerationSchemaError(err)) throw new ModerationSchemaError();
    throw err;
  }
  return { ok: true, id, created_at: createdAt, item_type: itemType, item_id: itemId, event_type: eventType };
}

export async function listModerationEvents(db, itemType, itemId) {
  const type = canonicalItemType(itemType);
  const id = String(itemId || '').trim();
  if (!type || !id) return [];
  try {
    const rows = await db
      .prepare(
        'SELECT id, item_type, item_id, event_type, actor_key, actor_role, actor_label, note, snapshot_json, created_at FROM lantern_moderation_events WHERE item_type = ? AND item_id = ? ORDER BY created_at ASC'
      )
      .bind(type, id)
      .all();
    return rows && rows.results ? rows.results : [];
  } catch (err) {
    if (isModerationSchemaError(err)) throw new ModerationSchemaError();
    throw err;
  }
}

export async function listModerationEventsForItems(db, pairs) {
  const list = (pairs || []).filter((p) => p && p.item_type && p.item_id);
  if (!list.length) return [];
  const out = [];
  // D1 has no reliable tuple IN; query per-type groups.
  const byType = Object.create(null);
  list.forEach((p) => {
    const t = canonicalItemType(p.item_type);
    const id = String(p.item_id).trim();
    if (!byType[t]) byType[t] = [];
    if (byType[t].indexOf(id) < 0) byType[t].push(id);
  });
  try {
    for (const type of Object.keys(byType)) {
      const ids = byType[type];
      const ph = ids.map(() => '?').join(',');
      const rows = await db
        .prepare(
          `SELECT id, item_type, item_id, event_type, actor_key, actor_role, actor_label, note, snapshot_json, created_at FROM lantern_moderation_events WHERE item_type = ? AND item_id IN (${ph}) ORDER BY created_at DESC`
        )
        .bind(type, ...ids)
        .all();
      (rows.results || []).forEach((r) => out.push(r));
    }
  } catch (err) {
    if (isModerationSchemaError(err)) throw new ModerationSchemaError();
    throw err;
  }
  return out;
}

/**
 * Latest of returned/resubmitted/approved/rejected decides RESUBMITTED presentation.
 */
export function isResubmittedFromEvents(events) {
  const rows = (events || []).slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  for (let i = 0; i < rows.length; i++) {
    const t = String(rows[i].event_type || '').toLowerCase();
    if (t === 'resubmitted') return true;
    if (t === 'returned' || t === 'approved' || t === 'rejected' || t === 'submitted') return false;
  }
  return false;
}

export function latestReturnEvent(events) {
  const rows = (events || []).slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  return rows.find((r) => String(r.event_type || '').toLowerCase() === 'returned') || null;
}
