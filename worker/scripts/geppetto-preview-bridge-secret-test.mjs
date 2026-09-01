/**
 * Dedicated Geppetto Preview bridge credential, scoped by mint host.
 * Usage: node worker/scripts/geppetto-preview-bridge-secret-test.mjs
 */
import worker from '../index.js';
import {
  GEPPETTO_STUDENT_AUDIENCE,
  GEPPETTO_STUDENT_PREVIEW_AUDIENCE,
  sanitizeGeppettoStudentReturn,
  isAllowedGeppettoCallbackHost,
  geppettoBridgeScopeFromSafeReturn,
  geppettoStudentAudienceForScope,
} from '../geppetto-student-handoff.js';

let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

const TEST_PILOT_SECRET = 'test-secret-not-a-real-pilot-session-secret';
const TEST_PROD_BRIDGE = 'test-geppetto-bridge-secret-not-real';
const TEST_PREVIEW_BRIDGE = 'test-geppetto-preview-bridge-secret-not-real';
const PROD_RETURN = 'https://mrradle.us/api/stem-daily/student/lantern-callback?next=%2Fdaily-work%2F';
const PREVIEW_RETURN = 'https://ee91415e.geppetto-full-deploy-v6.pages.dev/api/stem-daily/student/lantern-callback?next=%2Fdaily-work%2F';

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

function account(overrides) {
  return {
    username: 'student1',
    display_name: 'Test Student',
    role: 'student',
    mtss_student_id: '100200300',
    is_active: 1,
    must_change_password: 0,
    password_hash: 'x',
    password_salt: 'y',
    ...overrides,
  };
}

function makeEnv(state, extras) {
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
    LANTERN_GEPPETTO_BRIDGE_SECRET: TEST_PROD_BRIDGE,
    LANTERN_GEPPETTO_PREVIEW_BRIDGE_SECRET: TEST_PREVIEW_BRIDGE,
    TMS_LANTERN_BRIDGE_SECRET: 'tms-staff-secret-must-not-be-accepted',
    ...(extras || {}),
  };
}

async function cookieFor(acc) {
  const now = Math.floor(Date.now() / 1000);
  const token = await signTestJwt({
    sub: acc.username,
    role: acc.role,
    iat: now,
    exp: now + 3600,
  }, TEST_PILOT_SECRET);
  return `lantern_pilot=${token}`;
}

async function authorize(env, cookie, returnUrl) {
  const qs = new URLSearchParams();
  if (returnUrl != null) qs.set('return', returnUrl);
  return worker.fetch(
    new Request('https://tmslantern.org/api/auth/geppetto-student-authorize?' + qs.toString(), {
      method: 'GET',
      headers: cookie ? { Cookie: cookie } : {},
    }),
    env
  );
}

async function redeem(env, code, audience, bearer) {
  return worker.fetch(
    new Request('https://tmslantern.org/api/auth/geppetto-student-handoff/redeem', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + bearer,
      },
      body: JSON.stringify({ code, audience }),
    }),
    env
  );
}

function codeFrom(loc) {
  try { return new URL(loc).searchParams.get('code') || ''; } catch (_) { return ''; }
}

if (geppettoBridgeScopeFromSafeReturn(sanitizeGeppettoStudentReturn(PROD_RETURN)) === 'production' &&
    geppettoStudentAudienceForScope('production') === GEPPETTO_STUDENT_AUDIENCE) {
  ok('scope: mrradle.us is production audience');
} else bad('scope production');

if (geppettoBridgeScopeFromSafeReturn(sanitizeGeppettoStudentReturn(PREVIEW_RETURN)) === 'preview' &&
    geppettoStudentAudienceForScope('preview') === GEPPETTO_STUDENT_PREVIEW_AUDIENCE) {
  ok('scope: one-label Preview is preview audience');
} else bad('scope preview');

if (!isAllowedGeppettoCallbackHost('evil.pages.dev') &&
    !sanitizeGeppettoStudentReturn('https://evil.pages.dev/api/stem-daily/student/lantern-callback')) {
  ok('11. unrelated Preview host still rejected');
} else bad('11. unrelated host');

if (sanitizeGeppettoStudentReturn('https://ee91415e.geppetto-full-deploy-v6.pages.dev/daily-work/') === '') {
  ok('12. callback path remains exact');
} else bad('12. path');

const acc = account();
const prodState = {};
const prodEnv = makeEnv(prodState);
prodState.accounts[acc.username] = acc;
const prodAuth = await authorize(prodEnv, await cookieFor(acc), PROD_RETURN);
const prodLoc = prodAuth.headers.get('Location') || '';
const prodCode = codeFrom(prodLoc);
const prodRedeem = await redeem(prodEnv, prodCode, GEPPETTO_STUDENT_AUDIENCE, TEST_PROD_BRIDGE);
const prodJson = await prodRedeem.json();
if (prodAuth.status === 302 && prodRedeem.status === 200 && prodJson.ok && prodJson.mtss_student_id === '100200300') {
  ok('1. production handoff + production secret succeeds');
} else bad('1. prod success', { status: prodRedeem.status, prodJson });

const prodWithPreview = await redeem(prodEnv, prodCode, GEPPETTO_STUDENT_AUDIENCE, TEST_PREVIEW_BRIDGE);
const prodWithPreviewJson = await prodWithPreview.json();
if (prodWithPreview.status === 403 && !prodWithPreviewJson.ok && prodWithPreviewJson.error === 'wrong_audience') {
  ok('2. production handoff + Preview secret fails (scoped)');
} else bad('2. prod+preview secret', { status: prodWithPreview.status, prodWithPreviewJson });

const previewState = {};
const previewEnv = makeEnv(previewState);
previewState.accounts[acc.username] = acc;
const previewAuth = await authorize(previewEnv, await cookieFor(acc), PREVIEW_RETURN);
const previewLoc = previewAuth.headers.get('Location') || '';
const previewCode = codeFrom(previewLoc);
const previewRedeem = await redeem(previewEnv, previewCode, GEPPETTO_STUDENT_PREVIEW_AUDIENCE, TEST_PREVIEW_BRIDGE);
const previewJson = await previewRedeem.json();
if (previewAuth.status === 302 && previewLoc.startsWith('https://ee91415e.geppetto-full-deploy-v6.pages.dev/api/stem-daily/student/lantern-callback') &&
    previewRedeem.status === 200 && previewJson.ok) {
  ok('3. Preview handoff + Preview secret succeeds');
} else bad('3. preview success', { status: previewRedeem.status, previewJson, previewLoc });

const previewState2 = {};
const previewEnv2 = makeEnv(previewState2);
previewState2.accounts[acc.username] = acc;
const previewAuth2 = await authorize(previewEnv2, await cookieFor(acc), PREVIEW_RETURN);
const previewCode2 = codeFrom(previewAuth2.headers.get('Location') || '');
const previewWithProd = await redeem(previewEnv2, previewCode2, GEPPETTO_STUDENT_PREVIEW_AUDIENCE, TEST_PROD_BRIDGE);
const previewWithProdJson = await previewWithProd.json();
if (previewWithProd.status === 403 && previewWithProdJson.error === 'wrong_audience') {
  ok('4. Preview handoff + production secret fails (scoped)');
} else bad('4. preview+prod secret', { status: previewWithProd.status, previewWithProdJson });

const missingPreview = makeEnv({}, { LANTERN_GEPPETTO_PREVIEW_BRIDGE_SECRET: '' });
const missingState = missingPreview;
const missAccounts = {};
missAccounts[acc.username] = acc;
const missEnv = makeEnv({ accounts: missAccounts }, { LANTERN_GEPPETTO_PREVIEW_BRIDGE_SECRET: '' });
const missAuth = await authorize(missEnv, await cookieFor(acc), PREVIEW_RETURN);
const missCode = codeFrom(missAuth.headers.get('Location') || '');
const missRedeem = await redeem(missEnv, missCode, GEPPETTO_STUDENT_PREVIEW_AUDIENCE, TEST_PREVIEW_BRIDGE);
const missJson = await missRedeem.json();
if (missRedeem.status === 401 && missJson.error === 'unauthorized') {
  ok('5. missing Preview secret fails closed');
} else bad('5. missing preview secret', { status: missRedeem.status, missJson });

const wrongRedeem = await redeem(previewEnv2, previewCode2, GEPPETTO_STUDENT_PREVIEW_AUDIENCE, 'wrong-preview-secret-not-real');
if (wrongRedeem.status === 401 && (await wrongRedeem.json()).error === 'unauthorized') {
  ok('6. wrong Preview secret fails');
} else bad('6. wrong preview secret', wrongRedeem.status);

const expState = {};
const expEnv = makeEnv(expState);
expState.accounts[acc.username] = acc;
const expAuth = await authorize(expEnv, await cookieFor(acc), PREVIEW_RETURN);
const expCode = codeFrom(expAuth.headers.get('Location') || '');
const expHash = Object.keys(expState.handoffs)[0];
expState.handoffs[expHash].expires_at = new Date(Date.now() - 5000).toISOString();
const expRedeem = await redeem(expEnv, expCode, GEPPETTO_STUDENT_PREVIEW_AUDIENCE, TEST_PREVIEW_BRIDGE);
if (expRedeem.status === 401 && (await expRedeem.json()).error === 'expired') {
  ok('7. expired code fails');
} else bad('7. expired', expRedeem.status);

const consumedAgain = await redeem(previewEnv, previewCode, GEPPETTO_STUDENT_PREVIEW_AUDIENCE, TEST_PREVIEW_BRIDGE);
if (consumedAgain.status === 401 && (await consumedAgain.json()).error === 'already_consumed') {
  ok('8. consumed code fails');
} else bad('8. consumed', consumedAgain.status);

const aud = await redeem(previewEnv2, previewCode2, 'lantern', TEST_PREVIEW_BRIDGE);
if (aud.status === 403 && (await aud.json()).error === 'wrong_audience') {
  ok('9. invalid audience fails');
} else bad('9. audience', aud.status);

const staffState = {};
const staffEnv = makeEnv(staffState);
staffState.accounts.teacher1 = account({ username: 'teacher1', role: 'teacher', mtss_student_id: '999' });
const staffRes = await authorize(staffEnv, await cookieFor({ username: 'teacher1', role: 'teacher' }), PREVIEW_RETURN);
const staffLoc = staffRes.headers.get('Location') || '';
if (staffRes.status === 302 && staffLoc.startsWith('/login.html') && !/code=/.test(staffLoc) && !Object.keys(staffState.handoffs).length) {
  ok('10. staff cannot mint student handoff');
} else bad('10. staff', { status: staffRes.status, staffLoc });

const prodAgain = await authorize(makeEnv({ accounts: { student1: acc } }), await cookieFor(acc), PROD_RETURN);
const prodAgainLoc = prodAgain.headers.get('Location') || '';
if (prodAgain.status === 302 && prodAgainLoc.startsWith('https://mrradle.us/api/stem-daily/student/lantern-callback')) {
  ok('13. production behavior unchanged');
} else bad('13. production dest', prodAgainLoc);

if (!prodLoc.includes(TEST_PROD_BRIDGE) && !previewLoc.includes(TEST_PREVIEW_BRIDGE) &&
    prodJson.mtss_student_id && !JSON.stringify(prodJson).includes(TEST_PROD_BRIDGE)) {
  ok('14. no auth bypass / no secret leak');
} else bad('14. leak');

console.log('geppetto-preview-bridge-secret-test: ' + pass + ' PASS ' + fail + ' FAIL');
if (fail) process.exit(1);
