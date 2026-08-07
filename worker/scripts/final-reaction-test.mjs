/**
 * Immutable finalized reaction API tests (mock D1).
 * Usage: node worker/scripts/final-reaction-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  handleFinalReactionRoutes,
  finalReactionPercents,
  FINAL_REACTION_TYPES,
} from '../final-reaction-handlers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;

function ok(label) {
  pass++;
  console.log('PASS', label);
}

function bad(label, detail) {
  fail++;
  console.error('FAIL', label, detail || '');
}

function jsonResponse(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', ...(cors || {}) },
  });
}

function makeDb(state) {
  state.finalRows = state.finalRows || [];
  state.approvedFeed = state.approvedFeed || new Set(['feed-item-1', 'news:abc123']);

  function prepare(sql) {
    const s = String(sql);
    const binds = [];
    const api = {
      bind(...args) {
        binds.push(...args);
        return api;
      },
      async first() {
        if (s.includes('lantern_final_reaction_responses') && s.includes('reactor_username')) {
          const [itemType, itemId, username] = binds;
          const row = state.finalRows.find(
            (r) =>
              r.item_type === itemType &&
              r.item_id === itemId &&
              String(r.reactor_username).trim().toLowerCase() === String(username).trim().toLowerCase()
          );
          return row ? { id: row.id, reaction_type: row.reaction_type, finalized_at: row.finalized_at } : null;
        }
        if (s.includes('lantern_news_submissions')) {
          const id = binds[0];
          return state.approvedFeed.has('news:' + id) ? { id, status: 'approved' } : null;
        }
        if (s.includes('lantern_mission_submissions')) return null;
        if (s.includes('lantern_feed_items')) {
          const id = binds[0];
          return state.approvedFeed.has(id) ? { id } : null;
        }
        return null;
      },
      async all() {
        if (s.includes('lantern_final_reaction_responses') && s.includes('reaction_type')) {
          const [itemType, itemId] = binds;
          return {
            results: state.finalRows
              .filter((r) => r.item_type === itemType && r.item_id === itemId)
              .map((r) => ({ reaction_type: r.reaction_type })),
          };
        }
        return { results: [] };
      },
      async run() {
        if (s.includes('INSERT INTO lantern_final_reaction_responses')) {
          const [id, itemType, itemId, reactionType, username, charSnap, finalizedAt] = binds;
          const dup = state.finalRows.some(
            (r) =>
              r.item_type === itemType &&
              r.item_id === itemId &&
              String(r.reactor_username).trim().toLowerCase() === String(username).trim().toLowerCase()
          );
          if (dup) throw new Error('UNIQUE constraint failed');
          state.finalRows.push({
            id,
            item_type: itemType,
            item_id: itemId,
            reaction_type: reactionType,
            reactor_username: username,
            reactor_character_name: charSnap,
            finalized_at: finalizedAt,
          });
        }
        return { success: true };
      },
    };
    return api;
  }

  return { prepare };
}

const studentA = {
  username: '20889',
  role: 'student',
  student_character_name: '20889',
};
const studentB = {
  username: '20999',
  role: 'student',
  student_character_name: '20999',
};
const teacher = { username: 'teacher1', role: 'teacher' };

let currentAccount = studentA;

const deps = {
  jsonResponse,
  getPilotAccountFromRequest: async () => currentAccount,
  pilotEconomyCharacterName: (a) => a.student_character_name || a.username,
  pilotAccountRequiresChangePassword: () => false,
};

const cors = {};
const state = { finalRows: [], approvedFeed: new Set(['feed-item-1']) };
const env = { DB: makeDb(state) };

async function finalize(body, asAccount) {
  currentAccount = asAccount;
  const req = new Request('https://lantern.test/api/reactions/finalize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const url = new URL(req.url);
  const res = await handleFinalReactionRoutes(req, url, '/api/reactions/finalize', env, cors, deps);
  return { status: res.status, body: await res.json() };
}

async function status(itemId, asAccount) {
  currentAccount = asAccount;
  const req = new Request(
    'https://lantern.test/api/reactions/finalized-status?item_type=feed&item_id=' + encodeURIComponent(itemId)
  );
  const url = new URL(req.url);
  const res = await handleFinalReactionRoutes(req, url, '/api/reactions/finalized-status', env, cors, deps);
  return { status: res.status, body: await res.json() };
}

// A. first finalize succeeds
const first = await finalize({ item_type: 'feed', item_id: 'feed-item-1', reaction_type: 'heart' }, studentA);
if (first.status === 200 && first.body.ok && first.body.finalized && first.body.reaction_type === 'heart') {
  ok('A first finalize succeeds');
} else bad('A first finalize', first);

// B. exact same response repeated does not create second row
const repeat = await finalize({ item_type: 'feed', item_id: 'feed-item-1', reaction_type: 'heart' }, studentA);
if (repeat.status === 409 && repeat.body.error === 'reaction_already_finalized' && state.finalRows.length === 1) {
  ok('B repeat finalize rejected, one row');
} else bad('B repeat finalize', { repeat, count: state.finalRows.length });

// C. switch heart → fire rejected
const switchAttempt = await finalize({ item_type: 'feed', item_id: 'feed-item-1', reaction_type: 'fire' }, studentA);
if (switchAttempt.status === 409 && switchAttempt.body.reaction_type === 'heart' && state.finalRows[0].reaction_type === 'heart') {
  ok('C switch reaction rejected');
} else bad('C switch reaction', switchAttempt);

// E. one account multiple items
state.approvedFeed.add('feed-item-2');
const secondItem = await finalize({ item_type: 'feed', item_id: 'feed-item-2', reaction_type: 'star' }, studentA);
if (secondItem.status === 200 && state.finalRows.filter((r) => r.reactor_username === '20889').length === 2) {
  ok('E one account multiple items');
} else bad('E multiple items', { secondItem, count: state.finalRows.length });

// F. different accounts same item
state.approvedFeed.add('feed-item-3');
const f1 = await finalize({ item_type: 'feed', item_id: 'feed-item-3', reaction_type: 'fire' }, studentA);
const f2 = await finalize({ item_type: 'feed', item_id: 'feed-item-3', reaction_type: 'lightbulb' }, studentB);
if (f1.status === 200 && f2.status === 200 && state.finalRows.filter((r) => r.item_id === 'feed-item-3').length === 2) {
  ok('F different accounts same item');
} else bad('F different accounts', { f1, f2 });

// G. aggregates finalized rows only
const agg = finalReactionPercents([
  { reaction_type: 'heart' },
  { reaction_type: 'heart' },
  { reaction_type: 'fire' },
]);
if (agg.total_responses === 3 && agg.results.find((r) => r.reaction_type === 'heart').percentage === 67) {
  ok('G aggregate percentages');
} else bad('G aggregates', agg);

// H. status hides results before finalize
currentAccount = { username: 'newbie', role: 'student' };
const pre = await status('feed-item-1', currentAccount);
if (pre.body.ok && pre.body.finalized === false && pre.body.reaction_type === null && !pre.body.results) {
  ok('H status hides results before finalize');
} else bad('H pre-finalize status', pre.body);

// I. status reveals results after finalize
const post = await status('feed-item-1', studentA);
if (post.body.ok && post.body.finalized && post.body.reaction_type === 'heart' && Array.isArray(post.body.results) && post.body.total_responses >= 1) {
  ok('I status reveals results after finalize');
} else bad('I post-finalize status', post.body);

// J. unauthenticated finalize rejected
currentAccount = null;
const unauth = await finalize({ item_type: 'feed', item_id: 'feed-item-1', reaction_type: 'heart' }, null);
if (unauth.status === 401) ok('J unauthenticated finalize rejected');
else bad('J unauthenticated', unauth);

// K. teacher cannot finalize
const teacherAttempt = await finalize({ item_type: 'feed', item_id: 'feed-item-1', reaction_type: 'heart' }, teacher);
if (teacherAttempt.status === 403 && teacherAttempt.body.error === 'students_only') ok('K teacher finalize rejected');
else bad('K teacher finalize', teacherAttempt);

// L. unapproved item rejected
state.approvedFeed.delete('feed-hidden');
const hidden = await finalize({ item_type: 'feed', item_id: 'feed-hidden', reaction_type: 'heart' }, studentB);
if (hidden.status === 400) ok('L unapproved item rejected');
else bad('L unapproved item', hidden);

// Frontend regression: no detailUrl redirect in feed card
const feedCardJs = fs.readFileSync(path.join(root, 'app/js/lantern-feed-card.js'), 'utf8');
if (feedCardJs.includes('openFeedItem') && !feedCardJs.includes('item.detailUrl')) {
  ok('feed card uses LanternCardUI not detailUrl');
} else bad('feed card redirect regression', 'detailUrl branch or missing openFeedItem');

const cardUiJs = fs.readFileSync(path.join(root, 'app/js/lantern-card-ui.js'), 'utf8');
if (cardUiJs.includes('openFeedItem') && cardUiJs.includes('fillFeedItemDetailModal') && cardUiJs.includes('mountFinalReactionPanel')) {
  ok('LanternCardUI openFeedItem adapter present');
} else bad('LanternCardUI adapter');

const finalJs = fs.readFileSync(path.join(root, 'app/js/lantern-final-reactions.js'), 'utf8');
if (finalJs.includes('Lock In') && finalJs.includes('lanternFinalRxConfirmCancel') && FINAL_REACTION_TYPES.length === 5) {
  ok('final reaction UI lifecycle present');
} else bad('final reaction UI');

const feedHandlers = fs.readFileSync(path.join(root, 'worker/feed-handlers.js'), 'utf8');
if (!feedHandlers.includes('news.html?id=')) ok('feed-handlers no news.html detailUrl');
else bad('feed-handlers still sets news.html detailUrl');

const lockerFeed = fs.readFileSync(path.join(root, 'worker/locker-personal-feed.js'), 'utf8');
if (lockerFeed.includes('lantern_final_reaction_responses') && lockerFeed.includes('reactor_username')) {
  ok('locker Reacted uses final table');
} else bad('locker Reacted query');

console.log('\n--- final-reaction-test:', pass, 'passed,', fail, 'failed ---');
process.exit(fail ? 1 : 0);
