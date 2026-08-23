/**
 * Prompt #251C1 — combined report resolution + poll media revision integration.
 *
 * Usage: node worker/scripts/moderation-report-media-251c1-test.mjs
 */
import {
  buildReviewQueue,
  countStaffReviewItems,
  performReviewAction,
} from '../moderation-review.js';
import { finalizePollContributionPublish, resolvePollContributionIdFromLivePoll } from '../poll-publish.js';
import { resolvePollContributionMedia } from '../poll-resubmit-media.js';
import { isResubmittedFromEvents } from '../moderation-events.js';

const TEACHER = { username: 'ms_carter', display_name: 'Ms. Carter', role: 'teacher', teacher_id: 't_carter' };

const IMAGE_A = 'https://x.test/api/news/image?key=news/student-a.png';
const IMAGE_B = 'https://x.test/api/news/image?key=news/student-b.png';
const POLL_ID = 'poll_live_1';
const CONTRIB_ID = 'pcontrib_1';

let pass = 0;
let fail = 0;
function ok(msg) { pass++; console.log('PASS', msg); }
function bad(msg, d) { fail++; console.error('FAIL', msg, d != null ? d : ''); }
function assert(c, msg, d) { if (c) ok(msg); else bad(msg, d); }

class MemBucket {
  constructor() { this.objects = new Map(); }
  async put(key) { this.objects.set(String(key), true); return { ok: true }; }
}

function makeDb(seed) {
  const state = {
    polls: [],
    contrib: [],
    flags: [],
    events: [],
    approvals: [],
    news: [],
    subs: [],
    missions: [],
    feed: [],
  };
  Object.assign(state, seed || {});

  function byId(list, id) {
    return list.find((r) => String(r.id) === String(id)) || null;
  }

  return {
    state,
    prepare(sql) {
      const s = String(sql);
      const binds = [];
      const api = {
        bind(...args) { binds.push(...args); return api; },
        async first() {
          if (s.includes('COUNT(*)')) return { c: 0 };
          if (s.includes('lantern_poll_contributions')) {
            if (s.includes('WHERE id = ?')) return byId(state.contrib, binds[0]);
          }
          if (s.includes('lantern_polls')) {
            if (s.includes('WHERE id = ?')) return byId(state.polls, binds[0]);
            if (s.includes('mission_submission_id = ?')) {
              return state.polls.find((p) => String(p.mission_submission_id) === String(binds[0])) || null;
            }
          }
          if (s.includes('lantern_moderation_events')) {
            if (s.includes('item_type = ? AND item_id = ?')) {
              return state.events.filter((e) => e.item_type === binds[0] && e.item_id === binds[1])[0] || null;
            }
          }
          return null;
        },
        async all() {
          if (s.includes('lantern_approvals') && s.includes('LOWER(TRIM(status))')) {
            const want = String(binds[0] || '').toLowerCase();
            return { results: state.approvals.filter((a) => String(a.status).toLowerCase() === want) };
          }
          if (s.includes('resolved_at IS NULL') || s.includes("resolved_at = ''")) {
            return { results: state.flags.filter((f) => !f.resolved_at) };
          }
          if (s.includes('lantern_moderation_events') && s.includes('item_id IN')) {
            const type = binds[0];
            const ids = binds.slice(1);
            return { results: state.events.filter((e) => e.item_type === type && ids.indexOf(e.item_id) >= 0) };
          }
          if (s.includes("status)) = 'pending'")) {
            return { results: state.approvals.filter((a) => String(a.status).toLowerCase() === 'pending') };
          }
          if (s.includes("status)) = 'pending'") && s.includes('lantern_mission_submissions')) {
            return { results: [] };
          }
          if (s.includes('lantern_feed_items') && s.includes('submitted')) return { results: [] };
          return { results: [] };
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
                f.resolution = binds[2];
              }
            });
            return { success: true };
          }
          if (s.includes('UPDATE lantern_poll_contributions')) {
            const row = byId(state.contrib, binds[binds.length - 1]);
            if (row) {
              if (s.includes('status = ?')) row.status = binds[0];
              if (s.includes('decision_note')) row.decision_note = binds[3];
              if (s.includes('image_url = ?')) row.image_url = binds[2];
              if (s.includes('fallback_key = ?')) row.fallback_key = binds[3];
            }
            return { success: true };
          }
          if (s.includes('UPDATE lantern_polls')) {
            const row = byId(state.polls, binds[binds.length - 1]);
            if (!row) return { success: true };
            if (s.includes('question = ?')) {
              row.question = binds[0];
              row.choices_json = binds[1];
              row.image_url = binds[2];
              row.character_name = binds[3];
            } else if (s.includes('hidden_at = NULL')) {
              row.hidden_at = null;
              row.hidden_by = null;
            } else if (s.includes('hidden_at = ?')) {
              row.hidden_at = binds[0];
              row.hidden_by = binds[1];
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

function seedLivePollWithImage(imageUrl) {
  return {
    polls: [
      {
        id: POLL_ID,
        question: 'Favorite lunch?',
        character_name: 'Lucas R.',
        choices_json: '["Pizza","Salad"]',
        image_url: imageUrl,
        mission_submission_id: 'contrib:' + CONTRIB_ID,
        hidden_at: 't1',
        hidden_by: 'report:mia',
        approved_at: 't0',
      },
    ],
    contrib: [
      {
        id: CONTRIB_ID,
        question: 'Favorite lunch?',
        character_name: 'Lucas R.',
        status: 'approved',
        choices_json: '["Pizza","Salad"]',
        image_url: imageUrl,
      },
    ],
    flags: [{ id: 'f1', item_type: 'poll', item_id: POLL_ID, reported_by: 'Mia', reason: 'offensive', created_at: 't1' }],
  };
}

// Report → Return → Image A hydrates for revision (#251C + #254B)
{
  const db = makeDb(seedLivePollWithImage(IMAGE_A));
  const ret = await performReviewAction(db, TEACHER, {
    action: 'report_return',
    item_type: 'poll',
    item_id: POLL_ID,
    note: 'Choose a different picture.',
    now: '2026-08-20T10:00:00.000Z',
  });
  assert(ret.ok && db.state.contrib[0].status === 'returned', 'report return sets contribution returned');
  assert(db.state.contrib[0].image_url === IMAGE_A, 'returned contribution keeps Image A for revision');
  assert(db.state.polls[0].hidden_by === 'report:mia', 'live poll stays hidden after return');
  assert(db.state.flags[0].resolution === 'returned', 'report flags resolved on return');

  const keep = await resolvePollContributionMedia({ media_action: 'keep' }, db.state.contrib[0], 'https://x.test', new MemBucket());
  assert(keep.ok && keep.imageUrl === IMAGE_A, '254B keep hydrates current Image A');
}

// Replace A→B → resubmit → approve → same live poll id with B
{
  const db = makeDb(seedLivePollWithImage(IMAGE_A));
  await performReviewAction(db, TEACHER, {
    action: 'report_return',
    item_type: 'poll',
    item_id: POLL_ID,
    note: 'Replace the image.',
    now: '2026-08-20T10:00:00.000Z',
  });
  const prior = db.state.contrib[0];
  const replaced = await resolvePollContributionMedia(
    { media_action: 'replace', image: 'data:image/png;base64,iVBORw0KGgo=', mime_type: 'image/png' },
    prior,
    'https://x.test',
    new MemBucket()
  );
  assert(replaced.ok && replaced.imageUrl && replaced.imageUrl.includes('student-b') === false, 'replace produces new delivery url');
  assert(replaced.imageUrl !== IMAGE_A, 'replace does not keep Image A url');

  prior.status = 'returned';
  prior.image_url = replaced.imageUrl;
  prior.choices_json = '["Pizza","Salad"]';
  db.state.events.push({
    id: 'ev-resub',
    item_type: 'poll_contribution',
    item_id: CONTRIB_ID,
    event_type: 'resubmitted',
    created_at: '2026-08-20T11:00:00.000Z',
  });
  db.state.approvals.push({
    id: 'ap1',
    item_type: 'poll_contribution',
    item_id: CONTRIB_ID,
    status: 'pending',
    submitted_by_actor_name: 'Lucas R.',
    created_at: 't2',
  });

  const queue = await buildReviewQueue(db, TEACHER, { includeDetails: true });
  const card = queue.find((c) => c.item_id === CONTRIB_ID);
  assert(card && card.queue_state === 'RESUBMITTED', 'staff queue shows RESUBMITTED not REPORTED');

  const pub = await finalizePollContributionPublish(db, 'https://x.test', prior, { now: 't3', reviewedBy: 'Ms. Carter' });
  assert(pub.ok && pub.pollId === POLL_ID && !pub.created, 'reapprove reuses same live poll id');
  assert(db.state.polls[0].image_url === replaced.imageUrl, 'live poll image updated to B');
  assert(db.state.polls[0].image_url !== IMAGE_A, 'Image A is not current on live poll');
}

// Return → Remove A → fallback → resubmit → approve
{
  const db = makeDb(seedLivePollWithImage(IMAGE_A));
  await performReviewAction(db, TEACHER, {
    action: 'report_return',
    item_type: 'poll',
    item_id: POLL_ID,
    note: 'Remove inappropriate image.',
    now: '2026-08-20T10:00:00.000Z',
  });
  const removed = await resolvePollContributionMedia({ media_action: 'remove' }, db.state.contrib[0], 'https://x.test', new MemBucket());
  assert(removed.ok && removed.imageUrl === null && removed.fallbackKey === 'poll', 'remove clears image uses fallback');
  db.state.contrib[0].image_url = null;
  db.state.contrib[0].fallback_key = 'poll';
  db.state.contrib[0].status = 'pending';

  const pub = await finalizePollContributionPublish(db, 'https://x.test', db.state.contrib[0], { now: 't4', reviewedBy: 'Ms. Carter' });
  assert(pub.ok && pub.pollId === POLL_ID, 'fallback resubmit reapproves same poll id');
  assert(db.state.polls[0].image_url !== IMAGE_A, 'live poll no longer uses Image A after remove+approve');
  assert(
    !db.state.polls[0].image_url || String(db.state.polls[0].image_url).includes('default_poll'),
    'live poll uses fallback art when image removed'
  );
}

// Keep Hidden must NOT return contribution
{
  const db = makeDb({
    ...seedLivePollWithImage(IMAGE_A),
    flags: [
      { id: 'f1', item_type: 'poll', item_id: POLL_ID, reported_by: 'a', reason: 'x', created_at: 't1' },
      { id: 'f2', item_type: 'poll', item_id: POLL_ID, reported_by: 'b', reason: 'y', created_at: 't2' },
      { id: 'f3', item_type: 'poll', item_id: POLL_ID, reported_by: 'c', reason: 'z', created_at: 't3' },
      { id: 'f4', item_type: 'poll', item_id: POLL_ID, reported_by: 'd', reason: 'w', created_at: 't4' },
    ],
  });
  assert((await countStaffReviewItems(db, TEACHER)) === 1, 'four reports = one actionable item');
  const hide = await performReviewAction(db, TEACHER, { action: 'report_remove', item_type: 'poll', item_id: POLL_ID });
  assert(hide.ok && db.state.contrib[0].status === 'approved', 'Keep Hidden does not return contribution');
  assert((await countStaffReviewItems(db, TEACHER)) === 0, 'actionable count decrements after Keep Hidden');
  assert(db.state.flags.every((f) => f.resolution === 'hidden'), 'all flags resolved hidden');
}

// Restore must NOT mutate contribution/media
{
  const db = makeDb(seedLivePollWithImage(IMAGE_A));
  const before = JSON.stringify(db.state.contrib[0]);
  const restore = await performReviewAction(db, TEACHER, { action: 'report_dismiss', item_type: 'poll', item_id: POLL_ID });
  assert(restore.ok && JSON.stringify(db.state.contrib[0]) === before, 'Restore does not mutate contribution');
  assert(!db.state.polls[0].hidden_at, 'Restore clears report quarantine on live poll');
  assert(db.state.contrib[0].image_url === IMAGE_A, 'Restore leaves Image A unchanged');
}

assert(
  (await resolvePollContributionIdFromLivePoll(makeDb(seedLivePollWithImage(IMAGE_A)), POLL_ID)) === CONTRIB_ID,
  'poll/contribution linkage intact after integration'
);

assert(
  isResubmittedFromEvents([
    { event_type: 'returned', created_at: '2026-08-20T10:00:00.000Z' },
    { event_type: 'resubmitted', created_at: '2026-08-20T11:00:00.000Z' },
  ]),
  'resubmitted presentation helper'
);

console.log(`\n#251C1 moderation-report-media: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
