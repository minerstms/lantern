/**
 * Prompt #257C — global Mission admin config + reward bands + authoritative payout.
 * Usage: node worker/scripts/mission-activity-257c-test.mjs
 */
import {
  suggestedMissionReward,
  clampMissionRewardAmount,
  validateOrdinaryMissionMinCharacters,
  formatMissionStudentPreview,
} from '../mission-reward-bands.js';
import {
  buildActivitiesAdminPayload,
  patchGlobalMissionActivity,
  handleActivityAdminRoutes,
  GLOBAL_MISSION_REGISTRY,
} from '../activity-admin.js';
import { resolveStoredMissionPayout } from '../nugget-economy-settings.js';
import { creditMissionApprovalReward, missionRewardTxId } from '../missions-reward.js';

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

// ---- Reward bands ----
if (suggestedMissionReward(100) === 1) ok('100 → suggested 1');
else bad('100 band');
if (suggestedMissionReward(199) === 1) ok('1–199 → 1');
else bad('199 band');
if (suggestedMissionReward(200) === 2) ok('200 → 2');
else bad('200 band');
if (suggestedMissionReward(499) === 2) ok('200–499 → 2');
else bad('499 band');
if (suggestedMissionReward(500) === 5) ok('500 → 5');
else bad('500 band');
if (suggestedMissionReward(999) === 5) ok('500–999 → 5');
else bad('999 band');
if (suggestedMissionReward(1000) === 10) ok('1000+ → 10');
else bad('1000 band');

if (clampMissionRewardAmount(10) === 10 && clampMissionRewardAmount(11) === 10 && clampMissionRewardAmount(0, { allowLegacyZero: true }) === 0) {
  ok('clamp 1–10; legacy 0 preserved when stored');
} else bad('clamp range');

if (formatMissionStudentPreview(100, 3, false) === '100+ characters · +3 Nuggets · Earn once') ok('student preview 100/+3');
else bad('preview 100/+3', formatMissionStudentPreview(100, 3, false));
if (formatMissionStudentPreview(1000, 10, false) === '1000+ characters · +10 Nuggets · Earn once') ok('student preview 1000/+10');
else bad('preview 1000/+10');

const minZero = validateOrdinaryMissionMinCharacters(0, 'submission');
const minOne = validateOrdinaryMissionMinCharacters(100, 'submission');
const eventZero = validateOrdinaryMissionMinCharacters(0, 'event');
if (!minZero.ok && minOne.ok && eventZero.ok) ok('ordinary missions require min > 0; events exempt');
else bad('min validation', { minZero, minOne, eventZero });

// ---- Mock D1 for activities admin ----
function makeMissionDb(initialMissions) {
  const missions = { ...(initialMissions || {}) };
  const settings = {};
  return {
    missions,
    settings,
    prepare(sql) {
      const s = String(sql);
      const binds = [];
      const api = {
        bind(...args) {
          binds.push(...args);
          return api;
        },
        async first() {
          if (s.includes('FROM lantern_settings WHERE key')) {
            const v = settings[binds[0]];
            return v != null ? { value: v } : null;
          }
          if (s.includes('FROM lantern_missions WHERE id = ?')) {
            const row = missions[binds[0]];
            if (!row) return null;
            if (s.includes('SELECT id, allows_image FROM lantern_missions WHERE id = ?')) {
              return { id: row.id, allows_image: row.allows_image || 0 };
            }
            return { ...row };
          }
          return null;
        },
        async all() {
          if (s.includes('FROM lantern_missions') && s.includes('school_mission')) {
            return {
              results: Object.values(missions).filter((m) => String(m.audience || 'school_mission') === 'school_mission' || !m.audience),
            };
          }
          return { results: [] };
        },
        async run() {
          if (s.includes('UPDATE lantern_missions SET')) {
            const id = binds[binds.length - 1];
            const row = missions[id];
            if (!row) return { meta: { changes: 0 } };
            const setClause = s.split('UPDATE lantern_missions SET ')[1].split(' WHERE')[0];
            const cols = setClause.split(',').map((c) => c.trim().split('=')[0].trim());
            for (let i = 0; i < cols.length; i++) {
              row[cols[i]] = binds[i];
            }
            return { meta: { changes: 1 } };
          }
          if (s.includes('INSERT INTO lantern_settings')) {
            settings[binds[0]] = binds[1];
            return { success: true };
          }
          return { success: true };
        },
      };
      return api;
    },
  };
}

const thankYou = {
  id: 'perm_thank_you',
  title: 'Thank a Teacher',
  description: 'Say thanks',
  reward_amount: 1,
  submission_type: 'confirmation',
  active: 1,
  archived: 0,
  allows_text: 1,
  allows_image: 0,
  min_characters: 0,
  teacher_id: 'system',
  teacher_name: 'Lantern',
};
const longForm = {
  id: 'perm_create_something',
  title: 'Create Something',
  description: 'Make something',
  reward_amount: 1,
  submission_type: 'text',
  active: 1,
  archived: 0,
  allows_text: 1,
  allows_image: 0,
  min_characters: 100,
  teacher_id: 'system',
  teacher_name: 'Lantern',
};

const db = makeMissionDb({ perm_thank_you: { ...thankYou }, perm_create_something: { ...longForm } });
const payload = await buildActivitiesAdminPayload(db, 'https://x');
if (payload.ok && payload.missions.length >= 2 && payload.filters.includes('inactive')) {
  ok('activities admin payload lists global missions');
} else bad('activities payload', payload);

const patched = await patchGlobalMissionActivity(
  db,
  'perm_create_something',
  { min_characters: 1000, reward_amount: 10, require_image: false },
  'Admin',
  'https://x'
);
if (
  patched.ok &&
  patched.activity.min_characters === 1000 &&
  patched.activity.reward_amount === 10 &&
  patched.activity.student_preview.includes('1000+') &&
  patched.activity.student_preview.includes('+10')
) {
  ok('patch global mission saves min/reward/preview');
} else bad('patch mission', patched);

const thankPatch = await patchGlobalMissionActivity(
  db,
  'perm_thank_you',
  { min_characters: 100, reward_amount: 3, active: true },
  'Admin',
  'https://x'
);
if (thankPatch.ok && thankPatch.activity.reward_amount === 3 && thankPatch.activity.min_characters === 100) {
  ok('Thank a Teacher representative 100/+3 config');
} else bad('thank you patch', thankPatch);

const lockedPlacement = await patchGlobalMissionActivity(db, 'perm_thank_you', { placement: 'game' }, 'Admin', 'https://x');
if (lockedPlacement.ok && lockedPlacement.activity.placement === 'mission') {
  ok('mission-only placement cannot switch to game');
} else bad('placement lock', lockedPlacement);

if (GLOBAL_MISSION_REGISTRY.length >= 16) ok('global mission registry populated');
else bad('registry count', GLOBAL_MISSION_REGISTRY.length);

// ---- Stored payout amounts ----
for (const [amt, label] of [
  [1, '+1'],
  [2, '+2'],
  [5, '+5'],
  [10, '+10'],
]) {
  const payout = await resolveStoredMissionPayout(db, amt);
  if (payout === amt) ok(`stored reward ${label} resolves exactly`);
  else bad(`payout ${label}`, payout);
}

// ---- Approval payout amounts (creditMissionApprovalReward) ----
function makeCreditDb() {
  const state = { transactions: {}, wallets: {} };
  function runStatement(sql, binds) {
    const s = String(sql).replace(/\s+/g, ' ').trim();
    if (s.startsWith('INSERT INTO lantern_transactions')) {
      state.transactions[binds[0]] = {
        id: binds[0],
        character_name: binds[1],
        delta: binds[2],
        kind: binds[3],
      };
      return;
    }
    if (s.includes('INSERT INTO lantern_wallets') && s.includes('ON CONFLICT')) {
      const key = binds[0];
      const bal = Number(binds[1]) || 0;
      state.wallets[key] = { balance: bal };
      return;
    }
  }
  const db = {
    _state: state,
    async batch(stmts) {
      for (let i = 0; i < stmts.length; i++) {
        const stmt = stmts[i];
        await stmt.run();
      }
    },
    prepare(sql) {
      const binds = [];
      const api = {
        bind(...args) {
          binds.push(...args);
          return api;
        },
        async first() {
          const s = String(sql).replace(/\s+/g, ' ').trim();
          if (s.startsWith('SELECT id, character_name, delta, kind, created_at FROM lantern_transactions WHERE id =')) {
            return state.transactions[binds[0]] || null;
          }
          if (s.startsWith('SELECT balance FROM lantern_wallets WHERE character_name =')) {
            const w = state.wallets[binds[0]];
            return w ? { balance: w.balance } : null;
          }
          return null;
        },
        async run() {
          runStatement(sql, binds);
          return { success: true };
        },
      };
      return api;
    },
  };
  return db;
}

for (const [reward, subId] of [
  [1, 'sub_r1'],
  [2, 'sub_r2'],
  [5, 'sub_r5'],
  [10, 'sub_r10'],
]) {
  const rdb = makeCreditDb();
  const first = await creditMissionApprovalReward(rdb, '20889', subId, reward, 'approved');
  const second = await creditMissionApprovalReward(rdb, '20889', subId, reward, 'approved');
  const tx = rdb._state.transactions[missionRewardTxId(subId)];
  if (first.ok && first.delta === reward && second.idempotent && tx && Number(tx.delta) === reward) {
    ok(`credit pays +${reward} exactly once`);
  } else bad(`credit +${reward}`, { first, second, tx });
}

{
  const rdb = makeCreditDb();
  const first = await creditMissionApprovalReward(rdb, '20889', 'sub_hist', 1, 'old');
  const again = await creditMissionApprovalReward(rdb, '20889', 'sub_hist', 10, 'new');
  if (first.ok && first.delta === 1 && again.ok && again.idempotent && again.delta === 1) {
    ok('historical +1 ledger unchanged when later credit attempted at +10');
  } else bad('historical preservation', { first, again });
}

console.log('\nmission-activity-257c-test: ' + pass + ' PASS ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
