/**
 * Prompt #260 — stuck Poll review queue items (stale approvals + linked poll flags).
 * Usage: node worker/scripts/stuck-poll-review-260-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildReviewQueue,
  countStaffReviewItems,
  isActionablePendingApproval,
  performReviewAction,
  pollModerationIdentityAliases,
  resolveOpenFlags,
} from '../moderation-review.js';
import { actorFromAccount } from '../moderation-events.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TEACHER = { username: 'mr_radle', role: 'teacher', teacher_id: 'mr_radle' };
const POLL_ID = 'poll_who_would_win';
const CONTRIB_GWEN = 'pcontrib_gwen_art';
const CONTRIB_REPORTED = 'pcontrib_who_would_win';

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

function makeDb(seed) {
  const state = {
    contrib: [],
    polls: [],
    approvals: [],
    flags: [],
    events: [],
    news: [],
    subs: [],
    missions: [],
    feed: [],
  };
  Object.assign(state, seed || {});

  function byId(list, id) {
    return list.find((r) => String(r.id) === String(id)) || null;
  }
  function rowsOf(sql) {
    if (sql.includes('lantern_poll_contributions')) return state.contrib;
    if (sql.includes('lantern_polls')) return state.polls;
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
          binds.length = 0;
          binds.push(...args);
          return api;
        },
        async first() {
          if (s.includes('COUNT(*)')) return { c: 0 };
          if (s.includes('mission_submission_id = ?')) {
            return state.polls.find((p) => String(p.mission_submission_id) === String(binds[0])) || null;
          }
          if (s.includes('lantern_moderation_events') && s.includes('event_type IN')) {
            const pollId = binds[0];
            const contribId = binds[1];
            const hit = state.events.filter(
              (e) =>
                (e.item_type === 'poll' || e.item_type === 'poll_contribution') &&
                (e.item_id === pollId || e.item_id === contribId) &&
                ['report_removed', 'report_dismissed', 'report_returned'].includes(e.event_type)
            );
            return hit.length ? hit[hit.length - 1] : null;
          }
          if (s.includes('WHERE id = ?') || s.includes('WHERE id=?')) return byId(rowsOf(s), binds[0]);
          if (s.includes('item_type = ? AND item_id = ?')) {
            return state.approvals.find((a) => a.item_type === binds[0] && String(a.item_id) === String(binds[1])) || null;
          }
          return null;
        },
        async all() {
          if (s.includes('lantern_content_flags') && s.includes('resolved_at IS NULL')) {
            return { results: state.flags.filter((f) => !f.resolved_at) };
          }
          if (s.includes('lantern_moderation_events') && s.includes('event_type IN')) {
            const pollId = binds[0];
            const contribId = binds[1];
            const hit = state.events.filter(
              (e) =>
                (e.item_type === 'poll' || e.item_type === 'poll_contribution') &&
                (e.item_id === pollId || e.item_id === contribId) &&
                ['report_removed', 'report_dismissed', 'report_returned'].includes(e.event_type)
            );
            return { results: hit.length ? [hit[hit.length - 1]] : [] };
          }
          if (s.includes('lantern_approvals') && s.includes("'pending'")) {
            return { results: state.approvals.filter((a) => String(a.status).toLowerCase() === 'pending') };
          }
          if (s.includes('lantern_moderation_events') && s.includes('item_id IN')) {
            const type = binds[0];
            const ids = binds.slice(1);
            return { results: state.events.filter((e) => e.item_type === type && ids.includes(e.item_id)) };
          }
          return { results: rowsOf(s) };
        },
        async run() {
          if (s.includes('INSERT INTO lantern_moderation_events')) {
            state.events.push({
              item_type: binds[1],
              item_id: binds[2],
              event_type: binds[3],
            });
            return { success: true };
          }
          if (s.includes('UPDATE lantern_content_flags SET resolved_at')) {
            state.flags.forEach((f) => {
              if (String(f.item_id) === String(binds[4]) && f.item_type === binds[5] && !f.resolved_at) {
                f.resolved_at = binds[0];
                f.resolution = binds[2];
              }
            });
            return { success: true };
          }
          if (s.includes('UPDATE lantern_poll_contributions')) {
            const row = byId(state.contrib, binds[binds.length - 1]);
            if (row) row.status = binds[0];
            return { success: true };
          }
          if (s.includes('UPDATE lantern_polls')) {
            const row = byId(state.polls, binds[binds.length - 1]);
            if (row && s.includes('hidden_at = ?')) {
              row.hidden_at = binds[0];
              row.hidden_by = binds[1];
            } else if (row && s.includes('hidden_at = NULL')) {
              row.hidden_at = null;
              row.hidden_by = null;
            }
            return { success: true };
          }
          if (s.includes('UPDATE lantern_approvals SET status = ?')) {
            state.approvals.forEach((a) => {
              if (
                a.item_type === binds[5] &&
                String(a.item_id) === String(binds[6]) &&
                String(a.status).toLowerCase() === String(binds[7]).toLowerCase()
              ) {
                a.status = binds[0];
              }
            });
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
assert(reviewSrc.includes('isActionablePendingApproval'), 'actionable pending approval gate');
assert(reviewSrc.includes('pollModerationIdentityAliases'), 'poll identity aliases');

// Pending Poll: stale approval row after contribution already approved (Gwen Stacy scenario)
{
  const db = makeDb({
    contrib: [
      {
        id: CONTRIB_GWEN,
        question: 'Do you like my Gwen Stacy art??',
        character_name: 'Zane',
        status: 'approved',
      },
    ],
    approvals: [
      {
        id: 'appr_stale_gwen',
        item_type: 'poll_contribution',
        item_id: CONTRIB_GWEN,
        status: 'pending',
        submitted_by_actor_name: 'Zane',
        created_at: 't1',
      },
    ],
  });
  assert(!(await isActionablePendingApproval(db, db.state.approvals[0])), 'stale Gwen approval not actionable');
  const queue = await buildReviewQueue(db, TEACHER, { includeDetails: false });
  assert(queue.length === 0, 'stale Gwen poll absent from queue', queue);
  assert((await countStaffReviewItems(db, TEACHER)) === 0, 'stale Gwen count zero');
}

// Pending Poll: fresh pending appears and clears on approve
{
  const db = makeDb({
    contrib: [{ id: 'pc_pend', question: 'Lunch?', character_name: 'Lucas', status: 'pending' }],
    approvals: [
      {
        id: 'appr_pend',
        item_type: 'poll_contribution',
        item_id: 'pc_pend',
        status: 'pending',
        submitted_by_actor_name: 'Lucas',
        created_at: 't1',
      },
    ],
  });
  assert((await buildReviewQueue(db, TEACHER, { includeDetails: false })).length === 1, 'pending poll appears once');
  const approved = await performReviewAction(db, TEACHER, {
    action: 'approve',
    item_type: 'poll_contribution',
    item_id: 'pc_pend',
    now: 't2',
  }, { finalizePollContributionPublish: async () => ({ ok: true, pollId: 'poll_new' }) });
  assert(approved.ok, 'pending poll approve', approved);
  db.state.contrib[0].status = 'approved';
  assert((await buildReviewQueue(db, TEACHER, { includeDetails: false })).length === 0, 'pending poll gone after approve');
}

// Pending Poll: return clears queue
{
  const db = makeDb({
    contrib: [{ id: 'pc_ret', question: 'Fix art', character_name: 'Lucas', status: 'pending' }],
    approvals: [
      {
        id: 'appr_ret',
        item_type: 'poll_contribution',
        item_id: 'pc_ret',
        status: 'pending',
        submitted_by_actor_name: 'Lucas',
        created_at: 't1',
      },
    ],
  });
  const ret = await performReviewAction(db, TEACHER, {
    action: 'return',
    item_type: 'poll_contribution',
    item_id: 'pc_ret',
    note: 'Use a school-safe image.',
    now: 't2',
  });
  assert(ret.ok, 'pending poll return', ret);
  db.state.contrib[0].status = 'returned';
  db.state.approvals[0].status = 'returned';
  assert((await buildReviewQueue(db, TEACHER, { includeDetails: false })).length === 0, 'returned poll leaves queue');
}

// Reported Poll: flags on contribution id aggregate + resolve via live poll action
{
  const db = makeDb({
    polls: [
      {
        id: POLL_ID,
        question: 'who would win',
        character_name: 'Lucas',
        mission_submission_id: 'contrib:' + CONTRIB_REPORTED,
        hidden_at: 't0',
        hidden_by: 'report:student',
      },
    ],
    contrib: [{ id: CONTRIB_REPORTED, question: 'who would win', character_name: 'Lucas', status: 'approved' }],
    flags: [
      { id: 'f_poll', item_type: 'poll', item_id: POLL_ID, reported_by: 'Mia', reason: 'spam', created_at: 't1' },
      {
        id: 'f_contrib',
        item_type: 'poll_contribution',
        item_id: CONTRIB_REPORTED,
        reported_by: 'Sam',
        reason: 'other',
        created_at: 't2',
      },
    ],
  });
  const queue = await buildReviewQueue(db, TEACHER, { includeDetails: true });
  assert(queue.length === 1, 'linked poll flags = one card', queue.length);
  assert(queue[0].item_type === 'poll' && queue[0].item_id === POLL_ID, 'card uses live poll id');
  assert(queue[0].report_count === 2, 'both flags aggregate', queue[0].report_count);

  const keep = await performReviewAction(db, TEACHER, {
    action: 'report_remove',
    item_type: 'poll',
    item_id: POLL_ID,
    now: 't3',
  });
  assert(keep.ok, 'Keep Hidden on live poll', keep);
  assert(db.state.flags.every((f) => f.resolved_at), 'all linked flags resolved', db.state.flags);
  assert((await countStaffReviewItems(db, TEACHER)) === 0, 'reported poll count zero after keep hidden');
}

// resolveOpenFlags cross-resolves contribution-scoped flags when acting on poll id
{
  const db = makeDb({
    polls: [{ id: POLL_ID, mission_submission_id: 'contrib:' + CONTRIB_REPORTED }],
    flags: [{ id: 'fc', item_type: 'poll_contribution', item_id: CONTRIB_REPORTED, reason: 'x' }],
  });
  await resolveOpenFlags(db, 'poll', POLL_ID, 'hidden', actorFromAccount(TEACHER), '', 't4');
  assert(db.state.flags[0].resolved_at && db.state.flags[0].resolution === 'hidden', 'contrib flag resolved via poll id');
}

// Reject closes pending approval rows
{
  const db = makeDb({
    contrib: [{ id: 'pc_rej', question: 'Nope', character_name: 'Lucas', status: 'pending' }],
    approvals: [
      { id: 'a1', item_type: 'poll_contribution', item_id: 'pc_rej', status: 'pending', created_at: 't1' },
      { id: 'a2', item_type: 'poll_contribution', item_id: 'pc_rej', status: 'pending', created_at: 't2' },
    ],
  });
  await performReviewAction(db, TEACHER, {
    action: 'reject',
    item_type: 'poll_contribution',
    item_id: 'pc_rej',
    note: 'Not appropriate',
    now: 't3',
  });
  assert(db.state.approvals.every((a) => a.status === 'rejected'), 'reject closes all pending approvals');
}

const aliases = await pollModerationIdentityAliases(
  makeDb({
    polls: [{ id: POLL_ID, mission_submission_id: 'contrib:' + CONTRIB_REPORTED }],
  }),
  'poll',
  POLL_ID
);
assert(aliases.length === 2 && aliases.some((a) => a.item_type === 'poll_contribution'), 'poll aliases include contribution');

// Orphan contrib flag after staff already resolved linked live poll (production who would win)
{
  const db = makeDb({
    polls: [
      {
        id: POLL_ID,
        question: 'who would win',
        character_name: 'Lucas',
        mission_submission_id: 'contrib:' + CONTRIB_REPORTED,
        hidden_at: 't0',
        hidden_by: 'report:staff',
      },
    ],
    contrib: [{ id: CONTRIB_REPORTED, question: 'who would win', character_name: 'Lucas', status: 'approved' }],
    flags: [
      {
        id: 'f_orphan',
        item_type: 'poll_contribution',
        item_id: CONTRIB_REPORTED,
        reported_by: 'Sam',
        reason: 'other',
        created_at: 't2',
      },
    ],
    events: [{ item_type: 'poll', item_id: POLL_ID, event_type: 'report_removed', created_at: 't3' }],
  });
  assert((await buildReviewQueue(db, TEACHER, { includeDetails: false })).length === 0, 'orphan contrib flag honored after staff resolution');
}

console.log('\nstuck-poll-review-260-test:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
