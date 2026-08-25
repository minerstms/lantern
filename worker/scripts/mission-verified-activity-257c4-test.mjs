/**
 * Prompt #257C4 — final verified-activity release gate.
 * Usage: node worker/scripts/mission-verified-activity-257c4-test.mjs
 */
import {
  EDUCATIONAL_TRIVIA_MISSIONS,
  startEducationalTriviaRun,
  answerEducationalTriviaRun,
  getEducationalTriviaBank,
  TRIVIA_RUN_STATUS_ACTIVE,
  TRIVIA_RUN_STATUS_COMPLETE,
  triviaRunSubmissionId,
} from '../educational-trivia-missions.js';
import { SEVEN_HABITS_TRIVIA_BANK } from '../seven-habits-trivia-bank.js';
import { isHumanReviewMissionSubmission } from '../global-mission-eligibility.js';
import { buildReviewQueue, countStaffReviewItems } from '../moderation-review.js';
import { setMissionRewardMode, REWARD_MODE_EVERY } from '../mission-reward-mode.js';

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

function bankItem(gameId, questionId) {
  return getEducationalTriviaBank(gameId).find((q) => q.id === questionId);
}
function sevenHabitsItem(id) {
  return SEVEN_HABITS_TRIVIA_BANK.find((q) => q.id === id);
}

function makeDb() {
  const missions = new Map();
  const submissions = new Map();
  const completions = new Map();
  const txs = new Map();
  const wallets = new Map();
  const settings = {};

  function matchSelect(sql, binds) {
    const s = String(sql);
    if (s.includes('FROM lantern_settings WHERE key')) {
      const v = settings[binds[0]];
      return v != null ? { value: v } : null;
    }
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
    if (s.includes('FROM lantern_missions WHERE id IN')) {
      return { results: binds.map((id) => missions.get(id)).filter(Boolean) };
    }
    if (s.includes('FROM lantern_missions WHERE teacher_id = ?')) {
      return { results: [...missions.values()].filter((m) => m.teacher_id === binds[0]) };
    }
    if (s.includes('FROM lantern_missions')) return { results: [...missions.values()] };
    if (s.includes("FROM lantern_mission_submissions WHERE LOWER(TRIM(status)) = 'pending'")) {
      return { results: [...submissions.values()].filter((r) => String(r.status).toLowerCase() === 'pending') };
    }
    if (s.includes('FROM lantern_transactions WHERE id =') || s.includes('SELECT id, character_name, delta, kind, created_at FROM lantern_transactions WHERE id =')) {
      return txs.get(binds[0]) || null;
    }
    if (s.includes('SELECT balance FROM lantern_wallets')) {
      const bal = wallets.get(binds[0]);
      return bal != null ? { balance: bal } : null;
    }
    if (s.includes('submission_content FROM lantern_mission_submissions WHERE mission_id = ? AND character_name = ? ORDER BY created_at DESC LIMIT 1')) {
      let best = null;
      for (const row of submissions.values()) {
        if (row.mission_id === binds[0] && row.character_name === binds[1]) {
          if (!best || String(row.created_at) > String(best.created_at)) best = row;
        }
      }
      return best ? { submission_content: best.submission_content } : null;
    }
    if (s.includes('FROM lantern_approvals WHERE')) return { results: [] };
    if (s.includes('FROM lantern_feed_items WHERE')) return { results: [] };
    if (s.includes('FROM lantern_moderation_flags')) return { results: [] };
    if (s.includes('FROM lantern_news_submissions')) return { results: [] };
    return null;
  }

  function runMutation(s, binds) {
    if (s.includes('INSERT OR IGNORE INTO lantern_missions') || s.startsWith('INSERT OR IGNORE INTO lantern_missions')) {
      if (!missions.has(binds[0])) {
        missions.set(binds[0], {
          id: binds[0],
          title: binds[3],
          description: binds[4],
          reward_amount: binds[5],
          teacher_id: binds[1] || 'mr_radle',
          active: 1,
          archived: 0,
        });
      }
      return { meta: { changes: 1 } };
    }
    if (s.includes('INSERT INTO lantern_settings')) {
      settings[binds[0]] = binds[1];
      return { meta: { changes: 1 } };
    }
    if (s.startsWith('INSERT INTO lantern_mission_completions')) {
      if (completions.has(binds[4])) throw new Error('UNIQUE');
      completions.set(binds[4], {
        id: binds[0],
        mission_id: binds[1],
        character_name: binds[2],
        event_key: binds[4],
        source_ref: binds[5],
        submission_id: binds[6],
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
    if (s.includes('UPDATE lantern_mission_submissions SET submission_content = ?, status = ? WHERE id = ?')) {
      const row = submissions.get(binds[2]);
      if (row) {
        row.submission_content = binds[0];
        row.status = binds[1];
      }
      return { meta: { changes: row ? 1 : 0 } };
    }
    if (s.startsWith('UPDATE lantern_mission_submissions SET submission_content = ? WHERE id = ?')) {
      const row = submissions.get(binds[1]);
      if (row) row.submission_content = binds[0];
      return { meta: { changes: row ? 1 : 0 } };
    }
    if (s.startsWith('INSERT INTO lantern_transactions')) {
      if (txs.has(binds[0])) throw new Error('UNIQUE');
      txs.set(binds[0], { id: binds[0], character_name: binds[1], delta: binds[2], kind: binds[3] });
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
  }

  return {
    prepare(sql) {
      const s = String(sql);
      const api = {
        bind(...binds) {
          return {
            async first() {
              const hit = matchSelect(s, binds);
              if (hit && hit.results) return hit.results[0] || null;
              return hit;
            },
            async all() {
              const hit = matchSelect(s, binds);
              if (hit && hit.results) return hit;
              return { results: [] };
            },
            async run() {
              return runMutation(s, binds);
            },
          };
        },
        async first() {
          return matchSelect(s, []);
        },
        async all() {
          const hit = matchSelect(s, []);
          if (hit && hit.results) return hit;
          return { results: [] };
        },
        async run() {
          return runMutation(s, []);
        },
      };
      return api;
    },
    async batch(stmts) {
      for (const st of stmts) await st.run();
    },
    _missions: missions,
    _submissions: submissions,
    _completions: completions,
    _wallets: wallets,
  };
}

async function playSevenHabitsFullRun(db, characterName, runId) {
  const def = EDUCATIONAL_TRIVIA_MISSIONS.perm_seven_habits;
  const opts = { characterName, missionId: def.id, gameId: def.game_id, runId };
  let cur = await startEducationalTriviaRun(db, null, opts);
  if (!cur.ok || !cur.question) return { start: cur, last: cur, answers: 0 };

  const sid = triviaRunSubmissionId(runId);
  const runRow = db._submissions.get(sid);
  assert(runRow && runRow.status === TRIVIA_RUN_STATUS_ACTIVE, '7 Habits run starts run_active', runRow && runRow.status);

  let answers = 0;
  while (cur.question && answers < 20) {
    const item = sevenHabitsItem(cur.question.id);
    cur = await answerEducationalTriviaRun(db, null, {
      ...opts,
      questionId: cur.question.id,
      choiceIndex: item.correctIndex,
    });
    answers++;
    if (cur.completed) break;
  }
  return { start: cur, last: cur, answers, runRow: db._submissions.get(sid) };
}

async function playSevenHabitsMissRun(db, characterName, runId) {
  const def = EDUCATIONAL_TRIVIA_MISSIONS.perm_seven_habits;
  const opts = { characterName, missionId: def.id, gameId: def.game_id, runId };
  let cur = await startEducationalTriviaRun(db, null, opts);
  let answers = 0;
  while (cur.question && answers < 20) {
    const item = sevenHabitsItem(cur.question.id);
    cur = await answerEducationalTriviaRun(db, null, {
      ...opts,
      questionId: cur.question.id,
      choiceIndex: (item.correctIndex + 1) % 4,
    });
    answers++;
  }
  return { last: cur, answers };
}

async function completeStandardTrivia(db, def, characterName, runId) {
  const start = await startEducationalTriviaRun(db, null, {
    characterName,
    missionId: def.id,
    gameId: def.game_id,
    runId,
  });
  let q = start.question;
  let last = start;
  for (let i = 0; i < 12; i++) {
    const item = bankItem(def.game_id, q.id);
    last = await answerEducationalTriviaRun(db, null, {
      characterName,
      missionId: def.id,
      gameId: def.game_id,
      runId,
      questionId: q.id,
      choiceIndex: item.correctIndex,
    });
    if (last.completed) break;
    q = last.question;
  }
  return last;
}

const sh = EDUCATIONAL_TRIVIA_MISSIONS.perm_seven_habits;
const hb = EDUCATIONAL_TRIVIA_MISSIONS.perm_handbook_trivia;
const tr = EDUCATIONAL_TRIVIA_MISSIONS.perm_local_history_trivia;
const srp = EDUCATIONAL_TRIVIA_MISSIONS.perm_srp_safety;
const teacher = { username: 'mr_radle', role: 'teacher', teacher_id: 'mr_radle' };

// ---- 1. Full 7 Habits Every-completion path ----
{
  const db = makeDb();
  await setMissionRewardMode(db, sh.id, REWARD_MODE_EVERY);

  const first = await playSevenHabitsFullRun(db, '20889', '7h-every-1');
  assert(first.answers === 14, '7 Habits first run answered all 14 questions', first.answers);
  assert(first.last.completed && first.last.rewarded, '7 Habits first full run completes + rewards', first.last);
  assert(first.runRow && first.runRow.status === TRIVIA_RUN_STATUS_COMPLETE, '7 Habits run_complete after first run', first.runRow && first.runRow.status);
  assert(db._completions.size >= 1, '7 Habits completion recorded', db._completions.size);
  assert(db._wallets.get('20889') === 1, '7 Habits first Every reward +1', db._wallets.get('20889'));

  const second = await playSevenHabitsFullRun(db, '20889', '7h-every-2');
  assert(second.last.completed && second.last.rewarded, '7 Habits second distinct run rewards again', second.last);
  assert(db._wallets.get('20889') === 2, '7 Habits second Every reward total 2', db._wallets.get('20889'));

  const retry = await answerEducationalTriviaRun(db, null, {
    characterName: '20889',
    missionId: sh.id,
    gameId: sh.game_id,
    runId: '7h-every-2',
    questionId: sevenHabitsItem(SEVEN_HABITS_TRIVIA_BANK[0].id).id,
    choiceIndex: sevenHabitsItem(SEVEN_HABITS_TRIVIA_BANK[0].id).correctIndex,
  });
  assert(retry.ok && !retry.rewarded && db._wallets.get('20889') === 2, '7 Habits same-run retry +0', retry);

  const missDb = makeDb();
  await setMissionRewardMode(missDb, sh.id, REWARD_MODE_EVERY);
  const miss = await playSevenHabitsMissRun(missDb, '20889', '7h-miss');
  assert(miss.answers === 14 && !miss.last.completed && miss.last.run_exhausted, '7 Habits incomplete run no reward', miss.last);
  assert(!missDb._wallets.has('20889') || missDb._wallets.get('20889') === 0, '7 Habits miss run wallet unchanged', missDb._wallets.get('20889'));
}

// ---- 4–5. Review queue + legacy filtering ----
{
  const db = makeDb();
  const missionIds = [hb.id, tr.id, srp.id, sh.id, 'tmission_stem'];
  missionIds.forEach((id) => {
    db._missions.set(id, {
      id,
      title: id,
      teacher_id: 'mr_radle',
    });
  });

  const triviaRuns = [
    { id: 'legacy_hb', mission_id: hb.id, run_id: 'leg-hb', status: 'pending' },
    { id: 'legacy_tr', mission_id: tr.id, run_id: 'leg-tr', status: 'pending' },
    { id: 'legacy_srp', mission_id: srp.id, run_id: 'leg-srp', status: 'pending' },
    { id: 'legacy_7h', mission_id: sh.id, run_id: 'leg-7h', status: 'pending' },
    { id: 'new_hb', mission_id: hb.id, run_id: 'new-hb', status: TRIVIA_RUN_STATUS_ACTIVE },
    { id: 'new_tr', mission_id: tr.id, run_id: 'new-tr', status: TRIVIA_RUN_STATUS_ACTIVE },
    { id: 'new_srp', mission_id: srp.id, run_id: 'new-srp', status: TRIVIA_RUN_STATUS_ACTIVE },
    { id: 'new_7h', mission_id: sh.id, run_id: 'new-7h', status: TRIVIA_RUN_STATUS_ACTIVE },
  ];
  triviaRuns.forEach((r) => {
    const row = {
      id: r.id,
      mission_id: r.mission_id,
      character_name: '20889',
      submission_type: 'confirmation',
      submission_content: JSON.stringify({ type: 'trivia_run', run_id: r.run_id, mission_id: r.mission_id }),
      status: r.status,
      created_at: new Date().toISOString(),
    };
    db._submissions.set(r.id, row);
    assert(!isHumanReviewMissionSubmission(row), 'legacy/new trivia run excluded: ' + r.id);
  });

  db._submissions.set('msub_writing', {
    id: 'msub_writing',
    mission_id: 'tmission_stem',
    character_name: '20889',
    submission_type: 'text',
    submission_content: 'x'.repeat(500),
    status: 'pending',
    created_at: new Date().toISOString(),
  });
  assert(isHumanReviewMissionSubmission(db._submissions.get('msub_writing')), 'authored mission is human review');

  const queue = await buildReviewQueue(db, teacher, { includeDetails: false });
  const missionItems = queue.filter((q) => q.item_type === 'mission_submission');
  assert(missionItems.length === 1 && missionItems[0].item_id === 'msub_writing', 'review queue only authored mission', missionItems);

  const pendingCount = await countStaffReviewItems(db, teacher);
  assert(pendingCount === 1, 'pending review count is 1 (writing only)', pendingCount);
}

function missionIdsSetup(db) {
  [hb.id, tr.id, srp.id, sh.id].forEach((id) => {
    db._missions.set(id, { id, title: id, teacher_id: 'mr_radle' });
  });
}

// Simultaneous fresh completions do not create review rows
{
  const db = makeDb();
  missionIdsSetup(db);
  await completeStandardTrivia(db, hb, '20889', 'gate-hb');
  await completeStandardTrivia(db, tr, '20889', 'gate-tr');
  await completeStandardTrivia(db, srp, '20889', 'gate-srp');
  const queue = await buildReviewQueue(db, teacher, { includeDetails: false });
  const missionItems = queue.filter((q) => q.item_type === 'mission_submission');
  assert(missionItems.length === 0, 'fresh verified completions add zero review rows', missionItems);
}

console.log('\nmission-verified-activity-257c4-test:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
