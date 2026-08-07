/**
 * Locker achievement, purchase, and equip security tests.
 * Usage: node worker/scripts/locker-security-test.mjs
 */
import { executeCosmeticPurchase } from '../economy-cosmetic.js';
import { awardAchievementsForEconomyTransact } from '../locker-achievements.js';
import { handleLockerRoutes } from '../locker-handlers.js';
import { unlockAchievement } from '../locker-storage.js';

let fail = 0;
let pass = 0;

function ok(label) {
  pass++;
  console.log('PASS', label);
}

function bad(label, detail) {
  fail++;
  console.error('FAIL', label, detail || '');
}

function jsonResponse(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', ...(cors || {}) },
  });
}

function makeDb(state) {
  state.wallets = state.wallets || {};
  state.transactions = state.transactions || {};
  state.achievements = state.achievements || {};
  state.cosmeticOwnership = state.cosmeticOwnership || {};
  state.batchLog = state.batchLog || [];

  function prepare(sql) {
    const s = String(sql);
    const binds = [];
    const api = {
      bind(...args) {
        binds.push(...args);
        return api;
      },
      async first() {
        if (s.includes('FROM lantern_wallets')) {
          return state.wallets[binds[0]] || null;
        }
        if (s.includes('FROM lantern_achievements') && s.includes('achievement_id = ?')) {
          const rows = (state.achievements[binds[0]] || []).filter((r) => r.achievement_id === binds[1]);
          return rows[0] || null;
        }
        if (s.includes('FROM lantern_cosmetic_ownership')) {
          return state.cosmeticOwnership[binds[0]] || null;
        }
        if (s.includes('json_extract(meta_json')) {
          const key = binds[0];
          const idem = binds[1];
          const rows = (state.transactions[key] || []).filter((r) => {
            try {
              const m = JSON.parse(r.meta_json || '{}');
              return m.idempotency_key === idem;
            } catch (_) {
              return false;
            }
          });
          return rows[0] || null;
        }
        if (s.includes('SUM(CASE WHEN delta > 0')) {
          const key = binds[0];
          let earned = 0;
          for (const r of state.transactions[key] || []) {
            if (Number(r.delta) > 0) earned += Number(r.delta);
          }
          return { earned };
        }
        return null;
      },
      async all() {
        if (s.includes('FROM lantern_achievements')) {
          return { results: (state.achievements[binds[0]] || []).slice() };
        }
        if (s.includes('FROM lantern_transactions') && s.includes("kind = 'daily_hunt'")) {
          return { results: (state.transactions[binds[0]] || []).filter((r) => r.kind === 'daily_hunt') };
        }
        return { results: [] };
      },
      async run() {
        if (s.includes('INSERT INTO lantern_transactions')) {
          const [id, character_name, delta, kind, source, note, created_at, meta_json] = binds;
          state.transactions[character_name] = state.transactions[character_name] || [];
          state.transactions[character_name].push({
            id,
            character_name,
            delta,
            kind,
            source,
            note,
            created_at,
            meta_json,
          });
          return { success: true };
        }
        if (s.includes('INSERT INTO lantern_wallets')) {
          const [character_name, balance, updated_at, deltaArg, updatedArg] = binds;
          const existing = state.wallets[character_name];
          if (existing && s.includes('ON CONFLICT')) {
            state.wallets[character_name] = {
              balance: Number(existing.balance) + Number(deltaArg),
              updated_at: updatedArg,
            };
          } else {
            state.wallets[character_name] = { balance, updated_at };
          }
          return { success: true };
        }
        if (s.includes('INSERT INTO lantern_achievements')) {
          const [id, character_name, achievement_id, unlocked_at, source, meta_json] = binds;
          state.achievements[character_name] = state.achievements[character_name] || [];
          state.achievements[character_name].push({
            id,
            character_name,
            achievement_id,
            unlocked_at,
            source,
            meta_json,
          });
          return { success: true };
        }
        if (s.includes('INSERT INTO lantern_cosmetic_ownership')) {
          const [character_name, owned_json, equipped_json, updated_at] = binds;
          state.cosmeticOwnership[character_name] = {
            character_name,
            owned_json,
            equipped_json,
            updated_at,
          };
          return { success: true };
        }
        return { success: true };
      },
    };
    return api;
  }

  return {
    prepare,
    async batch(stmts) {
      state.batchLog.push(stmts.length);
      for (const stmt of stmts) {
        await stmt.run();
      }
      return stmts.map(() => ({ success: true }));
    },
  };
}

async function testClientUnlockRouteForbidden() {
  const deps = {
    jsonResponse,
    getPilotAccountFromRequest: async () => ({
      username: 'lucas',
      role: 'student',
      student_character_name: 'Lucas',
      teacher_id: null,
      mtss_student_id: '20889',
      is_active: 1,
      must_change_password: 0,
    }),
    pilotEconomyCharacterName: () => '20889',
    pilotAccountRequiresChangePassword: () => false,
  };
  const url = new URL('https://example.test/api/locker/achievements/unlock');
  const req = new Request(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ achievement_id: 'first_game' }),
  });
  const res = await handleLockerRoutes(req, url, '/api/locker/achievements/unlock', { DB: makeDb({}) }, {}, deps);
  const body = await res.json();
  if (res.status !== 410 || body.error !== 'achievement_unlock_client_forbidden') {
    return bad('client unlock route forbidden', { status: res.status, body });
  }
  ok('client unlock route returns 410');
}

async function testUnknownAchievementRejectedInternally() {
  const state = {};
  const db = makeDb(state);
  const result = await unlockAchievement(db, '20889', 'totally_fake_badge', 'test', {});
  if (result.ok !== false || result.error !== 'unknown_achievement') {
    return bad('unknown achievement rejected', result);
  }
  ok('unknown achievement id rejected');
}

async function testServerEventAwardsAchievement() {
  const state = { transactions: { '20889': [] }, achievements: {} };
  const db = makeDb(state);
  await awardAchievementsForEconomyTransact(db, '20889', 'daily_checkin', 'tx-1', 'Daily Check-In');
  const rows = state.achievements['20889'] || [];
  if (rows.length !== 1 || rows[0].achievement_id !== 'daily_checkin') {
    return bad('daily_checkin awarded by server event', rows);
  }
  await awardAchievementsForEconomyTransact(db, '20889', 'daily_checkin', 'tx-2', 'Daily Check-In');
  if ((state.achievements['20889'] || []).length !== 1) {
    return bad('duplicate event one row', state.achievements['20889']);
  }
  ok('server event awards and dedupes achievement');
}

async function testCosmeticPurchaseServerPrice() {
  const state = {
    wallets: { '20889': { balance: 10, updated_at: '2026-01-01T00:00:00.000Z' } },
    transactions: {},
    cosmeticOwnership: {},
  };
  const db = makeDb(state);
  const purchase = await executeCosmeticPurchase(db, '20889', 'frame_gold', { idempotencyKey: 'buy-1' });
  if (!purchase.ok || purchase.server_price !== 5 || purchase.balance_after !== 5) {
    return bad('successful purchase server price', purchase);
  }
  const owned = state.cosmeticOwnership['20889'];
  if (!owned || !JSON.parse(owned.owned_json).includes('frame_gold')) {
    return bad('ownership granted', owned);
  }
  const ach = (state.achievements && state.achievements['20889']) || [];
  if (!ach.some((a) => a.achievement_id === 'first_purchase')) {
    return bad('first_purchase after purchase', ach);
  }
  ok('cosmetic purchase uses server price and grants ownership');
}

async function testUnknownCosmeticRejected() {
  const state = { wallets: { '20889': { balance: 10 } } };
  const db = makeDb(state);
  const purchase = await executeCosmeticPurchase(db, '20889', 'not_a_real_item', {});
  if (purchase.ok || purchase.error !== 'unknown_cosmetic') return bad('unknown cosmetic rejected', purchase);
  ok('unknown cosmetic rejected');
}

async function testInsufficientBalanceGrantsNothing() {
  const state = { wallets: { '20889': { balance: 1 } }, transactions: {}, cosmeticOwnership: {} };
  const db = makeDb(state);
  const purchase = await executeCosmeticPurchase(db, '20889', 'frame_gold', {});
  if (purchase.ok || purchase.error !== 'insufficient') return bad('insufficient balance', purchase);
  if ((state.transactions['20889'] || []).length) return bad('no tx on insufficient', state.transactions);
  ok('insufficient balance grants nothing');
}

async function testDuplicateIdempotencyNoDoubleSpend() {
  const state = {
    wallets: { '20889': { balance: 10 } },
    transactions: {},
    cosmeticOwnership: {},
  };
  const db = makeDb(state);
  const first = await executeCosmeticPurchase(db, '20889', 'frame_gold', { idempotencyKey: 'dup-key' });
  const second = await executeCosmeticPurchase(db, '20889', 'frame_silver', { idempotencyKey: 'dup-key' });
  if (!first.ok || !second.ok || !second.idempotent) return bad('idempotent replay ok', { first, second });
  if ((state.transactions['20889'] || []).length !== 1) return bad('one tx row for idempotent replay', state.transactions);
  if (state.wallets['20889'].balance !== 5) return bad('balance not double-spent', state.wallets);
  ok('idempotent purchase cannot double-spend');
}

async function testEquipUnownedRejected() {
  const state = {
    cosmeticOwnership: {
      '20889': {
        character_name: '20889',
        owned_json: '[]',
        equipped_json: '{}',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    },
  };
  const deps = {
    jsonResponse,
    getPilotAccountFromRequest: async () => ({
      username: 'lucas',
      role: 'student',
      student_character_name: 'Lucas',
      teacher_id: null,
      mtss_student_id: '20889',
      is_active: 1,
      must_change_password: 0,
    }),
    pilotEconomyCharacterName: () => '20889',
    pilotAccountRequiresChangePassword: () => false,
  };
  const url = new URL('https://example.test/api/locker/cosmetics/equip');
  const req = new Request(url.toString(), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category: 'frame', cosmetic_id: 'frame_gold' }),
  });
  const res = await handleLockerRoutes(req, url, '/api/locker/cosmetics/equip', { DB: makeDb(state) }, {}, deps);
  const body = await res.json();
  if (res.status !== 400 || body.error !== 'not_owned') return bad('equip unowned rejected', body);
  ok('equip unowned item rejected');
}

async function testEquipInvalidSlotRejected() {
  const state = {
    cosmeticOwnership: {
      '20889': {
        character_name: '20889',
        owned_json: '["frame_gold"]',
        equipped_json: '{}',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    },
  };
  const deps = {
    jsonResponse,
    getPilotAccountFromRequest: async () => ({
      username: 'lucas',
      role: 'student',
      student_character_name: 'Lucas',
      teacher_id: null,
      mtss_student_id: '20889',
      is_active: 1,
      must_change_password: 0,
    }),
    pilotEconomyCharacterName: () => '20889',
    pilotAccountRequiresChangePassword: () => false,
  };
  const url = new URL('https://example.test/api/locker/cosmetics/equip');
  const req = new Request(url.toString(), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category: 'not_a_slot', cosmetic_id: 'frame_gold' }),
  });
  const res = await handleLockerRoutes(req, url, '/api/locker/cosmetics/equip', { DB: makeDb(state) }, {}, deps);
  const body = await res.json();
  if (res.status !== 400 || body.error !== 'invalid_slot') return bad('invalid slot rejected', body);
  ok('invalid equip slot rejected');
}

await testClientUnlockRouteForbidden();
await testUnknownAchievementRejectedInternally();
await testServerEventAwardsAchievement();
await testCosmeticPurchaseServerPrice();
await testUnknownCosmeticRejected();
await testInsufficientBalanceGrantsNothing();
await testDuplicateIdempotencyNoDoubleSpend();
await testEquipUnownedRejected();
await testEquipInvalidSlotRejected();

console.log('\nlocker-security-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
