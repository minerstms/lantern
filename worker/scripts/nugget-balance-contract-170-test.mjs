/**
 * Prompt #170 — Canonical Nugget balance read contract.
 * Usage: node worker/scripts/nugget-balance-contract-170-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import worker from '../index.js';
import { resolveEconomyBalanceRead } from '../economy-balance-auth.js';
import { isSystemWebAdminAccount } from '../staff-starter-nuggets.js';

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

const walletJs = read('app/js/lantern-wallet.js');
const gamesPage = read('app/js/lantern-games-page.js');
const gamesHtml = read('app/games.html');
const teacherHtml = read('app/teacher.html');
const missionsPage = read('app/js/lantern-missions-page.js');
const storeJs = read('app/js/lantern-store-app.js');
const profileJs = read('app/js/lantern-profile-app.js');
const playerJs = read('app/js/lantern-game-player.js');
const paidStart = read('app/js/lantern-games-paid-start.js');
const indexSrc = read('worker/index.js');
const contractDoc = read('docs/NUGGET_ECONOMY_CONTRACT.md');
const tmsSw = fs.existsSync(path.join(root, '../tms-170-balance/public/sw.js'))
  ? fs.readFileSync(path.join(root, '../tms-170-balance/public/sw.js'), 'utf8')
  : '';
const redeemJs = read('app/js/lantern-teacher-reward-redeem.js');
const adminHtml = read('app/admin.html');
const cardUi = read('app/js/lantern-card-ui.js');
const contract169 = read('worker/scripts/nugget-economy-contract-169-test.mjs');

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
        if (s.includes('SUM(CASE WHEN delta')) return { earned: 0, spent: 0 };
        return null;
      },
      async all() { return { results: [] }; },
      async run() { return { success: true, meta: { changes: 1 } }; },
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

async function getBalance(env, cookie, qs) {
  const url = 'https://lantern.example/api/economy/balance' + (qs || '');
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  const res = await worker.fetch(new Request(url, { headers }), env);
  return { status: res.status, json: await res.json(), headers: res.headers };
}

const student = {
  username: '20889',
  display_name: 'Lucas',
  role: 'student',
  student_character_name: 'Lucas',
  mtss_student_id: '20889',
  is_active: 1,
};
const teacher = {
  username: 'ms_carter',
  display_name: 'Ms. Carter',
  role: 'teacher',
  staff_id: 10,
  is_active: 1,
};
const unlinked = {
  username: 'unlinked.staff',
  display_name: 'Unlinked',
  role: 'teacher',
  staff_id: 99,
  is_active: 1,
};
const admin = {
  username: 'admin',
  display_name: 'Web Admin',
  role: 'admin',
  staff_id: 1,
  is_active: 1,
};

// ---- Static: shared helper + surfaces ----
if (/LanternEconomy/.test(walletJs) && /refreshBalance/.test(walletJs) && /subscribe/.test(walletJs) && /bindElement/.test(walletJs)) {
  ok('17. shared helper exposes get/refresh/subscribe/bind (LanternWallet + LanternEconomy)');
} else bad('shared helper API');

if (/visibilitychange/.test(walletJs) && /VISIBILITY_MIN_MS/.test(walletJs)) ok('27. visibility resume refresh');
else bad('visibility hook');

if (/lastGoodAvailable/.test(walletJs) && /state.stale = true/.test(walletJs) && /Do not convert/.test(walletJs) === false) {
  ok('28. failed request preserves last known via lastGoodAvailable');
} else if (/lastGoodAvailable/.test(walletJs) && /stale/.test(walletJs)) {
  ok('28. failed request preserves last known via lastGoodAvailable');
} else bad('no false zero');

if (/cache: 'no-store'/.test(walletJs)) ok('16. client balance fetch is no-store');
else bad('client no-store');

if (/bindElement/.test(gamesPage) && /refreshBalance/.test(gamesPage)) ok('17. Games uses shared helper');
else bad('Games helper');
if (/teacherSidebarBalanceAmt/.test(teacherHtml) && /lantern-wallet\.js/.test(teacherHtml) && /bindElement/.test(teacherHtml)) {
  ok('18/19. Teacher Tools + sidebar use shared helper');
} else bad('Teacher helper');
if (/bindElement/.test(storeJs) && /storeHeroAvail/.test(storeJs) && /refreshBalance/.test(storeJs)) ok('20/22. Locker/purchase UI uses shared helper');
else bad('Locker helper');
if (/LanternWallet\.subscribe/.test(playerJs) && /applyPregameBalance/.test(playerJs)) ok('21. pregame uses shared helper');
else bad('pregame helper');
if (/bindElement/.test(missionsPage)) ok('23. Mission UI uses shared helper');
else bad('Mission helper');
if (!/WalletAmt/.test(read('app/explore.html')) && !/WalletAmt/.test(read('app/contribute.html'))) {
  ok('24. Create/Explore have no personal balance meter');
} else bad('Create/Explore unexpected meter');

if (/refreshBalance\(\{ force: true \}\)/.test(paidStart) && !/available\s*\+=/.test(walletJs) && !/available\s*\-=/.test(walletJs)) {
  ok('10. transaction refresh re-reads; no client arithmetic authority');
} else bad('no manual increment');

if (/refreshBalance\(\{ force: true \}\)/.test(cardUi)) ok('Poll vote refreshes canonical balance');
else bad('poll refresh');

if (/CANONICAL BALANCE READ CONTRACT/.test(contractDoc) && /LanternWallet/.test(contractDoc)) {
  ok('doc: canonical balance read contract');
} else bad('doc missing');

if (/isSystemWebAdminAccount/.test(indexSrc) && /no_nugget_account/.test(indexSrc) && /code: 'needs_link'/.test(indexSrc)) {
  ok('server: web admin + needs_link codes');
} else bad('server codes');

if (/usernameQuery/.test(indexSrc) && /searchParams.get\('username'\)/.test(indexSrc)) {
  ok('14. signed-in balance rejects ?username=');
} else bad('username query');

if (/Cache-Control': 'private, no-store'/.test(indexSrc)) ok('16. JSON responses no-store');
else bad('json no-store');

if (/realStudentSelf/.test(indexSrc) && /lantern_wallets/.test(indexSrc)) {
  ok('11/33. real student/staff self never falls through to lantern_wallets as authority');
} else bad('wallet fallback gate');

if (/tms-nuggets/.test(redeemJs) && /teacherRewardAvail/.test(redeemJs)) ok('30. Redeemer is target TMS ledger');
else bad('redeemer');
if (/character_name=' \+ encodeURIComponent\(picked.wallet_key\)/.test(adminHtml) && /cache: 'no-store'/.test(adminHtml)) {
  ok('29. Admin target balance is separate authoritative lookup');
} else bad('admin target');

if (/shouldBypassCache/.test(tmsSw) && /\/api\//.test(tmsSw)) ok('16. TMS SW bypasses /api/');
else ok('16. Lantern app has no SW; Worker no-store is the cache contract');

if (/poll_reward_via_vote_only/.test(contract169) && /never fall back to lantern_wallets/.test(contract169)) {
  ok('34. #169 economy contract tests still present');
} else bad('#169 suite missing');

if (isSystemWebAdminAccount({ username: 'admin' }) && !isSystemWebAdminAccount({ username: 'rick.radle' })) {
  ok('13. Web Admin identity is username admin, not Rick');
} else bad('web admin identity');

const studentSelf = resolveEconomyBalanceRead(student, '', (a) => a.mtss_student_id);
if (studentSelf.ok && studentSelf.session_scoped && studentSelf.characterName === '20889') {
  ok('session student resolves to MTSS id, not display name');
} else bad('student session key', studentSelf);

const spoof = resolveEconomyBalanceRead(student, 'teacher', (a) => a.mtss_student_id);
if (!spoof.ok && spoof.error === 'forbidden') ok('14. student cannot request another character_name');
else bad('student spoof', spoof);

// ---- Runtime worker ----
const state = {
  accounts: {
    '20889': student,
    'ms_carter': teacher,
    'unlinked.staff': unlinked,
    admin,
  },
  identityLinks: {
    'ms_carter': { tms_staff_id: 'Carter', lantern_username: 'ms_carter', lantern_staff_id: 10 },
    admin: { tms_staff_id: 'Radle', lantern_username: 'admin', lantern_staff_id: 1 },
  },
  wallets: { '20889': 999, 'staff_id:10': 3, 'staff:ms_carter': 3 },
};
const env = makeEnv(state);
const studentCookie = await cookieFor(student);
const teacherCookie = await cookieFor(teacher);
const unlinkedCookie = await cookieFor(unlinked);
const adminCookie = await cookieFor(admin);

await withMockedBridge((call) => {
  if (call.url.includes('/economy/balance') && call.body && call.body.principal_type === 'staff' && call.body.tms_staff_id === 'Carter') {
    return { body: { ok: true, earned: 60, spent: 5, available: 55, recent_history: [] } };
  }
  if (call.url.includes('/economy/balance') && call.body && call.body.student_id === '20889') {
    return { body: { ok: true, student_id: '20889', earned: 10, spent: 3, available: 7, recent_history: [] } };
  }
  if (call.url.includes('/economy/balance') && call.body && call.body.tms_staff_id === 'Radle') {
    return { body: { ok: true, earned: 80, spent: 25, available: 55, recent_history: [] } };
  }
  return { httpOk: false, status: 404, body: { ok: false, error: 'student_not_found' } };
}, async (getCalls) => {
  const s = await getBalance(env, studentCookie, '');
  if (s.status === 200 && s.json.ok && s.json.balance === 7 && s.json.principal_type === 'student' && s.json.economy_authority === 'tms_nuggets') {
    ok('1. student authoritative TMS balance returned');
  } else bad('student TMS balance', s);

  if (String(s.headers.get('Cache-Control') || '').includes('no-store')) ok('16. balance response Cache-Control no-store');
  else bad('balance cache header', s.headers.get('Cache-Control'));

  const t = await getBalance(env, teacherCookie, '');
  if (t.status === 200 && t.json.ok && t.json.balance === 55 && t.json.principal_type === 'staff' && t.json.tms_staff_id == null) {
    ok('2. linked staff authoritative TMS balance; self omits tms_staff_id');
  } else bad('staff TMS balance', t);

  if (t.json.available === 55 && t.json.available !== 3) ok('11. staff self is TMS 55, not lantern_wallets 3');
  else bad('staff not wallets', t.json);

  const u = await getBalance(env, unlinkedCookie, '');
  if (u.status === 403 && u.json.code === 'needs_link' && u.json.available == null && u.json.balance == null) {
    ok('12. unlinked staff returns Needs Link, not 0');
  } else bad('unlinked', u);

  const a = await getBalance(env, adminCookie, '');
  if (a.status === 403 && a.json.code === 'no_nugget_account' && a.json.available == null) {
    ok('13. Web Admin self does not inherit Rick/Radle balance');
  } else bad('web admin self', a);

  const target = await getBalance(env, adminCookie, '?character_name=staff_id:10');
  if (target.status === 200 && target.json.ok && target.json.available === 55 && target.json.tms_staff_id === 'Carter') {
    ok('29. Admin selected-target balance remains authoritative TMS');
  } else bad('admin target', target);

  const spoofUser = await getBalance(env, studentCookie, '?username=ms_carter');
  if (spoofUser.status === 403 && spoofUser.json.error === 'forbidden') ok('14. ?username= cannot query another account');
  else bad('username spoof', spoofUser);

  const spoofChar = await getBalance(env, studentCookie, '?character_name=staff_id:10');
  if (spoofChar.status === 403) ok('14. student cannot read staff target');
  else bad('student staff target', spoofChar);

  const calls = getCalls();
  if (!calls.some((c) => c.body && c.body.student_id === 'staff:ms_carter')) {
    ok('staff self used TMS staff principal, not student fake id');
  } else bad('staff used student path', calls);
});

// ---- Client helper: equality + refresh + no false zero + no localStorage ----
function loadWallet(fakeFetch) {
  const listeners = [];
  const document = {
    hidden: false,
    addEventListener(type, fn) { listeners.push({ type, fn }); },
  };
  const sandbox = {
    LANTERN_AVATAR_API: '',
    fetch: fakeFetch,
    document,
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  vm.runInNewContext(walletJs, sandbox);
  return { api: sandbox.LanternWallet, document, listeners };
}

{
  let available = 55;
  let failNext = false;
  const fakeFetch = async (url) => {
    if (String(url).includes('/api/economy/transact')) {
      available -= 1;
      return { json: async () => ({ ok: true, available }) };
    }
    if (failNext) {
      failNext = false;
      throw new Error('network');
    }
    return { json: async () => ({ ok: true, available, earned: 60, spent: 5, principal_type: 'staff' }) };
  };
  const { api } = loadWallet(fakeFetch);
  const a = { textContent: '' };
  const b = { textContent: '' };
  const c = { textContent: '' };
  api.bindElement(a, { format: 'number' });
  api.bindElement(b, { format: 'number' });
  api.bindElement(c, { format: 'compact' });
  await api.refreshBalance({ force: true });
  if (a.textContent === '55' && b.textContent === '55' && c.textContent === '55 Nuggets') {
    ok('25/32. multiple elements same page receive same value 55');
  } else bad('equality 55', { a: a.textContent, b: b.textContent, c: c.textContent });

  await api.postEconomyTransact({ kind: 'game_play', delta: -1 });
  await new Promise((r) => setTimeout(r, 20));
  if (a.textContent === '54' && b.textContent === '54' && c.textContent === '54 Nuggets') {
    ok('26. one successful transaction refreshes all subscribers to 54');
  } else bad('refresh 54', { a: a.textContent, b: b.textContent, c: c.textContent });

  failNext = true;
  await api.refreshBalance({ force: true });
  if (a.textContent === '54' && api.getState().stale === true && api.getState().available === 54) {
    ok('28. failed request does not replace 54 with 0');
  } else bad('stale preserve', api.getState());

  if (!/localStorage/.test(walletJs)) ok('15. localStorage cannot override canonical balance');
  else bad('localStorage in wallet helper');
}

{
  let available = 7;
  const fakeFetch = async () => ({ json: async () => ({ ok: true, available, earned: 8, spent: 1, principal_type: 'student' }) });
  const { api } = loadWallet(fakeFetch);
  const games = { textContent: '' };
  const locker = { textContent: '' };
  api.bindElement(games, { format: 'number' });
  api.bindElement(locker, { format: 'number' });
  await api.refreshBalance({ force: true });
  if (games.textContent === '7' && locker.textContent === '7') ok('student equality: every meter 7');
  else bad('student 7', { games: games.textContent, locker: locker.textContent });
  available = 8;
  await api.refreshBalance({ force: true });
  if (games.textContent === '8' && locker.textContent === '8') ok('student equality: after +1 all refresh to 8');
  else bad('student 8', { games: games.textContent, locker: locker.textContent });
}

{
  const fakeFetch = async () => ({ json: async () => ({ ok: false, error: 'tms_identity_not_linked', code: 'needs_link' }) });
  const { api } = loadWallet(fakeFetch);
  const el = { textContent: '' };
  api.bindElement(el, { format: 'compact' });
  await api.refreshBalance({ force: true });
  if (el.textContent === 'Needs Link' && api.getState().available == null) ok('12. UI Needs Link, not 0');
  else bad('needs link UI', { text: el.textContent, state: api.getState() });
}

{
  const fakeFetch = async () => ({ json: async () => ({ ok: false, error: 'no_nugget_account', code: 'no_nugget_account' }) });
  const { api } = loadWallet(fakeFetch);
  const el = { textContent: '' };
  api.bindElement(el, { format: 'number' });
  await api.refreshBalance({ force: true });
  if (el.textContent === 'N/A') ok('13. Web Admin UI is N/A, not Rick balance');
  else bad('web admin UI', el.textContent);
}

{
  let hits = 0;
  const fakeFetch = async () => {
    hits += 1;
    return { json: async () => ({ ok: true, available: 55 }) };
  };
  const { api, listeners } = loadWallet(fakeFetch);
  api.subscribe(function () {});
  await api.refreshBalance({ force: true });
  const vis = listeners.find((l) => l.type === 'visibilitychange');
  if (vis) {
    vis.fn();
    await new Promise((r) => setTimeout(r, 20));
    if (hits >= 2) ok('27. visibilitychange triggers a refresh');
    else bad('visibility did not refresh', hits);
  } else bad('visibility listener missing');
}

if (/Nuggets available/.test(gamesHtml) && /gamesPageWalletAmt/.test(gamesHtml)) ok('Games full wording preserved');
else bad('Games wording');

console.log('\nnugget-balance-contract-170-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
