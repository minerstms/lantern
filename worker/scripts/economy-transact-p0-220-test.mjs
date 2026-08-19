/**
 * Prompt #220 — student cannot mint TMS Nuggets via POST /api/economy/transact.
 * Usage: node worker/scripts/economy-transact-p0-220-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import worker from '../index.js';
import {
  STUDENT_ECONOMY_TRANSACT_KINDS,
  isStudentEconomyTransactKind,
} from '../economy-balance-auth.js';
import { evaluatePaidRunForWinCredit, PAID_RUN_RESULT_WINDOW_MS } from '../game-paid-run-proof.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

const TEST_PILOT_SECRET = 'test-secret-not-a-real-pilot-session-secret';
const TEST_BRIDGE_SECRET = 'test-bridge-secret-not-real';
const TEST_ECONOMY_SECRET = 'test-economy-secret-not-real';

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

function studentAccount(overrides) {
  return {
    username: '20889',
    display_name: 'Lucas',
    role: 'student',
    student_character_name: 'Lucas',
    mtss_student_id: '20889',
    is_active: 1,
    must_change_password: 0,
    ...overrides,
  };
}
function adminAccount(overrides) {
  return {
    username: 'rradle',
    display_name: 'Rick Radle',
    role: 'admin',
    staff_id: 4,
    is_active: 1,
    must_change_password: 0,
    ...overrides,
  };
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
          return state.transactions.find((t) => {
            let meta = {};
            try { meta = JSON.parse(t.meta_json || '{}'); } catch (_) {}
            return t.kind === 'game_play' && meta.run_id === runId;
          }) || null;
        }
        return null;
      },
      async all() { return { results: [] }; },
      async run() {
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
    LANTERN_ECONOMY_SECRET: TEST_ECONOMY_SECRET,
  };
}

function withMockedBridge(behavior, fn) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    const call = { url: String(url), body: opts && opts.body ? JSON.parse(opts.body || 'null') : null };
    calls.push(call);
    const result = behavior(call) || {};
    return {
      ok: result.httpOk !== false,
      status: result.status || (result.httpOk === false ? 400 : 200),
      json: async () => result.body,
    };
  };
  return fn(() => calls).finally(() => { globalThis.fetch = original; });
}

async function postTransact(env, cookie, body, extraHeaders) {
  const headers = { 'Content-Type': 'application/json', ...(extraHeaders || {}) };
  if (cookie) headers.Cookie = cookie;
  const res = await worker.fetch(new Request('https://lantern.example/api/economy/transact', {
    method: 'POST', headers, body: JSON.stringify(body),
  }), env);
  return { status: res.status, json: await res.json() };
}

function addPaidRun(state, opts) {
  state.transactions.push({
    id: opts.id || ('tx-play-' + (opts.runId || 'run')),
    character_name: opts.characterName,
    delta: opts.delta != null ? opts.delta : -1,
    kind: opts.kind || 'game_play',
    source: 'LANTERN',
    note: opts.note || 'Nugget Hunt',
    created_at: opts.createdAt || new Date().toISOString(),
    meta_json: JSON.stringify({
      game_name: opts.gameName || 'Nugget Hunt',
      game_id: opts.gameId || 'nuggetHunt',
      run_id: opts.runId,
    }),
  });
}

const indexSrc = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
if (/kind_not_allowed/.test(indexSrc) && /isStudentEconomyTransactKind/.test(indexSrc)) {
  ok('worker rejects non-allowlisted student kinds');
} else bad('student kind allowlist missing');
if (/evaluatePaidRunForWinCredit/.test(indexSrc) && /meta.idempotency_key = runId/.test(indexSrc)) {
  ok('game_win replay key is forced to paid run_id');
} else bad('game_win replay lock missing');
if (
  isStudentEconomyTransactKind('game_play') &&
  isStudentEconomyTransactKind('game_win') &&
  isStudentEconomyTransactKind('avatar_upload') &&
  isStudentEconomyTransactKind('cosmetic') &&
  !isStudentEconomyTransactKind('misc') &&
  !isStudentEconomyTransactKind('hidden_nugget') &&
  !isStudentEconomyTransactKind('daily_hunt') &&
  !isStudentEconomyTransactKind('daily_checkin')
) {
  ok('student allowlist is spend/win-only: ' + STUDENT_ECONOMY_TRANSACT_KINDS.join(','));
} else bad('student allowlist contents', STUDENT_ECONOMY_TRANSACT_KINDS);

const proofNow = Date.parse('2026-08-15T17:00:00.000Z');
const goodPlay = {
  kind: 'game_play',
  delta: -1,
  character_name: '20889',
  created_at: '2026-08-15T16:30:00.000Z',
};
if (evaluatePaidRunForWinCredit(goodPlay, { characterName: '20889', nowMs: proofNow }).ok) {
  ok('paid-run win proof accepts owned game_play');
} else bad('win proof accept');
if (evaluatePaidRunForWinCredit(goodPlay, { characterName: '20999', nowMs: proofNow }).error === 'invalid_run') {
  ok('paid-run win proof rejects other-user run');
} else bad('win proof other user');
if (evaluatePaidRunForWinCredit({ ...goodPlay, kind: 'game_win' }, { characterName: '20889', nowMs: proofNow }).error === 'invalid_run') {
  ok('paid-run win proof rejects unpaid/non-play row');
} else bad('win proof unpaid');
if (
  evaluatePaidRunForWinCredit(
    { ...goodPlay, created_at: '2026-08-15T15:50:00.000Z' },
    { characterName: '20889', nowMs: proofNow + PAID_RUN_RESULT_WINDOW_MS }
  ).error === 'run_expired'
) {
  ok('paid-run win proof expires with the existing window');
} else bad('win proof expiry');

const student = studentAccount();
const other = studentAccount({
  username: '20999',
  display_name: 'Sam',
  student_character_name: 'Sam',
  mtss_student_id: '20999',
});
const admin = adminAccount();

const seenRefs = new Map();
await withMockedBridge((call) => {
  if (!String(call.url).includes('/economy/transact')) {
    return { httpOk: false, status: 404, body: { ok: false, error: 'unexpected' } };
  }
  const ref = String((call.body && call.body.reference) || '');
  const already = seenRefs.has(ref);
  seenRefs.set(ref, (seenRefs.get(ref) || 0) + 1);
  return {
    body: {
      ok: true,
      student_id: call.body.student_id,
      delta: already ? 0 : call.body.delta,
      available: 10,
      reference: ref,
      idempotent: already,
    },
  };
}, async (getCalls) => {
  const state = {
    accounts: { '20889': student, '20999': other, rradle: admin },
    identityLinks: { rradle: { tms_staff_id: 'tms_staff_rick', lantern_username: 'rradle', lantern_staff_id: 4 } },
    wallets: { '20889': 20 },
  };
  const env = makeEnv(state);
  const studentCookie = await cookieFor(student);
  const otherCookie = await cookieFor(other);
  const adminCookie = await cookieFor(admin);
  const tmsCalls = () => getCalls().filter((c) => String(c.url).includes('/economy/transact'));

  const anonEmpty = await postTransact(env, null, {});
  if (anonEmpty.status === 401 && anonEmpty.json.error === 'not_authenticated' && tmsCalls().length === 0) {
    ok('anonymous empty transact blocked before payload validation');
  } else bad('anonymous empty transact', anonEmpty);

  const anon = await postTransact(env, null, { character_name: '20889', delta: 99, kind: 'misc' });
  if (anon.status === 401 && anon.json.error === 'not_authenticated' && tmsCalls().length === 0) {
    ok('anonymous transact blocked before ledger');
  } else bad('anonymous transact', anon);

  const spoof = await postTransact(env, studentCookie, {
    character_name: '20999',
    delta: -1,
    kind: 'game_play',
    meta: { run_id: 'spoof-run' },
  });
  if (spoof.status === 200 && spoof.json.character_name === '20889') {
    ok('student cannot transact for another identity (session principal used)');
  } else bad('identity spoof', spoof);

  const beforeMisc = tmsCalls().length;
  const misc = await postTransact(env, studentCookie, { character_name: '20889', delta: 50, kind: 'misc' });
  if (misc.status === 403 && misc.json.error === 'kind_not_allowed' && tmsCalls().length === beforeMisc) {
    ok('student misc positive credit rejected');
  } else bad('student misc', misc);

  const hidden = await postTransact(env, studentCookie, { character_name: '20889', delta: 5, kind: 'hidden_nugget' });
  if (hidden.status === 403 && hidden.json.error === 'kind_not_allowed') ok('student hidden_nugget rejected');
  else bad('hidden_nugget', hidden);

  const hunt = await postTransact(env, studentCookie, { character_name: '20889', delta: 1, kind: 'daily_hunt' });
  if (hunt.status === 403 && hunt.json.error === 'kind_not_allowed') ok('student daily_hunt rejected');
  else bad('daily_hunt', hunt);

  const checkin = await postTransact(env, studentCookie, { character_name: '20889', delta: 3, kind: 'daily_checkin' });
  if (checkin.status === 403 && checkin.json.error === 'kind_not_allowed') ok('student daily_checkin rejected');
  else bad('daily_checkin', checkin);

  const playBadDelta = await postTransact(env, studentCookie, {
    character_name: '20889',
    delta: 25,
    kind: 'game_play',
    meta: { run_id: 'play-bad' },
  });
  if (playBadDelta.status === 400 && playBadDelta.json.error === 'client_delta_rejected' && playBadDelta.json.server_delta === -1) {
    ok('student game_play amount is server-locked to -1');
  } else bad('game_play lock', playBadDelta);

  const avatarBad = await postTransact(env, studentCookie, { character_name: '20889', delta: 10, kind: 'avatar_upload' });
  if (avatarBad.status === 403 && avatarBad.json.error === 'student_avatar_upload_disabled') {
    ok('student avatar_upload spend is disabled regardless of amount');
  } else bad('avatar lock', avatarBad);

  const winNoRun = await postTransact(env, studentCookie, { character_name: '20889', delta: 1, kind: 'game_win' });
  if (winNoRun.status === 400 && winNoRun.json.error === 'invalid_run') ok('game_win without run_id rejected');
  else bad('win no run', winNoRun);

  const winUnknown = await postTransact(env, studentCookie, {
    character_name: '20889',
    delta: 1,
    kind: 'game_win',
    meta: { run_id: 'run-unknown' },
  });
  if (winUnknown.status === 400 && winUnknown.json.error === 'invalid_run') ok('game_win unknown run rejected');
  else bad('win unknown', winUnknown);

  addPaidRun(state, { characterName: '20999', runId: 'run-other', gameName: 'Nugget Hunt', gameId: 'nuggetHunt' });
  const winOther = await postTransact(env, studentCookie, {
    character_name: '20889',
    delta: 1,
    kind: 'game_win',
    meta: { run_id: 'run-other' },
  });
  if (winOther.status === 400 && winOther.json.error === 'invalid_run') ok('game_win other-user run rejected');
  else bad('win other user', winOther);

  addPaidRun(state, { characterName: '20889', runId: 'run-unpaid', kind: 'misc', delta: 1 });
  const winUnpaid = await postTransact(env, studentCookie, {
    kind: 'game_win',
    delta: 1,
    meta: { run_id: 'run-unpaid' },
  });
  if (winUnpaid.status === 400 && winUnpaid.json.error === 'invalid_run') ok('game_win unpaid/non-play run rejected');
  else bad('win unpaid', winUnpaid);

  addPaidRun(state, { characterName: '20889', runId: 'run-eligible' });
  const beforeWin = tmsCalls().length;
  const winOk = await postTransact(env, studentCookie, {
    kind: 'game_win',
    delta: 99,
    meta: { run_id: 'run-eligible', idempotency_key: 'client-a' },
  });
  if (winOk.status === 400 && winOk.json.error === 'client_delta_rejected') {
    ok('game_win client +99 rejected; amount stays server +1');
  } else bad('win client delta', winOk);

  const winEligible = await postTransact(env, studentCookie, {
    kind: 'game_win',
    delta: 1,
    meta: { run_id: 'run-eligible', idempotency_key: 'client-a' },
  });
  const winCall = tmsCalls()[tmsCalls().length - 1];
  if (
    winEligible.status === 200 &&
    winEligible.json.ok &&
    winEligible.json.delta === 1 &&
    winCall &&
    winCall.body.delta === 1 &&
    winCall.body.reference === 'lantern:game_win:run-eligible' &&
    tmsCalls().length === beforeWin + 1
  ) {
    ok('valid paid run can receive the intended +1 win');
  } else bad('valid win', { winEligible, winCall });

  const winReplay = await postTransact(env, studentCookie, {
    kind: 'game_win',
    delta: 1,
    meta: { run_id: 'run-eligible', idempotency_key: 'client-b' },
  });
  const replayCall = tmsCalls()[tmsCalls().length - 1];
  if (
    winReplay.status === 200 &&
    winReplay.json.idempotent === true &&
    replayCall &&
    replayCall.body.reference === 'lantern:game_win:run-eligible' &&
    replayCall.body.delta === 1
  ) {
    ok('same run cannot receive repeat win credits; new client id cannot bypass');
  } else bad('replay key', { winReplay, replayCall });

  const playOk = await postTransact(env, studentCookie, {
    kind: 'game_play',
    delta: -1,
    meta: { run_id: 'run-play-ok' },
  });
  if (playOk.status === 200 && playOk.json.ok && playOk.json.delta === -1 && playOk.json.character_name === '20889') {
    ok('legitimate fixed-cost game_play still works');
  } else bad('game_play ok', playOk);

  const avatarOk = await postTransact(env, studentCookie, { kind: 'avatar_upload', delta: -1 });
  if (avatarOk.status === 403 && avatarOk.json && avatarOk.json.error === 'student_avatar_upload_disabled') {
    ok('student avatar_upload transact remains disabled at the configured cost');
  } else bad('avatar ok', avatarOk);

  const adj = await postTransact(env, adminCookie, {
    character_name: '20889',
    delta: 5,
    kind: 'admin_adjustment',
    note: 'Game testing',
    source: 'ADMIN_PANEL',
    idempotency_key: 'adj-220',
  });
  const adjCall = tmsCalls().filter((c) => c.body && c.body.kind === 'admin_adjustment').pop();
  if (
    adj.status === 200 &&
    adj.json.ok &&
    adjCall &&
    adjCall.body.delta === 5 &&
    adjCall.body.reference === 'lantern:admin_adjustment:adj-220'
  ) {
    ok('admin authoritative adjustment remains intact');
  } else bad('admin adjustment', { adj, adjCall });

  const secretAdj = await postTransact(env, null, {
    character_name: '20889',
    delta: 2,
    kind: 'admin_adjustment',
    note: 'Bridge correction',
    idempotency_key: 'secret-220',
  }, { 'X-Lantern-Economy-Secret': TEST_ECONOMY_SECRET });
  if (secretAdj.status === 200 && secretAdj.json.ok) ok('economy-secret privileged adjustment remains intact');
  else bad('economy secret', secretAdj);
});

console.log('\neconomy-transact-p0-220-test:', pass, 'PASS', fail, 'FAIL');
if (fail) process.exit(1);
