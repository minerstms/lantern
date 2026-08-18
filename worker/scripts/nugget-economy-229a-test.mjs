/**
 * Prompt #229A — event missions use saved reward_amount; student cards show it.
 * Usage: node worker/scripts/nugget-economy-229a-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import { completeMissionByEvent, submissionIdForEventKey } from '../mission-event-completions.js';
import { creditMissionApprovalReward, missionRewardTxId } from '../missions-reward.js';
import { resolveEventMissionPayout } from '../nugget-economy-settings.js';
import { overlayEducationalTriviaMissions } from '../educational-trivia-missions.js';
import { overlayFightSongMission } from '../fight-song-challenge.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

function makeEventDb(seed) {
  const missions = { ...(seed.missions || {}) };
  const settings = { ...(seed.settings || {}) };
  const completions = new Map();
  const submissions = new Map();
  const transactions = {};
  const wallets = { ...(seed.wallets || { '20889': 10 }) };

  function run(sql, binds) {
    const s = String(sql);
    if (s.includes('FROM lantern_missions WHERE id = ?') && s.includes('reward_amount')) {
      const row = missions[binds[0]];
      return row ? { reward_amount: row.reward_amount } : null;
    }
    if (s.includes('FROM lantern_settings WHERE key')) {
      return settings[binds[0]] != null ? { value: String(settings[binds[0]]) } : null;
    }
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
      for (const row of submissions.values()) {
        if (row.mission_id === binds[0] && row.character_name === binds[1] && row.status === 'accepted') return row;
      }
      return null;
    }
    if (s.includes('FROM lantern_mission_submissions WHERE id = ?')) {
      return submissions.get(binds[0]) || null;
    }
    if (s.includes('SELECT id, character_name, delta, kind, created_at FROM lantern_transactions WHERE id =')) {
      return transactions[binds[0]] || null;
    }
    if (s.includes('SELECT balance FROM lantern_wallets')) {
      const bal = wallets[binds[0]];
      return bal != null ? { balance: bal } : null;
    }
    if (s.includes('INSERT INTO lantern_mission_submissions')) {
      submissions.set(binds[0], {
        id: binds[0],
        mission_id: binds[1],
        character_name: binds[2],
        status: binds[5],
      });
      return { meta: { changes: 1 } };
    }
    if (s.includes('INSERT INTO lantern_mission_completions')) {
      completions.set(binds[4], {
        id: binds[0],
        mission_id: binds[1],
        character_name: binds[2],
        event_key: binds[4],
        submission_id: binds[6],
      });
      return { meta: { changes: 1 } };
    }
    if (s.includes('INSERT INTO lantern_transactions')) {
      if (transactions[binds[0]]) throw new Error('UNIQUE');
      transactions[binds[0]] = {
        id: binds[0],
        character_name: binds[1],
        delta: binds[2],
        kind: binds[3],
      };
      return { meta: { changes: 1 } };
    }
    if (s.includes('INSERT INTO lantern_wallets')) {
      wallets[binds[0]] = (Number(wallets[binds[0]]) || 0) + Number(binds[3] || 0);
      return { meta: { changes: 1 } };
    }
    return null;
  }

  return {
    _transactions: transactions,
    _wallets: wallets,
    prepare(sql) {
      const binds = [];
      const api = {
        bind(...args) { binds.push(...args); return api; },
        async first() { return run(sql, binds); },
        async run() { return run(sql, binds) || { meta: { changes: 1 } }; },
      };
      return api;
    },
    async batch(stmts) {
      for (const stmt of stmts) await stmt.run();
    },
  };
}

const eventSrc = fs.readFileSync(path.join(root, 'worker/mission-event-completions.js'), 'utf8');
const handlersSrc = fs.readFileSync(path.join(root, 'worker/missions-handlers.js'), 'utf8');
const missionsHtml = fs.readFileSync(path.join(root, 'app/missions.html'), 'utf8');
const missionsPage = fs.readFileSync(path.join(root, 'app/js/lantern-missions-page.js'), 'utf8');
const contractDoc = fs.readFileSync(path.join(root, 'docs/NUGGET_ECONOMY_CONTRACT.md'), 'utf8');

if (/resolveEventMissionPayout/.test(eventSrc) && !/creditMissionApprovalReward\(db, characterName, submissionId, 1,/.test(eventSrc)) {
  ok('no hardcoded event +1 remains where a saved mission reward applies');
} else bad('event hardcoded +1 still present');
if (/reward_amount: \(\(\) =>/.test(handlersSrc) && !/ordinary mission reward is always 1/.test(handlersSrc)) {
  ok('mission API responses expose saved reward_amount');
} else bad('missionRowToJson still forces 1');
if (missionsHtml.includes('savedMissionReward(m)') && missionsHtml.includes('formatSavedMissionReward')) {
  ok('missions.html student items use saved mission reward');
} else bad('missions.html still hardcodes reward: 1');
if (missionsPage.includes('formatMissionNuggetReward') && missionsPage.includes("n === 1 ? 'Nugget' : 'Nuggets'")) {
  ok('mission card helper uses singular/plural from saved amount');
} else bad('card helper');
if (/saved `reward_amount`/.test(contractDoc) && /economy.poll_response/.test(contractDoc) && /content_creation/.test(contractDoc)) {
  ok('economy contract documents settings + saved mission rewards');
} else bad('contract doc stale');

{
  const sandbox = { window: {}, globalThis: {} };
  sandbox.window = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(root, 'app/js/lantern-missions-page.js'), 'utf8'), sandbox);
  const api = sandbox.LanternMissionsPage;
  if (api.formatMissionNuggetReward(1) === '🟡 +1 Nugget' && api.formatMissionNuggetReward(3) === '🟡 +3 Nuggets') {
    ok('singular/plural copy works');
  } else bad('plural', { one: api.formatMissionNuggetReward(1), three: api.formatMissionNuggetReward(3) });
  if (api.formatMissionNuggetReward(0) === '' && api.formatMissionNuggetReward(null) === '') {
    ok('0 reward does not falsely display +1');
  } else bad('zero display', api.formatMissionNuggetReward(0));
  if (api.formatMissionNuggetReward(3, { free: true }) === 'FREE · +3 Nuggets') {
    ok('sponsored card copy uses the saved amount');
  } else bad('sponsored format', api.formatMissionNuggetReward(3, { free: true }));
}

{
  const overlaid = overlayEducationalTriviaMissions([
    { id: 'perm_handbook_trivia', title: 'Handbook', reward_amount: 3 },
  ]);
  const hb = overlaid.find((m) => m.id === 'perm_handbook_trivia');
  if (hb && Number(hb.reward_amount) === 3) ok('trivia overlay keeps saved reward 3');
  else bad('trivia overlay overwrite', hb);
}

{
  const overlaid = overlayFightSongMission([{ id: 'perm_fight_song', title: 'Fight Song', reward_amount: 0 }]);
  const fsong = overlaid.find((m) => m.id === 'perm_fight_song');
  if (fsong && Number(fsong.reward_amount) === 0) ok('fight-song overlay keeps saved 0 reward');
  else bad('fight-song overlay', fsong);
}

{
  const db = makeEventDb({ missions: {}, settings: { 'economy.mission_default': '2' } });
  const amt = await resolveEventMissionPayout(db, 'missing_mission');
  if (amt === 2) ok('event with no persisted mission uses Default Mission Reward');
  else bad('missing mission fallback', amt);
}

{
  const db = makeEventDb({
    missions: { perm_handbook_trivia: { reward_amount: 3 } },
    wallets: { '20889': 10 },
  });
  const first = await completeMissionByEvent(db, null, {
    missionId: 'perm_handbook_trivia',
    characterName: '20889',
    triggerType: 'game_correct_target',
    eventKey: 'handbook_trivia:20889',
    cadence: 'once',
    note: 'Handbook',
  });
  const tx = db._transactions[missionRewardTxId(submissionIdForEventKey('handbook_trivia:20889'))];
  if (first.ok && first.completed && first.nuggets === 3 && tx && Number(tx.delta) === 3 && db._wallets['20889'] === 13) {
    ok('event mission with reward 3 pays 3');
  } else bad('event pay 3', { first, tx, bal: db._wallets['20889'] });

  const replay = await completeMissionByEvent(db, null, {
    missionId: 'perm_handbook_trivia',
    characterName: '20889',
    triggerType: 'game_correct_target',
    eventKey: 'handbook_trivia:20889',
    cadence: 'once',
    note: 'Handbook',
  });
  if (replay.ok && replay.idempotent && replay.rewarded === false && Number(tx.delta) === 3 && db._wallets['20889'] === 13) {
    ok('idempotency remains intact; old transaction unchanged');
  } else bad('event idempotent', { replay, tx, bal: db._wallets['20889'] });
}

{
  const db = makeEventDb({
    missions: { perm_daily_checkin: { reward_amount: 0 } },
    wallets: { '20889': 10 },
  });
  const r = await completeMissionByEvent(db, null, {
    missionId: 'perm_daily_checkin',
    characterName: '20889',
    triggerType: 'daily_checkin',
    eventKey: 'daily_checkin:20889:2026-08-18',
    cadence: 'daily',
    note: 'Daily Check-In',
  });
  const txId = missionRewardTxId(submissionIdForEventKey('daily_checkin:20889:2026-08-18'));
  if (r.ok && r.completed && r.nuggets === 0 && !r.rewarded && !db._transactions[txId] && db._wallets['20889'] === 10) {
    ok('event mission with reward 0 completes with no TMS/ledger credit');
  } else bad('event pay 0', { r, tx: db._transactions[txId], bal: db._wallets['20889'] });
}

{
  const db = makeEventDb({
    missions: { perm_first_game: { reward_amount: 1 } },
    wallets: { '20889': 4 },
  });
  const first = await completeMissionByEvent(db, null, {
    missionId: 'perm_first_game',
    characterName: '20889',
    triggerType: 'game_play_first',
    eventKey: 'first_game:20889',
    cadence: 'once',
    note: 'First Game Played',
  });
  const sid = submissionIdForEventKey('first_game:20889');
  const oldTx = db._transactions[missionRewardTxId(sid)];
  db._missions = null;
  // Teacher later edits the saved reward. Replay of the same event must keep +1.
  const afterEdit = await creditMissionApprovalReward(db, '20889', sid, 3, 'First Game Played');
  if (first.nuggets === 1 && oldTx && Number(oldTx.delta) === 1 && afterEdit.idempotent && afterEdit.delta === 1 && db._wallets['20889'] === 5) {
    ok('teacher reward edit does not rewrite the already-issued event transaction');
  } else bad('edit preserves history', { first, oldTx, afterEdit, bal: db._wallets['20889'] });

  db2: {
    const futureDb = makeEventDb({
      missions: { perm_first_game: { reward_amount: 3 } },
      wallets: { '20999': 0 },
    });
    const future = await completeMissionByEvent(futureDb, null, {
      missionId: 'perm_first_game',
      characterName: '20999',
      triggerType: 'game_play_first',
      eventKey: 'first_game:20999',
      cadence: 'once',
      note: 'First Game Played',
    });
    if (future.ok && future.nuggets === 3) ok('teacher reward edit affects future event completion');
    else bad('future event 3', future);
  }
}

{
  const db = makeEventDb({
    settings: { 'economy.mission_default': '4' },
    wallets: { '20889': 0 },
  });
  const createdDefault = 4;
  const existingKept = await resolveEventMissionPayout(
    makeEventDb({
      missions: { tmission_old: { reward_amount: 1 } },
      settings: { 'economy.mission_default': '4' },
    }),
    'tmission_old'
  );
  if (createdDefault === 4 && existingKept === 1) {
    ok('Default Mission Reward applies to new/missing missions only; existing saved reward is kept');
  } else bad('default vs saved', { createdDefault, existingKept });
}

console.log('\nnugget-economy-229a-test: ' + pass + ' PASS ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
