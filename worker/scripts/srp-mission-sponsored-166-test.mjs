/**
 * Prompt #166 — SRP Safety Challenge Mission: free pair, server scoring, +1 reward.
 * Usage: node worker/scripts/srp-mission-sponsored-166-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import {
  EDUCATIONAL_TRIVIA_MISSIONS,
  EDUCATIONAL_TRIVIA_REWARD_NUGGETS,
  resolveEducationalTriviaMissionForGame,
  getEducationalTriviaBank,
  startEducationalTriviaRun,
  answerEducationalTriviaRun,
} from '../educational-trivia-missions.js';
import { LANTERN_LEADERBOARD_GAMES } from '../lantern-game-catalog.js';
import { WAVE2_MISSION_IDS } from '../mission-event-completions.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

const clientSrc = fs.readFileSync(path.join(root, 'app/js/lantern-educational-trivia-missions.js'), 'utf8');
const gamesHtml = fs.readFileSync(path.join(root, 'app/games.html'), 'utf8');
const playerJs = fs.readFileSync(path.join(root, 'app/js/lantern-game-player.js'), 'utf8');
const missionsPageJs = fs.readFileSync(path.join(root, 'app/js/lantern-missions-page.js'), 'utf8');
const catalogSrc = fs.readFileSync(path.join(root, 'app/js/lantern-game-catalog.js'), 'utf8');
const workerIndex = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
const eduSrc = fs.readFileSync(path.join(root, 'worker/educational-trivia-missions.js'), 'utf8');
const paidStartJs = fs.readFileSync(path.join(root, 'app/js/lantern-games-paid-start.js'), 'utf8');
const cardsSrc = fs.readFileSync(path.join(root, 'app/js/lantern-cards.js'), 'utf8');
const missionsHtml = fs.readFileSync(path.join(root, 'app/missions.html'), 'utf8');

const sandbox = { window: {}, crypto: { randomUUID: () => 'uuid-test' }, URLSearchParams };
sandbox.globalThis = sandbox.window;
vm.runInNewContext(clientSrc, sandbox);
const EDU = sandbox.window.LANTERN_EDU_TRIVIA;
const loc = (search) => ({ search });

const srp = EDUCATIONAL_TRIVIA_MISSIONS.perm_srp_safety;

if (catalogSrc.includes("id: 'srp-safety-trivia'") && catalogSrc.includes("name: 'SRP Safety Challenge'")) ok('1. game registered');
else bad('1. game registered');

if (srp && srp.id === 'perm_srp_safety' && srp.title === 'SRP Safety Challenge' && WAVE2_MISSION_IDS.SRP_SAFETY === 'perm_srp_safety') {
  ok('2. mission registered');
} else bad('2. mission registered', srp);

if (EDU.isSponsoredFreePair('perm_srp_safety', 'srp-safety-trivia') && EDU.isSponsoredFreeLaunch(loc('?game=srp-safety-trivia&mission=perm_srp_safety'), 'SRP Safety Challenge')) {
  ok('35. Mission launch free');
} else bad('35. Mission launch free');

if (!EDU.isSponsoredFreeLaunch(loc('?game=srp-safety-trivia'), 'SRP Safety Challenge')) {
  ok('40. direct Games play is not sponsored');
} else bad('40. direct not sponsored');

if (
  !EDU.isSponsoredFreeLaunch(loc('?game=handbook-trivia&mission=perm_srp_safety'), 'Handbook Trivia') &&
  !EDU.isSponsoredFreeLaunch(loc('?game=local-history-trivia&mission=perm_srp_safety'), 'Local History Trivia') &&
  !EDU.isSponsoredFreeLaunch(loc('?game=reaction&mission=perm_srp_safety'), 'Reaction Tap') &&
  !EDU.isSponsoredFreePair('perm_srp_safety', 'handbook-trivia')
) {
  ok('41. forged mission query cannot make another game free');
} else bad('41. forge bypass');

if (EDU.SPONSORED_FREE_MISSION_ID === 'perm_local_history_trivia' && EDU.SPONSORED_FREE_GAME_ID === 'local-history-trivia') {
  ok('Trinidad sponsored scalars preserved');
} else bad('Trinidad scalars');

if (
  missionsPageJs.includes("item.id === 'perm_srp_safety'") &&
  missionsPageJs.includes("item.id === 'perm_local_history_trivia'") &&
  missionsPageJs.includes("return 'FREE · +1 Nugget'") &&
  missionsPageJs.includes('assets/icons/nugget.png')
) {
  ok('37/38. Mission card says FREE and +1 Nugget');
} else bad('37/38 card');

if (
  playerJs.includes('FREE TO PLAY') &&
  playerJs.includes('assets/icons/nugget.png') &&
  playerJs.includes('+1 Nugget') &&
  playerJs.includes("cost + ' Nugget = 1 Play'")
) {
  ok('39. Mission pregame FREE; direct keeps paid copy');
} else bad('39 pregame');

if (
  gamesHtml.includes('isSponsoredFreeLaunch') &&
  gamesHtml.includes('if (sponsored)') &&
  gamesHtml.includes("tryPlay('SRP Safety Challenge'") &&
  gamesHtml.includes('srpSafetyTriviaPlayBtn')
) {
  ok('36. Mission start skips startPaidGame / no -1 game_play');
} else bad('36 charge skip');

if (catalogSrc.includes("id: 'srp-safety-trivia'") && /play_cost:\s*1/.test(catalogSrc) && catalogSrc.includes("id: 'handbook-trivia'")) {
  ok('40b. direct Games cost remains 1 Nugget = 1 Play');
} else bad('40b cost');

if (
  workerIndex.includes('findPaidGamePlayByRunId') &&
  workerIndex.includes('evaluatePaidGamePlayRun') &&
  gamesHtml.includes('getLastRunId') &&
  !gamesHtml.includes('startPaidGame') === false
) {
  ok('42. #159 paid-run security preserved');
} else bad('42 #159');

if (eduSrc.includes('completeMissionByEvent') && EDUCATIONAL_TRIVIA_REWARD_NUGGETS === 1 && !eduSrc.includes('CREATE TABLE')) {
  ok('45/46. TMS remains Nugget authority; no D1 migration');
} else bad('45/46 authority/migration');

if (cardsSrc.includes("perm_srp_safety: 'assets/srp-safety-trivia-card.png'") && fs.existsSync(path.join(root, 'app/assets/srp-safety-trivia-card.png'))) {
  ok('game/mission cover art present');
} else bad('cover art');

if (missionsHtml.includes("srpSafety: 'perm_srp_safety'") && clientSrc.includes("sponsored_free: true")) {
  ok('missions.html WAVE2 + client sponsored_free');
} else bad('missions html / sponsored_free');

if (resolveEducationalTriviaMissionForGame('perm_srp_safety', 'handbook-trivia') == null) {
  ok('SRP maps only to srp-safety-trivia');
} else bad('SRP pairing');

const otherIds = LANTERN_LEADERBOARD_GAMES.filter((g) => g.id !== 'srp-safety-trivia').map((g) => g.id);
if (otherIds.every((id) => !EDU.isSponsoredFreePair('perm_srp_safety', id))) {
  ok('other catalog games cannot be sponsored by SRP Mission');
} else bad('other games sponsored by SRP');

if (
  EDU.launchUrl('perm_srp_safety', { replay: true }).indexOf('mission=perm_srp_safety') !== -1 &&
  EDU.launchUrl('perm_handbook_trivia', { replay: true }).indexOf('mission=') === -1
) {
  ok('SRP replay stays in Mission context; Handbook replay unchanged');
} else bad('replay urls');

function makeDb() {
  const missions = new Map();
  const submissions = new Map();
  const completions = new Map();
  const txs = new Map();
  const wallets = new Map();
  function matchSelect(sql, binds) {
    const s = String(sql);
    if (s.includes('FROM lantern_mission_completions WHERE event_key')) return completions.get(binds[0]) || null;
    if (s.includes('FROM lantern_mission_completions WHERE mission_id = ? AND character_name = ?')) {
      for (const row of completions.values()) {
        if (row.mission_id === binds[0] && row.character_name === binds[1]) return row;
      }
      return null;
    }
    if (s.includes("FROM lantern_mission_submissions WHERE mission_id = ? AND character_name = ? AND status = 'accepted'")) {
      let best = null;
      for (const row of submissions.values()) {
        if (row.mission_id === binds[0] && row.character_name === binds[1] && row.status === 'accepted') {
          if (!best || String(row.created_at) < String(best.created_at)) best = row;
        }
      }
      return best ? { id: best.id, created_at: best.created_at, status: best.status } : null;
    }
    if (s.includes('FROM lantern_mission_submissions WHERE id = ?')) return submissions.get(binds[0]) || null;
    if (s.includes('FROM lantern_missions WHERE id = ?')) return missions.get(binds[0]) || null;
    if (s.includes('FROM lantern_transactions WHERE id = ?') || s.includes('SELECT id, character_name, delta, kind, created_at FROM lantern_transactions WHERE id =')) {
      return txs.get(binds[0]) || null;
    }
    if (s.includes('SELECT balance FROM lantern_wallets')) {
      const bal = wallets.get(binds[0]);
      return bal != null ? { balance: bal } : null;
    }
    return null;
  }
  return {
    prepare(sql) {
      const s = String(sql);
      return {
        bind(...binds) {
          return {
            async first() { return matchSelect(s, binds); },
            async run() {
              if (s.includes('INSERT OR IGNORE INTO lantern_missions')) {
                if (!missions.has(binds[0])) {
                  missions.set(binds[0], { id: binds[0], title: binds[3], description: binds[4], reward_amount: binds[5], active: 1, archived: 0 });
                }
                return { meta: { changes: 1 } };
              }
              if (s.startsWith('INSERT INTO lantern_mission_completions')) {
                const row = { id: binds[0], mission_id: binds[1], character_name: binds[2], trigger_type: binds[3], event_key: binds[4], source_ref: binds[5], submission_id: binds[6], created_at: binds[7] };
                if (completions.has(row.event_key) || [...completions.values()].some((c) => c.id === row.id)) throw new Error('UNIQUE');
                completions.set(row.event_key, row);
                return { meta: { changes: 1 } };
              }
              if (s.startsWith('INSERT INTO lantern_mission_submissions')) {
                if (submissions.has(binds[0])) throw new Error('UNIQUE');
                submissions.set(binds[0], { id: binds[0], mission_id: binds[1], character_name: binds[2], submission_type: binds[3], submission_content: binds[4], status: binds[5], created_at: binds[6], reviewed_by: binds[7] });
                return { meta: { changes: 1 } };
              }
              if (s.startsWith('UPDATE lantern_mission_submissions SET submission_content = ? WHERE id = ?')) {
                const row = submissions.get(binds[1]);
                if (row) row.submission_content = binds[0];
                return { meta: { changes: row ? 1 : 0 } };
              }
              if (s.startsWith('UPDATE lantern_mission_submissions')) {
                const row = submissions.get(binds[binds.length - 1]);
                if (row) { row.status = binds[0]; row.reviewed_at = binds[1]; row.reviewed_by = binds[2]; row.submission_content = binds[3]; }
                return { meta: { changes: row ? 1 : 0 } };
              }
              if (s.startsWith('INSERT INTO lantern_transactions')) {
                if (txs.has(binds[0])) throw new Error('UNIQUE');
                txs.set(binds[0], { id: binds[0], character_name: binds[1], delta: binds[2], kind: binds[3], source: binds[4], note: binds[5], created_at: binds[6] });
                return { meta: { changes: 1 } };
              }
              if (s.includes('INSERT INTO lantern_wallets')) {
                const key = binds[0];
                const startBal = binds[1];
                const delta = binds[3];
                const cur = wallets.has(key) ? wallets.get(key) : startBal - delta;
                wallets.set(key, cur + delta);
                return { meta: { changes: 1 } };
              }
              return { meta: { changes: 0 } };
            },
            async all() { return { results: [] }; },
          };
        },
      };
    },
    async batch(stmts) { for (const st of stmts) await st.run(); },
    _missions: missions,
    _submissions: submissions,
    _completions: completions,
    _txs: txs,
    _wallets: wallets,
  };
}

function bankItem(questionId) {
  return getEducationalTriviaBank('srp-safety-trivia').find((q) => q.id === questionId);
}
async function playCorrect(db, opts, question) {
  return answerEducationalTriviaRun(db, null, { ...opts, questionId: question.id, choiceIndex: bankItem(question.id).correctIndex });
}
async function playWrong(db, opts, question) {
  return answerEducationalTriviaRun(db, null, { ...opts, questionId: question.id, choiceIndex: (bankItem(question.id).correctIndex + 1) % 4 });
}

{
  const db = makeDb();
  const opts = { characterName: '20889', missionId: srp.id, gameId: srp.game_id, runId: 'run-srp-1', correctCount: 10, reward: 99 };
  const start = await startEducationalTriviaRun(db, null, opts);
  if (start.ok && start.correct_count === 0 && start.target === 10 && start.question && start.question.correctIndex == null) {
    ok('22. mission starts at 0/10; public question has no correctIndex');
  } else bad('22. start', start);

  const asked = [start.question.id];
  const correct = await playCorrect(db, opts, start.question);
  if (correct.ok && correct.correct && correct.correct_count === 1 && !correct.completed && correct.explanation) {
    ok('23. correct increments by one + explanation');
  } else bad('23. correct', correct);

  const wrong = await playWrong(db, opts, correct.question);
  asked.push(correct.question.id);
  if (wrong.ok && !wrong.correct && wrong.correct_count === 1 && !wrong.completed && wrong.explanation) {
    ok('24/25. wrong does not increment or reset + explanation');
  } else bad('24/25 wrong', wrong);

  const forged = await answerEducationalTriviaRun(db, null, {
    ...opts,
    questionId: wrong.question.id,
    choiceIndex: (bankItem(wrong.question.id).correctIndex + 1) % 4,
    correctCount: 10,
    correct: true,
    reward_nuggets: 99,
  });
  if (forged.ok && forged.correct_count === 1 && !forged.completed) ok('30/31/32. client cannot forge correctness, correctCount, or reward');
  else bad('30/31/32 forge', forged);

  let cur = forged;
  for (let i = 0; i < 8; i++) {
    cur = await playCorrect(db, opts, cur.question);
  }
  if (cur.ok && cur.correct_count === 9 && !cur.completed) ok('26. 9 correct incomplete');
  else bad('26. 9 correct', cur);

  const tenth = await playCorrect(db, opts, cur.question);
  if (tenth.ok && tenth.completed && tenth.correct_count === 10 && tenth.rewarded) ok('27. 10 correct complete');
  else bad('27. 10 complete', tenth);

  if (db._wallets.get('20889') === 1 && [...db._txs.values()].filter((t) => Number(t.delta) === 1).length === 1) {
    ok('33. reward exactly +1');
  } else bad('33. reward', { wallet: db._wallets.get('20889'), txs: [...db._txs.values()] });

  const again = await startEducationalTriviaRun(db, null, { ...opts, runId: 'run-srp-2' });
  if (again.already_completed && db._wallets.get('20889') === 1 && [...db._txs.values()].length === 1) {
    ok('34. duplicate completion no double reward');
  } else bad('34. idempotent', again);
}

{
  const db = makeDb();
  const opts = { characterName: '20889', missionId: srp.id, gameId: srp.game_id, runId: 'run-srp-over' };
  let cur = await startEducationalTriviaRun(db, null, opts);
  const seen = new Set();
  let attempts = 0;
  for (let i = 0; i < 6; i++) {
    if (seen.has(cur.question.id)) {
      bad('29. no repeat before pool exhaustion', cur.question.id);
      break;
    }
    seen.add(cur.question.id);
    cur = await playWrong(db, opts, cur.question);
    attempts++;
  }
  if (seen.size === 6) ok('29. no repeat before pool exhaustion');
  for (let i = 0; i < 10; i++) {
    cur = await playCorrect(db, opts, cur.question);
    attempts++;
  }
  if (attempts > 10 && cur.completed && cur.correct_count === 10) ok('28. >10 attempts supported');
  else bad('28. over 10', { attempts, cur });
}

if (paidStartJs.includes("kind: 'game_play'") && !clientSrc.includes('localStorage')) {
  ok('no parallel wallet / client ledger');
} else bad('wallet');

console.log('\nSRP Safety Mission #166:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
