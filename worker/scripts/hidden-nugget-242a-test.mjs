/**
 * Prompt #242A — Hidden Nugget moving-position / wrap-in-first-60 model.
 * Usage: node worker/scripts/hidden-nugget-242a-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  applyFirstPageHiddenNugget,
  claimHiddenNuggetViaReveal,
  hiddenNuggetAssignmentId,
  hiddenNuggetAssignmentPool,
  hiddenNuggetFirstWindowSize,
  hiddenNuggetPersonalizedPosition,
  isAssignableHiddenNuggetCard,
  isCardInFirstHiddenNuggetWindow,
  isHiddenNuggetClaimableTrigger,
  listAssignableHiddenNuggetCards,
  maybeAwardHiddenNuggetAfterInteraction,
  pickAssignedCardId,
  pinAssignedCardOnFirstPage,
  resetHiddenNuggetTableCache,
  resolveCurrentHiddenNuggetCardId,
  stablePickIndex,
  userHasPriorInteractionOnCard,
} from '../hidden-nugget.js';
import { ECONOMY_SETTING_DEFS } from '../nugget-economy-settings.js';
import { denverLocalDateYYYYMMDD } from '../school-schedule.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }
function assert(cond, label, detail) {
  if (cond) ok(label);
  else bad(label, detail);
}

function studentAccount(username) {
  const user = username || '20889';
  return { role: 'student', username: user, student_character_name: user };
}

function makeHnDb(seed) {
  const tableMissing = !!seed.tableMissing;
  const assignments = { ...(seed.assignments || {}) };
  const transactions = { ...(seed.transactions || {}) };
  const settings = { ...(seed.settings || {}) };
  const votes = [...(seed.votes || [])];
  const reactions = [...(seed.reactions || [])];

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
    if (s.includes('FROM lantern_poll_votes') && s.includes('poll_id')) {
      const hit = votes.find((v) => v.poll_id === binds[0] && v.character_name === binds[1]);
      return hit ? { ok: 1 } : null;
    }
    if (s.includes('FROM lantern_final_reaction_responses') && s.includes('item_id')) {
      const hit = reactions.find(
        (r) =>
          r.item_id === binds[1] &&
          String(r.reactor_username).toLowerCase() === String(binds[2]).toLowerCase()
      );
      return hit ? { ok: 1 } : null;
    }
    return null;
  }

  function all(sql, binds) {
    const s = String(sql);
    if (s.includes('FROM lantern_poll_votes')) {
      return { results: votes.filter((v) => v.character_name === binds[0]) };
    }
    if (s.includes('FROM lantern_final_reaction_responses')) {
      return {
        results: reactions.filter(
          (r) => String(r.reactor_username).toLowerCase() === String(binds[1]).toLowerCase()
        ),
      };
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
      return { meta: { changes: 1 } };
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
    votes,
    reactions,
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

function seedAssignment(db, accountKey, schoolDay, cardId, extra) {
  const id = hiddenNuggetAssignmentId(accountKey, schoolDay);
  db.assignments[id] = {
    id,
    account_key: accountKey,
    school_day: schoolDay,
    card_id: cardId,
    claimed_at: extra && extra.claimed_at ? extra.claimed_at : null,
    claim_tx_id: extra && extra.claim_tx_id ? extra.claim_tx_id : null,
    created_at: '2026-08-18T18:00:00.000Z',
    updated_at: '2026-08-18T18:00:00.000Z',
  };
  return db.assignments[id];
}

function newsCard(i) {
  return { id: 'news:n' + i, type: 'news' };
}

function cards(n) {
  return Array.from({ length: n }, (_, i) => newsCard(i));
}

function positionOf(cardId, orderedItems) {
  const list = listAssignableHiddenNuggetCards(orderedItems);
  return list.findIndex((item) => String(item.id) === String(cardId)) + 1;
}

function findAccountAtPosition(schoolDay, windowN, position1) {
  const want = position1 - 1;
  for (let i = 0; i < 4000; i++) {
    const key = 'stu' + i;
    if (stablePickIndex(key, schoolDay, windowN) === want) return key;
  }
  return '';
}

const day = denverLocalDateYYYYMMDD(new Date('2026-08-18T18:00:00Z'));
const now = new Date('2026-08-18T18:00:00Z');
const student = studentAccount('20889');

const list100 = cards(100);
const seedPos12 = 'news:n11';
assert(
  resolveCurrentHiddenNuggetCardId(seedPos12, list100) === seedPos12 &&
    positionOf(seedPos12, list100) === 12,
  '1. 100 eligible cards, student position 12 → target is current eligible #12'
);

const list101 = [newsCard('newA'), ...list100];
assert(
  resolveCurrentHiddenNuggetCardId(seedPos12, list101) === seedPos12 &&
    positionOf(seedPos12, list101) === 13,
  '2. one newer eligible card appears → same student\'s target becomes #13'
);

const seedPos60 = 'news:n59';
const wrapTo1 = resolveCurrentHiddenNuggetCardId(seedPos60, list101);
assert(
  wrapTo1 === 'news:nnewA' && positionOf(wrapTo1, list101) === 1,
  '3. starting position 60 + one newer eligible card → target wraps to #1',
  wrapTo1
);

const seedPos59 = 'news:n58';
const list102 = [newsCard('newB'), newsCard('newA'), ...list100];
const wrap59 = resolveCurrentHiddenNuggetCardId(seedPos59, list102);
assert(
  wrap59 === 'news:nnewB' && positionOf(wrap59, list102) === 1,
  '4. position 59 + two newer eligible cards → wraps to #1',
  wrap59
);

const list37 = cards(37);
const keys37 = ['20889', 'stuA', 'stuB', 'stuC', 'stuD'];
const allIn37 = keys37.every((key) => {
  const pos = hiddenNuggetPersonalizedPosition(key, day, 37);
  const seed = list37[pos - 1].id;
  const current = resolveCurrentHiddenNuggetCardId(seed, list37);
  const p = positionOf(current, list37);
  return p >= 1 && p <= 37 && hiddenNuggetFirstWindowSize(list37) === 37;
});
assert(allIn37, '5. 37 eligible cards → target always within 1..37');

const list8 = cards(8);
const allIn8 = keys37.every((key) => {
  const pos = hiddenNuggetPersonalizedPosition(key, day, 8);
  const seed = list8[pos - 1].id;
  const current = resolveCurrentHiddenNuggetCardId(seed, list8);
  const p = positionOf(current, list8);
  return p >= 1 && p <= 8 && hiddenNuggetFirstWindowSize(list8) === 8;
});
assert(allIn8, '6. 8 eligible cards → target always within 1..8');

const ten = cards(10);
const unvoted = ten[4];
const poolTen = hiddenNuggetAssignmentPool(ten, 60);
assert(
  poolTen.length === 10 && poolTen.every((c) => isAssignableHiddenNuggetCard(c)),
  '7a. assignment pool includes already-interacted cards; no untouched-only filter'
);
let votedPickCount = 0;
let unvotedPickCount = 0;
for (let i = 0; i < 40; i++) {
  const id = pickAssignedCardId('student' + i, day, ten);
  if (id === unvoted.id) unvotedPickCount += 1;
  else votedPickCount += 1;
}
assert(
  votedPickCount > 0 &&
    pickAssignedCardId('20889', day, ten) === ten[stablePickIndex('20889', day, 10)].id,
  '7. no preference for untouched cards — pick is the personalized hash slot',
  { votedPickCount, unvotedPickCount }
);

const keyA = findAccountAtPosition(day, 60, 12);
const keyB = findAccountAtPosition(day, 60, 37);
const keyC = findAccountAtPosition(day, 60, 60);
const keyD = findAccountAtPosition(day, 60, 4);
assert(
  keyA &&
    keyB &&
    keyC &&
    keyD &&
    new Set([keyA, keyB, keyC, keyD]).size === 4 &&
    hiddenNuggetPersonalizedPosition(keyA, day, 60) === 12 &&
    hiddenNuggetPersonalizedPosition(keyB, day, 60) === 37 &&
    hiddenNuggetPersonalizedPosition(keyC, day, 60) === 60 &&
    hiddenNuggetPersonalizedPosition(keyD, day, 60) === 4,
  'found four distinct personalized positions (12, 37, 60, 4)'
);

const before = list100;
const afterOne = list101;
const curA0 = resolveCurrentHiddenNuggetCardId(before[11].id, before);
const curB0 = resolveCurrentHiddenNuggetCardId(before[36].id, before);
const curA1 = resolveCurrentHiddenNuggetCardId(before[11].id, afterOne);
const curB1 = resolveCurrentHiddenNuggetCardId(before[36].id, afterOne);
const curC1 = resolveCurrentHiddenNuggetCardId(before[59].id, afterOne);
const curD1 = resolveCurrentHiddenNuggetCardId(before[3].id, afterOne);
assert(
  curA0 !== curB0 && curA1 !== curB1 && positionOf(curA1, afterOne) === 13 && positionOf(curB1, afterOne) === 38,
  '8. two students with different personalized positions remain on different targets',
  { curA0, curB0, curA1, curB1 }
);

const everyoneOnNew =
  curA1 === 'news:nnewA' && curB1 === 'news:nnewA' && curC1 === 'news:nnewA' && curD1 === 'news:nnewA';
assert(
  !everyoneOnNew &&
    curC1 === 'news:nnewA' &&
    curA1 === 'news:n11' &&
    curB1 === 'news:n36' &&
    curD1 === 'news:n3' &&
    positionOf(curC1, afterOne) === 1 &&
    positionOf(curD1, afterOne) === 5,
  '9. one new post does NOT become everyone\'s Hidden Nugget — only the wrapping student moves onto it',
  { curA1, curB1, curC1, curD1 }
);

const currentIds = [curA1, curB1, curC1, curD1, resolveCurrentHiddenNuggetCardId(seedPos12, list37), resolveCurrentHiddenNuggetCardId(list8[0].id, list8)];
assert(
  currentIds.every((id) => isCardInFirstHiddenNuggetWindow(id, id === currentIds[4] ? list37 : id === currentIds[5] ? list8 : afterOne)),
  '10. no Hidden Nugget target requires Load More — every current target is inside the first-N window'
);

resetHiddenNuggetTableCache();
const offPage = { id: 'news:old80', type: 'news' };
const firstPage = cards(60);
const dbPin = makeHnDb({ settings: { 'economy.hidden_nugget': '1' } });
seedAssignment(dbPin, '20889', day, offPage.id);
const pinnedPage = await applyFirstPageHiddenNugget(dbPin, {}, {
  page: { items: firstPage, has_more: true, next_cursor: 'c|news:n59' },
  orderedItems: [...firstPage, offPage],
  account: student,
  accountKey: '20889',
  now,
  pageSize: 60,
  fetchItem: async () => offPage,
});
const helperPinned = pinAssignedCardOnFirstPage(firstPage, offPage, 60);
assert(
  !pinnedPage.items.some((it) => it.id === 'news:old80') &&
    pinnedPage.items.length === 60 &&
    pinnedPage.items[0].id === 'news:n0' &&
    pinnedPage.next_cursor === 'c|news:n59' &&
    !helperPinned.some((it) => it.id === 'news:old80'),
  '11. no off-page assigned card is injected/pinned into first page'
);

resetHiddenNuggetTableCache();
const revealPollId = 'p-current';
const currentRevealCard = { id: 'poll:' + revealPollId, type: 'poll', contentSlot: { pollId: revealPollId } };
const revealSeq = [currentRevealCard, ...cards(60)];
const dbReveal = makeHnDb({
  settings: { 'economy.hidden_nugget': '1' },
  votes: [{ poll_id: revealPollId, character_name: '20889', choice_index: 1 }],
});
seedAssignment(dbReveal, '20889', day, 'news:n59');
assert(
  resolveCurrentHiddenNuggetCardId('news:n59', revealSeq) === currentRevealCard.id,
  '12-setup. stored position 60 + newest card wraps onto the already-voted poll'
);
const priorOk = await userHasPriorInteractionOnCard(dbReveal, {
  cardId: currentRevealCard.id,
  accountKey: '20889',
  username: '20889',
});
assert(priorOk, '12-setup. prior poll interaction is verified from D1');
const revealOnce = await claimHiddenNuggetViaReveal(dbReveal, {}, {
  account: student,
  accountKey: '20889',
  cardId: currentRevealCard.id,
  now: new Date('2026-08-18T18:10:00Z'),
  orderedItems: revealSeq,
});
assert(
  revealOnce.ok && revealOnce.found && revealOnce.amount === 1 && !revealOnce.already && Object.keys(dbReveal.transactions).length === 1,
  '12. already-interacted current target → Reveal Results can claim +1 once'
);
const revealTwice = await claimHiddenNuggetViaReveal(dbReveal, {}, {
  account: student,
  accountKey: '20889',
  cardId: currentRevealCard.id,
  now: new Date('2026-08-18T18:11:00Z'),
  orderedItems: revealSeq,
});
assert(revealTwice.ok && revealTwice.already && Object.keys(dbReveal.transactions).length === 1, '12b. second Reveal does not award again');

resetHiddenNuggetTableCache();
const freshCard = { id: 'news:nnewA', type: 'news' };
const freshSeq = [freshCard, ...cards(60)];
const dbFresh = makeHnDb({ settings: { 'economy.hidden_nugget': '1' } });
seedAssignment(dbFresh, '20889', day, 'news:n59');
assert(resolveCurrentHiddenNuggetCardId('news:n59', freshSeq) === freshCard.id, '13-setup. wrap current is the newest card');
const freshClaim = await maybeAwardHiddenNuggetAfterInteraction(dbFresh, {}, {
  account: student,
  accountKey: '20889',
  cardId: freshCard.id,
  trigger: 'reaction',
  now: new Date('2026-08-18T18:15:00Z'),
  orderedItems: freshSeq,
});
assert(freshClaim.found && freshClaim.amount === 1 && Object.keys(dbFresh.transactions).length === 1, '13. fresh current target → poll/reaction can claim +1 once');

resetHiddenNuggetTableCache();
const dbStale = makeHnDb({ settings: { 'economy.hidden_nugget': '1' } });
seedAssignment(dbStale, '20889', day, 'news:n59');
const snapshotClaim = await maybeAwardHiddenNuggetAfterInteraction(dbStale, {}, {
  account: student,
  accountKey: '20889',
  cardId: 'news:n59',
  trigger: 'reaction',
  now: new Date('2026-08-18T18:16:00Z'),
  orderedItems: freshSeq,
});
assert(
  snapshotClaim.found &&
    snapshotClaim.amount === 1 &&
    isHiddenNuggetClaimableTrigger('news:n59', 'news:n59', freshSeq) &&
    isHiddenNuggetClaimableTrigger(freshCard.id, 'news:n59', freshSeq),
  '14a. stale loaded-page seed remains claimable (loaded-snapshot contract)'
);

resetHiddenNuggetTableCache();
const dbUnrelated = makeHnDb({ settings: { 'economy.hidden_nugget': '1' } });
seedAssignment(dbUnrelated, '20889', day, 'news:n59');
const unrelated = await maybeAwardHiddenNuggetAfterInteraction(dbUnrelated, {}, {
  account: student,
  accountKey: '20889',
  cardId: 'news:n5',
  trigger: 'reaction',
  now: new Date('2026-08-18T18:17:00Z'),
  orderedItems: freshSeq,
});
assert(
  !unrelated.found &&
    unrelated.wrong_card &&
    !isHiddenNuggetClaimableTrigger('news:n5', 'news:n59', freshSeq) &&
    Object.keys(dbUnrelated.transactions).length === 0,
  '14. stale/former card that is neither the snapshot seed nor the current target cannot claim'
);

resetHiddenNuggetTableCache();
const dbClaimed = makeHnDb({ settings: { 'economy.hidden_nugget': '1' } });
seedAssignment(dbClaimed, '20889', day, 'news:n11', {
  claimed_at: '2026-08-18T18:10:00.000Z',
  claim_tx_id: 'tx_hidden_already',
});
dbClaimed.transactions.tx_hidden_already = {
  id: 'tx_hidden_already',
  character_name: '20889',
  delta: 1,
  kind: 'hidden_nugget',
  source: 'DISCOVERY',
};
const claimedAgain = await maybeAwardHiddenNuggetAfterInteraction(dbClaimed, {}, {
  account: student,
  accountKey: '20889',
  cardId: 'news:n11',
  trigger: 'reaction',
  now: new Date('2026-08-18T18:20:00Z'),
  orderedItems: list101,
});
const claimedOther = await maybeAwardHiddenNuggetAfterInteraction(dbClaimed, {}, {
  account: student,
  accountKey: '20889',
  cardId: 'news:nnewA',
  trigger: 'reaction',
  now: new Date('2026-08-18T18:21:00Z'),
  orderedItems: list101,
});
const claimedPage = await applyFirstPageHiddenNugget(dbClaimed, {}, {
  page: { items: list101.slice(0, 60), has_more: true, next_cursor: 'c' },
  orderedItems: list101,
  account: student,
  accountKey: '20889',
  now: new Date('2026-08-18T18:22:00Z'),
  pageSize: 60,
});
assert(
  claimedAgain.already &&
    !claimedOther.found &&
    Object.keys(dbClaimed.transactions).length === 1 &&
    claimedPage.assignment &&
    claimedPage.assignment.claimed_at &&
    claimedPage.assignment.card_id === 'news:n11',
  '15. claimed student → no further target/award that day'
);

const cardUi = fs.readFileSync(path.join(root, 'app/js/lantern-card-ui.js'), 'utf8');
const finalRx = fs.readFileSync(path.join(root, 'app/js/lantern-final-reactions.js'), 'utf8');
const revealJs = fs.readFileSync(path.join(root, 'app/js/lantern-result-reveal.js'), 'utf8');
const hnClient = fs.readFileSync(path.join(root, 'app/js/lantern-hidden-nugget.js'), 'utf8');
const cardsCss = fs.readFileSync(path.join(root, 'app/css/lantern-cards.css'), 'utf8');
const rxCss = fs.readFileSync(path.join(root, 'app/css/lantern-reactions.css'), 'utf8');
const hnWorker = fs.readFileSync(path.join(root, 'worker/hidden-nugget.js'), 'utf8');

const hasVotedBlock = (cardUi.match(/if \(hasVoted && results[\s\S]*?\} else if \(choicesEl && nuggetEl\)/) || [''])[0];
assert(
  /mountRevealResultsControl/.test(hasVotedBlock) &&
    /markPriorPollChoice/.test(hasVotedBlock) &&
    /onReveal/.test(hasVotedBlock) &&
    /claimReveal/.test(hasVotedBlock) &&
    /isReplay/.test(hasVotedBlock) &&
    !/revealPollResults\(votedGroup \|\| choicesEl, results, votedIdx\);/.test(hasVotedBlock) &&
    !/\/api\/polls\/vote/.test(hasVotedBlock),
  '16. #242 Reveal/Replay regression — prior poll choice, no auto-race, no duplicate vote'
);
const attachRevealFn = (finalRx.match(/function attachLockedRevealControl[\s\S]*?\n  function renderLocked/) || [''])[0];
assert(
  /function renderLocked[\s\S]*attachLockedRevealControl[\s\S]*wireLockedChoiceAttempts/.test(finalRx) &&
    /claimReveal/.test(attachRevealFn) &&
    /isReplay/.test(attachRevealFn) &&
    !/\/api\/reactions\/finalize/.test(attachRevealFn) &&
    /is-prior-choice/.test(cardsCss) &&
    /#56d078/.test(cardsCss) &&
    /outline:\s*3px solid #56d078/.test(rxCss) &&
    /Replay Results/.test(revealJs) &&
    /\/api\/hidden-nugget\/reveal-claim/.test(hnClient),
  '16b. #242 reaction Reveal/Replay + green selected treatment preserved'
);

assert(
  /reuseRows:\s*true/.test(cardUi) &&
    /preparePollChoiceLanes/.test(revealJs) &&
    /mountPollMineCartRace/.test(revealJs) &&
    /existingPollLanes/.test(revealJs) &&
    /cart\.style\.left = p \+ '%'/.test(revealJs),
  '17. #240 poll geometry regression'
);

assert(
  /function ensureRaceAreaVisibleOnce/.test(revealJs) &&
    /at most one positioning scroll/i.test(revealJs) &&
    !/function lockIconFloor/.test(revealJs),
  '18. #240 reaction free-scroll regression — one positioning scroll, race does not own scroll'
);
const rxFnMatch = revealJs.match(/function mountReactionSpatialRace[\s\S]*?\n  function mountResultRace/);
const rxFn = rxFnMatch ? rxFnMatch[0] : '';
assert(
  !!rxFn && !/scrollTop\s*\+=/.test(rxFn) && !/scrollTop\s*=/.test(rxFn) && !/scrollIntoView/.test(rxFn),
  '18b. reaction race function still does not scroll during animation'
);

assert(
  ECONOMY_SETTING_DEFS.hidden_nugget.default === 1 &&
    ECONOMY_SETTING_DEFS.poll_response.default === 0 &&
    ECONOMY_SETTING_DEFS.reaction.default === 0,
  'economy defaults unchanged: Hidden Nugget +1, poll 0, reaction 0'
);
assert(
  !/head\.push\(targetItem\)/.test(hnWorker) &&
    /never pinned/.test(hnWorker) &&
    /idx % HIDDEN_NUGGET_ASSIGNMENT_POOL_SIZE/.test(hnWorker),
  'worker no longer pins an off-page card; wrap uses modulo 60'
);

console.log('\nhidden-nugget-242a-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
