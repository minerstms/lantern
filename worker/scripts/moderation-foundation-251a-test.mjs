/**
 * Prompt #251A — moderation foundation: events, return/resubmit history,
 * feed returned status, report resolution, unified queue, action counts.
 *
 * Usage: node worker/scripts/moderation-foundation-251a-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compactSnapshot,
  isModerationSchemaError,
  isResubmittedFromEvents,
  recordModerationEvent,
  SNAPSHOT_JSON_MAX,
} from '../moderation-events.js';
import {
  buildReviewQueue,
  countStaffReviewItems,
  countStudentRevisions,
  handleReviewFoundationRoutes,
  performReviewAction,
  redactEventsForStudent,
  stripFlaggedReporter,
} from '../moderation-review.js';
import { restoreReportCreatedHide, quarantineReportedContent } from '../content-report-quarantine.js';
import { FEED_STATUSES, handleFeedRoutes } from '../feed-handlers.js';
import { isTeacherLike } from '../missions-auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '../..');
const indexSrc = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
const feedSrc = fs.readFileSync(path.join(root, 'worker/feed-handlers.js'), 'utf8');
const reviewSrc = fs.readFileSync(path.join(root, 'worker/moderation-review.js'), 'utf8');
const migration = fs.readFileSync(
  path.join(root, 'worker/migrations/077_lantern_moderation_foundation.sql'),
  'utf8'
);

let pass = 0;
let fail = 0;
function ok(msg) {
  pass++;
  console.log('PASS', msg);
}
function bad(msg, detail) {
  fail++;
  console.error('FAIL', msg, detail != null ? detail : '');
}
function assert(cond, msg, detail) {
  if (cond) ok(msg);
  else bad(msg, detail);
}

const TEACHER = { username: 'ms_carter', display_name: 'Ms. Carter', role: 'teacher', teacher_id: 't_carter' };
const TEACHER_B = { username: 'mr_lee', display_name: 'Mr. Lee', role: 'teacher', teacher_id: 't_lee' };
const ADMIN = { username: 'admin', display_name: 'Web Admin', role: 'admin' };
const STUDENT = { username: 'lucas', display_name: 'Lucas', role: 'student', student_character_name: 'Lucas' };
const STUDENT_B = { username: 'mia', display_name: 'Mia', role: 'student', student_character_name: 'Mia' };
const STAFF = { username: 'aide', display_name: 'Aide', role: 'staff' };

function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function depsFor(account) {
  return {
    jsonResponse,
    async getPilotAccountFromRequest() {
      return account || null;
    },
    async requireStaffPilotSession() {
      if (!account) return { response: jsonResponse({ ok: false, error: 'not_authenticated' }, 401) };
      if (!isTeacherLike(account.role)) return { response: jsonResponse({ ok: false, error: 'forbidden' }, 403) };
      return { account };
    },
    pilotAccountRequiresChangePassword() {
      return false;
    },
    pilotEconomyCharacterName(a) {
      return a && a.role === 'student' ? a.student_character_name || '' : '';
    },
    durableAccountKeyFromPilotAccount(a) {
      return a ? String(a.username || '') : '';
    },
  };
}

function makeDb(seed, opts) {
  const schema = !opts || opts.schema !== false;
  const state = {
    news: [],
    polls: [],
    contrib: [],
    missions: [],
    subs: [],
    feed: [],
    approvals: [],
    flags: [],
    events: [],
    avatars: [],
  };
  Object.assign(state, seed || {});

  function inList(value, list) {
    return list.indexOf(String(value || '')) >= 0;
  }

  function rowsOf(sql) {
    if (sql.includes('lantern_news_submissions')) return state.news;
    if (sql.includes('lantern_poll_contributions')) return state.contrib;
    if (sql.includes('lantern_polls')) return state.polls;
    if (sql.includes('lantern_mission_submissions')) return state.subs;
    if (sql.includes('lantern_missions')) return state.missions;
    if (sql.includes('lantern_feed_items')) return state.feed;
    if (sql.includes('lantern_approvals')) return state.approvals;
    if (sql.includes('lantern_content_flags')) return state.flags;
    if (sql.includes('lantern_moderation_events')) return state.events;
    if (sql.includes('lantern_avatar_submissions')) return state.avatars;
    return [];
  }

  function byId(list, id) {
    return list.find((r) => String(r.id) === String(id)) || null;
  }

  return {
    state,
    prepare(sql) {
      const s = String(sql);
      const binds = [];
      const api = {
        bind(...args) {
          binds.push(...args);
          return api;
        },
        async first() {
          if (!schema && /lantern_moderation_events/.test(s)) throw new Error('no such table: lantern_moderation_events');
          if (!schema && /resolved_at/.test(s) && /lantern_content_flags/.test(s)) {
            throw new Error('no such column: resolved_at');
          }
          if (s.includes('COUNT(*)')) {
            let n = 0;
            if (s.includes('lantern_news_submissions')) {
              const keys = binds.slice(0, binds.length / 2);
              n = state.news.filter(
                (r) => String(r.status).toLowerCase() === 'returned' && (inList(r.author_name, keys) || inList(r.actor_id, keys))
              ).length;
            } else if (s.includes('lantern_poll_contributions')) {
              n = state.contrib.filter((r) => String(r.status).toLowerCase() === 'returned' && inList(r.character_name, binds)).length;
            } else if (s.includes('lantern_mission_submissions')) {
              n = state.subs.filter((r) => String(r.status).toLowerCase() === 'returned' && inList(r.character_name, binds)).length;
            } else if (s.includes('lantern_feed_items')) {
              const keys = binds.slice(0, binds.length / 2);
              n = state.feed.filter(
                (r) => String(r.status).toLowerCase() === 'returned' && (inList(r.author_display_name, keys) || inList(r.author_id, keys))
              ).length;
            }
            return { c: n };
          }
          const list = rowsOf(s);
          if (s.includes('WHERE id = ?') || s.includes('WHERE id=?')) return byId(list, binds[0]);
          if (s.includes('item_type = ? AND item_id = ?')) {
            return list.find((r) => r.item_type === binds[0] && String(r.item_id) === String(binds[1])) || null;
          }
          return list[0] || null;
        },
        async all() {
          if (!schema && /lantern_moderation_events/.test(s)) throw new Error('no such table: lantern_moderation_events');
          if (!schema && /resolved_at/.test(s) && /lantern_content_flags/.test(s)) {
            throw new Error('no such column: resolved_at');
          }
          let list = rowsOf(s).slice();
          if (s.includes("status)) = 'pending'") || s.includes("status = ?") || s.includes("status)) = ?")) {
            const want = (binds[0] || 'pending').toLowerCase();
            if (s.includes('lantern_approvals')) list = list.filter((r) => String(r.status).toLowerCase() === want);
            if (s.includes('lantern_mission_submissions') && s.includes('pending')) {
              list = list.filter((r) => String(r.status).toLowerCase() === 'pending');
            }
          }
          if (s.includes("status)) = 'submitted'") || (s.includes('lantern_feed_items') && s.includes('submitted'))) {
            list = state.feed.filter((r) => String(r.status).toLowerCase() === 'submitted');
          }
          if (s.includes('resolved_at IS NULL') || s.includes("resolved_at = ''")) {
            list = state.flags.filter((r) => !r.resolved_at);
          }
          if (s.includes('lantern_moderation_events')) {
            if (s.includes('item_id IN')) {
              const type = binds[0];
              const ids = binds.slice(1);
              list = state.events.filter((e) => e.item_type === type && ids.indexOf(e.item_id) >= 0);
            } else if (s.includes('item_type = ? AND item_id = ?')) {
              list = state.events.filter((e) => e.item_type === binds[0] && e.item_id === binds[1]);
            }
          }
          if (s.includes('lantern_missions WHERE id IN')) {
            list = state.missions.filter((m) => binds.indexOf(m.id) >= 0);
          }
          return { results: list };
        },
        async run() {
          if (!schema && /lantern_moderation_events/.test(s)) throw new Error('no such table: lantern_moderation_events');
          if (!schema && /resolved_at/.test(s) && /lantern_content_flags/.test(s) && s.includes('UPDATE')) {
            throw new Error('no such column: resolved_at');
          }
          if (s.includes('INSERT INTO lantern_moderation_events')) {
            state.events.push({
              id: binds[0],
              item_type: binds[1],
              item_id: binds[2],
              event_type: binds[3],
              actor_key: binds[4],
              actor_role: binds[5],
              actor_label: binds[6],
              note: binds[7],
              snapshot_json: binds[8],
              created_at: binds[9],
            });
            return { success: true };
          }
          if (s.includes('INSERT INTO lantern_content_flags')) {
            state.flags.push({
              id: binds[0],
              item_type: binds[1],
              item_id: binds[2],
              reported_by: binds[3],
              reason: binds[4],
              created_at: binds[5],
              resolved_at: null,
            });
            return { success: true };
          }
          if (s.includes('INSERT INTO lantern_approvals')) {
            state.approvals.push({
              id: binds[0],
              item_type: binds[1],
              item_id: binds[2],
              status: binds[3],
              submitted_by_actor_name: binds[5],
              created_at: binds[7],
            });
            return { success: true };
          }
          if (s.includes('UPDATE lantern_content_flags SET resolved_at')) {
            state.flags.forEach((f) => {
              if (String(f.item_id) === String(binds[4]) && f.item_type === binds[5] && !f.resolved_at) {
                f.resolved_at = binds[0];
                f.resolved_by = binds[1];
                f.resolution = binds[2];
                f.staff_note = binds[3];
              }
            });
            return { success: true };
          }
          if (s.includes('UPDATE lantern_news_submissions')) {
            const row = byId(state.news, binds[binds.length - 1]);
            if (row && s.includes('hidden_at = NULL')) {
              row.hidden_at = null;
              row.hidden_by = null;
            } else if (row && s.includes('hidden_at = ?')) {
              row.hidden_at = binds[0];
              row.hidden_by = binds[1];
            } else if (row && s.includes('status = ?')) {
              row.status = binds[0];
              if (s.includes('decision_note')) row.decision_note = binds[4] != null ? binds[4] : binds[3];
            }
            return { success: true };
          }
          if (s.includes('UPDATE lantern_poll_contributions')) {
            const row = byId(state.contrib, binds[binds.length - 1]);
            if (row) {
              row.status = binds[0];
              if (s.includes('decision_note')) row.decision_note = binds[3];
            }
            return { success: true };
          }
          if (s.includes('UPDATE lantern_polls')) {
            const row = byId(state.polls, binds[binds.length - 1]);
            if (row && s.includes('NULL')) {
              row.hidden_at = null;
              row.hidden_by = null;
            } else if (row) {
              row.hidden_at = binds[0];
              row.hidden_by = binds[1];
            }
            return { success: true };
          }
          if (s.includes('UPDATE lantern_mission_submissions')) {
            const row = byId(state.subs, binds[binds.length - 1]);
            if (row && s.includes('hidden_at = NULL')) {
              row.hidden_at = null;
              row.hidden_by = null;
            } else if (row && s.includes('hidden_at = ?')) {
              row.hidden_at = binds[0];
              row.hidden_by = binds[1];
            } else if (row && s.includes('returned_reason')) {
              row.status = binds[0];
              row.returned_reason = binds[1];
              row.returned_by = binds[2];
              row.returned_at = binds[3];
            } else if (row && s.includes('status = ?')) {
              row.status = binds[0];
            }
            return { success: true };
          }
          if (s.includes('UPDATE lantern_feed_items')) {
            const row = byId(state.feed, binds[binds.length - 1]);
            if (row && s.includes("status = 'approved'")) {
              row.status = 'approved';
              row.hidden_at = null;
              row.hidden_by = null;
            } else if (row && s.includes("status = 'hidden'")) {
              row.status = 'hidden';
              row.hidden_at = binds[0];
              row.hidden_by = binds[1];
            } else if (row && s.includes("status = 'submitted'")) {
              row.status = 'submitted';
              row.private_feedback = null;
            } else if (row && s.includes("status = 'rejected'")) {
              row.status = 'rejected';
              row.private_feedback = binds[0];
            } else if (row && s.includes("status = 'returned'")) {
              row.status = 'returned';
              row.private_feedback = binds[0];
            } else if (row && s.includes('status = ?')) {
              row.status = binds[0];
              if (s.includes('private_feedback')) row.private_feedback = binds[1];
            } else if (row && s.includes('hidden_at = NULL')) {
              row.hidden_at = null;
              row.hidden_by = null;
            }
            return { success: true };
          }
          if (s.includes('UPDATE lantern_approvals')) {
            const row = byId(state.approvals, binds[binds.length - 1]);
            if (row) {
              row.status = binds[0];
              if (s.includes('decision_note')) row.decision_note = binds[4] != null ? binds[4] : row.decision_note;
            }
            return { success: true };
          }
          return { success: true };
        },
      };
      return api;
    },
  };
}

async function reqRoute(path, account, env, method, body, query) {
  const url = new URL('https://x.test' + path + (query || ''));
  const request = new Request(url, {
    method: method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: method === 'POST' ? JSON.stringify(body || {}) : undefined,
  });
  return handleReviewFoundationRoutes(request, url, path, env, {}, depsFor(account));
}

// ---------------------------------------------------------------------------
// Schema / source contracts
// ---------------------------------------------------------------------------
assert(/CREATE TABLE IF NOT EXISTS lantern_moderation_events/.test(migration), '077 creates events table');
assert(/ALTER TABLE lantern_content_flags ADD COLUMN resolved_at/.test(migration), '077 adds resolved_at');
assert(/DO NOT apply/.test(migration) && /wrangler d1 migrations apply/.test(migration), '077 says do not apply via wrangler migrations');
assert(!/last_returned_at/.test(migration) && !/resubmitted_at/.test(migration), '077 does not add per-table return timestamps');
assert(/isTeacherLike\(account\.role\)/.test(indexSrc), 'flagged endpoint uses isTeacherLike(account.role)');
assert(!/isTeacherLike\(account\)/.test(indexSrc.replace(/isTeacherLike\(account\.role\)/g, '')), 'no leftover isTeacherLike(account) object call');
assert(FEED_STATUSES.indexOf('returned') >= 0, 'FEED_STATUSES includes returned');
assert(/status = 'returned'/.test(feedSrc) && /\/api\/feed\/return/.test(feedSrc), 'feed return writes status=returned');
assert(!/\/api\/feed\/return[\s\S]{0,400}status = 'rejected'/.test(feedSrc), 'feed return no longer writes rejected');
assert(/\['draft', 'rejected', 'returned'\]/.test(feedSrc), 'feed submit accepts returned');
assert(/feedback_required/.test(reviewSrc) && /Legacy Return routes/.test(reviewSrc), 'new API requires feedback; legacy documented');
assert(/handleReviewFoundationRoutes/.test(indexSrc) && /\/api\/review/.test(indexSrc) && /\/api\/action-counts/.test(indexSrc), 'new routes dispatched');
assert(/path.startsWith\('\/api\/review'\)/.test(indexSrc) && /path === '\/api\/action-counts'/.test(indexSrc), 'CORS/dispatch includes review + action-counts');

// ---------------------------------------------------------------------------
// Snapshot bounds
// ---------------------------------------------------------------------------
{
  const snap = compactSnapshot({
    title: 'Hello',
    body: 'x'.repeat(20000),
    image_r2_key: 'news/a.png',
    status: 'pending',
    content_type: 'news',
    photo_bytes: 'data:image/png;base64,AAAA',
  });
  const json = JSON.stringify(snap);
  assert(json.length <= SNAPSHOT_JSON_MAX, 'snapshot json bounded', json.length);
  assert(!snap.photo_bytes && !/base64/.test(json), 'snapshot has no image bytes');
  assert(snap.title === 'Hello' && snap.image_r2_key === 'news/a.png', 'snapshot keeps title + media key');
}

// ---------------------------------------------------------------------------
// Event helper + schema fail-closed
// ---------------------------------------------------------------------------
{
  const db = makeDb();
  await recordModerationEvent(db, {
    itemType: 'news',
    itemId: 'n1',
    eventType: 'returned',
    actor: { actor_key: 'ms_carter', actor_role: 'teacher', actor_label: 'Ms. Carter' },
    note: 'Please add a source',
    snapshot: { title: 'A', body: 'B', status: 'pending', content_type: 'news' },
    now: '2026-08-01T00:00:00.000Z',
  });
  assert(db.state.events.length === 1 && db.state.events[0].event_type === 'returned', 'recordModerationEvent writes row');
  assert(db.state.events[0].note === 'Please add a source', 'event keeps staff note');
}
{
  const db = makeDb({}, { schema: false });
  let threw = null;
  try {
    await recordModerationEvent(db, { itemType: 'news', itemId: 'n1', eventType: 'returned', actor: {} });
  } catch (e) {
    threw = e;
  }
  assert(threw && isModerationSchemaError(threw), 'missing events table fails closed');
}

assert(
  isResubmittedFromEvents([
    { event_type: 'returned', created_at: '1' },
    { event_type: 'resubmitted', created_at: '2' },
  ]) === true,
  'latest resubmitted => RESUBMITTED'
);
assert(
  isResubmittedFromEvents([
    { event_type: 'resubmitted', created_at: '1' },
    { event_type: 'returned', created_at: '2' },
  ]) === false,
  'later return is not RESUBMITTED'
);

// ---------------------------------------------------------------------------
// News / poll / mission return → resubmit history
// ---------------------------------------------------------------------------
async function historyCycle(itemType, seedRow, applyReturn, applyResubmit) {
  const db = makeDb(seedRow);
  const r = await applyReturn(db);
  const s = await applyResubmit(db);
  const types = db.state.events.map((e) => e.event_type);
  const returned = db.state.events.find((e) => e.event_type === 'returned');
  const resub = db.state.events.find((e) => e.event_type === 'resubmitted');
  assert(r.ok && s.ok, itemType + ' return+resubmit ok');
  assert(types.indexOf('returned') >= 0 && types.indexOf('resubmitted') >= 0, itemType + ' events preserved', types);
  assert(returned && returned.note && returned.snapshot_json, itemType + ' returned keeps note+snapshot');
  assert(resub && resub.actor_role === 'student', itemType + ' resubmitted student actor');
  return db;
}

await historyCycle(
  'news',
  {
    news: [{ id: 'n1', title: 'v1', body: 'first', status: 'pending', author_name: 'Lucas', actor_id: 'lucas' }],
    approvals: [{ id: 'a1', item_type: 'news', item_id: 'n1', status: 'pending' }],
  },
  (db) => performReviewAction(db, TEACHER, { action: 'return', item_type: 'news', item_id: 'n1', note: 'Add a source' }),
  async (db) => {
    await recordModerationEvent(db, {
      itemType: 'news',
      itemId: 'n1',
      eventType: 'resubmitted',
      actor: { actor_key: 'lucas', actor_role: 'student', actor_label: 'Lucas' },
      snapshot: { title: 'v2', body: 'revised', status: 'pending', content_type: 'news' },
    });
    db.state.news[0].title = 'v2';
    db.state.news[0].body = 'revised';
    db.state.news[0].status = 'pending';
    db.state.news[0].decision_note = null;
    return { ok: true };
  }
);

await historyCycle(
  'poll',
  {
    contrib: [{ id: 'p1', question: 'Q1', choices_json: '["a","b"]', status: 'pending', character_name: 'Lucas' }],
    approvals: [{ id: 'ap', item_type: 'poll_contribution', item_id: 'p1', status: 'pending' }],
  },
  (db) => performReviewAction(db, TEACHER, { action: 'return', item_type: 'poll_contribution', item_id: 'p1', note: 'Fix choices' }),
  async (db) => {
    await recordModerationEvent(db, {
      itemType: 'poll_contribution',
      itemId: 'p1',
      eventType: 'resubmitted',
      actor: { actor_key: 'lucas', actor_role: 'student', actor_label: 'Lucas' },
      snapshot: { title: 'Q2', status: 'pending', content_type: 'poll_contribution' },
    });
    db.state.contrib[0].question = 'Q2';
    db.state.contrib[0].status = 'pending';
    db.state.contrib[0].decision_note = null;
    return { ok: true };
  }
);

await historyCycle(
  'mission',
  {
    missions: [{ id: 'm1', title: 'Write', teacher_id: 't_carter' }],
    subs: [{ id: 's1', mission_id: 'm1', character_name: 'Lucas', submission_content: 'draft1', status: 'pending' }],
  },
  (db) => performReviewAction(db, TEACHER, { action: 'return', item_type: 'mission_submission', item_id: 's1', note: 'More detail' }),
  async (db) => {
    await recordModerationEvent(db, {
      itemType: 'mission_submission',
      itemId: 's1',
      eventType: 'resubmitted',
      actor: { actor_key: 'lucas', actor_role: 'student', actor_label: 'Lucas' },
      snapshot: { body: 'draft2', status: 'pending', content_type: 'mission_submission' },
    });
    db.state.subs[0].submission_content = 'draft2';
    db.state.subs[0].status = 'pending';
    db.state.subs[0].returned_reason = null;
    return { ok: true };
  }
);

// Teacher B cannot return Teacher A mission
{
  const db = makeDb({
    missions: [{ id: 'm1', title: 'Write', teacher_id: 't_carter' }],
    subs: [{ id: 's1', mission_id: 'm1', character_name: 'Lucas', status: 'pending' }],
  });
  const r = await performReviewAction(db, TEACHER_B, { action: 'return', item_type: 'mission_submission', item_id: 's1', note: 'nope' });
  assert(r.ok === false && r.code === 403, 'FERPA: teacher B cannot return teacher A mission');
}

// ---------------------------------------------------------------------------
// Feed return / resubmit through handleFeedRoutes
// ---------------------------------------------------------------------------
{
  const db = makeDb({
    feed: [{ id: 'f1', title: 'Post', body: 'hello', status: 'submitted', author_display_name: 'Lucas', author_id: 'lucas' }],
  });
  const env = { DB: db };
  const feedDeps = {
    async getPilotAccountFromRequest() {
      return TEACHER;
    },
    pilotEconomyCharacterName() {
      return '';
    },
    pilotAccountRequiresChangePassword() {
      return false;
    },
  };
  const ret = await handleFeedRoutes(
    new Request('https://x.test/api/feed/return', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'f1', private_feedback: 'Tighten the lede' }),
    }),
    new URL('https://x.test/api/feed/return'),
    '/api/feed/return',
    env,
    {},
    feedDeps
  );
  const retBody = await ret.json();
  assert(ret.ok && retBody.status === 'returned' && db.state.feed[0].status === 'returned', 'feed return => returned', retBody);
  assert(db.state.events.some((e) => e.event_type === 'returned' && e.note === 'Tighten the lede'), 'feed returned event stored');

  const studentDeps = {
    async getPilotAccountFromRequest() {
      return STUDENT;
    },
    pilotEconomyCharacterName(a) {
      return a.student_character_name;
    },
    pilotAccountRequiresChangePassword() {
      return false;
    },
  };
  const sub = await handleFeedRoutes(
    new Request('https://x.test/api/feed/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'f1' }),
    }),
    new URL('https://x.test/api/feed/submit'),
    '/api/feed/submit',
    env,
    {},
    studentDeps
  );
  const subBody = await sub.json();
  assert(sub.ok && subBody.status === 'submitted' && db.state.feed[0].status === 'submitted', 'feed resubmit => submitted');
  assert(db.state.events.some((e) => e.event_type === 'resubmitted'), 'feed resubmitted event stored');
}

// Reject remains reject
{
  const db = makeDb({
    feed: [{ id: 'f2', title: 'Nope', body: 'x', status: 'submitted', author_display_name: 'Lucas', author_id: 'lucas' }],
  });
  const rej = await performReviewAction(db, TEACHER, { action: 'reject', item_type: 'feed_item', item_id: 'f2', note: 'Not appropriate' });
  assert(rej.ok && db.state.feed[0].status === 'rejected', 'reject stays rejected, not returned');
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------
{
  const db = makeDb({
    news: [{ id: 'n-live', title: 'Live', body: 'ok', status: 'approved', author_name: 'Lucas', hidden_at: null, hidden_by: null }],
  });
  const q = await quarantineReportedContent(db, 'news', 'n-live', 'report:mia', 't1');
  assert(q.ok && db.state.news[0].hidden_at === 't1', 'report quarantines approved news');
  assert(db.state.news[0].status === 'approved', 'report does not change news status');
}

{
  const db = makeDb({
    news: [
      {
        id: 'n-live',
        title: 'Live',
        body: 'ok',
        status: 'approved',
        author_name: 'Lucas',
        hidden_at: 't1',
        hidden_by: 'report:mia',
      },
    ],
    flags: [
      { id: 'flag-1', item_type: 'news', item_id: 'n-live', reported_by: 'Mia', reason: 'mean', created_at: 't1', resolved_at: null },
      { id: 'flag-2', item_type: 'news', item_id: 'n-live', reported_by: 'Sam', reason: 'spam', created_at: 't2', resolved_at: null },
    ],
  });
  const dismissed = await performReviewAction(db, TEACHER, { action: 'report_dismiss', item_type: 'news', item_id: 'n-live', note: 'ok' });
  assert(dismissed.ok && dismissed.resolution === 'dismissed', 'teacher can dismiss report quarantine');
  assert(!db.state.news[0].hidden_at && !db.state.news[0].hidden_by, 'dismiss restores news');
  assert(db.state.flags.every((f) => f.resolution === 'dismissed' && f.resolved_at), 'all open flags resolved dismissed');
  assert(db.state.events.some((e) => e.event_type === 'report_dismissed'), 'report_dismissed event');
}

{
  const db = makeDb({
    news: [
      {
        id: 'n-live',
        title: 'Live',
        body: 'ok',
        status: 'approved',
        author_name: 'Lucas',
        hidden_at: 't1',
        hidden_by: 'report:mia',
      },
    ],
    flags: [{ id: 'flag-1', item_type: 'news', item_id: 'n-live', reported_by: 'Mia', reason: 'mean', created_at: 't1' }],
  });
  const blank = await performReviewAction(db, TEACHER, { action: 'report_return', item_type: 'news', item_id: 'n-live', note: '   ' });
  assert(blank.ok === false && blank.error === 'feedback_required', 'report_return requires feedback');
  const ret = await performReviewAction(db, TEACHER, { action: 'report_return', item_type: 'news', item_id: 'n-live', note: 'Please rewrite kindly' });
  assert(ret.ok && db.state.news[0].status === 'returned', 'report_return sets returned');
  assert(db.state.news[0].hidden_by === 'report:mia', 'report_return keeps hidden from Explore');
  assert(db.state.flags[0].resolution === 'returned', 'flag resolved returned');
  assert(
    db.state.events.some((e) => e.event_type === 'returned') && db.state.events.some((e) => e.event_type === 'report_returned'),
    'returned + report_returned events'
  );
}

{
  const db = makeDb({
    news: [
      {
        id: 'n-admin-hide',
        title: 'X',
        body: 'y',
        status: 'approved',
        hidden_at: 't',
        hidden_by: 'admin',
      },
    ],
    flags: [{ id: 'f', item_type: 'news', item_id: 'n-admin-hide', reported_by: 'Mia', reason: 'x', created_at: 't' }],
  });
  const r = await performReviewAction(db, TEACHER, { action: 'report_dismiss', item_type: 'news', item_id: 'n-admin-hide' });
  assert(r.ok === false && r.error === 'not_report_quarantine', 'teacher cannot restore admin hide via report dismiss');
}

{
  const db = makeDb({
    news: [{ id: 'n1', title: 'X', body: 'y', status: 'approved', hidden_at: 't', hidden_by: 'report:mia' }],
    flags: [{ id: 'f', item_type: 'news', item_id: 'n1', reported_by: 'Mia', reason: 'x', created_at: 't' }],
  });
  const teacherRm = await performReviewAction(db, TEACHER, { action: 'report_remove', item_type: 'news', item_id: 'n1', resolution: 'removed' });
  assert(teacherRm.ok && teacherRm.resolution === 'hidden', 'teacher report_remove is keep-hidden, not admin removed');
  assert(db.state.news[0].hidden_by === 'report:mia', 'remove keeps quarantine');
}

{
  const restored = await restoreReportCreatedHide(
    makeDb({ news: [{ id: 'n1', hidden_at: 't', hidden_by: 'report:u' }] }),
    'news',
    'n1'
  );
  assert(restored.ok && restored.restored, 'restore helper clears report hide');
}

const newsHideIdx = indexSrc.lastIndexOf("path === '/api/news/hide'");
assert(newsHideIdx >= 0 && /requireAdminPilotSession/.test(indexSrc.slice(newsHideIdx, newsHideIdx + 500)), 'news hide remains admin-only');

// ---------------------------------------------------------------------------
// Unified queue + counts
// ---------------------------------------------------------------------------
{
  const db = makeDb({
    news: [
      { id: 'n-pend', title: 'Pending news', body: 'p', status: 'pending', author_name: 'Lucas' },
      { id: 'n-ret', title: 'Mine returned', body: 'r', status: 'returned', author_name: 'Lucas', actor_id: 'lucas' },
      { id: 'n-other', title: 'Other returned', body: 'o', status: 'returned', author_name: 'Mia', actor_id: 'mia' },
    ],
    contrib: [{ id: 'pc-ret', question: 'Q', status: 'returned', character_name: 'Lucas' }],
    missions: [
      { id: 'm1', title: 'Write', teacher_id: 't_carter' },
      { id: 'm2', title: 'Other class', teacher_id: 't_lee' },
    ],
    subs: [
      { id: 's-pend', mission_id: 'm1', character_name: 'Lucas', status: 'pending', created_at: '1' },
      { id: 's-other', mission_id: 'm2', character_name: 'Mia', status: 'pending', created_at: '2' },
      { id: 's-ret', mission_id: 'm1', character_name: 'Lucas', status: 'returned' },
    ],
    feed: [
      { id: 'f-sub', title: 'Feed', status: 'submitted', author_display_name: 'Lucas', author_id: 'lucas' },
      { id: 'f-ret', title: 'Feed ret', status: 'returned', author_display_name: 'Lucas', author_id: 'lucas' },
    ],
    approvals: [
      { id: 'ap1', item_type: 'news', item_id: 'n-pend', status: 'pending', submitted_by_actor_name: 'Lucas', created_at: '3' },
    ],
    flags: [
      { id: 'fl1', item_type: 'news', item_id: 'n-rep', reported_by: 'Mia', reason: 'rude', created_at: '4' },
      { id: 'fl2', item_type: 'news', item_id: 'n-rep', reported_by: 'Sam', reason: 'spam', created_at: '5' },
    ],
    events: [
      { id: 'e1', item_type: 'news', item_id: 'n-pend', event_type: 'returned', created_at: '0' },
      { id: 'e2', item_type: 'news', item_id: 'n-pend', event_type: 'resubmitted', created_at: '1' },
    ],
  });
  db.state.news.push({
    id: 'n-rep',
    title: 'Reported',
    body: 'z',
    status: 'approved',
    author_name: 'Lucas',
    hidden_at: 't',
    hidden_by: 'report:mia',
  });

  const teacherQueue = await buildReviewQueue(db, TEACHER, { includeDetails: true });
  const keys = teacherQueue.map((c) => c.queue_key);
  assert(keys.indexOf('mission_submission:s-pend') >= 0, 'teacher sees own pending mission');
  assert(keys.indexOf('mission_submission:s-other') < 0, 'teacher does not see other teacher mission');
  assert(keys.indexOf('news:n-pend') >= 0, 'pending news in queue');
  assert(teacherQueue.find((c) => c.item_id === 'n-pend').queue_state === 'RESUBMITTED', 'resubmitted presentation state');
  const reported = teacherQueue.find((c) => c.item_id === 'n-rep');
  assert(reported && reported.queue_state === 'REPORTED' && reported.report_count === 2, 'deduped reports, count=2', reported);
  assert(reported.reasons.indexOf('rude') >= 0 && !reported.reporters, 'teacher sees reasons, not reporters');
  assert(keys.indexOf('feed_item:f-sub') >= 0, 'submitted feed in pending review');

  const adminQueue = await buildReviewQueue(db, ADMIN, { includeDetails: true });
  assert(adminQueue.find((c) => c.item_id === 's-other'), 'admin sees other teacher pending mission');
  const adminReported = adminQueue.find((c) => c.item_id === 'n-rep');
  assert(adminReported && adminReported.reporters && adminReported.reporters.indexOf('Mia') >= 0, 'admin sees reporter identity');

  const staffCount = await countStaffReviewItems(db, TEACHER);
  assert(staffCount === teacherQueue.length, 'staff count == distinct queue items', { staffCount, q: teacherQueue.length });

  const studentCount = await countStudentRevisions(db, STUDENT, depsFor(STUDENT));
  assert(studentCount === 4, 'student revision count is own returned only (news+poll+mission+feed)', studentCount);
  const otherCount = await countStudentRevisions(db, STUDENT_B, depsFor(STUDENT_B));
  assert(otherCount === 1, 'other student only counts own returned news', otherCount);

  const env = { DB: db };
  const teacherCounts = await (await reqRoute('/api/action-counts', TEACHER, env)).json();
  assert(teacherCounts.staff_review_count === staffCount && teacherCounts.student_revision_count == null, 'teacher counts endpoint shape');
  const studentCounts = await (await reqRoute('/api/action-counts', STUDENT, env)).json();
  assert(studentCounts.student_revision_count === 4 && studentCounts.staff_review_count == null, 'student counts endpoint shape');
  const staffRoleCounts = await (await reqRoute('/api/action-counts', STAFF, env)).json();
  assert(staffRoleCounts.staff_review_count == null && staffRoleCounts.ok, 'plain staff gets no staff review count');

  const staffQueueHttp = await (await reqRoute('/api/review/queue', STAFF, env)).json();
  assert(staffQueueHttp.ok === false || staffQueueHttp.error === 'forbidden', 'plain staff cannot read review queue');

  const teacherQueueHttp = await (await reqRoute('/api/review/queue', TEACHER, env)).json();
  assert(teacherQueueHttp.ok && teacherQueueHttp.count === staffCount, 'queue HTTP count matches helper');
}

// ---------------------------------------------------------------------------
// Unified action blank return + legacy documented
// ---------------------------------------------------------------------------
{
  const db = makeDb({
    news: [{ id: 'n1', title: 't', body: 'b', status: 'pending', author_name: 'Lucas' }],
    approvals: [{ id: 'a1', item_type: 'news', item_id: 'n1', status: 'pending' }],
  });
  const blank = await performReviewAction(db, TEACHER, { action: 'return', item_type: 'news', item_id: 'n1', note: '' });
  assert(blank.error === 'feedback_required', 'unified return rejects blank note');
}

// ---------------------------------------------------------------------------
// History API privacy
// ---------------------------------------------------------------------------
{
  const db = makeDb({
    news: [{ id: 'n1', title: 't', body: 'b', status: 'returned', author_name: 'Lucas', actor_id: 'lucas' }],
    events: [
      { id: 'e1', item_type: 'news', item_id: 'n1', event_type: 'returned', note: 'fix this', actor_label: 'Ms. Carter', actor_role: 'teacher', created_at: '1', snapshot_json: '{"title":"t"}' },
      { id: 'e2', item_type: 'news', item_id: 'n1', event_type: 'reported', note: 'mean', actor_key: 'mia', created_at: '0' },
    ],
  });
  const env = { DB: db };
  const studentHist = await (await reqRoute('/api/moderation/history', STUDENT, env, 'GET', null, '?item_type=news&item_id=n1')).json();
  assert(studentHist.ok && studentHist.latest_return && studentHist.latest_return.note === 'fix this', 'student sees latest return');
  assert(studentHist.events.every((e) => e.event_type !== 'reported'), 'student history hides reported events');
  const miaHist = await reqRoute('/api/moderation/history', STUDENT_B, env, 'GET', null, '?item_type=news&item_id=n1');
  const miaBody = await miaHist.json();
  assert(miaHist.status === 403, 'peer cannot read another student history');
  const teacherHist = await (await reqRoute('/api/moderation/history', TEACHER, env, 'GET', null, '?item_type=news&item_id=n1')).json();
  assert(teacherHist.ok && teacherHist.events.some((e) => e.event_type === 'reported'), 'teacher history includes report events');
}

assert(stripFlaggedReporter({ reported_by: 'Mia', reason: 'x' }, false).reported_by == null, 'teacher flag payload strips reporter');
assert(stripFlaggedReporter({ reported_by: 'Mia', reason: 'x' }, true).reported_by === 'Mia', 'admin flag payload keeps reporter');
assert(
  redactEventsForStudent([{ event_type: 'reported' }, { event_type: 'returned', note: 'n' }]).length === 1,
  'student redaction drops report events'
);

// Schema missing on queue
{
  const db = makeDb({}, { schema: false });
  let threw = null;
  try {
    await buildReviewQueue(db, TEACHER, { includeDetails: false });
  } catch (e) {
    threw = e;
  }
  assert(threw && isModerationSchemaError(threw), 'queue fails closed without flags/events schema');
}

console.log('\nmoderation-foundation-251a-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
