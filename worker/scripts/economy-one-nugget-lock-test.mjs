/**
 * Prompt #159 — lock Missions + Games economy to exactly 1 Nugget.
 * Static/source + reward-credit unit checks (no production writes).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { creditMissionApprovalReward } from '../missions-reward.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;

function ok(label) {
  pass++;
  console.log('PASS', label);
}
function bad(label, detail) {
  fail++;
  console.error('FAIL', label, detail || '');
}

const workerIndex = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
const missionsHandlers = fs.readFileSync(path.join(root, 'worker/missions-handlers.js'), 'utf8');
const missionsReward = fs.readFileSync(path.join(root, 'worker/missions-reward.js'), 'utf8');
const teacherHtml = fs.readFileSync(path.join(root, 'app/teacher.html'), 'utf8');
const missionsPage = fs.readFileSync(path.join(root, 'app/js/lantern-missions-page.js'), 'utf8');
const gamesHtml = fs.readFileSync(path.join(root, 'app/games.html'), 'utf8');
const migration = fs.readFileSync(
  path.join(root, 'worker/migrations/057_mission_reward_one_nugget.sql'),
  'utf8'
);
const walletJs = fs.readFileSync(path.join(root, 'app/js/lantern-wallet.js'), 'utf8');

if (migration.includes('SET reward_amount = 1') && migration.includes('reward_amount <> 1')) {
  ok('migration 057 normalizes mission reward_amount to 1');
} else bad('migration 057');

if (/const rewardAmount = 1;/.test(missionsHandlers) && /Prompt #159/.test(missionsHandlers)) {
  ok('mission create API forces reward_amount = 1');
} else bad('mission create force 1');

if (
  missionsHandlers.includes('updates.push(\'reward_amount = ?\')') &&
  /bindings\.push\(1\);/.test(missionsHandlers) &&
  !/Math\.min\(99, Math\.floor\(Number\(body\.reward_amount\)/.test(missionsHandlers)
) {
  ok('mission update API forces reward_amount = 1 when provided');
} else bad('mission update force 1');

if (/const reward = 1;/.test(missionsHandlers) && /Prompt #159/.test(missionsHandlers)) {
  ok('mission approve path hardcodes reward = 1');
} else bad('mission approve force 1');

if (/const reward = 1;/.test(missionsReward) && /Prompt #159/.test(missionsReward)) {
  ok('creditMissionApprovalReward hardcodes +1');
} else bad('creditMissionApprovalReward force 1');

if (
  workerIndex.includes("kind === 'game_play'") &&
  workerIndex.includes('client_delta_rejected') &&
  workerIndex.includes('delta = -1')
) {
  ok('game_play server enforces delta = -1');
} else bad('game_play enforcement');

if (
  workerIndex.includes("kind === 'game_win'") &&
  workerIndex.includes('delta = 1') &&
  workerIndex.includes('game_win awards exactly 1 Nugget')
) {
  ok('game_win server enforces delta = +1');
} else bad('game_win enforcement');

if (workerIndex.includes("kind === 'game_false_start'") && workerIndex.includes('game_false_start_disabled')) {
  ok('game_false_start extra charge rejected server-side');
} else bad('game_false_start rejection');

if (!teacherHtml.includes('id="missionReward"') && teacherHtml.includes('1 Nugget')) {
  ok('Teacher Create Mission has no reward selector; shows fixed 1 Nugget');
} else bad('teacher create reward UI');

if (!teacherHtml.includes('data-edit="reward_amount"') && teacherHtml.includes('Reward: <strong>1 Nugget</strong>')) {
  ok('Teacher edit form has no reward_amount control');
} else bad('teacher edit reward UI');

if (missionsPage.includes("return '🟡 +1 Nugget'") || missionsPage.includes('return "🟡 +1 Nugget"')) {
  ok('student mission cards render canonical +1 Nugget');
} else bad('student card +1 display');

if (gamesHtml.includes('var REWARDS = { easy: 1, medium: 1, hard: 1 }')) {
  ok('Nugget Hunt client rewards normalized to 1');
} else bad('nugget hunt rewards');

if (!gamesHtml.includes("callEconomyTransact(adopted.name, -1, 'game_false_start'")) {
  ok('Reaction false-start no longer posts an extra economy charge');
} else bad('false-start client charge still present');

if (
  walletJs.includes('canUseHttpEconomy') &&
  walletJs.includes('postEconomyTransact') &&
  walletJs.includes("economyApiBase() !== null || typeof global.fetch === 'function'")
) {
  ok('production wallet path prefers HTTP economy when fetch exists (no silent LS authority)');
} else bad('wallet production HTTP gate');

function makeCreditDb() {
  const state = {
    transactions: {},
    wallets: { '20889': { character_name: '20889', balance: 10, updated_at: '' } },
  };
  function runStatement(sql, binds) {
    const s = String(sql).replace(/\s+/g, ' ').trim();
    if (s.startsWith('SELECT id, character_name, delta, kind, created_at FROM lantern_transactions WHERE id =')) {
      return state.transactions[binds[0]] || null;
    }
    if (s.startsWith('SELECT balance FROM lantern_wallets WHERE character_name =')) {
      const w = state.wallets[binds[0]];
      return w ? { balance: w.balance } : null;
    }
    if (s.startsWith('INSERT INTO lantern_transactions')) {
      const [id, characterName, delta, kind, source, note, createdAt, metaJson] = binds;
      if (state.transactions[id]) {
        const err = new Error('UNIQUE');
        err.code = 'SQLITE_CONSTRAINT_PRIMARYKEY';
        throw err;
      }
      state.transactions[id] = {
        id,
        character_name: characterName,
        delta,
        kind,
        source,
        note,
        created_at: createdAt,
        meta_json: metaJson,
      };
      return { meta: { changes: 1 } };
    }
    if (s.startsWith('INSERT INTO lantern_wallets')) {
      const [characterName, balance, updatedAt, deltaAdd, updatedAt2] = binds;
      const existing = state.wallets[characterName];
      if (existing) {
        existing.balance = Number(existing.balance || 0) + Number(deltaAdd || 0);
        existing.updated_at = updatedAt2 || updatedAt;
      } else {
        state.wallets[characterName] = { character_name: characterName, balance: Number(balance), updated_at: updatedAt };
      }
      return { meta: { changes: 1 } };
    }
    throw new Error('Unhandled SQL: ' + s.slice(0, 80));
  }
  return {
    _state: state,
    prepare(sql) {
      const binds = [];
      const api = {
        bind(...args) {
          binds.length = 0;
          binds.push(...args);
          return api;
        },
        async first() {
          const row = runStatement(sql, binds);
          return row && row.meta ? null : row;
        },
        async run() {
          return runStatement(sql, binds);
        },
      };
      return api;
    },
    async batch(stmts) {
      for (const stmt of stmts) await stmt.run();
    },
  };
}

(async function () {
  const db = makeCreditDb();
  const credited = await creditMissionApprovalReward(db, '20889', 'sub_force_1', 99, 'note');
  if (credited.ok && credited.delta === 1 && db._state.wallets['20889'].balance === 11) {
    ok('creditMissionApprovalReward ignores client 99 and awards +1');
  } else bad('credit ignores malformed reward', credited);

  console.log('\nEconomy 1-nugget tests:', pass, 'passed,', fail, 'failed');
  process.exit(fail ? 1 : 0);
})();
