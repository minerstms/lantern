/**
 * Prompt #251C — reported content resolution / staff moderation corrective.
 *
 * Usage: node worker/scripts/moderation-report-control-251c-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildReviewQueue,
  countStaffReviewItems,
  countStudentRevisions,
  flagCanonicalType,
  performReviewAction,
  queueItemKey,
} from '../moderation-review.js';
import { resolvePollContributionIdFromLivePoll } from '../poll-publish.js';
import { isTeacherLike } from '../missions-auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '../..');

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
const ADMIN = { username: 'admin', display_name: 'Web Admin', role: 'admin' };
const STUDENT = { username: 'lucas', display_name: 'Lucas', role: 'student', student_character_name: 'Lucas R.' };
const STAFF = { username: 'aide', display_name: 'Aide', role: 'staff' };

function makeDb(seed) {
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

  function byId(list, id) {
    return list.find((r) => String(r.id) === String(id)) || null;
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
    return [];
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
          if (s.includes('COUNT(*)')) {
            if (s.includes('lantern_poll_contributions')) {
              const n = state.contrib.filter(
                (r) => String(r.status).toLowerCase() === 'returned' && binds.indexOf(r.character_name) >= 0
              ).length;
              return { c: n };
            }
            return { c: 0 };
          }
          const list = rowsOf(s);
          if (s.includes('WHERE id = ?') || s.includes('WHERE id=?')) return byId(list, binds[0]);
          if (s.includes('mission_submission_id = ?')) {
            return list.find((r) => String(r.mission_submission_id) === String(binds[0])) || null;
          }
          if (s.includes('item_type = ? AND item_id = ?')) {
            return list.find((r) => r.item_type === binds[0] && String(r.item_id) === String(binds[1])) || null;
          }
          return list[0] || null;
        },
        async all() {
          let list = rowsOf(s).slice();
          if (s.includes('resolved_at IS NULL') || s.includes("resolved_at = ''")) {
            list = state.flags.filter((r) => !r.resolved_at);
          }
          if (s.includes("status)) = 'pending'")) {
            list = state.approvals.filter((r) => String(r.status).toLowerCase() === 'pending');
          }
          if (s.includes('lantern_moderation_events') && s.includes('item_id IN')) {
            const type = binds[0];
            const ids = binds.slice(1);
            list = state.events.filter((e) => e.item_type === type && ids.indexOf(e.item_id) >= 0);
          }
          return { results: list };
        },
        async run() {
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
            if (row && s.includes('hidden_at = ?')) {
              row.hidden_at = binds[0];
              row.hidden_by = binds[1];
            } else if (row && s.includes('NULL')) {
              row.hidden_at = null;
              row.hidden_by = null;
            }
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

const reviewSrc = fs.readFileSync(path.join(root, 'worker/moderation-review.js'), 'utf8');
const teacherHtml = fs.readFileSync(path.join(root, 'app/teacher.html'), 'utf8');
const reviewQueueJs = fs.readFileSync(path.join(root, 'app/js/lantern-review-queue.js'), 'utf8');
const modListJs = fs.readFileSync(path.join(root, 'app/js/lantern-moderation-list.js'), 'utf8');

assert(/flagCanonicalType/.test(reviewSrc) && !/item_type: canonicalItemType\(partial\.item_type\)/.test(reviewSrc), 'queue preserves live poll item_type');
assert(flagCanonicalType('poll') === 'poll' && flagCanonicalType('poll_contribution') === 'poll_contribution', 'flagCanonicalType distinguishes poll vs contribution');
assert(queueItemKey('poll', 'poll_1') === 'poll:poll_1', 'queue key uses poll not poll_contribution');

const POLL_ID = 'poll_1787340945479_ps5j';
const CONTRIB_ID = 'pcontrib_abc';

{
  const db = makeDb({
    polls: [
      {
        id: POLL_ID,
        question: 'Favorite lunch?',
        character_name: 'Lucas R.',
        created_by_character: 'Lucas R.',
        choices_json: '["Pizza","Salad"]',
        mission_submission_id: 'contrib:' + CONTRIB_ID,
        hidden_at: 't1',
        hidden_by: 'report:mia',
        approved_at: 't0',
      },
    ],
    contrib: [{ id: CONTRIB_ID, question: 'Favorite lunch?', character_name: 'Lucas R.', status: 'approved', choices_json: '["Pizza","Salad"]' }],
    flags: [
      { id: 'f1', item_type: 'poll', item_id: POLL_ID, reported_by: 'Mia', reason: 'offensive', created_at: 't1' },
      { id: 'f2', item_type: 'poll', item_id: POLL_ID, reported_by: 'Sam', reason: 'spam', created_at: 't2' },
      { id: 'f3', item_type: 'poll', item_id: POLL_ID, reported_by: 'Jo', reason: 'other', created_at: 't3' },
      { id: 'f4', item_type: 'poll', item_id: POLL_ID, reported_by: 'Pat', reason: 'other2', created_at: 't4' },
    ],
  });

  const queue = await buildReviewQueue(db, TEACHER, { includeDetails: true });
  assert(queue.length === 1, 'four flags on one poll = one queue item', queue.length);
  const card = queue[0];
  assert(card.item_type === 'poll' && card.item_id === POLL_ID, 'reported live poll stays item_type poll');
  assert(card.report_count === 4, 'report_count aggregates flags', card.report_count);
  assert(card.title === 'Favorite lunch?' && card.submitter === 'Lucas R.', 'poll hydration title + student');
  assert(await countStaffReviewItems(db, TEACHER) === 1, 'staff count is distinct items not raw flags');

  const keep = await performReviewAction(db, TEACHER, { action: 'report_remove', item_type: 'poll', item_id: POLL_ID });
  assert(keep.ok && keep.resolution === 'hidden', 'Keep Hidden resolves reported poll');
  assert(db.state.flags.every((f) => f.resolution === 'hidden' && f.resolved_at), 'all four flags resolved');
  assert(db.state.polls[0].hidden_at && db.state.polls[0].hidden_by, 'poll remains hidden');
  assert((await countStaffReviewItems(db, TEACHER)) === 0, 'count decrements after Keep Hidden');

  const again = await performReviewAction(db, TEACHER, { action: 'report_remove', item_type: 'poll', item_id: POLL_ID });
  assert(again.ok === false && again.error === 'already_resolved', 'double resolution blocked');
}

{
  const db = makeDb({
    polls: [
      {
        id: POLL_ID,
        question: 'Best subject?',
        character_name: 'Lucas R.',
        mission_submission_id: 'contrib:' + CONTRIB_ID,
        hidden_at: 't1',
        hidden_by: 'report:mia',
      },
    ],
    contrib: [{ id: CONTRIB_ID, question: 'Best subject?', character_name: 'Lucas R.', status: 'approved' }],
    flags: [{ id: 'f1', item_type: 'poll', item_id: POLL_ID, reported_by: 'Mia', reason: 'x', created_at: 't1' }],
  });
  const restore = await performReviewAction(db, TEACHER, { action: 'report_dismiss', item_type: 'poll', item_id: POLL_ID, note: 'fine' });
  assert(restore.ok && restore.resolution === 'dismissed', 'Restore dismisses reported poll');
  assert(!db.state.polls[0].hidden_at, 'report quarantine cleared on restore');
  assert(db.state.flags[0].resolution === 'dismissed', 'flag resolved dismissed');
  assert((await countStaffReviewItems(db, TEACHER)) === 0, 'queue empty after restore');
}

{
  const db = makeDb({
    polls: [
      {
        id: POLL_ID,
        question: 'Pick one',
        character_name: 'Lucas R.',
        mission_submission_id: 'contrib:' + CONTRIB_ID,
        hidden_at: 't1',
        hidden_by: 'report:mia',
      },
    ],
    contrib: [{ id: CONTRIB_ID, question: 'Pick one', character_name: 'Lucas R.', status: 'approved' }],
    flags: [{ id: 'f1', item_type: 'poll', item_id: POLL_ID, reported_by: 'Mia', reason: 'x', created_at: 't1' }],
  });
  const blank = await performReviewAction(db, TEACHER, { action: 'report_return', item_type: 'poll', item_id: POLL_ID, note: '  ' });
  assert(blank.ok === false && blank.error === 'feedback_required', 'Return requires feedback');
  const ret = await performReviewAction(db, TEACHER, { action: 'report_return', item_type: 'poll', item_id: POLL_ID, note: 'Choose a different picture.' });
  assert(ret.ok && ret.resolution === 'returned', 'published poll report_return ok');
  assert(db.state.contrib[0].status === 'returned' && db.state.contrib[0].decision_note === 'Choose a different picture.', 'contribution returned');
  assert(db.state.flags[0].resolution === 'returned', 'flags resolved returned');
  assert(db.state.polls[0].hidden_by === 'report:mia', 'live poll stays hidden during student revision');
  assert((await countStaffReviewItems(db, TEACHER)) === 0, 'reported staff count zero after return');
  const studentCount = await countStudentRevisions(db, STUDENT, {
    pilotEconomyCharacterName(a) {
      return a.student_character_name;
    },
  });
  assert(studentCount === 1, 'student revision count increases', studentCount);
}

{
  const cid = await resolvePollContributionIdFromLivePoll(
    makeDb({
      polls: [{ id: POLL_ID, mission_submission_id: 'contrib:' + CONTRIB_ID }],
    }),
    POLL_ID
  );
  assert(cid === CONTRIB_ID, 'live poll links to contribution via mission_submission_id');
}

{
  const db = makeDb({
    polls: [{ id: POLL_ID, question: '', character_name: '', hidden_at: 't', hidden_by: 'report:x' }],
    flags: [{ id: 'f1', item_type: 'poll', item_id: POLL_ID, reported_by: 'Mia', reason: 'x', created_at: 't1' }],
  });
  const queue = await buildReviewQueue(db, TEACHER, { includeDetails: true });
  assert(queue[0].title === 'Legacy Poll', 'legacy fallback title when question missing');
  assert(queue[0].legacy_author_unavailable, 'legacy author unavailable flag');
}

assert(/item_type === 'poll'/.test(teacherHtml) && /Technical Details/.test(teacherHtml), 'teacher UI poll review + technical details');
assert(/legacy_author_unavailable/.test(reviewQueueJs), 'review queue passes legacy hydration fields');
assert(/resolved_at/.test(modListJs) && /Unresolved reported/.test(modListJs), 'moderation browse distinguishes resolved reports');

assert(!isTeacherLike(STAFF.role) || STAFF.role === 'staff', 'staff role check baseline');
{
  const db = makeDb({
    polls: [{ id: POLL_ID, hidden_at: 't', hidden_by: 'report:x' }],
    flags: [{ id: 'f1', item_type: 'poll', item_id: POLL_ID, reported_by: 'Mia', reason: 'x', created_at: 't1' }],
  });
  const denied = await performReviewAction(db, STUDENT, { action: 'report_remove', item_type: 'poll', item_id: POLL_ID });
  assert(denied.ok === false && denied.error === 'forbidden', 'student cannot resolve report');
}

console.log('\n#251C moderation-report-control:', pass, 'pass,', fail, 'fail');
process.exit(fail ? 1 : 0);
