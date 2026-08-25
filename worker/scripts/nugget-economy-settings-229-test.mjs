/**
 * Prompt #229 — Nugget Economy settings + teacher mission reward.
 * Usage: node worker/scripts/nugget-economy-settings-229-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import worker from '../index.js';
import {
  ECONOMY_SETTING_DEFS,
  ECONOMY_ROW_ORDER,
  validateEconomyValue,
  resolveEconomyAmount,
  getEconomySettings,
  setEconomyValue,
  clampTeacherMissionReward,
  resolveTeacherMissionReward,
  resolveStoredMissionPayout,
  handleNuggetEconomySettings,
} from '../nugget-economy-settings.js';
import { handleSettingsRoutes } from '../lantern-settings.js';
import { creditMissionApprovalReward, missionRewardTxId } from '../missions-reward.js';
import { creditPollCompletionReward, pollCompleteReference } from '../poll-completion-reward.js';
import { classifyEarnKind } from '../interactions-analytics.js';
import { evaluatePaidRunForWinCredit } from '../game-paid-run-proof.js';
import { handleMissionsRoutes } from '../missions-handlers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

const TEST_PILOT_SECRET = 'test-secret-not-a-real-pilot-session-secret';
const TEST_BRIDGE_SECRET = 'test-bridge-secret-not-real';

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

function adminAccount() {
  return { username: 'rradle', display_name: 'Rick Radle', role: 'admin', staff_id: 4, is_active: 1, must_change_password: 0 };
}
function teacherAccount() {
  return { username: 'ms_carter', display_name: 'Ms. Carter', role: 'teacher', teacher_id: 't_carter', is_active: 1, must_change_password: 0 };
}
function studentAccount() {
  return {
    username: '20889',
    display_name: 'Lucas',
    role: 'student',
    student_character_name: 'Lucas',
    mtss_student_id: '20889',
    is_active: 1,
    must_change_password: 0,
  };
}

function makeSettingsDb(initial) {
  const rows = { ...(initial || {}) };
  return {
    rows,
    prepare(sql) {
      const s = String(sql);
      const binds = [];
      const api = {
        bind(...args) { binds.push(...args); return api; },
        async first() {
          if (s.includes('FROM lantern_settings WHERE key')) {
            const key = binds[0];
            return rows[key] != null ? { value: String(rows[key].value != null ? rows[key].value : rows[key]) } : null;
          }
          return null;
        },
        async run() {
          if (s.includes('INSERT INTO lantern_settings')) {
            rows[binds[0]] = { value: binds[1], updated_at: binds[2], updated_by: binds[3] };
          }
          return { success: true, meta: { changes: 1 } };
        },
      };
      return api;
    },
  };
}

function makeWorkerEnv(state) {
  state.accounts = state.accounts || {};
  state.settings = state.settings || {};
  state.identityLinks = state.identityLinks || {};
  state.wallets = state.wallets || {};
  state.transactions = state.transactions || [];
  state.voterRewards = state.voterRewards || [];
  state.missions = state.missions || {};
  state.submissions = state.submissions || {};
  function prepare(sql) {
    const s = String(sql);
    const binds = [];
    const api = {
      bind(...args) { binds.push(...args); return api; },
      async first() {
        if (s.includes('FROM lantern_pilot_accounts WHERE lower(trim(username))')) {
          return state.accounts[String(binds[0] || '').trim().toLowerCase()] || null;
        }
        if (s.includes('FROM tms_identity_links WHERE lower(trim(lantern_username))')) {
          return state.identityLinks[String(binds[0] || '').trim().toLowerCase()] || null;
        }
        if (s.includes('FROM lantern_settings WHERE key')) {
          const key = String(binds[0] || '');
          return state.settings[key] != null ? { value: String(state.settings[key]) } : null;
        }
        if (s.includes('FROM lantern_wallets WHERE character_name = ?')) {
          const bal = state.wallets[binds[0]];
          return bal != null ? { balance: bal } : null;
        }
        if (s.includes('FROM lantern_poll_voter_rewards WHERE poll_id = ? AND character_name = ?')) {
          return state.voterRewards.find((v) => v.poll_id === binds[0] && v.character_name === binds[1]) || null;
        }
        if (s.includes('FROM lantern_transactions') && s.includes("json_extract(meta_json, '$.run_id')")) {
          return state.transactions.find((t) => {
            let meta = {};
            try { meta = JSON.parse(t.meta_json || '{}'); } catch (_) {}
            return t.kind === 'game_play' && meta.run_id === binds[0];
          }) || null;
        }
        if (s.includes('SELECT id, character_name, delta, kind, created_at FROM lantern_transactions WHERE id =')) {
          return state.transactions.find((t) => t.id === binds[0]) || null;
        }
        if (s.includes('SELECT id, teacher_id, allows_image FROM lantern_missions WHERE id = ?') || s.includes('SELECT id, teacher_id FROM lantern_missions WHERE id = ?')) {
          const row = state.missions[binds[0]];
          return row ? { id: row.id, teacher_id: row.teacher_id, allows_image: row.allows_image || 0 } : null;
        }
        if (s.includes('SELECT reward_amount, teacher_id FROM lantern_missions WHERE id = ?')) {
          const row = state.missions[binds[0]];
          return row ? { reward_amount: row.reward_amount, teacher_id: row.teacher_id } : null;
        }
        return null;
      },
      async all() { return { results: [] }; },
      async run() {
        if (s.includes('INSERT INTO lantern_settings')) {
          state.settings[binds[0]] = binds[1];
        } else if (s.includes('INSERT INTO lantern_poll_voter_rewards')) {
          state.voterRewards.push({ id: binds[0], poll_id: binds[1], character_name: binds[2] });
        } else if (s.includes('INSERT INTO lantern_transactions')) {
          if (state.transactions.some((t) => t.id === binds[0])) {
            const err = new Error('UNIQUE');
            throw err;
          }
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
        } else if (s.includes('INSERT INTO lantern_wallets')) {
          state.wallets[binds[0]] = (state.wallets[binds[0]] || 0) + Number(binds[3] || 0);
        } else if (s.includes('INSERT INTO lantern_missions')) {
          state.missions[binds[0]] = {
            id: binds[0],
            teacher_id: binds[1],
            teacher_name: binds[2],
            title: binds[3],
            description: binds[4],
            reward_amount: binds[5],
            allows_image: binds[14] || 0,
          };
        } else if (s.includes('UPDATE lantern_missions SET')) {
          const id = binds[binds.length - 1];
          const row = state.missions[id];
          if (row && s.includes('reward_amount = ?')) row.reward_amount = binds[0];
        } else if (s.includes('INSERT INTO lantern_student_identities')) {
          /* ignore */
        }
        return { success: true, meta: { changes: 1 } };
      },
    };
    return api;
  }
  return {
    DB: { prepare, async batch(stmts) { for (const stmt of stmts) await stmt.run(); } },
    PILOT_SESSION_SECRET: TEST_PILOT_SECRET,
    TMS_LANTERN_BRIDGE_SECRET: TEST_BRIDGE_SECRET,
  };
}

function makeDeps(isAdmin, account) {
  return {
    jsonResponse(body, status) { return { status: status || 200, body }; },
    async requireAdminPilotSession() {
      if (isAdmin) return { account: account || adminAccount() };
      return { response: { status: 403, body: { ok: false, error: 'forbidden' } } };
    },
    adminAuditLabel(a) { return (a && (a.display_name || a.username)) || 'admin'; },
  };
}

function withMockedBridge(behavior, fn) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    const call = { url: String(url), body: opts && opts.body ? JSON.parse(opts.body) : null };
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

async function jsonFetch(env, method, pathName, cookie, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  const res = await worker.fetch(new Request('https://lantern.example' + pathName, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  }), env);
  return { status: res.status, json: await res.json() };
}

function missionDeps(account) {
  return {
    jsonResponse(body, status, _cors) {
      return new Response(JSON.stringify(body), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
    },
    getPilotAccountFromRequest: async () => account,
    pilotEconomyCharacterName: (row) => (row && row.role === 'student' ? String(row.username || '').trim() : ''),
    pilotAccountRequiresChangePassword: () => false,
  };
}

async function callMissions(account, env, method, urlStr, body) {
  const url = new URL(urlStr);
  const request = new Request(urlStr, {
    method,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const res = await handleMissionsRoutes(request, url, url.pathname, env, {}, missionDeps(account));
  return { status: res.status, json: await res.json() };
}

// ---- Static UI / architecture ----
const adminHtml = fs.readFileSync(path.join(root, 'app/admin.html'), 'utf8');
const teacherHtml = fs.readFileSync(path.join(root, 'app/teacher.html'), 'utf8');
const studentHtml = fs.readFileSync(path.join(root, 'app/index.html'), 'utf8');
const gamesHtml = fs.readFileSync(path.join(root, 'app/games.html'), 'utf8');
const indexSrc = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
const eventSrc = fs.readFileSync(path.join(root, 'worker/mission-event-completions.js'), 'utf8');
const analyticsSrc = fs.readFileSync(path.join(root, 'worker/interactions-analytics.js'), 'utf8');
const migrations = fs.readdirSync(path.join(root, 'worker/migrations'));

if (adminHtml.includes('Nugget Economy') && adminHtml.includes('nuggetEconomySave') && adminHtml.includes('loadNuggetEconomy()')) {
  ok('System Tools admin page has Nugget Economy load/save');
} else bad('admin Nugget Economy UI');
if (teacherHtml.includes('id="missionRewardAmount"') && teacherHtml.includes('data-edit="reward_amount"') && teacherHtml.includes('loadMissionEconomyGuardrails')) {
  ok('teacher create + edit expose Nugget Reward');
} else bad('teacher mission reward UI');
if (!studentHtml.includes('nuggetEconomySave') && !gamesHtml.includes('nuggetEconomySave')) {
  ok('student surfaces do not expose economy-setting controls');
} else bad('student economy controls leaked');
if (!migrations.some((f) => /229|nugget_economy|economy_settings/.test(f))) {
  ok('no new D1 economy/mission-reward migration added');
} else bad('unexpected migration file');
if (/resolveEventMissionPayout/.test(eventSrc) && !/creditMissionApprovalReward\(db, characterName, submissionId, 1,/.test(eventSrc)) {
  ok('event missions resolve saved/configured mission reward (no hardcoded +1)');
} else bad('event mission reward still hardcoded');
if (analyticsSrc.includes('earned += delta') && analyticsSrc.includes('Number(row.delta)')) {
  ok('analytics sums persisted ledger deltas, not today\'s setting');
} else bad('analytics ledger sum');
if (/kind === 'reaction'/.test(indexSrc) === false || !/creditReaction/.test(indexSrc)) {
  ok('no new ordinary-reaction ledger path invented');
} else bad('reaction ledger invented');
if (pollCompleteReference('p1', '20889') === 'lantern:poll_complete:p1:20889') {
  ok('poll idempotency reference unchanged');
} else bad('poll reference');
if (missionRewardTxId('sub_1') === 'tx_mission_sub_1') ok('mission reward tx id unchanged');
else bad('mission tx id');

// ---- Validator / resolver ----
if (validateEconomyValue('poll_response', 0).ok && validateEconomyValue('poll_response', 5).ok) {
  ok('poll_response allows 0 and +5');
} else bad('poll bounds');
if (!validateEconomyValue('poll_response', 6).ok && !validateEconomyValue('poll_response', -1).ok && !validateEconomyValue('poll_response', 99999).ok) {
  ok('invalid / sign-reversal / absurd earn values rejected');
} else bad('poll reject');
if (validateEconomyValue('game_play', -1).ok && validateEconomyValue('game_play', 0).ok && !validateEconomyValue('game_play', 1).ok && !validateEconomyValue('game_play', -50).ok) {
  ok('game_play allows spend 0…-10 and rejects pay-to-play reversal');
} else bad('game_play bounds');
if (ECONOMY_ROW_ORDER.length === 10 && ECONOMY_SETTING_DEFS.hidden_nugget.dormant === false && ECONOMY_SETTING_DEFS.reaction.dormant) {
  ok('row set includes live Hidden Nugget + dormant Reaction');
} else bad('row set');

const emptyDb = makeSettingsDb({});
const missing = await resolveEconomyAmount(emptyDb, 'poll_response');
const missingGame = await resolveEconomyAmount(emptyDb, 'game_play');
if (missing === 0 && missingGame === -1) ok('missing settings use documented fallbacks (poll 0, game -1)');
else bad('fallback', { missing, missingGame });

const invalidDb = makeSettingsDb({ 'economy.poll_response': { value: 'nope' }, 'economy.game_play': { value: '12' } });
if ((await resolveEconomyAmount(invalidDb, 'poll_response')) === 0 && (await resolveEconomyAmount(invalidDb, 'game_play')) === -1) {
  ok('invalid stored values fall back safely');
} else bad('invalid fallback');

const storedDb = makeSettingsDb({ 'economy.poll_response': { value: '2' }, 'economy.game_play': { value: '-3' } });
if ((await resolveEconomyAmount(storedDb, 'poll_response')) === 2 && (await resolveEconomyAmount(storedDb, 'game_play')) === -3) {
  ok('stored validated values win over fallbacks');
} else bad('stored values');

const writeDb = makeSettingsDb({});
const saved = await setEconomyValue(writeDb, 'poll_response', 2, 'Rick Radle');
const after = await getEconomySettings(writeDb);
if (saved.ok && after.values.poll_response === 2 && after.sources.poll_response === 'stored' && writeDb.rows['economy.poll_response'].updated_by === 'Rick Radle') {
  ok('setEconomyValue persists and records updated_by');
} else bad('setEconomyValue', { saved, after });

if (clampTeacherMissionReward(null, { mission_min: 0, mission_max: 5, mission_default: 1 }) === 1) {
  ok('new mission with no reward uses suggested default (1)');
} else bad('default mission reward');
if (clampTeacherMissionReward(3, { mission_min: 0, mission_max: 5, mission_default: 1 }) === 3) {
  ok('teacher custom mission reward within bounds is kept');
} else bad('custom mission reward');
if (clampTeacherMissionReward(9, { mission_min: 0, mission_max: 5, mission_default: 1 }) === 9) {
  ok('teacher reward up to 10 is kept (#257C)');
} else bad('max keep');
if (clampTeacherMissionReward(11, { mission_min: 0, mission_max: 5, mission_default: 1 }) === 10) {
  ok('teacher reward above 10 is clamped');
} else bad('max clamp');
if (clampTeacherMissionReward(-2, { mission_min: 0, mission_max: 5, mission_default: 1 }) === 1) {
  ok('teacher reward below min is clamped to 1');
} else bad('min clamp');

const payoutDb = makeSettingsDb({ 'economy.mission_default': { value: '2' }, 'economy.mission_max': { value: '10' } });
if ((await resolveStoredMissionPayout(payoutDb, 1)) === 1 && (await resolveStoredMissionPayout(payoutDb, null)) === 1) {
  ok('existing missions keep saved reward; missing stored reward uses suggested default (1)');
} else bad('stored payout');

if ((await resolveTeacherMissionReward(emptyDb, undefined)) === 1) ok('resolveTeacherMissionReward uses fallback default');
else bad('resolveTeacherMissionReward');

// ---- Settings HTTP (handler + real admin gate) ----
{
  const db = makeSettingsDb({});
  const getRes = await handleNuggetEconomySettings(
    new Request('https://x/api/settings/nugget-economy'),
    '/api/settings/nugget-economy',
    { DB: db },
    {},
    makeDeps(true)
  );
  if (
    getRes.status === 200 &&
    getRes.body.ok &&
    getRes.body.values.poll_response === 0 &&
    getRes.body.rows.length === 4 &&
    getRes.body.values.game_play === -1 &&
    !getRes.body.rows.some((r) => r.id === 'game_play')
  ) {
    ok('System Admin can read economy settings (fallbacks; legacy game_play hidden from rows)');
  } else bad('GET economy', getRes);
}

{
  const db = makeSettingsDb({});
  const patchRes = await handleNuggetEconomySettings(
    new Request('https://x/api/settings/nugget-economy', {
      method: 'PATCH',
      body: JSON.stringify({ values: { poll_response: 0, game_play: -1 } }),
    }),
    '/api/settings/nugget-economy',
    { DB: db },
    {},
    makeDeps(true, adminAccount())
  );
  if (patchRes.status === 200 && patchRes.body.ok && patchRes.body.values.game_play === -1 && patchRes.body.updated_by === 'Rick Radle') {
    ok('System Admin can change an allowed setting');
  } else bad('PATCH admin', patchRes);

  const badVal = await handleNuggetEconomySettings(
    new Request('https://x/api/settings/nugget-economy', {
      method: 'PATCH',
      body: JSON.stringify({ values: { poll_response: 99999 } }),
    }),
    '/api/settings/nugget-economy',
    { DB: db },
    {},
    makeDeps(true, adminAccount())
  );
  if (badVal.status === 400 && badVal.body.error === 'out_of_range') ok('invalid PATCH value rejected');
  else bad('PATCH invalid', badVal);

  const teacherPatch = await handleNuggetEconomySettings(
    new Request('https://x/api/settings/nugget-economy', {
      method: 'PATCH',
      body: JSON.stringify({ values: { poll_response: 2 } }),
    }),
    '/api/settings/nugget-economy',
    { DB: db },
    {},
    makeDeps(false, teacherAccount())
  );
  if (teacherPatch.status === 403) ok('teacher cannot change global settings (handler gate)');
  else bad('teacher PATCH handler', teacherPatch);
}

{
  const settingsRouteGet = await handleSettingsRoutes(
    new Request('https://x/api/settings/nugget-economy'),
    new URL('https://x/api/settings/nugget-economy'),
    '/api/settings/nugget-economy',
    { DB: makeSettingsDb({}) },
    {},
    makeDeps(false)
  );
  if (settingsRouteGet.status === 200 && settingsRouteGet.body.ok) ok('economy GET is reused on existing settings routes');
  else bad('settings route GET', settingsRouteGet);
}

await withMockedBridge(() => ({ body: { ok: false } }), async () => {
  const admin = adminAccount();
  const teacher = teacherAccount();
  const student = studentAccount();
  const state = {
    accounts: { rradle: admin, ms_carter: teacher, '20889': student },
    settings: {},
  };
  const env = makeWorkerEnv(state);
  const adminCookie = await cookieFor(admin);
  const teacherCookie = await cookieFor(teacher);
  const studentCookie = await cookieFor(student);

  const read = await jsonFetch(env, 'GET', '/api/settings/nugget-economy', adminCookie);
  if (read.status === 200 && read.json.ok) ok('admin GET /api/settings/nugget-economy via worker');
  else bad('worker GET', read);

  const adminWrite = await jsonFetch(env, 'PATCH', '/api/settings/nugget-economy', adminCookie, { values: { reaction: 0, hidden_nugget: 1 } });
  if (adminWrite.status === 200 && adminWrite.json.ok && adminWrite.json.values.hidden_nugget === 1) {
    ok('admin PATCH persists Hidden Nugget setting');
  } else bad('worker admin PATCH', adminWrite);

  const teacherWrite = await jsonFetch(env, 'PATCH', '/api/settings/nugget-economy', teacherCookie, { values: { game_play: 0 } });
  if (teacherWrite.status === 403 && teacherWrite.json.error === 'forbidden') ok('teacher cannot PATCH global settings (session gate)');
  else bad('teacher worker PATCH', teacherWrite);

  const studentWrite = await jsonFetch(env, 'PATCH', '/api/settings/nugget-economy', studentCookie, { values: { game_play: 0 } });
  if (studentWrite.status === 403 && studentWrite.json.error === 'forbidden') ok('student cannot PATCH global settings (session gate)');
  else bad('student worker PATCH', studentWrite);
});

// ---- Poll 0 / no TMS ----
await withMockedBridge(() => ({ body: { ok: true, delta: 1 } }), async (getCalls) => {
  const db = makeWorkerEnv({ settings: {} }).DB;
  const r = await creditPollCompletionReward(db, { TMS_LANTERN_BRIDGE_SECRET: TEST_BRIDGE_SECRET }, 'poll_z', '20889');
  if (r.ok && r.status === 'skipped' && r.voter_nuggets === 0 && getCalls().length === 0) {
    ok('poll reward 0 skips TMS and writes no Nugget credit');
  } else bad('poll 0', r);
});

await withMockedBridge((call) => ({ body: { ok: true, student_id: '20889', delta: call.body.delta, available: 4 } }), async (getCalls) => {
  const envBundle = makeWorkerEnv({ settings: { 'economy.poll_response': '1' } });
  const r = await creditPollCompletionReward(envBundle.DB, { TMS_LANTERN_BRIDGE_SECRET: TEST_BRIDGE_SECRET }, 'poll_one', '20889');
  const replay = await creditPollCompletionReward(envBundle.DB, { TMS_LANTERN_BRIDGE_SECRET: TEST_BRIDGE_SECRET }, 'poll_one', '20889');
  if (
    r.ok &&
    r.voter_nuggets === 1 &&
    replay.status === 'already' &&
    getCalls().length === 1 &&
    getCalls()[0].body.reference === 'lantern:poll_complete:poll_one:20889'
  ) {
    ok('poll setting 1 still credits once; duplicate protection preserved');
  } else bad('poll 1 + idempotent', { r, replay, calls: getCalls() });
});

// ---- Game cost configurable + insufficient + free play ----
await withMockedBridge((call) => {
  if (call.body && call.body.kind === 'game_play' && Number(call.body.delta) === -2) {
    return { httpOk: false, status: 400, body: { ok: false, error: 'insufficient_balance', code: 'insufficient_balance' } };
  }
  return { body: { ok: true, student_id: call.body.student_id, delta: call.body.delta, available: 8, reference: call.body.reference } };
}, async (getCalls) => {
  const student = studentAccount();
  const state = {
    accounts: { '20889': student },
    settings: { 'economy.game_play': '-2' },
    wallets: { '20889': 1 },
  };
  const env = makeWorkerEnv(state);
  const cookie = await cookieFor(student);
  const rejected = await jsonFetch(env, 'POST', '/api/economy/transact', cookie, {
    kind: 'game_play',
    delta: -1,
    meta: { run_id: 'run-cost-mismatch' },
  });
  if (rejected.status === 400 && rejected.json.error === 'client_delta_rejected' && rejected.json.server_delta === -2) {
    ok('client cannot choose game cost; server uses configured -2');
  } else bad('game client reject', rejected);

  const insuff = await jsonFetch(env, 'POST', '/api/economy/transact', cookie, {
    kind: 'game_play',
    delta: -2,
    meta: { run_id: 'run-insuff' },
  });
  if (insuff.status === 400 && (insuff.json.code === 'insufficient_balance' || insuff.json.error === 'insufficient_balance' || insuff.json.error === 'tms_staff_transact_failed' || String(insuff.json.error || '').includes('insufficient'))) {
    ok('insufficient-balance behavior preserved when game cost is negative');
  } else bad('insufficient', insuff);
  if (getCalls().some((c) => c.body && c.body.delta === -2)) ok('TMS is asked for the configured spend, not the client amount');
  else bad('TMS configured spend', getCalls());
});

await withMockedBridge(() => ({ body: { ok: true, delta: -1 } }), async (getCalls) => {
  const student = studentAccount();
  const state = { accounts: { '20889': student }, settings: { 'economy.game.memory.play_mode': 'free' } };
  const env = makeWorkerEnv(state);
  const cookie = await cookieFor(student);
  const free = await jsonFetch(env, 'POST', '/api/economy/transact', cookie, {
    kind: 'game_play',
    delta: 0,
    meta: { run_id: 'run-free', game_id: 'memory' },
  });
  const playSpends = getCalls().filter((c) => c.body && c.body.kind === 'game_play');
  if (free.status === 200 && free.json.ok && free.json.delta === 0 && free.json.skipped && playSpends.length === 0) {
    ok('game cost 0 is free play: local proof row, no TMS debit');
  } else bad('free play', { free, playSpends, tms: getCalls() });
  if (evaluatePaidRunForWinCredit(state.transactions[0], { characterName: '20889', nowMs: Date.now() }).ok) {
    ok('free-play game_play still unlocks win-credit proof');
  } else bad('free play proof');
});

// ---- Mission create / edit / payout ----
{
  const teacher = teacherAccount();
  const state = { accounts: { ms_carter: teacher }, settings: { 'economy.mission_default': '2', 'economy.mission_min': '0', 'economy.mission_max': '5' } };
  const env = makeWorkerEnv(state);
  const createdDefault = await callMissions(teacher, env, 'POST', 'https://x/api/missions', { title: 'Default reward mission' });
  if (createdDefault.status === 200 && createdDefault.json.ok && createdDefault.json.mission.reward_amount === 1) {
    ok('teacher create without reward uses suggested default (1)');
  } else bad('create default', createdDefault);

  const createdCustom = await callMissions(teacher, env, 'POST', 'https://x/api/missions', { title: 'Custom reward', reward_amount: 3, min_characters: 100 });
  if (createdCustom.status === 200 && createdCustom.json.mission.reward_amount === 3) {
    ok('teacher custom mission reward is saved');
  } else bad('create custom', createdCustom);

  const createdOver = await callMissions(teacher, env, 'POST', 'https://x/api/missions', { title: 'Over max', reward_amount: 99, min_characters: 100 });
  if (createdOver.status === 200 && createdOver.json.mission.reward_amount === 10) {
    ok('teacher cannot exceed mission max (10)');
  } else bad('create over max', createdOver);

  const mid = createdCustom.json.mission.id;
  const edited = await callMissions(teacher, env, 'PATCH', 'https://x/api/missions/' + mid, { reward_amount: 4 });
  if (edited.status === 200 && state.missions[mid].reward_amount === 4) {
    ok('existing mission reward can be edited');
  } else bad('edit reward', { edited, row: state.missions[mid] });
}

{
  const creditState = { wallets: { '20889': 10 }, transactions: [] };
  const env = makeWorkerEnv(creditState);
  const first = await creditMissionApprovalReward(env.DB, '20889', 'sub_old', 1, 'approved');
  creditState.missions = { m1: { reward_amount: 3 } };
  const again = await creditMissionApprovalReward(env.DB, '20889', 'sub_old', 3, 'approved later');
  const future = await creditMissionApprovalReward(env.DB, '20889', 'sub_new', 3, 'approved later');
  if (first.ok && first.delta === 1 && again.ok && again.idempotent && again.delta === 1 && future.ok && future.delta === 3) {
    ok('prior reward transaction unchanged; future completion uses new mission reward');
  } else bad('mission history vs future', { first, again, future });
  const ledgerOld = creditState.transactions.find((t) => t.id === missionRewardTxId('sub_old'));
  if (ledgerOld && Number(ledgerOld.delta) === 1) ok('historical ledger row stays +1');
  else bad('ledger rewrite', ledgerOld);
}

// ---- Analytics uses real amounts ----
if (
  classifyEarnKind('lantern_mission_reward', 'APPROVAL', 'Teacher mission approved') === 'Missions' &&
  classifyEarnKind('poll_complete', 'POLL', 'Poll participation') === 'Content / Polls'
) {
  ok('analytics classifies by kind, then sums actual deltas');
} else bad('analytics classify');

console.log('\nnugget-economy-settings-229-test: ' + pass + ' PASS ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
