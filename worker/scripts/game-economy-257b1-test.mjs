/**
 * Prompt #257B1 — authority, forgery resistance, bundle concurrency, isolation.
 * Usage: node worker/scripts/game-economy-257b1-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../index.js';
import {
  resolveGamePlayTransact,
  persistAuthoritativeGamePlayProof,
  saveGameEconomySettings,
  resolveGamePlayEconomy,
} from '../game-play-economy.js';
import { evaluatePaidGamePlayRun } from '../game-paid-run-proof.js';
import { resolveRegisteredLeaderboardGame } from '../lantern-game-catalog.js';
import { economyPublicPayload, getEconomySettings } from '../nugget-economy-settings.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TEST_PILOT_SECRET = 'test-secret-not-a-real-pilot-session-secret';
const TEST_BRIDGE_SECRET = 'test-bridge-secret-not-real';

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

function b64url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function signTestJwt(payload, secret) {
  const enc = new TextEncoder();
  const headerB64 = b64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payloadB64 = b64url(enc.encode(JSON.stringify(payload)));
  const data = `${headerB64}.${payloadB64}`;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return `${data}.${b64url(new Uint8Array(sigBuf))}`;
}
async function studentCookie(name) {
  const now = Math.floor(Date.now() / 1000);
  const token = await signTestJwt(
    {
      sub: name,
      role: 'student',
      scn: name,
      iat: now,
      exp: now + 3600,
    },
    TEST_PILOT_SECRET
  );
  return `lantern_pilot=${token}`;
}

function makeDb(state) {
  state.settings = state.settings || {};
  state.transactions = state.transactions || [];
  state.wallets = state.wallets || {};
  return {
    state,
    prepare(sql) {
      const s = String(sql);
      const binds = [];
      const api = {
        bind(...args) {
          binds.push(...args);
          return api;
        },
        async first() {
          if (s.includes('FROM lantern_settings') && s.includes('key = ?')) {
            const v = state.settings[binds[0]];
            return v != null ? { value: v } : null;
          }
          if (s.includes('COUNT(*)') && s.includes('bundle_id')) {
            const bid = binds[0];
            const c = state.transactions.filter((t) => {
              if (t.kind !== 'game_play') return false;
              let meta = t.meta || {};
              if (t.meta_json) {
                try {
                  meta = JSON.parse(t.meta_json);
                } catch (_) {}
              }
              return meta.bundle_id === bid;
            }).length;
            return { c };
          }
          if (s.includes('FROM lantern_transactions') && s.includes('run_id')) {
            const rid = binds[0];
            return (
              state.transactions.find((t) => {
                if (t.kind !== 'game_play') return false;
                let meta = t.meta || {};
                if (t.meta_json) {
                  try {
                    meta = JSON.parse(t.meta_json);
                  } catch (_) {}
                }
                return meta.run_id === rid;
              }) || null
            );
          }
          if (s.includes('FROM lantern_transactions WHERE id = ?')) {
            return state.transactions.find((t) => t.id === binds[0]) || null;
          }
          if (s.includes('FROM lantern_wallets')) {
            const bal = state.wallets[binds[0]];
            return bal != null ? { balance: bal } : null;
          }
          return null;
        },
        async all() {
          if (s.includes('FROM lantern_transactions') && s.includes('bundle_id')) {
            const char = binds[0];
            const gid = binds[1];
            return {
              results: state.transactions
                .filter((t) => {
                  if (t.character_name !== char || t.kind !== 'game_play') return false;
                  let meta = t.meta || {};
                  if (t.meta_json) {
                    try {
                      meta = JSON.parse(t.meta_json);
                    } catch (_) {}
                  }
                  return meta.game_id === gid && meta.bundle_id && meta.bundle_plays_total;
                })
                .map((t) => ({
                  meta_json: t.meta_json || JSON.stringify(t.meta || {}),
                  created_at: t.created_at,
                })),
            };
          }
          return { results: [] };
        },
        async run() {
          if (s.includes('INSERT INTO lantern_settings')) {
            state.settings[binds[0]] = binds[1];
            return { success: true };
          }
          if (s.includes('DELETE FROM lantern_settings')) {
            delete state.settings[binds[0]];
            return { success: true };
          }
          if (s.includes('INSERT INTO lantern_transactions')) {
            if (state.transactions.some((t) => t.id === binds[0])) {
              throw new Error('UNIQUE constraint failed');
            }
            const metaJson = binds[7] || '{}';
            state.transactions.push({
              id: binds[0],
              character_name: binds[1],
              delta: binds[2],
              kind: binds[3],
              meta_json: metaJson,
              meta: JSON.parse(metaJson),
              created_at: binds[6],
            });
            return { success: true };
          }
          if (s.includes('INSERT INTO lantern_wallets') || s.includes('UPDATE lantern_wallets')) {
            state.wallets[binds[0]] = (state.wallets[binds[0]] || 0) + Number(binds[3] || binds[1] || 0);
            return { success: true };
          }
          return { success: true };
        },
      };
      return api;
    },
  };
}

async function insertPlay(db, characterName, resolved) {
  const txId = 'tx-' + Math.random().toString(36).slice(2);
  const now = new Date().toISOString();
  if (resolved.delta === 0) {
    return persistAuthoritativeGamePlayProof(db, {
      characterName,
      runId: resolved.meta.run_id,
      meta: resolved.meta,
      delta: 0,
      now,
    });
  }
  await db
    .prepare(
      'INSERT INTO lantern_transactions (id, character_name, delta, kind, source, note, created_at, meta_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(txId, characterName, resolved.delta, 'game_play', 'GAME', 'Game', now, JSON.stringify(resolved.meta))
    .run();
  return { ok: true };
}

function makeWorkerEnv(state) {
  state.accounts = state.accounts || {
    lucas: {
      username: 'lucas',
      display_name: 'Lucas',
      role: 'student',
      student_character_name: 'Lucas',
      is_active: 1,
    },
  };
  state.settings = state.settings || {};
  state.transactions = state.transactions || [];
  state.wallets = state.wallets || { Lucas: 5 };
  const inner = makeDb(state);
  function prepare(sql) {
    const s = String(sql);
    if (s.includes('FROM lantern_pilot_accounts WHERE lower(trim(username))')) {
      const binds = [];
      const api = {
        bind(v) {
          binds.push(v);
          return api;
        },
        async first() {
          return state.accounts[String(binds[0] || '').trim().toLowerCase()] || null;
        },
        async all() {
          return { results: [] };
        },
        async run() {
          return { success: true };
        },
      };
      return api;
    }
    return inner.prepare(sql);
  }
  return {
    DB: Object.assign({ prepare }, { state }),
    PILOT_SESSION_SECRET: TEST_PILOT_SECRET,
    TMS_LANTERN_BRIDGE_SECRET: TEST_BRIDGE_SECRET,
  };
}

async function transact(env, cookie, body) {
  const res = await worker.fetch(
    new Request('https://lantern.example/api/economy/transact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify(body),
    }),
    env
  );
  return { status: res.status, json: await res.json() };
}

// ---- 1. Modern authority ignores legacy economy.game_play when game_id present ----
{
  const db = makeDb({ settings: { 'economy.game_play': '0', 'economy.game_default_play_mode': '1' } });
  const mem = await resolveGamePlayEconomy(db, 'memory');
  assert(mem && !mem.free && mem.playsPerNugget === 1, '2. modern global ignores legacy game_play=0');
  const txn = await resolveGamePlayTransact(db, 'Lucas', 'memory', 'modern-run');
  assert(txn.ok && txn.delta === -1 && !txn.legacy, '2. modern transact debits despite legacy game_play=0');
}

// ---- Admin payload hides dormant legacy game_play row ----
{
  const db = makeDb({});
  const payload = economyPublicPayload(await getEconomySettings(db));
  assert(!payload.rows.some((r) => r.id === 'game_play'), '4. dormant game_play hidden from admin rows');
  assert(/game_default_play_mode|Game Economy/.test(fs.readFileSync(path.join(root, 'app/admin.html'), 'utf8')), '4. admin has Game Economy section');
}

// ---- Forgery via worker transact ----
await (async () => {
  const env = makeWorkerEnv({
    settings: { 'economy.game_default_play_mode': '1' },
    wallets: { Lucas: 5 },
  });
  const cookie = await studentCookie('lucas');
  const forgedZero = await transact(env, cookie, {
    kind: 'game_play',
    delta: 0,
    meta: { run_id: 'forge-zero', game_id: 'tower' },
  });
  assert(forgedZero.status === 400 && forgedZero.json.error === 'client_delta_rejected', '5. forged delta=0 rejected');

  const forgedFreeResolved = await resolveGamePlayTransact(env.DB, 'Lucas', 'tower', 'forge-free');
  assert(
    forgedFreeResolved.ok && forgedFreeResolved.delta === -1 && !forgedFreeResolved.meta.free_play,
    '6. forged free_play meta ignored; server resolves paid debit'
  );

  await saveGameEconomySettings(env.DB, { game_overrides: { tower: '2' } }, 'admin');
  const env2 = makeWorkerEnv({
    settings: Object.assign({}, env.DB.state.settings),
    wallets: { Lucas: 5 },
  });
  const cookie2 = await studentCookie('lucas');
  const fakeBundle = await transact(env2, cookie2, {
    kind: 'game_play',
    delta: 0,
    meta: {
      run_id: 'forge-bundle',
      game_id: 'tower',
      bundle_id: 'fake-bundle',
      bundle_plays_total: 2,
      bundle_play_index: 2,
      bundle_consume: true,
    },
  });
  assert(fakeBundle.status === 400 && fakeBundle.json.error === 'client_delta_rejected', '7-8. forged bundle consume rejected', fakeBundle);

  const fakePurchase = await transact(env2, cookie2, {
    kind: 'game_play',
    delta: 0,
    meta: {
      run_id: 'forge-purchase',
      game_id: 'tower',
      bundle_id: 'fake-bundle-2',
      bundle_plays_total: 3,
      bundle_play_index: 1,
      bundle_purchase: true,
    },
  });
  assert(fakePurchase.status === 400 && fakePurchase.json.error === 'client_delta_rejected', '8. forged bundle purchase index rejected');
})();

// ---- Concurrency: last entitlement on 2-play bundle ----
{
  const db = makeDb({});
  await saveGameEconomySettings(db, { game_overrides: { tower: '2' } }, 'admin');
  const char = 'Lucas';
  const r1 = await resolveGamePlayTransact(db, char, 'tower', 'c-run-1');
  await insertPlay(db, char, r1);
  const meta2 = {
    bundle_id: r1.meta.bundle_id,
    bundle_plays_total: 2,
    bundle_play_index: 2,
    game_id: 'tower',
    game_name: 'Stack Lab',
    bundle_consume: true,
  };
  const [slotA, slotB] = await Promise.all([
    persistAuthoritativeGamePlayProof(db, {
      characterName: char,
      runId: 'c-run-2a',
      meta: meta2,
      delta: 0,
    }),
    persistAuthoritativeGamePlayProof(db, {
      characterName: char,
      runId: 'c-run-2b',
      meta: meta2,
      delta: 0,
    }),
  ]);
  const wins = [slotA, slotB].filter((r) => r.ok && !r.idempotent);
  const losses = [slotA, slotB].filter((r) => !r.ok && r.error === 'bundle_slot_taken');
  assert(wins.length === 1 && losses.length === 1, '10. 2-play final entitlement: only one concurrent consume', { slotA, slotB });
}

// ---- Concurrency: last entitlement on 3-play bundle ----
{
  const db = makeDb({});
  await saveGameEconomySettings(db, { game_overrides: { tower: '3' } }, 'admin');
  const char = 'Lucas';
  let bundleId = '';
  for (const rid of ['3a', '3b']) {
    const r = await resolveGamePlayTransact(db, char, 'tower', rid);
    bundleId = r.meta.bundle_id;
    await insertPlay(db, char, r);
  }
  const meta3 = {
    bundle_id: bundleId,
    bundle_plays_total: 3,
    bundle_play_index: 3,
    game_id: 'tower',
    game_name: 'Stack Lab',
    bundle_consume: true,
  };
  const [a, b] = await Promise.all([
    persistAuthoritativeGamePlayProof(db, { characterName: char, runId: '3c-a', meta: meta3, delta: 0 }),
    persistAuthoritativeGamePlayProof(db, { characterName: char, runId: '3c-b', meta: meta3, delta: 0 }),
  ]);
  assert([a, b].filter((r) => r.ok && !r.idempotent).length === 1, '11. 3-play final entitlement concurrency', { a, b });
}

// ---- Idempotent same run retry ----
{
  const db = makeDb({});
  await saveGameEconomySettings(db, { game_overrides: { tower: '2' } }, 'admin');
  const r1 = await resolveGamePlayTransact(db, 'Lucas', 'tower', 'idem-run');
  await insertPlay(db, 'Lucas', r1);
  const again = await persistAuthoritativeGamePlayProof(db, {
    characterName: 'Lucas',
    runId: 'idem-run',
    meta: r1.meta,
    delta: 0,
  });
  assert(again.ok && again.idempotent, '13. same-run idempotent retry');
  const count = db.state.transactions.filter((t) => t.kind === 'game_play').length;
  assert(count === 1, '13. same-run retry did not insert duplicate row', count);
}

// ---- New run consumes next entitlement ----
{
  const db = makeDb({});
  await saveGameEconomySettings(db, { game_overrides: { tower: '2' } }, 'admin');
  const r1 = await resolveGamePlayTransact(db, 'Lucas', 'tower', 'next-1');
  await insertPlay(db, 'Lucas', r1);
  const r2 = await resolveGamePlayTransact(db, 'Lucas', 'tower', 'next-2');
  assert(r2.ok && r2.delta === 0 && r2.meta.bundle_play_index === 2, '14. new run consumes remaining entitlement', r2);
}

// ---- Cross-game isolation ----
{
  const db = makeDb({});
  await saveGameEconomySettings(db, { game_overrides: { tower: '2' } }, 'admin');
  const r1 = await resolveGamePlayTransact(db, 'Lucas', 'tower', 'iso-1');
  await insertPlay(db, 'Lucas', r1);
  const avatar = await resolveGamePlayTransact(db, 'Lucas', 'avatar-match', 'iso-am');
  assert(avatar.ok && avatar.delta === -1 && !avatar.meta.bundle_consume, '16. tower bundle not usable on avatar-match', avatar);
}

// ---- Free play trusted proof ----
{
  const db = makeDb({});
  await saveGameEconomySettings(db, { game_overrides: { memory: 'free' } }, 'admin');
  const env = makeWorkerEnv({ settings: db.state.settings, wallets: { Lucas: 5 } });
  const cookie = await studentCookie('lucas');
  const free = await transact(env, cookie, {
    kind: 'game_play',
    delta: 0,
    meta: { run_id: 'free-proof', game_id: 'memory' },
  });
  assert(free.status === 200 && free.json.delta === 0 && free.json.skipped, '18. free play server proof', free);
  const tx = env.DB.state.transactions.find((t) => {
    try {
      return JSON.parse(t.meta_json).run_id === 'free-proof';
    } catch (_) {
      return false;
    }
  });
  const proof = evaluatePaidGamePlayRun(tx, {
    characterName: 'Lucas',
    game: resolveRegisteredLeaderboardGame('memory'),
    nowMs: Date.now(),
  });
  assert(proof.ok, '18. free play leaderboard proof valid');
}

// ---- Legacy path without game_id still uses economy.game_play ----
{
  const db = makeDb({ settings: { 'economy.game_play': '-2' } });
  const legacy = await resolveGamePlayTransact(db, 'Lucas', '', 'legacy-no-game-2');
  assert(legacy.ok && legacy.legacy && legacy.delta === -2, '3. legacy path uses economy.game_play numeric debit');
  const modern = await resolveGamePlayTransact(db, 'Lucas', 'memory', 'legacy-modern');
  assert(modern.ok && !modern.legacy && modern.delta === -1, '3. legacy game_play ignored when game_id present');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
