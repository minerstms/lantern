/**
 * Prompt #257C3 — verified activity missions auto-complete without human review queue.
 * Usage: node worker/scripts/mission-verified-activity-257c3-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  EDUCATIONAL_TRIVIA_MISSIONS,
  startEducationalTriviaRun,
  answerEducationalTriviaRun,
  getEducationalTriviaBank,
  TRIVIA_RUN_STATUS_ACTIVE,
  TRIVIA_RUN_STATUS_COMPLETE,
  triviaRunSubmissionId,
} from '../educational-trivia-missions.js';
import {
  classifyMissionEvidenceKind,
  isHumanReviewMissionSubmission,
  missionCompletionModeLabel,
  EVIDENCE_SUBMISSION,
  EVIDENCE_VERIFIED_ACTIVITY,
} from '../global-mission-eligibility.js';
import { buildReviewQueue } from '../moderation-review.js';
import { registryForMissionId } from '../activity-admin.js';
import { WAVE2_MISSION_IDS } from '../mission-event-completions.js';
import { setMissionRewardMode, REWARD_MODE_EVERY } from '../mission-reward-mode.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
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

const reviewSrc = fs.readFileSync(path.join(root, 'worker/moderation-review.js'), 'utf8');
const eduSrc = fs.readFileSync(path.join(root, 'worker/educational-trivia-missions.js'), 'utf8');
const handlersSrc = fs.readFileSync(path.join(root, 'worker/missions-handlers.js'), 'utf8');
const adminHtml = fs.readFileSync(path.join(root, 'app/admin.html'), 'utf8');
const gamesHtml = fs.readFileSync(path.join(root, 'app/games.html'), 'utf8');

assert(reviewSrc.includes('isHumanReviewMissionSubmission'), 'review queue uses human-review filter');
assert(eduSrc.includes('TRIVIA_RUN_STATUS_ACTIVE') && !eduSrc.includes("'pending', now, 'system'"), 'new runs use run_active not pending');
assert(handlersSrc.includes('verified_activity_not_reviewable'), 'approve blocks verified run rows');
assert(adminHtml.includes('Completion:') && adminHtml.includes('Verified automatically'), 'admin completion label');
assert(gamesHtml.includes('Challenge complete!') && gamesHtml.includes('Reward already earned'), 'student completion UX');

function bankItem(gameId, questionId) {
  return getEducationalTriviaBank(gameId).find((q) => q.id === questionId);
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
    if (s.includes('FROM lantern_approvals WHERE')) return { results: [] };
    if (s.includes('FROM lantern_feed_items WHERE')) return { results: [] };
    if (s.includes('FROM lantern_moderation_flags')) return { results: [] };
    if (s.includes('FROM lantern_news_submissions')) return { results: [] };
    if (s.includes('FROM lantern_missions WHERE teacher_id = ?')) {
      return { results: [...missions.values()].filter((m) => m.teacher_id === binds[0]) };
    }
    if (s.includes('FROM lantern_missions')) return { results: [...missions.values()] };
    if (s.includes("FROM lantern_mission_submissions WHERE LOWER(TRIM(status)) = 'pending'")) {
      return {
        results: [...submissions.values()].filter((r) => String(r.status).toLowerCase() === 'pending'),
      };
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
    return null;
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
                const row = {
                  id: binds[0],
                  mission_id: binds[1],
                  character_name: binds[2],
                  event_key: binds[4],
                  submission_id: binds[6],
                };
                if (completions.has(row.event_key)) throw new Error('UNIQUE');
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
      return api;
    },
    async batch(stmts) {
      for (const st of stmts) await st.run();
    },
    _missions: missions,
    _submissions: submissions,
    _completions: completions,
    _wallets: wallets,
    _settings: settings,
  };
}

async function completeTriviaRun(db, def, characterName, runId) {
  const start = await startEducationalTriviaRun(db, null, {
    characterName,
    missionId: def.id,
    gameId: def.game_id,
    runId,
  });
  if (!start.ok || !start.question) return start;
  const sid = triviaRunSubmissionId(runId);
  const runRow = db._submissions.get(sid);
  assert(runRow && runRow.status === TRIVIA_RUN_STATUS_ACTIVE, def.id + ' run starts run_active', runRow && runRow.status);
  assert(!isHumanReviewMissionSubmission(runRow), def.id + ' run not human review', runRow);

  let q = start.question;
  let last = start;
  for (let i = 0; i < 10; i++) {
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

// Evidence classification
const hb = EDUCATIONAL_TRIVIA_MISSIONS.perm_handbook_trivia;
const tr = EDUCATIONAL_TRIVIA_MISSIONS.perm_local_history_trivia;
const srp = EDUCATIONAL_TRIVIA_MISSIONS.perm_srp_safety;
const sh = EDUCATIONAL_TRIVIA_MISSIONS.perm_seven_habits;

assert(classifyMissionEvidenceKind({ id: hb.id }, 'trivia') === EVIDENCE_VERIFIED_ACTIVITY, 'Handbook verified_activity');
assert(classifyMissionEvidenceKind({ id: tr.id }, 'trivia') === EVIDENCE_VERIFIED_ACTIVITY, 'Trinidad verified_activity');
assert(classifyMissionEvidenceKind({ id: srp.id }, 'trivia') === EVIDENCE_VERIFIED_ACTIVITY, 'SRP verified_activity');
assert(classifyMissionEvidenceKind({ id: sh.id }, 'trivia') === EVIDENCE_VERIFIED_ACTIVITY, '7 Habits verified_activity');
assert(classifyMissionEvidenceKind({ id: WAVE2_MISSION_IDS.FIGHT_SONG }, 'event') === EVIDENCE_VERIFIED_ACTIVITY, 'Fight Song verified_activity');
assert(classifyMissionEvidenceKind({ id: 'tmission_stem', submission_type: 'text' }, 'submission') === EVIDENCE_SUBMISSION, 'STEM submission');
assert(missionCompletionModeLabel(EVIDENCE_VERIFIED_ACTIVITY) === 'Verified automatically', 'completion label verified');
assert(missionCompletionModeLabel(EVIDENCE_SUBMISSION) === 'Staff review', 'completion label staff');

// A–F trivia completions
{
  const db = makeDb();
  const res = await completeTriviaRun(db, hb, '20889', 'hb-a');
  assert(res.completed && res.rewarded, 'Handbook first run completes + rewards', res);
  const runRow = db._submissions.get(triviaRunSubmissionId('hb-a'));
  assert(runRow && runRow.status === TRIVIA_RUN_STATUS_COMPLETE, 'Handbook run row run_complete', runRow && runRow.status);
  const pendingHuman = [...db._submissions.values()].filter((r) => isHumanReviewMissionSubmission(r));
  assert(pendingHuman.length === 0, 'Handbook no human-review rows', pendingHuman.length);
}

{
  const db = makeDb();
  await setMissionRewardMode(db, hb.id, REWARD_MODE_EVERY);
  const first = await completeTriviaRun(db, hb, '20889', 'hb-b1');
  const second = await completeTriviaRun(db, hb, '20889', 'hb-b2');
  assert(first.rewarded && second.rewarded, 'Handbook every mode second distinct run rewards', { first, second });
  assert(db._wallets.get('20889') === 2, 'Handbook every mode two nuggets', db._wallets.get('20889'));
}

{
  const db = makeDb();
  await completeTriviaRun(db, hb, '20889', 'hb-c');
  const item = bankItem(hb.game_id, getEducationalTriviaBank(hb.game_id)[0].id);
  const retry = await answerEducationalTriviaRun(db, null, {
    characterName: '20889',
    missionId: hb.id,
    gameId: hb.game_id,
    runId: 'hb-c',
    questionId: item.id,
    choiceIndex: item.correctIndex,
  });
  assert(retry.ok && !retry.rewarded, 'Handbook same-run retry no duplicate reward', retry);
}

{
  const db = makeDb();
  const res = await completeTriviaRun(db, tr, '20889', 'tr-a');
  assert(res.completed && res.rewarded, 'Trinidad completes automatically', res);
}

{
  const db = makeDb();
  const res = await completeTriviaRun(db, srp, '20889', 'srp-a');
  assert(res.completed && res.rewarded, 'SRP completes automatically', res);
}

// G forged — invalid answer rejected before completion
{
  const db = makeDb();
  const start = await startEducationalTriviaRun(db, null, { characterName: '20889', missionId: hb.id, gameId: hb.game_id, runId: 'forge-1' });
  const bad = await answerEducationalTriviaRun(db, null, {
    characterName: '20889',
    missionId: hb.id,
    gameId: hb.game_id,
    runId: 'forge-1',
    questionId: 'nonexistent-q',
    choiceIndex: 0,
  });
  assert(!bad.ok && (bad.error === 'unknown_question' || bad.error === 'stale_question'), 'forged/stale question rejected', bad);
}

// H ordinary writing mission stays pending review
{
  const writing = {
    id: 'msub_write_1',
    mission_id: 'tmission_stem',
    character_name: '20889',
    submission_type: 'text',
    submission_content: 'x'.repeat(500),
    status: 'pending',
    created_at: new Date().toISOString(),
  };
  assert(isHumanReviewMissionSubmission(writing), 'writing mission is human review');
}

// Review queue excludes trivia run rows (legacy pending + new run_active)
{
  const db = makeDb();
  db._missions.set(hb.id, { id: hb.id, title: hb.title, teacher_id: 'mr_radle' });
  db._submissions.set('msub_trivia_legacy', {
    id: 'msub_trivia_legacy',
    mission_id: hb.id,
    character_name: '20889',
    submission_type: 'confirmation',
    submission_content: JSON.stringify({ type: 'trivia_run', run_id: 'legacy' }),
    status: 'pending',
    created_at: new Date().toISOString(),
  });
  db._submissions.set('msub_write_pending', {
    id: 'msub_write_pending',
    mission_id: 'tmission_stem',
    character_name: '20889',
    submission_type: 'text',
    submission_content: 'writing'.repeat(50),
    status: 'pending',
    created_at: new Date().toISOString(),
  });
  db._missions.set('tmission_stem', { id: 'tmission_stem', title: 'STEM Today', teacher_id: 'mr_radle' });
  const teacher = { username: 'mr_radle', role: 'teacher', teacher_id: 'mr_radle' };
  const queue = await buildReviewQueue(db, teacher, { includeDetails: false });
  const missionItems = queue.filter((q) => q.item_type === 'mission_submission');
  assert(missionItems.length === 1 && missionItems[0].item_id === 'msub_write_pending', 'review queue only writing mission', missionItems);
}

assert(handlersSrc.includes('finalizeMissionSubmission') && handlersSrc.includes('/api/missions/submissions/approve'), 'ordinary mission approval route preserved');

console.log('\nmission-verified-activity-257c3-test:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
