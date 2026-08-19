/**
 * Prompt #20 — system-wide Nugget normalization.
 * Usage: node worker/scripts/nugget-normalization-20-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import worker from '../index.js';
import { resolveEconomySelfTransact, isSelfEconomyTransactKind, staffEconomyKey } from '../economy-balance-auth.js';
import { resolveEconomyKey, buildLockerMeResponse } from '../locker-handlers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

const TEST_PILOT_SECRET = 'test-secret-not-a-real-pilot-session-secret';
const TEST_BRIDGE_SECRET = 'test-bridge-secret-not-real';

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
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
async function cookieFor(account) {
  const now = Math.floor(Date.now() / 1000);
  const token = await signTestJwt({
    sub: account.username,
    role: account.role,
    scn: account.student_character_name || null,
    tid: account.teacher_id || null,
    iat: now,
    exp: now + 3600,
  }, TEST_PILOT_SECRET);
  return `lantern_pilot=${token}`;
}

function makeEnv(state) {
  state.accounts = state.accounts || {};
  state.identityLinks = state.identityLinks || {};
  state.wallets = state.wallets || {};
  state.transactions = state.transactions || [];
  function prepare(sql) {
    const s = String(sql);
    const binds = [];
    const api = {
      bind(...args) { binds.push(...args); return api; },
      async first() {
        if (s.includes('FROM lantern_pilot_accounts WHERE lower(trim(username))')) {
          const key = String(binds[0] || '').trim().toLowerCase();
          return state.accounts[key] || null;
        }
        if (s.includes('FROM tms_identity_links WHERE lower(trim(lantern_username))')) {
          const key = String(binds[0] || '').trim().toLowerCase();
          return state.identityLinks[key] || null;
        }
        if (s.includes('FROM tms_identity_links WHERE lantern_staff_id')) {
          const sid = Number(binds[0]);
          return Object.values(state.identityLinks).find((l) => Number(l.lantern_staff_id) === sid) || null;
        }
        if (s.includes('FROM lantern_wallets WHERE character_name = ?')) {
          const bal = state.wallets[binds[0]];
          return bal != null ? { balance: bal } : null;
        }
        if (s.includes('FROM lantern_transactions') && s.includes("json_extract(meta_json, '$.run_id')")) {
          const runId = binds[0];
          return (state.transactions || []).find((t) => {
            let meta = {};
            try { meta = JSON.parse(t.meta_json || '{}'); } catch (_) {}
            return t.kind === 'game_play' && meta.run_id === runId;
          }) || null;
        }
        if (s.includes('SUM(CASE WHEN delta')) return { earned: 99, spent: 0 };
        return null;
      },
      async all() { return { results: [] }; },
      async run() {
        if (s.includes('INSERT INTO lantern_wallets')) state.legacyWalletWrites = (state.legacyWalletWrites || 0) + 1;
        if (s.includes('INSERT INTO lantern_transactions')) {
          state.transactions.push({
            id: binds[0],
            character_name: binds[1],
            delta: binds[2],
            kind: binds[3],
            source: binds[4],
            note: binds[5],
            created_at: binds[6],
            meta_json: binds[7],
          });
        }
        return { success: true, meta: { changes: 1 } };
      },
    };
    return api;
  }
  return {
    DB: { prepare },
    PILOT_SESSION_SECRET: TEST_PILOT_SECRET,
    TMS_LANTERN_BRIDGE_SECRET: TEST_BRIDGE_SECRET,
    TMS_NUGGETS_API_BASE_URL: 'https://tms.example',
  };
}

function withMockedBridge(behavior, fn) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    const call = { url: String(url), body: opts && opts.body ? JSON.parse(opts.body || 'null') : null };
    calls.push(call);
    const result = behavior(call);
    return {
      ok: result.httpOk !== false,
      status: result.status || (result.httpOk === false ? 400 : 200),
      json: async () => result.body,
    };
  };
  return fn(() => calls).finally(() => { globalThis.fetch = original; });
}

async function getBalance(env, cookie) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  const res = await worker.fetch(new Request('https://lantern.example/api/economy/balance', { headers }), env);
  return { status: res.status, json: await res.json() };
}
async function postTransact(env, cookie, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  const res = await worker.fetch(new Request('https://lantern.example/api/economy/transact', {
    method: 'POST', headers, body: JSON.stringify(body),
  }), env);
  return { status: res.status, json: await res.json() };
}

const student = {
  username: '20889',
  display_name: 'Lucas',
  role: 'student',
  student_character_name: 'Lucas',
  mtss_student_id: '20889',
  is_active: 1,
};
const unlinkedStudent = {
  username: 'jane',
  display_name: 'Jane',
  role: 'student',
  student_character_name: 'Jane',
  mtss_student_id: null,
  is_active: 1,
};
const teacher = {
  username: 'ms_carter',
  display_name: 'Ms. Carter',
  role: 'teacher',
  staff_id: 10,
  teacher_id: 't_carter',
  is_active: 1,
};

const walletJs = read('app/js/lantern-wallet.js');
const lockerShell = read('app/js/lantern-locker-shell.js');
const lockerHtml = read('app/locker.html');
const gamesPage = read('app/js/lantern-games-page.js');
const missionsPage = read('app/js/lantern-missions-page.js');
const storeJs = read('app/js/lantern-store-app.js');
const authJs = read('app/js/lantern-pilot-auth.js');
const indexSrc = read('worker/index.js');
const lockerHandlers = read('worker/locker-handlers.js');
const lockerProgress = read('worker/locker-progress.js');

if (isSelfEconomyTransactKind('game_play') && isSelfEconomyTransactKind('game_win') && isSelfEconomyTransactKind('cosmetic') && isSelfEconomyTransactKind('avatar_upload') && isSelfEconomyTransactKind('daily_hunt')) {
  ok('self kinds include play/win/cosmetic/avatar/hunt');
} else bad('self kinds');

if (staffEconomyKey(teacher) === 'staff_id:10') ok('staff key prefers staff_id');
else bad('staff key', staffEconomyKey(teacher));

const staffLockerKey = resolveEconomyKey({ ...teacher, _economy_character_name: null });
if (staffLockerKey === 'staff_id:10') ok('Locker staff economy key is staff_id, not teacher_id');
else bad('locker staff key', staffLockerKey);

if (/Nugget Balance/.test(lockerShell) && /Lifetime Nuggets Earned/.test(lockerShell) && !/Next Milestone/.test(lockerShell)) {
  ok('Locker Progress shows Nugget Balance + lifetime; no milestone');
} else bad('locker shell labels');

if (/bindElement/.test(lockerShell) && /data-locker-nugget-balance/.test(lockerShell)) ok('Locker Nugget Balance binds LanternWallet');
else bad('locker bind');

if (/Nuggets available/.test(lockerHtml) && !/available for your character/.test(lockerHtml)) ok('Store copy is authenticated-wallet language');
else bad('store copy');

if (/bindElement/.test(gamesPage) && /bindElement/.test(missionsPage) && /bindElement/.test(storeJs)) {
  ok('Games/Missions/Store consume LanternWallet');
} else bad('surface bind');

if (/function clearWalletState/.test(walletJs) && /clear: clearWalletState/.test(walletJs) && /invalidate: invalidateWallet/.test(walletJs)) {
  ok('LanternWallet clear/invalidate exist');
} else bad('wallet clear');

if (/LanternWallet.clear/.test(authJs) && /invalidateLockerMe/.test(authJs)) ok('logout clears wallet + locker me');
else bad('logout clear');

if (/isSelfEconomyTransactKind/.test(indexSrc) && /selfSessionScoped/.test(indexSrc) && /productionSelf/.test(indexSrc)) {
  ok('transact/balance fail-closed for production self');
} else bad('server fail-closed');

if (/fetchAuthoritativeEconomySnapshot/.test(lockerHandlers) && /fetchAuthoritativeEconomySnapshot/.test(lockerProgress)) {
  ok('Locker wallet/progress use shared TMS snapshot');
} else bad('locker snapshot');

if (/next_milestone: null/.test(lockerProgress)) ok('Locker progress does not compute 0/50 milestone');
else bad('milestone removed');

const state = {
  accounts: { '20889': student, jane: unlinkedStudent, ms_carter: teacher },
  identityLinks: { ms_carter: { tms_staff_id: 'Carter', lantern_username: 'ms_carter', lantern_staff_id: 10 } },
  wallets: { '20889': 999, Jane: 40, 'staff_id:10': 3, jane: 40 },
};
const env = makeEnv(state);
const studentCookie = await cookieFor(student);
const unlinkedCookie = await cookieFor(unlinkedStudent);
const teacherCookie = await cookieFor(teacher);

await withMockedBridge((call) => {
  if (call.url.includes('/economy/balance') && call.body && call.body.student_id === '20889') {
    return { body: { ok: true, student_id: '20889', earned: 10, spent: 3, available: 7, recent_history: [] } };
  }
  if (call.url.includes('/economy/balance') && call.body && call.body.principal_type === 'staff' && call.body.tms_staff_id === 'Carter') {
    return { body: { ok: true, earned: 60, spent: 5, available: 55, recent_history: [] } };
  }
  if (call.url.includes('/economy/transact') && call.body && call.body.student_id === '20889') {
    const d = Number(call.body.delta);
    return { body: { ok: true, student_id: '20889', delta: d, earned: 10, spent: d < 0 ? 4 : 3, available: d < 0 ? 6 : 8 } };
  }
  if (call.url.includes('/economy/transact') && call.body && call.body.principal_type === 'staff' && call.body.tms_staff_id === 'Carter') {
    const d = Number(call.body.delta);
    return { body: { ok: true, tms_staff_id: 'Carter', delta: d, earned: 60, spent: d < 0 ? 6 : 5, available: d < 0 ? 54 : 56 } };
  }
  return { httpOk: false, status: 404, body: { ok: false, error: 'student_not_found' } };
}, async (getCalls) => {
  const s = await getBalance(env, studentCookie);
  if (s.status === 200 && s.json.ok && s.json.available === 7 && s.json.economy_authority === 'tms_nuggets') ok('1. linked student TMS balance');
  else bad('1 student balance', s);

  const zeroEnvCalls = [];
  const z = await (async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async (url, opts) => {
      const body = opts && opts.body ? JSON.parse(opts.body) : null;
      zeroEnvCalls.push(body);
      if (body && body.student_id === '20889') {
        return { ok: true, status: 200, json: async () => ({ ok: true, student_id: '20889', earned: 0, spent: 0, available: 0, recent_history: [] }) };
      }
      return { ok: false, status: 404, json: async () => ({ ok: false }) };
    };
    try {
      return await getBalance(env, studentCookie);
    } finally {
      globalThis.fetch = original;
    }
  })();
  if (z.status === 200 && z.json.ok && z.json.available === 0) ok('2. linked student real 0 returns 0');
  else bad('2 real zero', z);

  const failStudent = {
    username: '20889',
    display_name: 'Lucas',
    role: 'student',
    student_character_name: 'Lucas',
    mtss_student_id: '20889',
    is_active: 1,
  };
  const failCookie = await cookieFor(failStudent);
  const failState = { accounts: { '20889': failStudent }, identityLinks: {}, wallets: { '20889': 999 } };
  const failEnv = makeEnv(failState);
  await withMockedBridge(() => ({ httpOk: false, status: 502, body: { ok: false, error: 'bridge_down' } }), async () => {
    const f = await getBalance(failEnv, failCookie);
    if (!f.json.ok && f.json.available == null && f.json.economy_authority !== 'lantern_legacy' && f.json.balance !== 999) {
      ok('3. student TMS failure does not return legacy wallet');
    } else bad('3 student fail', f);
  });

  const u = await getBalance(env, unlinkedCookie);
  if (!u.json.ok && u.json.available == null && u.json.balance !== 40) ok('4. unlinked student does not get legacy spendable wallet');
  else bad('4 unlinked student', u);

  const play = await postTransact(env, studentCookie, { character_name: 'spoof', delta: -1, kind: 'game_play', meta: { run_id: 'r1' } });
  if (play.json.ok && play.json.economy_authority === 'tms_nuggets' && play.json.character_name === '20889') ok('5. game play uses student TMS principal');
  else bad('5 play', play);

  const win = await postTransact(env, studentCookie, { character_name: 'spoof', delta: 1, kind: 'game_win', meta: { run_id: 'r1' } });
  if (win.json.ok && win.json.economy_authority === 'tms_nuggets' && win.json.character_name === '20889') ok('6. game win uses SAME student TMS principal');
  else bad('6 win', win);

  const hunt = await postTransact(env, studentCookie, { character_name: 'Jane', delta: 1, kind: 'daily_hunt' });
  if (hunt.status === 403 && hunt.json.error === 'kind_not_allowed') ok('8. student daily_hunt generic credit rejected');
  else bad('8 hunt', hunt);

  const avatar = await postTransact(env, studentCookie, { character_name: 'Jane', delta: -1, kind: 'avatar_upload' });
  if (avatar.status === 403 && avatar.json && avatar.json.error === 'student_avatar_upload_disabled') ok('9. student avatar spend disabled (upload closed)');
  else bad('9 avatar', avatar);

  const t = await getBalance(env, teacherCookie);
  if (t.status === 200 && t.json.ok && t.json.available === 55 && t.json.economy_authority === 'tms_nuggets_staff') ok('10. staff TMS staff ledger');
  else bad('10 staff balance', t);

  const staffZero = await (async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async (url, opts) => {
      const body = opts && opts.body ? JSON.parse(opts.body) : null;
      if (body && body.principal_type === 'staff') {
        return { ok: true, status: 200, json: async () => ({ ok: true, earned: 0, spent: 0, available: 0, recent_history: [] }) };
      }
      return { ok: false, status: 404, json: async () => ({ ok: false }) };
    };
    try {
      return await getBalance(env, teacherCookie);
    } finally {
      globalThis.fetch = original;
    }
  })();
  if (staffZero.json.ok && staffZero.json.available === 0) ok('11. staff real 0 returns 0');
  else bad('11 staff zero', staffZero);

  const staffPlay = await postTransact(env, teacherCookie, { character_name: 't_carter', delta: -1, kind: 'game_play', meta: { run_id: 's1' } });
  if (staffPlay.json.ok && staffPlay.json.character_name === 'staff_id:10' && staffPlay.json.economy_authority === 'tms_nuggets_staff') {
    ok('13. staff game play uses staff ledger');
  } else bad('13 staff play', staffPlay);

  const staffWin = await postTransact(env, teacherCookie, { character_name: 't_carter', delta: 1, kind: 'game_win', meta: { run_id: 's1' } });
  if (staffWin.json.ok && staffWin.json.character_name === 'staff_id:10' && staffWin.json.economy_authority === 'tms_nuggets_staff') {
    ok('14. staff game win uses SAME staff ledger');
  } else bad('14 staff win', staffWin);

  const staffHunt = await postTransact(env, teacherCookie, { character_name: 't_carter', delta: 1, kind: 'daily_hunt' });
  if (staffHunt.json.ok && staffHunt.json.character_name === 'staff_id:10' && staffHunt.json.economy_authority === 'tms_nuggets_staff') {
    ok('16. staff hunt uses staff ledger');
  } else bad('16 staff hunt', staffHunt);

  const staffAvatar = await postTransact(env, teacherCookie, { character_name: 't_carter', delta: -1, kind: 'avatar_upload' });
  if (staffAvatar.json.ok && staffAvatar.json.character_name === 'staff_id:10' && staffAvatar.json.economy_authority === 'tms_nuggets_staff') {
    ok('17. staff avatar spend uses staff ledger');
  } else bad('17 staff avatar', staffAvatar);

  if (!state.legacyWalletWrites) ok('23. authenticated production transacts did not write lantern_wallets');
  else bad('23 legacy writes', state.legacyWalletWrites);

  const calls = getCalls();
  if (!calls.some((c) => c.body && (c.body.student_id === 'staff_id:10' || c.body.student_id === 't_carter'))) {
    ok('staff never used as TMS student_id');
  } else bad('staff as student', calls);
});

const selfPlay = resolveEconomySelfTransact(teacher, 't_carter', () => '');
if (selfPlay.ok && selfPlay.characterName === 'staff_id:10' && selfPlay.session_scoped) ok('self transact ignores client teacher_id');
else bad('self transact staff', selfPlay);

const selfStudent = resolveEconomySelfTransact(student, 'spoof', (a) => a.mtss_student_id);
if (selfStudent.ok && selfStudent.characterName === '20889') ok('self transact ignores client spoof name');
else bad('self transact student', selfStudent);

const pollRewardSrc = read('worker/poll-completion-reward.js');
if (/isKnownDemoPersonaName\(who\)/.test(pollRewardSrc) && /allowLegacyWallet/.test(pollRewardSrc)) {
  ok('21. poll reward allows lantern_wallets only for known demo personas');
} else bad('poll legacy');

console.log('\nnugget-normalization-20-test:', pass, 'PASS', fail, 'FAIL');
if (fail) process.exit(1);
