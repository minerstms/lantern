/**
 * Prompt #242 — Hidden Nugget top-60 assignable pool + Reveal Results claim.
 * Usage: node worker/scripts/hidden-nugget-242-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  applyFirstPageHiddenNugget,
  claimHiddenNuggetViaReveal,
  hiddenNuggetAssignmentPool,
  isAssignableHiddenNuggetCard,
  maybeAwardHiddenNuggetAfterInteraction,
  pickAssignedCardId,
  resetHiddenNuggetTableCache,
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
      return { results: reactions.filter((r) => String(r.reactor_username).toLowerCase() === String(binds[1]).toLowerCase()) };
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
    if (s.includes('INSERT INTO lantern_poll_votes') || s.includes('INSERT INTO lantern_final_reaction_responses')) {
      return { meta: { changes: 0 } };
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

function newsCard(i) {
  return { id: 'news:n' + i, type: 'news' };
}

resetHiddenNuggetTableCache();
const student = studentAccount();
const day = denverLocalDateYYYYMMDD(new Date('2026-08-18T18:00:00Z'));
const now = new Date('2026-08-18T18:00:00Z');

const hundred = Array.from({ length: 100 }, (_, i) => newsCard(i));
const pool100 = hiddenNuggetAssignmentPool(hundred, 60);
assert(
  pool100.length === 60 && pool100[0].id === 'news:n0' && pool100[59].id === 'news:n59' && !pool100.some((c) => c.id === 'news:n60'),
  '1. 100 eligible cards → assignment pool is exactly first 60'
);

const thirtySeven = Array.from({ length: 37 }, (_, i) => newsCard(i));
const pool37 = hiddenNuggetAssignmentPool(thirtySeven, 60);
assert(pool37.length === 37 && pool37[36].id === 'news:n36', '2. 37 eligible cards → pool is 37');

const mixed = [];
for (let i = 0; i < 80; i++) {
  mixed.push({ id: 'game_score:' + i, type: 'game_score' });
  mixed.push(newsCard(i));
}
const poolMixed = hiddenNuggetAssignmentPool(mixed, 60);
assert(
  poolMixed.length === 60 &&
    poolMixed.every((c) => isAssignableHiddenNuggetCard(c)) &&
    poolMixed[0].id === 'news:n0' &&
    poolMixed[59].id === 'news:n59',
  'top-60 skips non-assignable types and follows Explore order'
);

assert(!isAssignableHiddenNuggetCard({ id: 'game_score:1', type: 'game_score' }), 'game_score is not assignable');
assert(isAssignableHiddenNuggetCard({ id: 'poll:p1', type: 'poll', contentSlot: { pollId: 'p1' } }), 'voted or unvoted poll remains assignable');

resetHiddenNuggetTableCache();
const dbStable = makeHnDb({ settings: { 'economy.hidden_nugget': '1' } });
const first = await applyFirstPageHiddenNugget(dbStable, {}, {
  page: { items: hundred.slice(0, 60), has_more: true, next_cursor: 'c|news:n59' },
  orderedItems: hundred,
  account: student,
  accountKey: '20889',
  now,
  pageSize: 60,
});
const again = await applyFirstPageHiddenNugget(dbStable, {}, {
  page: { items: [newsCard(999), ...hundred.slice(0, 59)], has_more: true, next_cursor: 'c|x' },
  orderedItems: [newsCard(999), ...hundred],
  account: student,
  accountKey: '20889',
  now: new Date('2026-08-18T20:00:00Z'),
  pageSize: 60,
});
assert(
  first.assignment &&
    again.assignment &&
    first.assignment.card_id === again.assignment.card_id &&
    hundred.slice(0, 60).some((c) => c.id === first.assignment.card_id) &&
    first.assignment.card_id !== 'news:n60' &&
    first.assignment.card_id !== 'news:n99',
  '3. refresh/reload keeps the same-day ring seed (stored card_id) from the original top 60'
);

const assignedId = first.assignment.card_id;
assert(pickAssignedCardId('20889', day, pool100) === assignedId, 'stable hash pick matches stored assignment');

const indexJs = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
const finalRxHandlers = fs.readFileSync(path.join(root, 'worker/final-reaction-handlers.js'), 'utf8');
assert(
  /voted_choice_index:\s*hasVoted \? votedChoiceIndex : null/.test(indexJs) &&
    /has_voted:\s*hasVoted/.test(indexJs),
  '4. GET /api/polls/:id still returns prior poll choice'
);
assert(
  /reaction_type:\s*row\.reaction_type/.test(finalRxHandlers) &&
    /finalized:\s*true/.test(finalRxHandlers),
  '5. GET /api/reactions/finalized-status still returns prior reaction'
);

const cardUi = fs.readFileSync(path.join(root, 'app/js/lantern-card-ui.js'), 'utf8');
const finalRx = fs.readFileSync(path.join(root, 'app/js/lantern-final-reactions.js'), 'utf8');
const revealJs = fs.readFileSync(path.join(root, 'app/js/lantern-result-reveal.js'), 'utf8');
const hnClient = fs.readFileSync(path.join(root, 'app/js/lantern-hidden-nugget.js'), 'utf8');
const cardsCss = fs.readFileSync(path.join(root, 'app/css/lantern-cards.css'), 'utf8');
const rxCss = fs.readFileSync(path.join(root, 'app/css/lantern-reactions.css'), 'utf8');

const hasVotedBlock = (cardUi.match(/if \(hasVoted && results[\s\S]*?\} else if \(choicesEl && nuggetEl\)/) || [''])[0];
assert(
  /mountRevealResultsControl/.test(hasVotedBlock) &&
    /markPriorPollChoice/.test(hasVotedBlock) &&
    /onReveal/.test(hasVotedBlock) &&
    !/revealPollResults\(votedGroup \|\| choicesEl, results, votedIdx\);/.test(hasVotedBlock),
  '6. previously-interacted poll reopen does not auto-start the race'
);
assert(
  /function renderLocked[\s\S]*attachLockedRevealControl[\s\S]*wireLockedChoiceAttempts/.test(finalRx) &&
    !/function renderLocked[\s\S]*if \(status\.results && status\.results\.length\) \{\s*revealReactionResults/.test(finalRx),
  '6b. previously-reacted reopen does not auto-start the race'
);
assert(
  /function lockExistingDraft[\s\S]*revealReactionResults\(null, status\.results/.test(finalRx),
  'first reaction still starts the race immediately'
);

assert(
  /claimReveal/.test(hasVotedBlock) &&
    !/\/api\/polls\/vote/.test(hasVotedBlock) &&
    /isReplay/.test(hasVotedBlock),
  '7/8. Reveal/Replay on a poll does not submit a new vote'
);
const attachRevealFn = (finalRx.match(/function attachLockedRevealControl[\s\S]*?\n  function renderLocked/) || [''])[0];
assert(
  /claimReveal/.test(attachRevealFn) &&
    /isReplay/.test(attachRevealFn) &&
    !/\/api\/reactions\/finalize/.test(attachRevealFn) &&
    !/finalizeReaction\(/.test(attachRevealFn),
  '7/8. Reveal/Replay on a reaction does not submit a new reaction'
);

resetHiddenNuggetTableCache();
const dbOrdinary = makeHnDb({
  settings: { 'economy.hidden_nugget': '1' },
  votes: [{ poll_id: 'other', character_name: '20889' }],
});
await applyFirstPageHiddenNugget(dbOrdinary, {}, {
  page: { items: hundred.slice(0, 60), has_more: false, next_cursor: '' },
  orderedItems: hundred,
  account: student,
  accountKey: '20889',
  now,
  pageSize: 60,
});
const ordinary = await claimHiddenNuggetViaReveal(dbOrdinary, {}, {
  account: student,
  accountKey: '20889',
  cardId: 'poll:other',
  now: new Date('2026-08-18T18:10:00Z'),
});
assert(ordinary.ok && ordinary.prior_verified && !ordinary.found && Object.keys(dbOrdinary.transactions).length === 0, '9. Reveal on an ordinary card awards 0');

resetHiddenNuggetTableCache();
const assignedPollId = 'p-assigned';
const assignedCard = { id: 'poll:' + assignedPollId, type: 'poll', contentSlot: { pollId: assignedPollId } };
const dbClaim = makeHnDb({
  settings: { 'economy.hidden_nugget': '1' },
  votes: [{ poll_id: assignedPollId, character_name: '20889', choice_index: 1 }],
});
const assignedPage = [assignedCard];
await applyFirstPageHiddenNugget(dbClaim, {}, {
  page: { items: assignedPage, has_more: false, next_cursor: '' },
  orderedItems: assignedPage,
  account: student,
  accountKey: '20889',
  now,
  pageSize: 60,
});
const stored = Object.values(dbClaim.assignments)[0];
assert(stored && stored.card_id === assignedCard.id, 'assigned card can be an already-voted poll');
const priorOk = await userHasPriorInteractionOnCard(dbClaim, {
  cardId: assignedCard.id,
  accountKey: '20889',
  username: '20889',
});
assert(priorOk, '4/5. prior poll interaction is verified from D1, not client display state');

const firstReveal = await claimHiddenNuggetViaReveal(dbClaim, {}, {
  account: student,
  accountKey: '20889',
  cardId: assignedCard.id,
  now: new Date('2026-08-18T18:10:00Z'),
});
assert(
  firstReveal.ok && firstReveal.found && firstReveal.amount === 1 && !firstReveal.already && Object.keys(dbClaim.transactions).length === 1,
  '10. Reveal on today\'s assigned card with verified prior interaction awards +1 once'
);

const secondReveal = await claimHiddenNuggetViaReveal(dbClaim, {}, {
  account: student,
  accountKey: '20889',
  cardId: assignedCard.id,
  now: new Date('2026-08-18T18:11:00Z'),
});
assert(
  secondReveal.ok && secondReveal.already && Object.keys(dbClaim.transactions).length === 1,
  '11. second Reveal/replay does not award a second Hidden Nugget'
);

const forgedWrong = await claimHiddenNuggetViaReveal(dbClaim, {}, {
  account: student,
  accountKey: '20889',
  cardId: 'news:n1',
  now: new Date('2026-08-18T18:12:00Z'),
});
assert(
  (!forgedWrong.ok && forgedWrong.error === 'no_prior_interaction') || (forgedWrong.ok && !forgedWrong.found),
  '12. forged reveal for a wrong card awards nothing'
);
assert(Object.keys(dbClaim.transactions).length === 1, '12b. forged wrong-card reveal did not insert a second tx');

resetHiddenNuggetTableCache();
const dbNoPrior = makeHnDb({ settings: { 'economy.hidden_nugget': '1' } });
await applyFirstPageHiddenNugget(dbNoPrior, {}, {
  page: { items: assignedPage, has_more: false, next_cursor: '' },
  orderedItems: assignedPage,
  account: student,
  accountKey: '20889',
  now,
  pageSize: 60,
});
const noPrior = await claimHiddenNuggetViaReveal(dbNoPrior, {}, {
  account: student,
  accountKey: '20889',
  cardId: assignedCard.id,
  now: new Date('2026-08-18T18:10:00Z'),
});
assert(
  !noPrior.ok && noPrior.error === 'no_prior_interaction' && !noPrior.found && Object.keys(dbNoPrior.transactions).length === 0,
  '13. forged reveal without prior interaction cannot claim'
);

const freshVote = await maybeAwardHiddenNuggetAfterInteraction(dbNoPrior, {}, {
  account: student,
  accountKey: '20889',
  cardId: assignedCard.id,
  trigger: 'poll',
  now: new Date('2026-08-18T18:15:00Z'),
});
assert(freshVote.found && freshVote.amount === 1, 'fresh first interaction still uses the existing claim path');

assert(/reuseRows:\s*true/.test(cardUi) && /preparePollChoiceLanes/.test(revealJs), '14. #240 poll in-place rows preserved');
assert(/mountPollMineCartRace/.test(revealJs) && /existingPollLanes/.test(revealJs), '14b. poll mine-cart race API unchanged');
const pollFnMatch = revealJs.match(/function mountPollMineCartRace[\s\S]*?\n  function mountReactionSpatialRace/);
const rxFnMatch = revealJs.match(/function mountReactionSpatialRace[\s\S]*?\n  function mountResultRace/);
const pollFn = pollFnMatch ? pollFnMatch[0] : '';
const rxFn = rxFnMatch ? rxFnMatch[0] : '';
assert(!!pollFn && /reuseRows/.test(pollFn) && /cart\.style\.left = p \+ '%'/.test(pollFn), '14c. #240 poll geometry race function intact');
assert(
  !!rxFn &&
    !/function lockIconFloor/.test(rxFn) &&
    !/scrollTop\s*\+=/.test(rxFn) &&
    !/scrollTop\s*=/.test(rxFn) &&
    !/scrollIntoView/.test(rxFn),
  '15. #240 reaction race still does not own scroll during animation'
);
assert(
  /function ensureRaceAreaVisibleOnce/.test(revealJs) &&
    /scrollIntoView/.test(revealJs) &&
    /at most one positioning scroll/i.test(revealJs),
  'scroll helper exists once, outside the race loop'
);

assert(
  ECONOMY_SETTING_DEFS.hidden_nugget.default === 1 &&
    ECONOMY_SETTING_DEFS.poll_response.default === 0 &&
    ECONOMY_SETTING_DEFS.reaction.default === 0,
  '17. economy defaults unchanged: Hidden Nugget +1, poll 0, reaction 0'
);
assert(/\/api\/hidden-nugget\/reveal-claim/.test(hnClient) && /claimReveal/.test(hnClient), 'client claim helper posts to the server route');
assert(/is-prior-choice/.test(cardsCss) && /#56d078/.test(cardsCss), 'prior poll choice uses a green outline');
assert(/lanternRevealResultsBtn/.test(cardsCss) && /font-size:\s*24px/.test(cardsCss), 'Reveal Results button is 24px and full width');
assert(/outline:\s*3px solid #56d078/.test(rxCss), 'prior reaction keeps a green selected outline');
assert(/Reveal Results/.test(cardUi) || /revealLabel/.test(revealJs), 'Reveal Results label is used');
assert(/Replay Results/.test(revealJs), 'Replay Results label is used after the first reveal');

console.log('\nhidden-nugget-242-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
