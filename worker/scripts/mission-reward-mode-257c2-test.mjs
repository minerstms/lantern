/**
 * Prompt #257C2 — Mission reward mode (once vs every completion).
 * Usage: node worker/scripts/mission-reward-mode-257c2-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  REWARD_MODE_ONCE,
  REWARD_MODE_EVERY,
  normalizeRewardMode,
  getMissionRewardMode,
  setMissionRewardMode,
  isEveryCompletionMode,
  formatRewardModeAdminPreview,
} from '../mission-reward-mode.js';
import { approveMissionWithReward, creditMissionApprovalReward } from '../missions-reward.js';
import { completeMissionByEvent, submissionIdForEventKey } from '../mission-event-completions.js';
import {
  eventKeyEducationalTrivia,
  eventKeyEducationalTriviaRun,
} from '../educational-trivia-missions.js';
import { formatMissionStudentPreview } from '../mission-reward-bands.js';
import { resolveStoredMissionPayout } from '../nugget-economy-settings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '../..');
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

// ---- Static wiring ----
const rewardJs = fs.readFileSync(path.join(root, 'worker/missions-reward.js'), 'utf8');
const eventJs = fs.readFileSync(path.join(root, 'worker/mission-event-completions.js'), 'utf8');
const triviaJs = fs.readFileSync(path.join(root, 'worker/educational-trivia-missions.js'), 'utf8');
const adminHtml = fs.readFileSync(path.join(root, 'app/admin.html'), 'utf8');
const missionsHtml = fs.readFileSync(path.join(root, 'app/missions.html'), 'utf8');

assert(normalizeRewardMode(undefined) === REWARD_MODE_ONCE, 'default mode once');
assert(normalizeRewardMode('every_completion') === REWARD_MODE_EVERY, 'normalize every');
assert(/resolveMissionRewardMode/.test(rewardJs) && /isEveryCompletionMode/.test(rewardJs), 'approve path uses reward mode');
assert(/everyMode/.test(eventJs) && /resolveMissionRewardMode/.test(eventJs), 'event completion uses reward mode');
assert(/eventKeyEducationalTriviaRun/.test(triviaJs), 'trivia per-run event key');
assert(/Reward mode/.test(adminHtml) && /Every completion/.test(adminHtml), 'admin reward mode UI');
assert(/missionEveryCompletion/.test(missionsHtml) && /Practice again/.test(missionsHtml), 'student practice again copy');

assert(
  formatMissionStudentPreview(100, 3, false, 'once') === '100+ characters · +3 Nuggets · Earn once',
  'once student preview'
);
assert(
  formatMissionStudentPreview(0, 1, false, 'every_completion') === '+1 Nugget every completion',
  'every student preview'
);
assert(formatRewardModeAdminPreview(1, 'every_completion') === '+1 Nugget every completion', 'admin economy every');
assert(formatRewardModeAdminPreview(3, 'once') === '+3 Nuggets when completed', 'admin economy once');

function submissionsSeed(db, id, missionId, characterName, status) {
  db.submissions[id] = {
    id,
    mission_id: missionId,
    character_name: characterName,
    status,
    created_at: new Date().toISOString(),
  };
}

function makeDb() {
  const settings = {};
  const submissions = {};
  const transactions = {};
  const wallets = {};
  const completions = {};
  const missions = {
    m_once: { id: 'm_once', reward_amount: 3 },
    m_every: { id: 'm_every', reward_amount: 1 },
    m_switch: { id: 'm_switch', reward_amount: 2 },
    m_switch2: { id: 'm_switch2', reward_amount: 1 },
    perm_handbook_trivia: { id: 'perm_handbook_trivia', reward_amount: 1 },
  };

  function run(sql, binds) {
    const s = String(sql).replace(/\s+/g, ' ').trim();
    if (s.includes('FROM lantern_settings WHERE key')) {
      const v = settings[binds[0]];
      return v != null ? { value: v } : null;
    }
    if (s.includes('INSERT INTO lantern_settings')) {
      settings[binds[0]] = binds[1];
      return { meta: { changes: 1 } };
    }
    if (s.includes('FROM lantern_missions WHERE id')) {
      return missions[binds[0]] ? { ...missions[binds[0]] } : null;
    }
    if (s.includes('SELECT id, status, character_name, mission_id FROM lantern_mission_submissions WHERE id =')) {
      const row = submissions[binds[0]];
      return row
        ? { id: row.id, status: row.status, character_name: row.character_name, mission_id: row.mission_id }
        : null;
    }
    if (s.includes("status = 'accepted' AND id != ?")) {
      const [missionId, characterName, excludeId] = binds;
      const found = Object.values(submissions).find(
        (row) =>
          row.mission_id === missionId &&
          row.character_name === characterName &&
          row.status === 'accepted' &&
          row.id !== excludeId
      );
      return found ? { id: found.id, created_at: found.created_at || '' } : null;
    }
    if (s.includes('FROM lantern_mission_completions WHERE event_key = ?')) {
      return completions[binds[0]] || null;
    }
    if (s.includes('FROM lantern_mission_completions WHERE mission_id = ? AND character_name = ? ORDER BY')) {
      const [missionId, characterName] = binds;
      const found = Object.values(completions).find(
        (c) => c.mission_id === missionId && c.character_name === characterName
      );
      return found || null;
    }
    if (s.includes("FROM lantern_mission_submissions WHERE mission_id = ? AND character_name = ? AND status = 'accepted' ORDER BY")) {
      const [missionId, characterName] = binds;
      const found = Object.values(submissions).find(
        (row) => row.mission_id === missionId && row.character_name === characterName && row.status === 'accepted'
      );
      return found ? { id: found.id, created_at: found.created_at || '' } : null;
    }
    if (s.includes('SELECT id, status FROM lantern_mission_submissions WHERE id =')) {
      const row = submissions[binds[0]];
      return row ? { id: row.id, status: row.status } : null;
    }
    if (s.includes('SELECT status, character_name FROM lantern_mission_submissions WHERE id =')) {
      const row = submissions[binds[0]];
      return row ? { status: row.status, character_name: row.character_name } : null;
    }
    if (s.includes('SELECT status FROM lantern_mission_submissions WHERE id =')) {
      const row = submissions[binds[0]];
      return row ? { status: row.status } : null;
    }
    if (s.includes('UPDATE lantern_mission_submissions SET status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ? AND status = ?')) {
      const [status, , , id, expected] = binds;
      const row = submissions[id];
      if (!row || row.status !== expected) return { meta: { changes: 0 } };
      row.status = status;
      return { meta: { changes: 1 } };
    }
    if (s.includes('INSERT INTO lantern_mission_submissions')) {
      const [id, missionId, characterName, , , status] = binds;
      if (submissions[id]) throw new Error('UNIQUE sub');
      submissions[id] = { id, mission_id: missionId, character_name: characterName, status, created_at: new Date().toISOString() };
      return { meta: { changes: 1 } };
    }
    if (s.includes('INSERT INTO lantern_mission_completions')) {
      const [id, missionId, characterName, triggerType, eventKey, sourceRef, submissionId] = binds;
      if (completions[eventKey]) throw new Error('UNIQUE comp');
      completions[eventKey] = {
        id,
        mission_id: missionId,
        character_name: characterName,
        trigger_type: triggerType,
        event_key: eventKey,
        submission_id: submissionId,
      };
      return { meta: { changes: 1 } };
    }
    if (s.includes('SELECT id, character_name, delta, kind, created_at FROM lantern_transactions WHERE id =')) {
      return transactions[binds[0]] || null;
    }
    if (s.includes('SELECT balance FROM lantern_wallets WHERE character_name =')) {
      const w = wallets[binds[0]];
      return w ? { balance: w.balance } : null;
    }
    if (s.includes('INSERT INTO lantern_transactions')) {
      const [id, characterName, delta] = binds;
      if (transactions[id]) throw new Error('UNIQUE tx');
      transactions[id] = { id, character_name: characterName, delta: Number(delta) };
      return { meta: { changes: 1 } };
    }
    if (s.includes('INSERT INTO lantern_wallets')) {
      const [characterName, balance, , deltaAdd] = binds;
      if (wallets[characterName]) wallets[characterName].balance += Number(deltaAdd || 0);
      else wallets[characterName] = { balance: Number(balance) };
      return { meta: { changes: 1 } };
    }
    if (s.includes('UPDATE lantern_mission_submissions SET status = ?, reviewed_at = ?, reviewed_by = ?, submission_content = ?')) {
      const row = submissions[binds[4]];
      if (row) row.status = binds[0];
      return { meta: { changes: 1 } };
    }
    throw new Error('Unhandled: ' + s.slice(0, 120));
  }

  return {
    submissions,
    transactions,
    completions,
    async batch(stmts) {
      for (const st of stmts) await st.run();
    },
    prepare(sql) {
      const binds = [];
      const api = {
        bind(...args) {
          binds.length = 0;
          binds.push(...args);
          return api;
        },
        async first() {
          const row = run(sql, binds);
          return row && row.meta ? null : row;
        },
        async run() {
          return run(sql, binds);
        },
      };
      return api;
    },
  };
}

const db = makeDb();
await setMissionRewardMode(db, 'm_once', REWARD_MODE_ONCE, 'test');
await setMissionRewardMode(db, 'm_every', REWARD_MODE_EVERY, 'test');

// Once mode: second approval +0
submissionsSeed(db, 'sub_a1', 'm_once', 'Alice', 'pending');
const firstOnce = await approveMissionWithReward(db, {
  submissionId: 'sub_a1',
  recipientCharacterName: 'Alice',
  rewardAmount: 3,
});
assert(firstOnce.ok && firstOnce.nuggets === 3, 'once first approval +3');

submissionsSeed(db, 'sub_a2', 'm_once', 'Alice', 'pending');
const secondOnce = await approveMissionWithReward(db, {
  submissionId: 'sub_a2',
  recipientCharacterName: 'Alice',
  rewardAmount: 3,
});
assert(secondOnce.ok && secondOnce.reward_skipped && secondOnce.nuggets === 0, 'once second approval +0');

// Every mode: two distinct submissions pay
submissionsSeed(db, 'sub_b1', 'm_every', 'Bob', 'pending');
const firstEvery = await approveMissionWithReward(db, {
  submissionId: 'sub_b1',
  recipientCharacterName: 'Bob',
  rewardAmount: 1,
});
submissionsSeed(db, 'sub_b2', 'm_every', 'Bob', 'pending');
const secondEvery = await approveMissionWithReward(db, {
  submissionId: 'sub_b2',
  recipientCharacterName: 'Bob',
  rewardAmount: 1,
});
assert(firstEvery.nuggets === 1 && secondEvery.nuggets === 1 && !secondEvery.reward_skipped, 'every mode two submissions +1 each');

// Idempotency: retry same submission
const retry = await creditMissionApprovalReward(db, 'Bob', 'sub_b1', 1, 'retry');
assert(retry.ok && retry.idempotent && !retry.skipped, 'same submission retry idempotent');

// 10 sequential every-mode event completions
let totalEventReward = 0;
for (let i = 0; i < 10; i++) {
  const eventKey = `handbook_trivia:Carol:run_${i}`;
  const res = await completeMissionByEvent(db, null, {
    missionId: 'perm_handbook_trivia',
    characterName: 'Carol',
    triggerType: 'handbook_trivia',
    eventKey,
    cadence: 'once',
    rewardMode: REWARD_MODE_EVERY,
    note: 'Handbook',
    content: 'confirmed',
  });
  assert(res.ok && res.rewarded, `every event completion ${i + 1} rewarded`, res);
  totalEventReward += Number(res.nuggets) || 0;
  const dup = await completeMissionByEvent(db, null, {
    missionId: 'perm_handbook_trivia',
    characterName: 'Carol',
    triggerType: 'handbook_trivia',
    eventKey,
    cadence: 'once',
    rewardMode: REWARD_MODE_EVERY,
  });
  assert(dup.ok && !dup.rewarded, `event retry ${i + 1} +0`, dup);
}
assert(totalEventReward === 10, '10 legitimate completions total +10', totalEventReward);

// Mode switch once → every
await setMissionRewardMode(db, 'm_switch', REWARD_MODE_ONCE, 'admin');
submissionsSeed(db, 'sub_sw1', 'm_switch', 'Dan', 'pending');
await approveMissionWithReward(db, { submissionId: 'sub_sw1', recipientCharacterName: 'Dan', rewardAmount: 2 });
await setMissionRewardMode(db, 'm_switch', REWARD_MODE_EVERY, 'admin');
submissionsSeed(db, 'sub_sw2', 'm_switch', 'Dan', 'pending');
const afterSwitch = await approveMissionWithReward(db, {
  submissionId: 'sub_sw2',
  recipientCharacterName: 'Dan',
  rewardAmount: 2,
});
assert(afterSwitch.nuggets === 2, 'once→every future distinct completion pays');

// Mode switch every → once (prior accepted blocks)
await setMissionRewardMode(db, 'm_switch2', REWARD_MODE_EVERY, 'admin');
submissionsSeed(db, 'sub_sw3', 'm_switch2', 'Eve', 'pending');
await approveMissionWithReward(db, { submissionId: 'sub_sw3', recipientCharacterName: 'Eve', rewardAmount: 1 });
submissionsSeed(db, 'sub_sw4', 'm_switch2', 'Eve', 'pending');
await approveMissionWithReward(db, { submissionId: 'sub_sw4', recipientCharacterName: 'Eve', rewardAmount: 1 });
await setMissionRewardMode(db, 'm_switch2', REWARD_MODE_ONCE, 'admin');
submissionsSeed(db, 'sub_sw5', 'm_switch2', 'Eve', 'pending');
const afterOnceSwitch = await approveMissionWithReward(db, {
  submissionId: 'sub_sw5',
  recipientCharacterName: 'Eve',
  rewardAmount: 1,
});
assert(afterOnceSwitch.reward_skipped, 'every→once blocks additional once reward when prior accepted exists');

// Per-run trivia event keys distinct
const k1 = eventKeyEducationalTriviaRun('perm_handbook_trivia', 'Frank', 'run1');
const k2 = eventKeyEducationalTriviaRun('perm_handbook_trivia', 'Frank', 'run2');
const kLifetime = eventKeyEducationalTrivia('perm_handbook_trivia', 'Frank');
assert(k1 !== k2 && k1 !== kLifetime, 'distinct run event keys');

// Server resolves payout — client reward forgery does not change stored amount
const stored = await resolveStoredMissionPayout(db, 'm_every');
assert(stored === 1, 'server resolves stored mission reward', stored);

console.log('\n#257C2 mission-reward-mode: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
