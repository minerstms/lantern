/**
 * Prompt #150 — educational trivia missions (server-authoritative 10-correct target).
 * Usage: node worker/scripts/educational-trivia-missions-150-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import {
  EDUCATIONAL_TRIVIA_MISSIONS,
  EDUCATIONAL_TRIVIA_CORRECT_TARGET,
  EDUCATIONAL_TRIVIA_REWARD_NUGGETS,
  GAME_CORRECT_TARGET_TYPE,
  resolveEducationalTriviaMission,
  resolveEducationalTriviaMissionForGame,
  getEducationalTriviaBank,
  startEducationalTriviaRun,
  answerEducationalTriviaRun,
  overlayEducationalTriviaMissions,
  isTriviaRunPendingSubmission,
  triviaRunSubmissionId,
} from '../educational-trivia-missions.js';
import { HANDBOOK_TRIVIA_BANK, LOCAL_HISTORY_TRIVIA_BANK } from '../educational-trivia-banks.js';
import { WAVE2_MISSION_IDS } from '../mission-event-completions.js';
import { isExcludedMissionCompletion, isInternalConfirmationContent } from '../marquee-events.js';
import { isSystemMissionEventMarkerSubmission } from '../mission-event-completions.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let passed = 0;
let failed = 0;

function ok(msg) {
  passed++;
  console.log('PASS', msg);
}
function bad(msg, detail) {
  failed++;
  console.log('FAIL', msg, detail != null ? detail : '');
}

function loadFrontendBanks() {
  const src = fs.readFileSync(path.join(root, 'app/js/lantern-game-content.js'), 'utf8');
  const sandbox = { window: {}, Math, console };
  sandbox.globalThis = sandbox.window;
  vm.runInNewContext(src, sandbox);
  return sandbox.window.LANTERN_GAME_CONTENT;
}

function makeDb() {
  const missions = new Map();
  const submissions = new Map();
  const completions = new Map();
  const txs = new Map();
  const wallets = new Map();

  function matchSelect(sql, binds) {
    const s = String(sql);
    if (s.includes('FROM lantern_mission_completions WHERE event_key')) {
      return completions.get(binds[0]) || null;
    }
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
    if (s.includes('FROM lantern_mission_submissions WHERE id = ?')) {
      return submissions.get(binds[0]) || null;
    }
    if (s.includes('FROM lantern_missions WHERE id = ?')) {
      return missions.get(binds[0]) || null;
    }
    if (s.includes("FROM lantern_transactions WHERE character_name = ? AND kind = 'first_game'")) {
      return null;
    }
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
            async first() {
              return matchSelect(s, binds);
            },
            async run() {
              if (s.includes('INSERT OR IGNORE INTO lantern_missions') || s.startsWith('INSERT OR IGNORE INTO lantern_missions')) {
                if (!missions.has(binds[0])) {
                  missions.set(binds[0], {
                    id: binds[0],
                    title: binds[3],
                    description: binds[4],
                    reward_amount: binds[5],
                    active: 1,
                    archived: 0,
                  });
                }
                return { meta: { changes: missions.has(binds[0]) ? 1 : 0 } };
              }
              if (s.startsWith('INSERT INTO lantern_mission_completions')) {
                const row = {
                  id: binds[0],
                  mission_id: binds[1],
                  character_name: binds[2],
                  trigger_type: binds[3],
                  event_key: binds[4],
                  source_ref: binds[5],
                  submission_id: binds[6],
                  created_at: binds[7],
                };
                if (completions.has(row.event_key) || [...completions.values()].some((c) => c.id === row.id)) {
                  throw new Error('UNIQUE');
                }
                completions.set(row.event_key, row);
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
                  reviewed_at: binds.length > 8 ? binds[7] : null,
                  reviewed_by: binds.length > 8 ? binds[8] : binds[7],
                });
                return { meta: { changes: 1 } };
              }
              if (s.startsWith('UPDATE lantern_mission_submissions SET submission_content = ? WHERE id = ?')) {
                const row = submissions.get(binds[1]);
                if (row) row.submission_content = binds[0];
                return { meta: { changes: row ? 1 : 0 } };
              }
              if (s.startsWith('UPDATE lantern_mission_submissions')) {
                const row = submissions.get(binds[binds.length - 1]);
                if (row) {
                  row.status = binds[0];
                  row.reviewed_at = binds[1];
                  row.reviewed_by = binds[2];
                  row.submission_content = binds[3];
                }
                return { meta: { changes: row ? 1 : 0 } };
              }
              if (s.startsWith('INSERT INTO lantern_transactions')) {
                if (txs.has(binds[0])) throw new Error('UNIQUE');
                txs.set(binds[0], {
                  id: binds[0],
                  character_name: binds[1],
                  delta: binds[2],
                  kind: binds[3],
                  source: binds[4],
                  note: binds[5],
                  created_at: binds[6],
                });
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
            async all() {
              return { results: [] };
            },
          };
        },
      };
    },
    async batch(stmts) {
      for (const st of stmts) await st.run();
    },
    _missions: missions,
    _submissions: submissions,
    _completions: completions,
    _txs: txs,
    _wallets: wallets,
  };
}

function bankItem(gameId, questionId) {
  return getEducationalTriviaBank(gameId).find((q) => q.id === questionId);
}

async function answerChoice(db, opts, questionId, choiceIndex) {
  return answerEducationalTriviaRun(db, null, {
    characterName: opts.characterName,
    missionId: opts.missionId,
    gameId: opts.gameId,
    runId: opts.runId,
    questionId,
    choiceIndex,
  });
}

async function playCorrect(db, opts, question) {
  const item = bankItem(opts.gameId, question.id);
  return answerChoice(db, opts, question.id, item.correctIndex);
}

async function playWrong(db, opts, question) {
  const item = bankItem(opts.gameId, question.id);
  return answerChoice(db, opts, question.id, (item.correctIndex + 1) % 4);
}

const frontend = loadFrontendBanks();
const gamesHtml = fs.readFileSync(path.join(root, 'app/games.html'), 'utf8');
const missionsHtml = fs.readFileSync(path.join(root, 'app/missions.html'), 'utf8');
const handlersSrc = fs.readFileSync(path.join(root, 'worker/missions-handlers.js'), 'utf8');
const eduSrc = fs.readFileSync(path.join(root, 'worker/educational-trivia-missions.js'), 'utf8');
const clientSrc = fs.readFileSync(path.join(root, 'app/js/lantern-educational-trivia-missions.js'), 'utf8');
const catalogSrc = fs.readFileSync(path.join(root, 'app/js/lantern-game-catalog.js'), 'utf8');
const contentSrc = fs.readFileSync(path.join(root, 'app/js/lantern-game-content.js'), 'utf8');
const banksSrc = fs.readFileSync(path.join(root, 'worker/educational-trivia-banks.js'), 'utf8');

const hb = EDUCATIONAL_TRIVIA_MISSIONS.perm_handbook_trivia;
const tr = EDUCATIONAL_TRIVIA_MISSIONS.perm_local_history_trivia;

if (hb && hb.title === 'Student Handbook Challenge') ok('1. Handbook Mission exists');
else bad('1. Handbook Mission exists', hb);

if (tr && tr.title === 'Trinidad History Challenge') ok('2. Trinidad Mission exists');
else bad('2. Trinidad Mission exists', tr);

if (hb.game_id === 'handbook-trivia' && resolveEducationalTriviaMissionForGame(hb.id, 'local-history-trivia') == null) {
  ok('3. Handbook maps only to handbook-trivia');
} else bad('3. Handbook maps only to handbook-trivia');

if (tr.game_id === 'local-history-trivia' && resolveEducationalTriviaMissionForGame(tr.id, 'handbook-trivia') == null) {
  ok('4. Trinidad maps only to local-history-trivia');
} else bad('4. Trinidad maps only to local-history-trivia');

if (
  hb.correct_target === 10 &&
  tr.correct_target === 10 &&
  EDUCATIONAL_TRIVIA_CORRECT_TARGET === 10 &&
  hb.type === GAME_CORRECT_TARGET_TYPE
) {
  ok('5. target is server-owned 10');
} else bad('5. target is server-owned 10');

if (hb.reward_nuggets === 1 && tr.reward_nuggets === 1 && EDUCATIONAL_TRIVIA_REWARD_NUGGETS === 1) {
  ok('6. reward is server-owned 1');
} else bad('6. reward is server-owned 1');

if (
  handlersSrc.includes("path === '/api/missions/trivia/run/start'") &&
  handlersSrc.includes("path === '/api/missions/trivia/answer'") &&
  handlersSrc.includes('requireMissionSession') &&
  handlersSrc.includes("participantKind !== 'student'")
) {
  ok('7. authenticated student required');
} else bad('7. authenticated student required');

{
  const db = makeDb();
  const unauth = await startEducationalTriviaRun(db, null, {
    characterName: '',
    missionId: hb.id,
    gameId: hb.game_id,
    runId: 'run-auth-1',
  });
  if (!unauth.ok && unauth.error === 'missing_identity') ok('7b. empty identity rejected');
  else bad('7b. empty identity rejected', unauth);
}

{
  const db = makeDb();
  const start = await startEducationalTriviaRun(db, null, {
    characterName: '20889',
    missionId: hb.id,
    gameId: hb.game_id,
    runId: 'run-start-0',
    target: 1,
    reward: 999,
    character_name: 'hacker',
  });
  if (start.ok && start.correct_count === 0 && start.target === 10 && start.question && start.question.id && start.question.correctIndex == null) {
    ok('8. Mission starts at 0 correct');
  } else bad('8. Mission starts at 0 correct', start);

  const item = bankItem(hb.game_id, start.question.id);
  const correct = await playCorrect(db, { characterName: '20889', missionId: hb.id, gameId: hb.game_id, runId: 'run-start-0' }, start.question);
  if (correct.ok && correct.correct && correct.correct_count === 1 && !correct.completed) ok('9. correct increments progress');
  else bad('9. correct increments progress', correct);

  const wrong = await playWrong(db, { characterName: '20889', missionId: hb.id, gameId: hb.game_id, runId: 'run-start-0' }, correct.question);
  if (wrong.ok && !wrong.correct && wrong.correct_count === 1 && !wrong.completed) ok('10. wrong does not increment');
  else bad('10. wrong does not increment', wrong);

  const still = await playWrong(db, { characterName: '20889', missionId: hb.id, gameId: hb.game_id, runId: 'run-start-0' }, wrong.question);
  if (still.ok && still.correct_count === 1 && !still.completed) ok('11. wrong does not reset');
  else bad('11. wrong does not reset', still);

  let q = still.question;
  let last = still;
  for (let i = 0; i < 8; i++) {
    last = await playCorrect(db, { characterName: '20889', missionId: hb.id, gameId: hb.game_id, runId: 'run-start-0' }, q);
    q = last.question;
  }
  if (last.ok && last.correct_count === 9 && !last.completed && q) ok('12. 9 correct does not complete');
  else bad('12. 9 correct does not complete', last);

  const tenth = await playCorrect(db, { characterName: '20889', missionId: hb.id, gameId: hb.game_id, runId: 'run-start-0' }, q);
  if (tenth.ok && tenth.completed && tenth.correct_count === 10 && tenth.rewarded) ok('13. 10th correct completes');
  else bad('13. 10th correct completes', tenth);

  const wallet = db._wallets.get('20889');
  const rewardTxs = [...db._txs.values()].filter((t) => t.character_name === '20889' && Number(t.delta) === 1);
  if (wallet === 1 && rewardTxs.length === 1) ok('14. completion gives exactly 1 Nugget');
  else bad('14. completion gives exactly 1 Nugget', { wallet, rewardTxs: rewardTxs.length });

  const dupComplete = await answerEducationalTriviaRun(db, null, {
    characterName: '20889',
    missionId: hb.id,
    gameId: hb.game_id,
    runId: 'run-start-0',
    questionId: item.id,
    choiceIndex: item.correctIndex,
  });
  if (dupComplete.ok && (dupComplete.already_completed || dupComplete.locked) && db._wallets.get('20889') === 1 && [...db._txs.values()].length === 1) {
    ok('15. duplicate completion does not double reward');
  } else bad('15. duplicate completion does not double reward', { dupComplete, wallet: db._wallets.get('20889'), txs: db._txs.size });

  const dupRun = await startEducationalTriviaRun(db, null, {
    characterName: '20889',
    missionId: hb.id,
    gameId: hb.game_id,
    runId: 'run-start-0',
  });
  const tenthAgain = await playCorrect(db, { characterName: '20889', missionId: hb.id, gameId: hb.game_id, runId: 'run-start-0' }, start.question).catch((e) => e);
  if (db._wallets.get('20889') === 1) ok('16. duplicate run result does not double reward');
  else bad('16. duplicate run result does not double reward', { dupRun, tenthAgain, wallet: db._wallets.get('20889') });

  if (start.target === 10 && start.reward_nuggets === 1 && tenth.reward_nuggets === 1) {
    ok('17. client reward override ignored/rejected');
    ok('18. client target override ignored/rejected');
  } else {
    bad('17. client reward override ignored/rejected', start);
    bad('18. client target override ignored/rejected', start);
  }
}

{
  const db = makeDb();
  const mismatch = await startEducationalTriviaRun(db, null, {
    characterName: '20889',
    missionId: hb.id,
    gameId: 'local-history-trivia',
    runId: 'run-mismatch',
  });
  if (!mismatch.ok && mismatch.error === 'invalid_mission') ok('19. different game cannot satisfy Mission');
  else bad('19. different game cannot satisfy Mission', mismatch);
}

if (
  gamesHtml.includes("function runTriviaGame(") &&
  gamesHtml.includes("function candidateTriviaMission(") &&
  gamesHtml.includes("if (mission)") &&
  gamesHtml.includes("runTriviaGame('Handbook Trivia'") &&
  !gamesHtml.includes("candidateTriviaMission('lantern-live-trivia')")
) {
  ok('20. direct Games play does not accidentally activate Mission');
} else bad('20. direct Games play does not accidentally activate Mission');

{
  const db = makeDb();
  const start = await startEducationalTriviaRun(db, null, {
    characterName: '20889',
    missionId: tr.id,
    gameId: tr.game_id,
    runId: 'run-leave',
  });
  let q = start.question;
  for (let i = 0; i < 4; i++) {
    const r = await playCorrect(db, { characterName: '20889', missionId: tr.id, gameId: tr.game_id, runId: 'run-leave' }, q);
    q = r.question;
  }
  const accepted = [...db._submissions.values()].filter((s) => s.status === 'accepted' && s.mission_id === tr.id);
  if (accepted.length === 0 && (db._wallets.get('20889') == null || db._wallets.get('20889') === 0)) {
    ok('21. leaving before 10 gives no completion');
  } else bad('21. leaving before 10 gives no completion', { accepted: accepted.length, wallet: db._wallets.get('20889') });
}

{
  const db = makeDb();
  const opts = { characterName: '20889', missionId: hb.id, gameId: hb.game_id, runId: 'run-stay' };
  let cur = await startEducationalTriviaRun(db, null, opts);
  for (let i = 0; i < 10; i++) {
    cur = await playCorrect(db, opts, cur.question);
  }
  const progressStart = await startEducationalTriviaRun(db, null, { ...opts, runId: 'run-stay-2' });
  if (cur.completed && progressStart.already_completed && db._wallets.get('20889') === 1) {
    ok('22. completed Mission remains completed');
  } else bad('22. completed Mission remains completed', { cur, progressStart });

  const replay = await startEducationalTriviaRun(db, null, {
    characterName: '20889',
    missionId: hb.id,
    gameId: hb.game_id,
    runId: 'run-replay',
  });
  if (replay.already_completed && db._wallets.get('20889') === 1 && [...db._txs.values()].length === 1) {
    ok('23. replay does not re-award same Mission instance');
  } else bad('23. replay does not re-award same Mission instance', { replay, wallet: db._wallets.get('20889'), txs: db._txs.size });
}

if (
  catalogSrc.includes("id: 'handbook-trivia'") &&
  catalogSrc.includes("id: 'local-history-trivia'") &&
  /play_cost:\s*1/.test(catalogSrc) &&
  gamesHtml.includes("tryPlay('Handbook Trivia'") &&
  gamesHtml.includes("tryPlay('Local History Trivia'")
) {
  ok('24. current game-start charging remains unchanged');
} else bad('24. current game-start charging remains unchanged');

if (
  clientSrc.includes('games.html?game=') &&
  !clientSrc.includes('game_play') &&
  !clientSrc.includes('postEconomyTransact') &&
  missionsHtml.includes('Play Trivia') &&
  handlersSrc.includes('Mission tap itself does not charge')
) {
  ok('25. Mission tap itself does not charge');
} else bad('25. Mission tap itself does not charge');

if (
  !eduSrc.includes('lantern_wallets') &&
  eduSrc.includes('completeMissionByEvent') &&
  !fs.existsSync(path.join(root, 'worker/migrations/060_educational_trivia_missions.sql'))
) {
  ok('26. no new Lantern wallet/ledger');
} else bad('26. no new Lantern wallet/ledger');

{
  const marker = {
    submission_type: 'confirmation',
    reviewed_by: 'system',
    status: 'accepted',
    mission_id: hb.id,
    submission_content: JSON.stringify({ type: GAME_CORRECT_TARGET_TYPE, game_id: hb.game_id, run_id: 'x', correct_count: 10 }),
  };
  if (
    isSystemMissionEventMarkerSubmission(marker) &&
    isExcludedMissionCompletion(marker) &&
    !isExcludedMissionCompletion({ status: 'accepted', submission_type: 'text', submission_content: 'photo walk done' })
  ) {
    ok('27. #146 public/hidden behavior unchanged');
  } else bad('27. #146 public/hidden behavior unchanged');
}

{
  const feHb = frontend.getHandbookQuestions();
  const same =
    feHb.length === HANDBOOK_TRIVIA_BANK.length &&
    JSON.stringify(feHb) === JSON.stringify(HANDBOOK_TRIVIA_BANK);
  if (same && contentSrc.includes("{ id: 'hb1'") && contentSrc.includes("{ id: 'hb50'")) ok('28. Handbook bank unchanged');
  else bad('28. Handbook bank unchanged');
}

{
  const feLh = frontend.getLocalHistoryQuestions();
  const same =
    feLh.length === LOCAL_HISTORY_TRIVIA_BANK.length &&
    JSON.stringify(feLh) === JSON.stringify(LOCAL_HISTORY_TRIVIA_BANK) &&
    feLh.length === 10;
  if (same) ok('29. Trinidad bank not rewritten by #150');
  else bad('29. Trinidad bank not rewritten by #150', { fe: feLh.length, wk: LOCAL_HISTORY_TRIVIA_BANK.length });
}

{
  const questionBlob = JSON.stringify(HANDBOOK_TRIVIA_BANK) + JSON.stringify(LOCAL_HISTORY_TRIVIA_BANK) + JSON.stringify(frontend.getLocalHistoryQuestions());
  if (!/tobago/i.test(questionBlob) && !/trinidad and tobago/i.test(questionBlob)) {
    ok('30. no Trinidad and Tobago content introduced');
  } else bad('30. no Trinidad and Tobago content introduced');
}

if (WAVE2_MISSION_IDS.HANDBOOK_TRIVIA === hb.id && WAVE2_MISSION_IDS.LOCAL_HISTORY_TRIVIA === tr.id) {
  ok('31. WAVE2 ids aligned with educational trivia catalog');
} else bad('31. WAVE2 ids aligned');

if (
  overlayEducationalTriviaMissions([]).length === 2 &&
  isTriviaRunPendingSubmission({
    status: 'pending',
    mission_id: hb.id,
    submission_content: JSON.stringify({ type: 'trivia_run', run_id: 'x' }),
  }) &&
  handlersSrc.includes('isTriviaRunPendingSubmission')
) {
  ok('32. overlay + pending trivia runs filtered from teacher review');
} else bad('32. overlay + pending filter');

if (
  gamesHtml.includes(' / 10 correct') &&
  gamesHtml.includes('Mission Complete!') &&
  gamesHtml.includes('runEducationalTriviaMission') &&
  !/data-correct/.test(gamesHtml.slice(gamesHtml.indexOf('function runEducationalTriviaMission'), gamesHtml.indexOf('function playBtnIdForGameName')))
) {
  ok('33. mission UI uses correct-count progress and does not expose data-correct');
} else bad('33. mission UI');

if (triviaRunSubmissionId('abc def') === '' && triviaRunSubmissionId('run-ok_1') === 'msub_trivia_run-ok_1') {
  ok('34. run_id sanitizer reused');
} else bad('34. run_id sanitizer', triviaRunSubmissionId('run-ok_1'));

if (resolveEducationalTriviaMission('handbook') == null && resolveEducationalTriviaMission(hb.id).reward_nuggets === 1) {
  ok('35. arbitrary client mission keys do not resolve');
} else bad('35. arbitrary client mission keys');

console.log('\nEducational trivia missions #150:', passed, 'passed,', failed, 'failed');
process.exit(failed ? 1 : 0);
