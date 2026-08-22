/**
 * Prompt #252A — locker showcase / archive / feature / peer visibility.
 * Usage: node worker/scripts/locker-showcase-252a-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleLockerRoutes } from '../locker-handlers.js';
import {
  applyLockerItemAction,
  FEATURE_MAX,
  normalizeLockerItemRef,
} from '../locker-item-state.js';
import { lockerPublicKeyFromDurableKey, normalizeLockerPublicKey } from '../locker-public-key.js';
import { countStudentRevisions } from '../moderation-review.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

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

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const migration = read('worker/migrations/078_lantern_locker_item_state.sql');
assert(/CREATE TABLE IF NOT EXISTS lantern_locker_item_state/.test(migration), '078 creates locker item state');
assert(/owner_archived_at/.test(migration) && /featured/.test(migration), '078 has feature + archive columns');
assert(!/ADD COLUMN hidden_at/.test(migration) && /Does not alter hidden_at/.test(migration), '078 does not add hidden_at');
assert(/DO NOT apply/.test(migration) && /wrangler d1 migrations apply/.test(migration), '078 says do not apply');

const itemStateSrc = read('worker/locker-item-state.js');
assert(/pending_not_archivable/.test(itemStateSrc), 'pending cannot be archived');
assert(/FEATURE_MAX = 3/.test(itemStateSrc) && FEATURE_MAX === 3, 'feature max is 3');
assert(/reopen_revision/.test(itemStateSrc), 'reopen_revision action exists');

const eventsSrc = read('worker/moderation-events.js');
assert(/owner_archived/.test(eventsSrc) && /owner_reopened/.test(eventsSrc), 'moderation event types include owner archive/reopen');

const reviewSrc = read('worker/moderation-review.js');
assert(/listArchivedLockerRefs/.test(reviewSrc), 'action counts subtract owner-archived returned items');

const lockerHtml = read('app/locker.html');
assert(/id="lockerArchived"/.test(lockerHtml), 'Archived section in locker');
assert(/Archive for Later/.test(read('app/js/lantern-locker-revision.js')), 'Needs Revision offers Archive for Later');
assert(/lockerNeedsCardAside/.test(read('app/js/lantern-locker-revision.js')), 'compact NR card has aside column');
assert(/locker\.html\?view=/.test(read('app/js/lantern-locker-org.js')), 'peer URL uses view= public key');
assert(/Nothing on display yet/.test(read('app/js/lantern-locker-org.js')), 'empty peer copy');
assert(/Feature in My Locker/.test(read('app/js/lantern-locker-org.js')), 'Feature wording');
assert(!/mtss_student_id/.test(read('app/js/lantern-locker-org.js')), 'peer UI does not route on mtss id');

const showcaseSrc = read('worker/locker-showcase.js');
assert(!/bio/.test(showcaseSrc) || /DO NOT/.test(showcaseSrc) || !/profile\.bio/.test(showcaseSrc), 'showcase builder does not expose bio');
assert(/owned_json/.test(showcaseSrc) === false, 'showcase does not mention owned_json');
assert(/wallet/.test(showcaseSrc) === false, 'showcase does not mention wallet');

assert(/news:abc/.test('news:abc') && normalizeLockerItemRef('news', 'news:abc').item_id === 'abc', 'strips news: prefix');
assert(normalizeLockerItemRef('poll', 'poll:p1').item_type === 'poll', 'published poll type stays poll');
assert(normalizeLockerItemRef('mission', 'mission:m1').item_type === 'mission_submission', 'mission prefix maps');

function jsonResponse(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', ...(cors || {}) },
  });
}

function makeDb(state) {
  state.itemState = state.itemState || [];
  state.news = state.news || [];
  state.contrib = state.contrib || [];
  state.subs = state.subs || [];
  state.feed = state.feed || [];
  state.polls = state.polls || [];
  state.events = state.events || [];
  state.accounts = state.accounts || [];
  state.cosmeticOwnership = state.cosmeticOwnership || {};

  function matches(sql, table) {
    return String(sql).includes(table);
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
          if (s.includes('COUNT(*)') && s.includes('lantern_locker_item_state') && s.includes('featured')) {
            return { c: state.itemState.filter((r) => r.character_name === binds[0] && r.featured === 1).length };
          }
          if (s.includes('MAX(featured_sort)')) {
            const rows = state.itemState.filter((r) => r.character_name === binds[0] && r.featured === 1);
            const m = rows.reduce((acc, r) => Math.max(acc, Number(r.featured_sort) || 0), 0);
            return { m };
          }
          if (s.includes('FROM lantern_locker_item_state') && s.includes('item_id = ?')) {
            return (
              state.itemState.find(
                (r) => r.character_name === binds[0] && r.item_type === binds[1] && r.item_id === binds[2]
              ) || null
            );
          }
          if (s.includes('FROM lantern_news_submissions') && s.includes('id = ?')) {
            return state.news.find((r) => r.id === binds[0]) || null;
          }
          if (s.includes('FROM lantern_poll_contributions') && s.includes('id = ?')) {
            return state.contrib.find((r) => r.id === binds[0]) || null;
          }
          if (s.includes('FROM lantern_mission_submissions') && s.includes('id = ?')) {
            return state.subs.find((r) => r.id === binds[0]) || null;
          }
          if (s.includes('FROM lantern_feed_items') && s.includes('id = ?')) {
            return state.feed.find((r) => r.id === binds[0]) || null;
          }
          if (s.includes('FROM lantern_polls') && s.includes('id = ?')) {
            return state.polls.find((r) => r.id === binds[0]) || null;
          }
          if (s.includes('COUNT(*)') && s.includes('lantern_news_submissions')) {
            const keys = new Set(binds);
            return {
              c: state.news.filter((r) => String(r.status).toLowerCase() === 'returned' && (keys.has(r.author_name) || keys.has(r.actor_id))).length,
            };
          }
          if (s.includes('COUNT(*)') && s.includes('lantern_poll_contributions')) {
            const keys = new Set(binds);
            return { c: state.contrib.filter((r) => String(r.status).toLowerCase() === 'returned' && keys.has(r.character_name)).length };
          }
          if (s.includes('COUNT(*)') && s.includes('lantern_mission_submissions')) {
            const keys = new Set(binds);
            return { c: state.subs.filter((r) => String(r.status).toLowerCase() === 'returned' && keys.has(r.character_name)).length };
          }
          if (s.includes('COUNT(*)') && s.includes('lantern_feed_items')) {
            const keys = new Set(binds);
            return {
              c: state.feed.filter((r) => String(r.status).toLowerCase() === 'returned' && (keys.has(r.author_display_name) || keys.has(r.author_id))).length,
            };
          }
          if (s.includes('FROM lantern_cosmetic_ownership')) {
            return state.cosmeticOwnership[binds[0]] || { owned: '[]', equipped: '{}' };
          }
          return null;
        },
        async all() {
          if (s.includes('FROM lantern_locker_item_state') && s.includes('owner_archived_at')) {
            const keys = new Set(binds);
            return {
              results: state.itemState.filter((r) => keys.has(r.character_name) && r.owner_archived_at),
            };
          }
          if (s.includes('FROM lantern_locker_item_state')) {
            return { results: state.itemState.filter((r) => r.character_name === binds[0]) };
          }
          if (s.includes('FROM lantern_pilot_accounts') && s.includes('student')) {
            return { results: state.accounts.filter((a) => String(a.role).toLowerCase() === 'student') };
          }
          return { results: [] };
        },
        async run() {
          if (s.includes('INSERT INTO lantern_locker_item_state')) {
            const row = {
              character_name: binds[0],
              item_type: binds[1],
              item_id: binds[2],
              featured: binds[3],
              featured_sort: binds[4],
              owner_archived_at: binds[5],
              owner_archived_from: binds[6],
              updated_at: binds[7],
            };
            const idx = state.itemState.findIndex(
              (r) => r.character_name === row.character_name && r.item_type === row.item_type && r.item_id === row.item_id
            );
            if (idx >= 0) state.itemState[idx] = row;
            else state.itemState.push(row);
            return { success: true };
          }
          if (s.includes('INSERT INTO lantern_moderation_events')) {
            state.events.push({
              id: binds[0],
              item_type: binds[1],
              item_id: binds[2],
              event_type: binds[3],
              note: binds[7],
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

const OWNER = {
  username: 'lucas',
  display_name: 'Lucas',
  role: 'student',
  student_character_name: 'Lucas',
  mtss_student_id: 'SID-999',
  is_active: 1,
};
const PEER = {
  username: 'mia',
  display_name: 'Mia',
  role: 'student',
  student_character_name: 'Mia',
  mtss_student_id: 'SID-111',
  is_active: 1,
};

const deps = {
  jsonResponse,
  getPilotAccountFromRequest: async () => OWNER,
  pilotEconomyCharacterName: (a) => a.mtss_student_id || a.student_character_name,
  durableAccountKeyFromPilotAccount: (a) => a.mtss_student_id || a.student_character_name || a.username,
  pilotAccountRequiresChangePassword: () => false,
};

{
  const pub = await lockerPublicKeyFromDurableKey('SID-999');
  assert(normalizeLockerPublicKey(pub) === pub, 'public key is 32 hex');
  assert(pub !== 'SID-999' && pub !== 'lucas', 'public key is not login or student id');
}

{
  const db = makeDb({
    news: [{ id: 'n1', title: 'Hello', status: 'approved', author_name: 'Lucas', actor_id: 'lucas' }],
    contrib: [{ id: 'p1', status: 'pending', character_name: 'Lucas', question: 'Q' }],
    subs: [{ id: 's1', status: 'returned', character_name: 'SID-999', mission_id: 'm1' }],
    feed: [{ id: 'f1', status: 'rejected', author_display_name: 'Lucas', author_id: 'lucas' }],
  });
  const feat = await applyLockerItemAction(db, OWNER, 'SID-999', { action: 'feature', item_type: 'news', item_id: 'n1' }, deps);
  assert(feat.ok && feat.state.featured === 1, 'feature approved own item');
  const pending = await applyLockerItemAction(db, OWNER, 'SID-999', { action: 'archive', item_type: 'poll_contribution', item_id: 'p1' }, deps);
  assert(!pending.ok && pending.error === 'pending_not_archivable', 'pending archive blocked');
  const later = await applyLockerItemAction(db, OWNER, 'SID-999', { action: 'archive', item_type: 'mission_submission', item_id: 's1' }, deps);
  assert(later.ok && later.archive_kind === 'archive_for_later' && later.state.owner_archived_from === 'returned', 'archive for later keeps returned');
  const rej = await applyLockerItemAction(db, OWNER, 'SID-999', { action: 'archive', item_type: 'feed_item', item_id: 'f1' }, deps);
  assert(rej.ok && rej.state.owner_archived_from === 'rejected', 'rejected can be archived for org');
  const reopen = await applyLockerItemAction(db, OWNER, 'SID-999', { action: 'reopen_revision', item_type: 'mission_submission', item_id: 's1' }, deps);
  assert(reopen.ok && !reopen.state.owner_archived_at, 'reopen clears archive');
  const cross = await applyLockerItemAction(db, PEER, 'SID-111', { action: 'archive', item_type: 'news', item_id: 'n1' }, deps);
  assert(!cross.ok && (cross.error === 'forbidden' || cross.status === 403), 'peer cannot mutate owner item');
}

{
  const db = makeDb({
    news: [{ id: 'n-ret', status: 'returned', author_name: 'Lucas', actor_id: 'lucas' }],
    contrib: [],
    subs: [],
    feed: [],
  });
  const before = await countStudentRevisions(db, OWNER, deps);
  assert(before === 1, 'returned counts before archive', before);
  await applyLockerItemAction(db, OWNER, 'SID-999', { action: 'archive', item_type: 'news', item_id: 'n-ret' }, deps);
  const after = await countStudentRevisions(db, OWNER, deps);
  assert(after === 0, 'archived returned leaves revision count', after);
  await applyLockerItemAction(db, OWNER, 'SID-999', { action: 'reopen_revision', item_type: 'news', item_id: 'n-ret' }, deps);
  const again = await countStudentRevisions(db, OWNER, deps);
  assert(again === 1, 'reopen restores revision count', again);
}

{
  const db = makeDb({
    news: [{ id: 'n1', title: 'Hello', status: 'approved', author_name: 'Lucas', actor_id: 'lucas' }],
    accounts: [OWNER, PEER],
  });
  const req = new Request('https://lantern.test/api/locker/item-state', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'feature', item_type: 'news', item_id: 'n1', student_id: 'SID-111' }),
  });
  const res = await handleLockerRoutes(req, new URL(req.url), '/api/locker/item-state', { DB: db }, {}, deps);
  const body = await res.json();
  assert(body.error === 'identity_params_not_allowed', 'item-state rejects student_id body key');
}

{
  const pub = await lockerPublicKeyFromDurableKey('SID-999');
  const db = makeDb({
    accounts: [OWNER, PEER],
    news: [
      { id: 'n1', title: 'Hello', status: 'approved', author_name: 'Lucas', actor_id: 'lucas' },
      { id: 'n-hid', title: 'Hidden', status: 'approved', author_name: 'Lucas', hidden_at: 't' },
    ],
    cosmeticOwnership: {
      'SID-999': { owned_json: JSON.stringify(['bg_stars']), equipped_json: JSON.stringify({ background: 'bg_stars' }) },
    },
  });
  const peerDeps = { ...deps, getPilotAccountFromRequest: async () => PEER };
  const req = new Request('https://lantern.test/api/locker/showcase/' + pub, { method: 'GET' });
  const res = await handleLockerRoutes(req, new URL(req.url), '/api/locker/showcase/' + pub, { DB: db }, {}, peerDeps);
  const body = await res.json();
  assert(body.ok === false || body.items, 'showcase route responds for peer');
  if (body.ok) {
    assert(!body.profile || body.profile.bio == null, 'showcase omits bio');
    assert(!body.wallet && !body.owned_items && !body.purchases, 'showcase omits economy');
    assert(body.equipped && body.equipped.background === 'bg_stars', 'showcase exposes equipped tokens only');
    const ids = (body.items || []).map((it) => it.id);
    assert(ids.indexOf('n-hid') < 0, 'hidden never in showcase');
  }
}

{
  const unauthDeps = { ...deps, getPilotAccountFromRequest: async () => null };
  const req = new Request('https://lantern.test/api/locker/showcase/abcd', { method: 'GET' });
  const res = await handleLockerRoutes(req, new URL(req.url), '/api/locker/showcase/abcd', { DB: makeDb({}) }, {}, unauthDeps);
  const body = await res.json();
  assert(res.status === 401 && body.error === 'not_authenticated', 'unauthenticated showcase denied');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
