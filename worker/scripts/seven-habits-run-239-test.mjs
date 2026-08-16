/**
 * Prompt #239 — balanced 14-question run selection + existing-mission regression.
 * Usage: node worker/scripts/seven-habits-run-239-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import {
  EDUCATIONAL_TRIVIA_MISSIONS,
  EDUCATIONAL_TRIVIA_CORRECT_TARGET,
  pickNextQuestion,
  pickBalancedSevenHabitsRun,
  startEducationalTriviaRun,
  answerEducationalTriviaRun,
  getEducationalTriviaBank,
  overlayEducationalTriviaMissions,
  SEVEN_HABITS_SELECTION,
} from '../educational-trivia-missions.js';
import { SEVEN_HABITS_TRIVIA_BANK, SEVEN_HABITS_NAMES } from '../seven-habits-trivia-bank.js';
import { HANDBOOK_TRIVIA_BANK, LOCAL_HISTORY_TRIVIA_BANK, SRP_SAFETY_TRIVIA_BANK } from '../educational-trivia-banks.js';
import { WAVE2_MISSION_IDS } from '../mission-event-completions.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function assertRun(items, label) {
  if (!Array.isArray(items) || items.length !== 14) {
    bad(label + ' size', items && items.length);
    return false;
  }
  const ids = items.map((q) => q.id);
  if (new Set(ids).size !== 14) {
    bad(label + ' duplicate ids', ids);
    return false;
  }
  let good = true;
  SEVEN_HABITS_NAMES.forEach((habit) => {
    const pair = items.filter((q) => q.habit === habit);
    const rec = pair.filter((q) => q.qtype === 'recognition');
    const app = pair.filter((q) => q.qtype === 'application');
    if (pair.length !== 2 || rec.length !== 1 || app.length !== 1) {
      bad(label + ' ' + habit, { pair: pair.length, rec: rec.length, app: app.length });
      good = false;
    }
  });
  return good;
}

let runOk = 0;
const signatures = new Set();
for (let i = 0; i < 80; i++) {
  const items = pickBalancedSevenHabitsRun(SEVEN_HABITS_TRIVIA_BANK, [], mulberry32(1000 + i * 17));
  if (assertRun(items, 'seed ' + i)) runOk++;
  signatures.add(items.map((q) => q.id).join('|'));
}
if (runOk === 80) ok('80 seeded runs: 14 questions, 2 per habit, 1 recognition + 1 application');
else bad('seeded run failures', 80 - runOk);
if (signatures.size >= 70) ok('seeded runs produce substantial variety (' + signatures.size + ' unique sets)');
else bad('low run variety', signatures.size);

const grouped = [];
SEVEN_HABITS_NAMES.forEach((habit) => {
  const rec = SEVEN_HABITS_TRIVIA_BANK.find((q) => q.habit === habit && q.qtype === 'recognition');
  const app = SEVEN_HABITS_TRIVIA_BANK.find((q) => q.habit === habit && q.qtype === 'application');
  grouped.push(rec, app);
});
let adjacentPairs = 0;
for (let i = 0; i < 40; i++) {
  const items = pickBalancedSevenHabitsRun(SEVEN_HABITS_TRIVIA_BANK, [], mulberry32(9000 + i));
  let adj = 0;
  for (let j = 0; j < items.length - 1; j++) {
    if (items[j].habit === items[j + 1].habit) adj++;
  }
  if (adj === 7) adjacentPairs++;
}
if (adjacentPairs <= 2) ok('final order is shuffled (not habit-by-habit pairs)');
else bad('order still grouped by habit', adjacentPairs);

const avoid = pickBalancedSevenHabitsRun(SEVEN_HABITS_TRIVIA_BANK, [], mulberry32(42)).map((q) => q.id);
const next = pickBalancedSevenHabitsRun(SEVEN_HABITS_TRIVIA_BANK, avoid, mulberry32(43));
if (assertRun(next, 'avoid replay') && next.every((q) => !avoid.includes(q.id))) {
  ok('avoid-ids skips the previous 14 when the pools allow it');
} else bad('avoid-ids', next.map((q) => q.id));

const hbAsked = [];
const hbFirst = pickNextQuestion(HANDBOOK_TRIVIA_BANK, hbAsked, '');
hbAsked.push(hbFirst.id);
const hbSecond = pickNextQuestion(HANDBOOK_TRIVIA_BANK, hbAsked, hbFirst.id);
if (hbFirst && hbSecond && hbFirst.id !== hbSecond.id && !hbFirst.habit) {
  ok('Handbook pickNextQuestion unchanged (no habit pairing)');
} else bad('Handbook selector drifted', { hbFirst, hbSecond });

const lh = pickNextQuestion(LOCAL_HISTORY_TRIVIA_BANK, [], '');
const srp = pickNextQuestion(SRP_SAFETY_TRIVIA_BANK, [], '');
if (lh && srp && lh.category === 'local_history' && srp.category === 'srp_safety') {
  ok('Trinidad and SRP still use the shared unused-pool picker');
} else bad('Trinidad/SRP picker');

const def = EDUCATIONAL_TRIVIA_MISSIONS.perm_seven_habits;
if (
  def &&
  def.title === '7 Habits Challenge' &&
  def.selection === SEVEN_HABITS_SELECTION &&
  def.correct_target === EDUCATIONAL_TRIVIA_CORRECT_TARGET &&
  def.reward_nuggets === 1 &&
  def.allow_practice_after_complete &&
  def.require_full_run_before_completion === true &&
  def.run_length === 14 &&
  WAVE2_MISSION_IDS.SEVEN_HABITS === 'perm_seven_habits'
) {
  ok('mission metadata uses existing 10-correct / +1 Nugget contract');
} else bad('mission metadata', def);

if (
  EDUCATIONAL_TRIVIA_MISSIONS.perm_handbook_trivia.selection == null &&
  EDUCATIONAL_TRIVIA_MISSIONS.perm_local_history_trivia.selection == null &&
  EDUCATIONAL_TRIVIA_MISSIONS.perm_srp_safety.selection == null &&
  !EDUCATIONAL_TRIVIA_MISSIONS.perm_handbook_trivia.require_full_run_before_completion &&
  !EDUCATIONAL_TRIVIA_MISSIONS.perm_local_history_trivia.require_full_run_before_completion &&
  !EDUCATIONAL_TRIVIA_MISSIONS.perm_srp_safety.require_full_run_before_completion
) {
  ok('balanced sampling is optional and off for Handbook / Trinidad / SRP');
} else bad('other missions gained selection config');

if (overlayEducationalTriviaMissions([]).some((m) => m.id === 'perm_seven_habits') && overlayEducationalTriviaMissions([]).length === 4) {
  ok('overlay includes 7 Habits as the fourth educational trivia mission');
} else bad('overlay count', overlayEducationalTriviaMissions([]).length);

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
      for (const row of submissions.values()) {
        if (row.mission_id === binds[0] && row.character_name === binds[1] && row.status === 'accepted') {
          return { id: row.id, created_at: row.created_at, status: row.status };
        }
      }
      return null;
    }
    if (s.includes('SELECT submission_content FROM lantern_mission_submissions WHERE mission_id = ? AND character_name = ?')) {
      const rows = [];
      for (const row of submissions.values()) {
        if (row.mission_id === binds[0] && row.character_name === binds[1]) rows.push(row);
      }
      rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      return rows[0] || null;
    }
    if (s.includes('FROM lantern_mission_submissions WHERE id = ?')) return submissions.get(binds[0]) || null;
    if (s.includes('FROM lantern_missions WHERE id = ?')) return missions.get(binds[0]) || null;
    if (s.includes('SELECT balance FROM lantern_wallets')) {
      const bal = wallets.get(binds[0]);
      return bal != null ? { balance: bal } : null;
    }
    if (s.includes('FROM lantern_transactions WHERE id = ?') || s.includes('SELECT id, character_name, delta, kind, created_at FROM lantern_transactions WHERE id =')) {
      return txs.get(binds[0]) || null;
    }
    return null;
  }
  return {
    _submissions: submissions,
    _wallets: wallets,
    _txs: txs,
    prepare(sql) {
      const s = String(sql);
      return {
        bind(...binds) {
          return {
            async first() { return matchSelect(s, binds); },
            async run() {
              if (s.includes('INSERT OR IGNORE INTO lantern_missions')) {
                if (!missions.has(binds[0])) missions.set(binds[0], { id: binds[0] });
                return { meta: { changes: 1 } };
              }
              if (s.startsWith('INSERT INTO lantern_mission_completions')) {
                if (completions.has(binds[4])) throw new Error('UNIQUE');
                completions.set(binds[4], {
                  id: binds[0],
                  mission_id: binds[1],
                  character_name: binds[2],
                  trigger_type: binds[3],
                  event_key: binds[4],
                  source_ref: binds[5],
                  submission_id: binds[6],
                  created_at: binds[7],
                });
                return { meta: { changes: 1 } };
              }
              if (s.startsWith('INSERT INTO lantern_mission_submissions')) {
                if (submissions.has(binds[0])) throw new Error('UNIQUE');
                submissions.set(binds[0], {
                  id: binds[0],
                  mission_id: binds[1],
                  character_name: binds[2],
                  submission_type: binds[3],
                  submission_content: binds[4],
                  status: binds[5],
                  created_at: binds[6],
                  reviewed_by: binds[binds.length - 1],
                });
                return { meta: { changes: 1 } };
              }
              if (s.startsWith('UPDATE lantern_mission_submissions SET submission_content')) {
                const row = submissions.get(binds[1]);
                if (row) row.submission_content = binds[0];
                return { meta: { changes: 1 } };
              }
              if (s.startsWith('UPDATE lantern_mission_submissions')) {
                const row = submissions.get(binds[binds.length - 1]);
                if (row) {
                  row.status = binds[0];
                  row.submission_content = binds[3];
                }
                return { meta: { changes: 1 } };
              }
              if (s.startsWith('INSERT INTO lantern_transactions')) {
                if (txs.has(binds[0])) throw new Error('UNIQUE');
                txs.set(binds[0], { id: binds[0], character_name: binds[1], delta: binds[2] });
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
          };
        },
      };
    },
    async batch(stmts) {
      for (const st of stmts) await st.run();
    },
  };
}

function bankItem(id) {
  return SEVEN_HABITS_TRIVIA_BANK.find((q) => q.id === id);
}

{
  const db = makeDb();
  const start = await startEducationalTriviaRun(db, null, {
    characterName: '20889',
    missionId: 'perm_seven_habits',
    gameId: 'seven-habits-trivia',
    runId: 'run-7h-1',
    target: 1,
    reward: 99,
  });
  const row = [...db._submissions.values()][0];
  const state = JSON.parse(row.submission_content);
  const queued = state.run_queue.map((id) => bankItem(id));
  if (
    start.ok &&
    start.target === 10 &&
    start.reward_nuggets === 1 &&
    start.question &&
    start.question.correctIndex == null &&
    state.run_queue.length === 14 &&
    assertRun(queued, 'persisted queue')
  ) {
    ok('start stores a balanced 14-question server queue and hides answers');
  } else bad('start queue', { start, state });

  const hbStart = await startEducationalTriviaRun(db, null, {
    characterName: '20889',
    missionId: 'perm_handbook_trivia',
    gameId: 'handbook-trivia',
    runId: 'run-hb-reg',
  });
  const hbRow = db._submissions.get('msub_trivia_run-hb-reg');
  const hbState = JSON.parse(hbRow.submission_content);
  if (hbStart.ok && !hbState.run_queue && !hbState.selection) ok('Handbook start still uses pick-next, not a 14-queue');
  else bad('Handbook start changed', hbState);
}

{
  const db = makeDb();
  const opts = { characterName: '20889', missionId: 'perm_seven_habits', gameId: 'seven-habits-trivia', runId: 'run-7h-score' };
  let cur = await startEducationalTriviaRun(db, null, opts);
  let seen = 0;
  const habits = new Set();
  const types = Object.create(null);
  while (cur.question && seen < 20) {
    const item = bankItem(cur.question.id);
    habits.add(item.habit);
    types[item.habit] = types[item.habit] || { recognition: 0, application: 0 };
    types[item.habit][item.qtype] += 1;
    cur = await answerEducationalTriviaRun(db, null, {
      ...opts,
      questionId: cur.question.id,
      choiceIndex: item.correctIndex,
      correctCount: 99,
    });
    seen++;
    if (cur.completed) break;
  }
  if (seen === 14 && cur.completed && cur.correct_count === 14 && cur.rewarded && db._wallets.get('20889') === 1) {
    ok('10 correct completes with one Nugget via existing event path');
  } else bad('scoring/reward', { seen, cur, bal: db._wallets.get('20889') });
  if (habits.size === 7) ok('a completing run still encountered all seven habits in the queued 14');
  else bad('habit coverage during play', [...habits]);

  const replay = await startEducationalTriviaRun(db, null, { ...opts, runId: 'run-7h-replay' });
  if (replay.ok && replay.question && replay.question.id) ok('practice run still starts after first completion');
  else bad('practice after complete', replay);
  let r = replay;
  for (let i = 0; i < 14; i++) {
    const item = bankItem(r.question.id);
    r = await answerEducationalTriviaRun(db, null, {
      characterName: '20889',
      missionId: 'perm_seven_habits',
      gameId: 'seven-habits-trivia',
      runId: 'run-7h-replay',
      questionId: r.question.id,
      choiceIndex: item.correctIndex,
    });
  }
  if (r.completed && r.rewarded === false && db._wallets.get('20889') === 1) {
    ok('replay completion does not award a second Nugget');
  } else bad('replay reward', r);
}

{
  const db = makeDb();
  const opts = { characterName: '20889', missionId: 'perm_seven_habits', gameId: 'seven-habits-trivia', runId: 'run-7h-miss' };
  let cur = await startEducationalTriviaRun(db, null, opts);
  let answers = 0;
  while (cur.question && answers < 20) {
    const item = bankItem(cur.question.id);
    const wrong = (item.correctIndex + 1) % 4;
    cur = await answerEducationalTriviaRun(db, null, {
      ...opts,
      questionId: cur.question.id,
      choiceIndex: wrong,
    });
    answers++;
  }
  if (answers === 14 && !cur.completed && cur.run_exhausted && cur.correct_count === 0 && !cur.question) {
    ok('a 14-question miss run ends without a false completion or reward');
  } else bad('exhausted miss run', { answers, cur });
}

const clientSrc = fs.readFileSync(path.join(root, 'app/js/lantern-educational-trivia-missions.js'), 'utf8');
const gamesHtml = fs.readFileSync(path.join(root, 'app/games.html'), 'utf8');
const missionsHtml = fs.readFileSync(path.join(root, 'app/missions.html'), 'utf8');
const catalogSrc = fs.readFileSync(path.join(root, 'app/js/lantern-game-catalog.js'), 'utf8');
if (
  clientSrc.includes("id: 'perm_seven_habits'") &&
  clientSrc.includes("gameId: 'seven-habits-trivia'") &&
  gamesHtml.includes('sevenHabitsTriviaPlayBtn') &&
  missionsHtml.includes("sevenHabits: 'perm_seven_habits'") &&
  catalogSrc.includes("id: 'seven-habits-trivia'")
) {
  ok('client mission, games play button, and catalog are wired');
} else bad('client wiring');

if (getEducationalTriviaBank('handbook-trivia').length === 50 && getEducationalTriviaBank('srp-safety-trivia').length === 30) {
  ok('shared bank lookup still returns Handbook 50 and SRP 30');
} else bad('shared lookup regression');

const sandbox = { window: {}, Math, console };
sandbox.globalThis = sandbox.window;
vm.runInNewContext(fs.readFileSync(path.join(root, 'app/js/lantern-educational-trivia-missions.js'), 'utf8'), sandbox);
const EDU = sandbox.window.LANTERN_EDU_TRIVIA;
if (
  EDU.isSponsoredFreePair('perm_seven_habits', 'seven-habits-trivia') &&
  !EDU.isSponsoredFreePair('perm_seven_habits', 'handbook-trivia') &&
  EDU.launchUrl('perm_seven_habits', { replay: true }).indexOf('mission=perm_seven_habits') !== -1
) {
  ok('sponsored pair is exact and replay stays in mission context');
} else bad('sponsored pair');

console.log('\n7 Habits run selection #239:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
