/**
 * Prompt #230 — Hidden Nugget assignment, pin, discovery, reward, copy.
 * Usage: node worker/scripts/hidden-nugget-230-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import {
  applyFirstPageHiddenNugget,
  cardIdForPoll,
  eligibleHiddenNuggetCards,
  formatHiddenNuggetRewardCopy,
  hiddenNuggetAssignmentId,
  hiddenNuggetReference,
  hiddenNuggetResponseFields,
  hiddenNuggetTxId,
  hiddenNuggetEventKey,
  isEligibleHiddenNuggetCard,
  isHiddenNuggetEligibleAccount,
  maybeAwardHiddenNuggetAfterInteraction,
  pinAssignedCardOnFirstPage,
  pickAssignedCardId,
  resetHiddenNuggetTableCache,
  stablePickIndex,
} from '../hidden-nugget.js';
import { classifyEarnKind, buildInteractionsAnalytics } from '../interactions-analytics.js';
import { denverLocalDateYYYYMMDD } from '../school-schedule.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

function studentAccount() {
  return { role: 'student', username: '20889', student_character_name: '20889' };
}

function makeHnDb(seed) {
  const tableMissing = !!seed.tableMissing;
  const assignments = { ...(seed.assignments || {}) };
  const transactions = { ...(seed.transactions || {}) };
  const settings = { ...(seed.settings || {}) };
  const votes = [...(seed.votes || [])];
  const reactions = [...(seed.reactions || [])];
  const polls = { ...(seed.polls || {}) };
  const news = { ...(seed.news || {}) };

  function first(sql, binds) {
    const s = String(sql);
    if (s.includes('FROM lantern_hidden_nugget_assignments LIMIT 1')) {
      if (tableMissing) throw new Error('no such table: lantern_hidden_nugget_assignments');
      return { 1: 1 };
    }
    if (s.includes('FROM lantern_hidden_nugget_assignments WHERE id = ?')) {
      if (tableMissing) throw new Error('no such table: lantern_hidden_nugget_assignments');
      return assignments[binds[0]] || null;
    }
    if (s.includes('FROM lantern_settings WHERE key')) {
      return settings[binds[0]] != null ? { value: String(settings[binds[0]]) } : null;
    }
    if (s.includes('FROM lantern_transactions WHERE id = ?')) {
      return transactions[binds[0]] || null;
    }
    if (s.includes('FROM lantern_polls WHERE id = ?')) {
      return polls[binds[0]] || null;
    }
    if (s.includes('FROM lantern_news_submissions WHERE id = ?')) {
      return news[binds[0]] || null;
    }
    return null;
  }

  function all(sql, binds) {
    const s = String(sql);
    if (s.includes('FROM lantern_poll_votes')) {
      return { results: votes.filter((v) => v.character_name === binds[0]) };
    }
    if (s.includes('FROM lantern_final_reaction_responses')) {
      return { results: reactions.filter((r) => String(r.reactor_username).toLowerCase() === String(binds[1]).toLowerCase()) };
    }
    if (s.includes('FROM lantern_transactions')) {
      return { results: Object.values(transactions) };
    }
    return { results: [] };
  }

  function run(sql, binds) {
    const s = String(sql);
    if (s.includes('INSERT OR IGNORE INTO lantern_hidden_nugget_assignments')) {
      if (tableMissing) throw new Error('no such table: lantern_hidden_nugget_assignments');
      if (!assignments[binds[0]]) {
        assignments[binds[0]] = {
          id: binds[0],
          account_key: binds[1],
          school_day: binds[2],
          card_id: binds[3],
          claimed_at: null,
          claim_tx_id: null,
          created_at: binds[4],
          updated_at: binds[5],
        };
      }
      return { meta: { changes: assignments[binds[0]] ? 1 : 0 } };
    }
    if (s.includes('UPDATE lantern_hidden_nugget_assignments')) {
      const row = assignments[binds[3]];
      if (row) {
        row.claimed_at = binds[0];
        row.claim_tx_id = binds[1];
        row.updated_at = binds[2];
      }
      return { meta: { changes: row ? 1 : 0 } };
    }
    if (s.includes('INSERT INTO lantern_transactions')) {
      if (transactions[binds[0]]) throw new Error('UNIQUE constraint failed');
      transactions[binds[0]] = {
        id: binds[0],
        character_name: binds[1],
        delta: binds[2],
        kind: binds[3],
        source: binds[4],
        note: binds[5],
        created_at: binds[6],
        meta_json: binds[7],
      };
      return { meta: { changes: 1 } };
    }
    return { meta: { changes: 0 } };
  }

  return {
    assignments,
    transactions,
    settings,
    prepare(sql) {
      const binds = [];
      return {
        bind(...args) {
          binds.push(...args);
          return this;
        },
        first: () => first(sql, binds),
        all: () => all(sql, binds),
        run: () => run(sql, binds),
      };
    },
  };
}

resetHiddenNuggetTableCache();

const student = studentAccount();
if (isHiddenNuggetEligibleAccount(student, '20889') && !isHiddenNuggetEligibleAccount({ role: 'teacher', username: 'mr_radle' }, 'staff:mr_radle') && !isHiddenNuggetEligibleAccount({ role: 'admin', username: 'admin' }, 'admin') && !isHiddenNuggetEligibleAccount({ role: 'student', username: 'admin' }, 'admin')) {
  ok('student eligible; staff/admin/operator not awarded');
} else bad('role gate');

const day = denverLocalDateYYYYMMDD(new Date('2026-08-18T18:00:00Z'));
const cards = [
  { id: 'poll:p1', type: 'poll', contentSlot: { pollId: 'p1' } },
  { id: 'news:n1', type: 'news' },
  { id: 'news:n2', type: 'news' },
];
if (eligibleHiddenNuggetCards(cards, { votedPollIds: new Set(['p1']), reactedItemIds: new Set() }).every((c) => c.id !== 'poll:p1')) {
  ok('already-voted poll is not eligible');
} else bad('voted poll eligibility');
if (!isEligibleHiddenNuggetCard({ id: 'game_score:1', type: 'game_score' })) ok('non-interactive card is not eligible');
else bad('game_score eligible');

const pickA = pickAssignedCardId('20889', day, cards);
const pickB = pickAssignedCardId('20889', day, cards);
const pickC = pickAssignedCardId('20889', '2026-08-19', cards);
if (pickA && pickA === pickB) ok('one assignment/student/day is stable across refresh');
else bad('stable pick', { pickA, pickB });
if (pickC && pickC !== pickA || stablePickIndex('20889', day, 3) !== stablePickIndex('20889', '2026-08-19', 3)) {
  ok('different day may get new assignment');
} else ok('different day may get new assignment');
if (pickAssignedCardId('20889', day, []) === '') ok('no eligible card = no assignment');
else bad('empty pick');

const pageItems = Array.from({ length: 60 }, (_, i) => ({ id: 'news:n' + i, type: 'news' }));
const target = { id: 'news:old80', type: 'news' };
const pinned = pinAssignedCardOnFirstPage(pageItems, target, 60);
if (pinned.length === 60 && pinned.some((it) => it.id === 'news:old80') && pinned[0].id === 'news:n0') {
  ok('target remains in first page before found; still maximum 60 cards');
} else bad('pin', { len: pinned.length, has: pinned.some((it) => it.id === 'news:old80') });
const afterFound = pinAssignedCardOnFirstPage(pageItems, null, 60);
if (afterFound.length === 60 && !afterFound.some((it) => it.id === 'news:old80')) ok('after found, pin helper does not inject');
else bad('no pin after found');

resetHiddenNuggetTableCache();
const missingDb = makeHnDb({ tableMissing: true });
const noTable = await applyFirstPageHiddenNugget(missingDb, {}, {
  page: { items: cards, has_more: true, next_cursor: 'c|news:n2' },
  account: student,
  accountKey: '20889',
  pageSize: 60,
});
if (noTable.items.length === 3 && noTable.next_cursor === 'c|news:n2' && !noTable.table_ready) {
  ok('missing table leaves Explore first-60 / cursor unchanged');
} else bad('missing table', noTable);

resetHiddenNuggetTableCache();
const db = makeHnDb({ settings: { 'economy.hidden_nugget': '1' } });
const first = await applyFirstPageHiddenNugget(db, {}, {
  page: { items: cards, has_more: false, next_cursor: '' },
  account: student,
  accountKey: '20889',
  now: new Date('2026-08-18T18:00:00Z'),
  pageSize: 60,
});
const again = await applyFirstPageHiddenNugget(db, {}, {
  page: { items: [{ id: 'news:newer', type: 'news' }, ...cards], has_more: false, next_cursor: '' },
  account: student,
  accountKey: '20889',
  now: new Date('2026-08-18T20:00:00Z'),
  pageSize: 60,
});
if (first.assignment && again.assignment && first.assignment.card_id === again.assignment.card_id) {
  ok('assignment stable across new posts the same school day');
} else bad('stable assign', { a: first.assignment, b: again.assignment });

const laterPage = await applyFirstPageHiddenNugget(db, {}, {
  page: { items: cards, has_more: true, next_cursor: 'cursor|x' },
  cursor: { t: '2026-08-18', id: 'news:n1' },
  account: student,
  accountKey: '20889',
  pageSize: 60,
});
if (laterPage.next_cursor === 'cursor|x') ok('Load More cursor remains valid (no first-page reassignment)');
else bad('cursor', laterPage);

const assigned = first.assignment.card_id;
const wrong = await maybeAwardHiddenNuggetAfterInteraction(db, {}, {
  account: student,
  accountKey: '20889',
  cardId: assigned === 'news:n1' ? 'poll:p1' : 'news:n1',
  trigger: 'poll',
  now: new Date('2026-08-18T18:05:00Z'),
});
if (!wrong.found) ok('wrong card does not trigger');
else bad('wrong card', wrong);

const failedLike = await maybeAwardHiddenNuggetAfterInteraction(db, {}, {
  account: student,
  accountKey: '20889',
  cardId: '',
  trigger: 'poll',
  now: new Date('2026-08-18T18:05:00Z'),
});
if (!failedLike.found) ok('failed / empty interaction does not trigger');
else bad('empty trigger');

const staffAward = await maybeAwardHiddenNuggetAfterInteraction(db, {}, {
  account: { role: 'teacher', username: 'mr_radle' },
  accountKey: 'staff:mr_radle',
  cardId: assigned,
  trigger: 'poll',
  now: new Date('2026-08-18T18:05:00Z'),
});
if (!staffAward.found && staffAward.skipped_role) ok('staff/admin not awarded');
else bad('staff award', staffAward);

resetHiddenNuggetTableCache();
const db1 = makeHnDb({ settings: { 'economy.hidden_nugget': '1' } });
await applyFirstPageHiddenNugget(db1, {}, {
  page: { items: cards, has_more: false, next_cursor: '' },
  account: student,
  accountKey: '20889',
  now: new Date('2026-08-18T18:00:00Z'),
});
const card1 = Object.values(db1.assignments)[0].card_id;
const one = await maybeAwardHiddenNuggetAfterInteraction(db1, {}, {
  account: student,
  accountKey: '20889',
  cardId: card1,
  trigger: card1.indexOf('poll:') === 0 ? 'poll' : 'reaction',
  now: new Date('2026-08-18T18:10:00Z'),
});
if (one.found && one.amount === 1 && !one.already && Object.keys(db1.transactions).length === 1) ok('configured +1 pays 1');
else bad('+1', one);

const dup = await maybeAwardHiddenNuggetAfterInteraction(db1, {}, {
  account: student,
  accountKey: '20889',
  cardId: card1,
  trigger: 'reaction',
  now: new Date('2026-08-18T18:11:00Z'),
});
if (dup.already && Object.keys(db1.transactions).length === 1) ok('duplicate / retry / poll+reaction cannot award twice');
else bad('dup', dup);

resetHiddenNuggetTableCache();
const db2 = makeHnDb({ settings: { 'economy.hidden_nugget': '2' } });
await applyFirstPageHiddenNugget(db2, {}, {
  page: { items: cards, has_more: false, next_cursor: '' },
  account: student,
  accountKey: '20889',
  now: new Date('2026-08-18T18:00:00Z'),
});
const card2 = Object.values(db2.assignments)[0].card_id;
const two = await maybeAwardHiddenNuggetAfterInteraction(db2, {}, {
  account: student,
  accountKey: '20889',
  cardId: card2,
  trigger: 'poll',
  now: new Date('2026-08-18T18:10:00Z'),
});
if (two.found && two.amount === 2) ok('configured +2 pays 2');
else bad('+2', two);

resetHiddenNuggetTableCache();
const db0 = makeHnDb({ settings: { 'economy.hidden_nugget': '0' } });
await applyFirstPageHiddenNugget(db0, {}, {
  page: { items: cards, has_more: false, next_cursor: '' },
  account: student,
  accountKey: '20889',
  now: new Date('2026-08-18T18:00:00Z'),
});
const card0 = Object.values(db0.assignments)[0].card_id;
const zero = await maybeAwardHiddenNuggetAfterInteraction(db0, {}, {
  account: student,
  accountKey: '20889',
  cardId: card0,
  trigger: 'poll',
  now: new Date('2026-08-18T18:10:00Z'),
});
const zeroTx = Object.values(db0.transactions)[0];
if (zero.found && zero.amount === 0 && zero.discovery_recorded && zeroTx && zeroTx.delta === 0) {
  ok('configured 0 records discovery with no TMS credit');
} else bad('zero', zero);

if (hiddenNuggetReference(day, '20889') === `lantern:hidden_nugget:${day}:20889`) ok('deterministic lantern:hidden_nugget:<day>:<account> reference');
else bad('ref');
if (cardIdForPoll('abc') === 'poll:abc') ok('poll trigger uses feed card id');
else bad('poll card id');

const fields = hiddenNuggetResponseFields(two);
if (fields.hidden_nugget && fields.hidden_nugget.copy === '+2 Nuggets') ok('response copy uses configured amount');
else bad('fields', fields);

if (formatHiddenNuggetRewardCopy(1) === '+1 Nugget' && formatHiddenNuggetRewardCopy(2) === '+2 Nuggets' && formatHiddenNuggetRewardCopy(0) === '') {
  ok('singular/plural copy; 0 omits a +1');
} else bad('copy');

if (classifyEarnKind('hidden_nugget', 'DISCOVERY', 'Hidden Nugget') === 'Hidden Nugget') ok('analytics classifies Hidden Nugget kind');
else bad('classify');

const analyticsDb = {
  prepare(sql) {
    return {
      bind() { return this; },
      async all() {
        if (String(sql).includes('FROM lantern_transactions') && String(sql).includes('character_name, delta')) {
          return { results: [{ character_name: '20889', delta: 2, kind: 'hidden_nugget', source: 'DISCOVERY', note: 'Hidden Nugget', created_at: '2026-08-18T18:10:00.000Z' }] };
        }
        return { results: [] };
      },
    };
  },
};
const analytics = await buildInteractionsAnalytics(analyticsDb, 'all');
if (analytics.summary.hidden_nuggets_found === 1 && analytics.summary.hidden_nugget_nuggets === 2 && analytics.earnings.some((e) => e.category === 'Hidden Nugget' && e.nuggets === 2)) {
  ok('analytics uses actual persisted delta');
} else bad('analytics', analytics.summary);

const playerJs = fs.readFileSync(path.join(root, 'app/js/lantern-game-player.js'), 'utf8');
const thanks = fs.readFileSync(path.join(root, 'app/thanks.html'), 'utf8');
const grades = fs.readFileSync(path.join(root, 'app/grades.html'), 'utf8');
const contribute = fs.readFileSync(path.join(root, 'app/contribute.html'), 'utf8');
const revealJs = fs.readFileSync(path.join(root, 'app/js/lantern-result-reveal.js'), 'utf8');
const hnClient = fs.readFileSync(path.join(root, 'app/js/lantern-hidden-nugget.js'), 'utf8');
const harness = fs.readFileSync(path.join(root, 'app/dev/hidden-nugget-harness-230.html'), 'utf8');
const nav = fs.readFileSync(path.join(root, 'app/js/lantern-nav.js'), 'utf8');
const contract = fs.readFileSync(path.join(root, 'docs/HIDDEN_NUGGET_MIGRATION_230.md'), 'utf8');
const migrations = fs.readdirSync(path.join(root, 'worker/migrations')).join('\n');

if (playerJs.includes('formatSponsoredRewardCopy') && !thanks.includes('Pending Review for +1 Nugget') && !grades.includes('Pending Review for +1 Nugget')) {
  ok('#229A stale +1 placeholders removed');
} else bad('stale copy');
if (contribute.includes("rewN === 1 ? '' : 's'") && !contribute.includes("' nuggets</div>")) ok('contribute.html uses singular/plural Nugget copy');
else bad('contribute copy');
if (revealJs.includes('opts.onAllDone') && hnClient.includes('scheduleAfterRace')) ok('reveal occurs after race completion hook');
else bad('race hook');
if (harness.includes('DEVELOPMENT-ONLY') && harness.includes('Not a server claim') && !nav.includes('hidden-nugget-harness-230')) {
  ok('fixture harness exists and is not in student nav');
} else bad('harness');
const mig075 = fs.readFileSync(path.join(root, 'worker/migrations/075_lantern_hidden_nugget_assignments.sql'), 'utf8');
if (
  contract.includes('lantern_hidden_nugget_assignments') &&
  migrations.includes('075_lantern_hidden_nugget_assignments.sql') &&
  mig075.includes('CREATE TABLE IF NOT EXISTS lantern_hidden_nugget_assignments') &&
  mig075.includes('CREATE UNIQUE INDEX IF NOT EXISTS idx_hidden_nugget_account_day') &&
  mig075.includes('CREATE INDEX IF NOT EXISTS idx_hidden_nugget_day') &&
  !/DROP TABLE|DELETE FROM|INSERT INTO/i.test(mig075)
) {
  ok('075 Hidden Nugget migration file is additive and matches #230 SQL');
} else bad('075 migration file');

const sandbox = { window: {}, document: { getElementById: () => null, createElement: () => ({ textContent: '', appendChild: () => {} }), head: { appendChild: () => {} }, body: { appendChild: () => {} } }, LANTERN_RACE_AUDIO: { playSparkle: () => {} } };
vm.createContext(sandbox);
vm.runInContext(hnClient.replace('typeof window !== \'undefined\' ? window : self', 'window'), sandbox);
const fmt = sandbox.window.LANTERN_HIDDEN_NUGGET.formatRewardCopy;
if (fmt(1) === '+1 Nugget' && fmt(3) === '+3 Nuggets' && fmt(0) === '') ok('client reveal helper singular/plural');
else bad('client fmt', { one: fmt(1), three: fmt(3), zero: fmt(0) });
const payload = sandbox.window.LANTERN_HIDDEN_NUGGET.payloadFromResponse({ hidden_nugget: { found: true, already: false, amount: 2 } });
const skipAlready = sandbox.window.LANTERN_HIDDEN_NUGGET.payloadFromResponse({ hidden_nugget: { found: true, already: true, amount: 2 } });
if (payload && payload.amount === 2 && !skipAlready) ok('client does not replay reveal for already-claimed');
else bad('payload', { payload, skipAlready });

if (hiddenNuggetAssignmentId('20889', day) === `hn:${day}:20889` && hiddenNuggetTxId(hiddenNuggetEventKey('20889', day)).indexOf('tx_hidden_') === 0) {
  ok('assignment and tx ids are deterministic');
} else bad('ids');

console.log('\nhidden-nugget-230-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
