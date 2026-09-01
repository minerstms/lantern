/**
 * Authorized Geppetto Pages Preview callbacks for student SSO.
 * Usage: node worker/scripts/geppetto-preview-auth-test.mjs
 */
import worker from '../index.js';
import {
  sanitizeGeppettoStudentReturn,
  sanitizeGeppettoStudentLogoutReturn,
  isAllowedGeppettoCallbackHost,
  mintGeppettoStudentHandoff,
  redeemGeppettoStudentHandoff,
  GEPPETTO_STUDENT_AUDIENCE,
  GEPPETTO_STUDENT_CALLBACK_PATH,
} from '../geppetto-student-handoff.js';

let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

const TEST_PILOT_SECRET = 'test-secret-not-a-real-pilot-session-secret';
const TEST_GEPPETTO_BRIDGE = 'test-geppetto-bridge-secret-not-real';
const PROD_CB = 'https://mrradle.us/api/stem-daily/student/lantern-callback?next=%2Fdaily-work%2F';
const APEX_CB = 'https://geppetto-full-deploy-v6.pages.dev/api/stem-daily/student/lantern-callback?next=%2Fdaily-work%2F';
const PREVIEW_ID_CB = 'https://ee91415e.geppetto-full-deploy-v6.pages.dev/api/stem-daily/student/lantern-callback?next=%2Fdaily-work%2F';
const PREVIEW_BRANCH_CB = 'https://cursor-daily-work-calendar-v2.geppetto-full-deploy-v6.pages.dev/api/stem-daily/student/lantern-callback?next=%2Fdaily-work%2F';

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

function account() {
  return {
    username: 'student1',
    display_name: 'Test Student',
    role: 'student',
    student_character_name: null,
    teacher_id: null,
    mtss_student_id: '100200300',
    is_active: 1,
    must_change_password: 0,
    password_hash: 'x',
    password_salt: 'y',
  };
}

function makeEnv(state) {
  state.accounts = state.accounts || {};
  state.handoffs = state.handoffs || {};
  function prepare(sql) {
    const s = String(sql);
    const binds = [];
    const api = {
      bind(...args) { binds.push(...args); return api; },
      async first() {
        if (s.includes('FROM lantern_pilot_accounts WHERE lower(trim(username))')) {
          return state.accounts[String(binds[0] || '').trim().toLowerCase()] || null;
        }
        if (s.includes('FROM lantern_student_identities')) return null;
        if (s.includes('FROM geppetto_student_handoffs WHERE code_hash')) {
          return state.handoffs[String(binds[0] || '')] || null;
        }
        return null;
      },
      async all() { return { results: [] }; },
      async run() {
        if (s.includes('INSERT INTO geppetto_student_handoffs')) {
          const row = {
            id: binds[0],
            code_hash: binds[1],
            lantern_username: binds[2],
            mtss_student_id: binds[3],
            display_name: binds[4],
            audience: binds[5],
            created_at: binds[6],
            expires_at: binds[7],
            consumed_at: null,
          };
          state.handoffs[row.code_hash] = row;
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes('UPDATE geppetto_student_handoffs') && s.includes('SET consumed_at')) {
          const consumedAt = binds[0];
          const hash = binds[1];
          const audience = binds[2];
          const now = binds[3];
          const row = state.handoffs[hash];
          if (row && row.audience === audience && !row.consumed_at && String(row.expires_at || '') > now) {
            row.consumed_at = consumedAt;
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true, meta: { changes: 0 } };
        }
        return { success: true, meta: { changes: 1 } };
      },
    };
    return api;
  }
  return {
    DB: { prepare },
    PILOT_SESSION_SECRET: TEST_PILOT_SECRET,
    LANTERN_GEPPETTO_BRIDGE_SECRET: TEST_GEPPETTO_BRIDGE,
    TMS_LANTERN_BRIDGE_SECRET: 'tms-staff-secret-must-not-be-accepted',
  };
}

async function cookieFor(acc) {
  const now = Math.floor(Date.now() / 1000);
  const token = await signTestJwt({
    sub: acc.username,
    role: acc.role,
    scn: null,
    tid: null,
    iat: now,
    exp: now + 3600,
  }, TEST_PILOT_SECRET);
  return `lantern_pilot=${token}`;
}

async function authorize(env, cookie, returnUrl) {
  const qs = new URLSearchParams();
  if (returnUrl != null) qs.set('return', returnUrl);
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  return worker.fetch(
    new Request('https://tmslantern.org/api/auth/geppetto-student-authorize?' + qs.toString(), {
      method: 'GET',
      headers,
    }),
    env
  );
}

function expectCb(raw, host) {
  const out = sanitizeGeppettoStudentReturn(raw);
  return out.startsWith('https://' + host + GEPPETTO_STUDENT_CALLBACK_PATH) &&
    new URL(out).searchParams.get('next') === '/daily-work/';
}

if (expectCb(PROD_CB, 'mrradle.us')) ok('1. mrradle.us callback accepted');
else bad('1. mrradle.us callback accepted');

if (expectCb(PROD_CB, 'mrradle.us') && sanitizeGeppettoStudentReturn('https://mrradle.us/api/stem-daily/student/lantern-callback')) {
  ok('2. legitimate existing production callback accepted');
} else bad('2. production callback');

if (expectCb(APEX_CB, 'geppetto-full-deploy-v6.pages.dev')) ok('3. apex geppetto-full-deploy-v6.pages.dev accepted');
else bad('3. apex pages.dev');

if (expectCb(PREVIEW_ID_CB, 'ee91415e.geppetto-full-deploy-v6.pages.dev')) ok('4. deployment-ID Preview accepted');
else bad('4. deployment-ID Preview', sanitizeGeppettoStudentReturn(PREVIEW_ID_CB));

if (expectCb(PREVIEW_BRANCH_CB, 'cursor-daily-work-calendar-v2.geppetto-full-deploy-v6.pages.dev')) {
  ok('5. branch-alias Preview accepted');
} else bad('5. branch-alias Preview');

if (!sanitizeGeppettoStudentReturn('https://evil.pages.dev/api/stem-daily/student/lantern-callback') &&
    !isAllowedGeppettoCallbackHost('evil.pages.dev')) {
  ok('6. unrelated pages.dev rejected');
} else bad('6. unrelated pages.dev');

if (!sanitizeGeppettoStudentReturn('https://geppetto-full-deploy-v7.pages.dev/api/stem-daily/student/lantern-callback')) {
  ok('7. different Geppetto project rejected');
} else bad('7. different project');

if (!isAllowedGeppettoCallbackHost('foo.bar.geppetto-full-deploy-v6.pages.dev') &&
    !sanitizeGeppettoStudentReturn('https://foo.bar.geppetto-full-deploy-v6.pages.dev/api/stem-daily/student/lantern-callback')) {
  ok('8. nested two-label Preview rejected');
} else bad('8. nested two-label');

if (!isAllowedGeppettoCallbackHost('geppetto-full-deploy-v6.pages.dev.evil.example') &&
    !isAllowedGeppettoCallbackHost('evil-geppetto-full-deploy-v6.pages.dev') &&
    !sanitizeGeppettoStudentReturn('https://geppetto-full-deploy-v6.pages.dev.evil.example/api/stem-daily/student/lantern-callback')) {
  ok('9. lookalike suffix hostname rejected');
} else bad('9. lookalike suffix');

if (!sanitizeGeppettoStudentReturn('http://ee91415e.geppetto-full-deploy-v6.pages.dev/api/stem-daily/student/lantern-callback')) {
  ok('10. HTTP Preview rejected');
} else bad('10. HTTP Preview');

if (!sanitizeGeppettoStudentReturn('not a url') && !sanitizeGeppettoStudentReturn('')) {
  ok('11. malformed URL rejected');
} else bad('11. malformed URL');

if (!sanitizeGeppettoStudentReturn('https://ee91415e.geppetto-full-deploy-v6.pages.dev/daily-work/') &&
    !sanitizeGeppettoStudentReturn('https://mrradle.us/digital-art.html')) {
  ok('12. wrong callback path rejected');
} else bad('12. wrong callback path');

const noSess = await authorize(makeEnv({}), '', PREVIEW_ID_CB);
const noSessLoc = noSess.headers.get('Location') || '';
if (noSess.status === 302 && noSessLoc.startsWith('/login.html?return=')) {
  ok('13. valid Preview host without student session still requires login');
} else bad('13. session required', { status: noSess.status, noSessLoc });

const missing = await authorize(makeEnv({}), '', '');
if (missing.status === 401) ok('14. missing/invalid return rejected as return_not_allowed');
else bad('14. invalid return', missing.status);

const acc = account();
const state = {};
const env2 = makeEnv(state);
state.accounts[acc.username] = acc;
const forged = await cookieFor({ ...acc, username: 'student1' });
const forgedBad = forged.replace(/\.[^.]+$/, '.aaaa');
const forgedRes = await authorize(env2, forgedBad, PREVIEW_ID_CB);
const forgedLoc = forgedRes.headers.get('Location') || '';
if (forgedRes.status === 302 && forgedLoc.startsWith('/login.html?return=') && !/code=/.test(forgedLoc)) {
  ok('15. invalid session signature does not mint a handoff');
} else bad('15. invalid signature', { status: forgedRes.status, forgedLoc });

const mintDb = {
  handoffs: {},
  prepare(sql) {
    const binds = [];
    const api = {
      bind(...args) { binds.push(...args); return api; },
      async first() {
        return this._row || null;
      },
      async run() {
        if (String(sql).includes('INSERT')) {
          this._row = {
            code_hash: binds[1],
            mtss_student_id: binds[3],
            audience: binds[5],
            expires_at: new Date(Date.now() - 1000).toISOString(),
            consumed_at: null,
          };
          mintDb.handoffs[binds[1]] = this._row;
        }
        if (String(sql).includes('UPDATE')) {
          return { success: true, meta: { changes: 0 } };
        }
        return { success: true, meta: { changes: 1 } };
      },
    };
    return api;
  },
};
const expireState = { rows: {} };
const expireDb = {
  prepare(sql) {
    const binds = [];
    const api = {
      bind(...args) { binds.push(...args); return api; },
      async first() {
        const row = expireState.rows[String(binds[0] || '')] || null;
        return row;
      },
      async run() {
        if (String(sql).includes('INSERT INTO geppetto_student_handoffs')) {
          expireState.rows[binds[1]] = {
            code_hash: binds[1],
            lantern_username: binds[2],
            mtss_student_id: binds[3],
            display_name: binds[4],
            audience: binds[5],
            created_at: binds[6],
            expires_at: binds[7],
            consumed_at: null,
          };
          return { success: true, meta: { changes: 1 } };
        }
        return { success: true, meta: { changes: 0 } };
      },
    };
    return api;
  },
};
const minted = await mintGeppettoStudentHandoff(expireDb, { mtssStudentId: '100200300', lanternUsername: 's', displayName: 'Ada' });
if (minted.ok) {
  const hashKeys = Object.keys(expireState.rows);
  expireState.rows[hashKeys[0]].expires_at = new Date(Date.now() - 5000).toISOString();
  const expired = await redeemGeppettoStudentHandoff(expireDb, minted.code, GEPPETTO_STUDENT_AUDIENCE);
  if (!expired.ok && expired.error === 'expired') {
    ok('16. expired authorization rejected');
  } else bad('16. expired', expired);
} else bad('16. mint for expiry', minted);

const prodAcc = account();
const prodState = {};
const prodE = makeEnv(prodState);
prodState.accounts[prodAcc.username] = prodAcc;
const prodRes = await authorize(prodE, await cookieFor(prodAcc), PROD_CB);
const prodLoc = prodRes.headers.get('Location') || '';
if (prodRes.status === 302 && prodLoc.startsWith('https://mrradle.us/api/stem-daily/student/lantern-callback') && /[?&]code=/.test(prodLoc)) {
  ok('17. normal production Geppetto authentication unchanged');
} else bad('17. production auth', { status: prodRes.status, prodLoc });

const previewState = {};
const previewE = makeEnv(previewState);
previewState.accounts[prodAcc.username] = prodAcc;
const previewRes = await authorize(previewE, await cookieFor(prodAcc), PREVIEW_ID_CB);
const previewLoc = previewRes.headers.get('Location') || '';
if (previewRes.status === 302 && previewLoc.startsWith('https://ee91415e.geppetto-full-deploy-v6.pages.dev/api/stem-daily/student/lantern-callback') && /[?&]code=/.test(previewLoc) && previewLoc.includes('next=')) {
  ok('18. Preview callback minted only after student session');
} else bad('18. preview mint', { status: previewRes.status, previewLoc });

if (!sanitizeGeppettoStudentReturn('https://evil.example/api/stem-daily/student/lantern-callback') &&
    !sanitizeGeppettoStudentLogoutReturn('https://evil.example/') &&
    sanitizeGeppettoStudentLogoutReturn('https://mrradle.us/daily-work/') === 'https://mrradle.us/daily-work/') {
  ok('19. no arbitrary external redirect');
} else bad('19. open redirect');

const staffState = {};
const staffE = makeEnv(staffState);
staffState.accounts.teacher1 = {
  username: 'teacher1',
  display_name: 'Teacher',
  role: 'teacher',
  mtss_student_id: '999',
  is_active: 1,
  must_change_password: 0,
};
const staffCookie = await cookieFor({ username: 'teacher1', role: 'teacher' });
const staffRes = await authorize(staffE, staffCookie, PREVIEW_ID_CB);
const staffLoc = staffRes.headers.get('Location') || '';
if (staffRes.status === 302 && staffLoc.startsWith('/login.html') && !/code=/.test(staffLoc)) {
  ok('staff session does not mint a student Preview handoff');
} else bad('staff separation', { status: staffRes.status, staffLoc });

console.log('geppetto-preview-auth-test: ' + pass + ' PASS ' + fail + ' FAIL');
if (fail) process.exit(1);
