/**
 * Prompt #242 — 7 Habits full-14 completion semantics (10/14 pass after all 14 answers).
 * Usage: node worker/scripts/seven-habits-complete-242-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  EDUCATIONAL_TRIVIA_MISSIONS,
  EDUCATIONAL_TRIVIA_CORRECT_TARGET,
  startEducationalTriviaRun,
  answerEducationalTriviaRun,
  getEducationalTriviaBank,
} from '../educational-trivia-missions.js';
import { SEVEN_HABITS_TRIVIA_BANK, SEVEN_HABITS_NAMES } from '../seven-habits-trivia-bank.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

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
    _completions: completions,
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

function bankItem(id, gameId) {
  return getEducationalTriviaBank(gameId || 'seven-habits-trivia').find((q) => q.id === id);
}

function habitsCovered(ids) {
  const types = Object.create(null);
  ids.forEach((id) => {
    const item = bankItem(id);
    if (!item) return;
    types[item.habit] = types[item.habit] || { recognition: 0, application: 0 };
    types[item.habit][item.qtype] += 1;
  });
  return SEVEN_HABITS_NAMES.every((habit) => types[habit] && types[habit].recognition === 1 && types[habit].application === 1);
}

async function play(db, opts, question, correct) {
  const item = bankItem(question.id, opts.gameId);
  const choiceIndex = correct ? item.correctIndex : (item.correctIndex + 1) % 4;
  return answerEducationalTriviaRun(db, null, {
    ...opts,
    questionId: question.id,
    choiceIndex,
  });
}

{
  const def = EDUCATIONAL_TRIVIA_MISSIONS.perm_seven_habits;
  if (
    def.require_full_run_before_completion === true &&
    def.run_length === 14 &&
    def.correct_target === EDUCATIONAL_TRIVIA_CORRECT_TARGET &&
    EDUCATIONAL_TRIVIA_CORRECT_TARGET === 10 &&
    !EDUCATIONAL_TRIVIA_MISSIONS.perm_handbook_trivia.require_full_run_before_completion &&
    !EDUCATIONAL_TRIVIA_MISSIONS.perm_local_history_trivia.require_full_run_before_completion &&
    !EDUCATIONAL_TRIVIA_MISSIONS.perm_srp_safety.require_full_run_before_completion
  ) {
    ok('1/16. optional full-run config is 7 Habits only; 10/14 remains the pass threshold');
  } else bad('1/16. mission config', def);
}

{
  const db = makeDb();
  const opts = { characterName: '20889', missionId: 'perm_seven_habits', gameId: 'seven-habits-trivia', runId: 'run-242-ten' };
  let cur = await startEducationalTriviaRun(db, null, opts);
  const row = [...db._submissions.values()][0];
  const state = JSON.parse(row.submission_content);
  if (state.run_queue.length === 14 && cur.run_length === 14 && cur.question_number === 1 && cur.target === 10) {
    ok('1. start selects 14 and reports Question 1 of 14');
  } else bad('1. start length', { queue: state.run_queue.length, cur });

  const asked = [];
  for (let i = 0; i < 10; i++) {
    asked.push(cur.question.id);
    cur = await play(db, opts, cur.question, true);
    if (i < 9 && (cur.completed || cur.rewarded || !cur.question)) {
      bad('early stop before 10', { i, cur });
    }
  }
  if (
    asked.length === 10 &&
    cur.correct_count === 10 &&
    cur.completed !== true &&
    cur.rewarded !== true &&
    cur.locked !== true &&
    cur.question &&
    cur.question.id &&
    db._wallets.get('20889') == null &&
    db._completions.size === 0
  ) {
    ok('3/4. 10 correct after question 10 does not complete or award');
  } else bad('3/4. early 10', { cur, bal: db._wallets.get('20889'), comps: db._completions.size });

  if (cur.question_number === 11 && cur.run_length === 14) ok('5. question 11 is still served');
  else bad('5. q11', { qn: cur.question_number, id: cur.question && cur.question.id });

  asked.push(cur.question.id);
  cur = await play(db, opts, cur.question, false);
  if (cur.question && cur.question_number === 12 && !cur.completed && cur.correct_count === 10) ok('6. question 12 is still served');
  else bad('6. q12', cur);

  asked.push(cur.question.id);
  cur = await play(db, opts, cur.question, false);
  if (cur.question && cur.question_number === 13 && !cur.completed && cur.correct_count === 10) ok('7. question 13 is still served');
  else bad('7. q13', cur);

  asked.push(cur.question.id);
  cur = await play(db, opts, cur.question, false);
  if (cur.question && cur.question_number === 14 && !cur.completed && cur.correct_count === 10) ok('8. question 14 is still served');
  else bad('8. q14', cur);

  asked.push(cur.question.id);
  cur = await play(db, opts, cur.question, false);
  if (
    asked.length === 14 &&
    cur.correct_count === 10 &&
    cur.completed === true &&
    cur.rewarded === true &&
    !cur.question &&
    db._wallets.get('20889') === 1 &&
    db._completions.size === 1
  ) {
    ok('9/10. after all 14 with 10 correct → complete + first Nugget once');
  } else bad('9/10. finish 10/14', { asked: asked.length, cur, bal: db._wallets.get('20889') });

  if (habitsCovered(asked) && habitsCovered(state.run_queue)) {
    ok('14. all seven recognition + application pairs were answered before completion');
  } else bad('14. habit pairs', asked);

  const replay = await startEducationalTriviaRun(db, null, { ...opts, runId: 'run-242-replay' });
  let r = replay;
  for (let i = 0; i < 14; i++) {
    r = await play(db, { ...opts, runId: 'run-242-replay' }, r.question, true);
  }
  if (r.completed && r.rewarded === false && db._wallets.get('20889') === 1 && db._completions.size === 1) {
    ok('13. replay after completion does not award again');
  } else bad('13. replay', { r, bal: db._wallets.get('20889'), comps: db._completions.size });
}

{
  const db = makeDb();
  const opts = { characterName: '20889', missionId: 'perm_seven_habits', gameId: 'seven-habits-trivia', runId: 'run-242-nine' };
  let cur = await startEducationalTriviaRun(db, null, opts);
  for (let i = 0; i < 9; i++) cur = await play(db, opts, cur.question, true);
  for (let i = 0; i < 5; i++) cur = await play(db, opts, cur.question, false);
  if (
    cur.correct_count === 9 &&
    cur.completed !== true &&
    cur.run_exhausted === true &&
    cur.rewarded !== true &&
    !cur.question &&
    db._wallets.get('20889') == null &&
    db._completions.size === 0
  ) {
    ok('11. after all 14 answered with 9 correct → mission does not complete');
  } else bad('11. 9/14', { cur, bal: db._wallets.get('20889') });
}

{
  const db = makeDb();
  const opts = { characterName: '20889', missionId: 'perm_seven_habits', gameId: 'seven-habits-trivia', runId: 'run-242-perfect' };
  let cur = await startEducationalTriviaRun(db, null, opts);
  for (let i = 0; i < 14; i++) cur = await play(db, opts, cur.question, true);
  if (cur.completed && cur.correct_count === 14 && cur.rewarded && db._wallets.get('20889') === 1) {
    ok('12. 14/14 completes normally');
  } else bad('12. 14/14', cur);
}

{
  const db = makeDb();
  const opts = { characterName: '20889', missionId: 'perm_seven_habits', gameId: 'seven-habits-trivia', runId: 'run-242-forge' };
  let cur = await startEducationalTriviaRun(db, null, opts);
  for (let i = 0; i < 10; i++) cur = await play(db, opts, cur.question, true);
  const forged = await answerEducationalTriviaRun(db, null, {
    ...opts,
    questionId: cur.question.id,
    choiceIndex: bankItem(cur.question.id).correctIndex,
    completed: true,
    correctCount: 14,
    correct_count: 14,
    reward: 99,
    reward_nuggets: 99,
    asked_count: 14,
  });
  if (
    forged.ok &&
    forged.correct_count === 11 &&
    forged.completed !== true &&
    forged.rewarded !== true &&
    forged.question &&
    forged.question_number === 12 &&
    db._wallets.get('20889') == null
  ) {
    ok('15. client attempt to claim completion early is ignored');
  } else bad('15. forge', forged);
}

async function playUntilTen(db, missionId, gameId, runId) {
  const opts = { characterName: '20889', missionId, gameId, runId };
  let cur = await startEducationalTriviaRun(db, null, opts);
  let seen = 0;
  while (cur.question && seen < 20) {
    cur = await play(db, opts, cur.question, true);
    seen++;
    if (cur.completed) break;
  }
  return { cur, seen };
}

{
  const db = makeDb();
  const hb = await playUntilTen(db, 'perm_handbook_trivia', 'handbook-trivia', 'run-242-hb');
  if (hb.seen === 10 && hb.cur.completed && hb.cur.correct_count === 10 && hb.cur.rewarded) {
    ok('16. Handbook still completes at 10 correct');
  } else bad('16. Handbook', hb);
}

{
  const db = makeDb();
  const tr = await playUntilTen(db, 'perm_local_history_trivia', 'local-history-trivia', 'run-242-tr');
  if (tr.seen === 10 && tr.cur.completed && tr.cur.correct_count === 10 && tr.cur.rewarded) {
    ok('17. Trinidad still completes at 10 correct');
  } else bad('17. Trinidad', tr);
}

{
  const db = makeDb();
  const srp = await playUntilTen(db, 'perm_srp_safety', 'srp-safety-trivia', 'run-242-srp');
  if (srp.seen === 10 && srp.cur.completed && srp.cur.correct_count === 10 && srp.cur.rewarded) {
    ok('18. SRP still completes at 10 correct');
  } else bad('18. SRP', srp);
}

{
  const gamesHtml = fs.readFileSync(path.join(root, 'app/games.html'), 'utf8');
  const slice = gamesHtml.slice(gamesHtml.indexOf('function runEducationalTriviaMission'), gamesHtml.indexOf('function playBtnIdForGameName'));
  if (
    gamesHtml.includes('Question ') &&
    gamesHtml.includes(' of ') &&
    gamesHtml.includes(' / 10 correct') &&
    /if \(res\.completed\)/.test(slice) &&
    !/count >= target/.test(slice) &&
    slice.includes('Keep practicing!') &&
    slice.includes("Get ' + target + ' of ")
  ) {
    ok('UX: Question N of 14; no premature victory on count >= 10');
  } else bad('UX games.html', { hasCount: /count >= target/.test(slice) });
}

if (SEVEN_HABITS_TRIVIA_BANK.length === 84) ok('84-question bank unchanged');
else bad('bank size', SEVEN_HABITS_TRIVIA_BANK.length);

console.log('\n7 Habits completion #242:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
