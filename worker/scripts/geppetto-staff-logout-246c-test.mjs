/**
 * Prompt #246C-FIX — silent non-student session discard on student-authorize.
 * Usage: node worker/scripts/geppetto-staff-logout-246c-test.mjs
 */
import fs from 'fs';
import { fileURLToPath } from 'url';
import worker from '../index.js';
import {
  sanitizeGeppettoStudentReturn,
  sanitizeGeppettoStudentAuthorizeContinue,
  geppettoStudentAuthorizeLoginLocation,
  geppettoStudentAuthorizeSelfHref,
} from '../geppetto-student-handoff.js';

let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

const TEST_PILOT_SECRET = 'test-secret-not-a-real-pilot-session-secret';
const SAFE_RETURN = 'https://mrradle.us/api/stem-daily/student/lantern-callback?next=%2Fdigital-art.html';
const SAFE_MAKEUP_RETURN =
  'https://mrradle.us/api/stem-daily/student/lantern-callback?next=' + encodeURIComponent('/?makeup=1');
const STAFF_DISCLOSURE =
  /staff account|You're signed in|You&#39;re signed in|Log Out of Lantern|student accounts only|This sign-in is for student/i;

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

function account(overrides) {
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
    ...overrides,
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
          const key = String(binds[0] || '').trim().toLowerCase();
          return state.accounts[key] || null;
        }
        return null;
      },
      async all() { return { results: [] }; },
      async run() {
        if (s.includes('INSERT INTO geppetto_student_handoffs')) {
          state.handoffs[String(binds[1])] = { mtss_student_id: binds[3], display_name: binds[4] };
          return { success: true, meta: { changes: 1 } };
        }
        return { success: true, meta: { changes: 1 } };
      },
    };
    return api;
  }
  return {
    DB: { prepare },
    PILOT_SESSION_SECRET: TEST_PILOT_SECRET,
    LANTERN_GEPPETTO_BRIDGE_SECRET: 'test-geppetto-bridge-secret-not-real',
  };
}

async function authorize(env, cookie, returnUrl) {
  const qs = new URLSearchParams();
  if (returnUrl != null) qs.set('return', returnUrl);
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  return worker.fetch(
    new Request(`https://tmslantern.org/api/auth/geppetto-student-authorize?${qs.toString()}`, {
      method: 'GET',
      headers,
    }),
    env
  );
}

async function logout(env, opts) {
  opts = opts || {};
  const headers = {};
  if (opts.cookie) headers.Cookie = opts.cookie;
  if (opts.form) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  return worker.fetch(
    new Request('https://tmslantern.org/api/auth/logout', {
      method: opts.method || 'POST',
      headers,
      body: opts.form ? new URLSearchParams({ continue: opts.form }).toString() : undefined,
    }),
    env
  );
}

function cookieCleared(res) {
  const raw = res.headers.get('Set-Cookie') || '';
  return /lantern_pilot=/.test(raw) && /Max-Age=0/.test(raw);
}

function cookieNotCleared(res) {
  const raw = res.headers.get('Set-Cookie') || '';
  return !raw || !/Max-Age=0/.test(raw);
}

function parseStudentSignIn(loc) {
  if (!loc) return null;
  try {
    return new URL(loc, 'https://tmslantern.org');
  } catch (_) {
    return null;
  }
}

function authorizeReturnFromLogin(login) {
  if (!login) return '';
  const loginReturn = login.searchParams.get('return') || '';
  if (!loginReturn.startsWith('/api/auth/geppetto-student-authorize?return=')) return '';
  try {
    return decodeURIComponent(loginReturn.split('return=')[1] || '');
  } catch (_) {
    return '';
  }
}

const staff = account({ username: 'teacher1', role: 'teacher', mtss_student_id: '999' });

{
  const state = {};
  const env = makeEnv(state);
  state.accounts[staff.username] = staff;
  const res = await authorize(env, await cookieFor(staff), SAFE_RETURN);
  const text = await res.text();
  const loc = res.headers.get('Location') || '';
  const login = parseStudentSignIn(loc);
  const loginReturn = login ? login.searchParams.get('return') || '' : '';
  const dest = authorizeReturnFromLogin(login);
  if (res.status !== 302 || !login || !login.pathname.endsWith('/login.html')) {
    bad('1. staff generic authorize must 302 to Student Sign In', { status: res.status, loc, text: text.slice(0, 240) });
  } else if (!cookieCleared(res)) {
    bad('1. staff generic authorize must invalidate Lantern session', res.headers.get('Set-Cookie'));
  } else if (login.searchParams.get('intent') !== 'class-website') {
    bad('1. Student Sign In must keep class-website intent', loc);
  } else if (!loginReturn.startsWith('/api/auth/geppetto-student-authorize?return=')) {
    bad('1. project continuation must be preserved', loginReturn);
  } else if (/makeup=1/.test(loginReturn) || /makeup=1/.test(dest)) {
    bad('1. generic flow must not gain makeup=1', dest);
  } else if (!dest.includes('digital-art.html')) {
    bad('1. generic project destination missing', dest);
  } else if (loc.includes('code=') || Object.keys(state.handoffs).length) {
    bad('1. staff must not mint a student handoff', { loc, handoffs: state.handoffs });
  } else if (STAFF_DISCLOSURE.test(text) || STAFF_DISCLOSURE.test(loc)) {
    bad('1. no staff-session disclosure', text.slice(0, 320) || loc);
  } else {
    ok('1. Staff + generic authorize: silent session clear, 302 Student Sign In, project preserved');
  }
}

{
  const state = {};
  const env = makeEnv(state);
  state.accounts[staff.username] = staff;
  const res = await authorize(env, await cookieFor(staff), SAFE_MAKEUP_RETURN);
  const text = await res.text();
  const loc = res.headers.get('Location') || '';
  const login = parseStudentSignIn(loc);
  const dest = authorizeReturnFromLogin(login);
  if (res.status !== 302 || !login || !login.pathname.endsWith('/login.html')) {
    bad('2. staff Make Up authorize must 302 to Student Sign In', { status: res.status, loc, text: text.slice(0, 240) });
  } else if (!cookieCleared(res)) {
    bad('2. staff Make Up authorize must invalidate Lantern session', res.headers.get('Set-Cookie'));
  } else if (login.searchParams.get('intent') !== 'class-website') {
    bad('2. Make Up Student Sign In must keep class-website intent', loc);
  } else if (!/makeup=1|makeup%3D1/.test(dest)) {
    bad('2. Make Up must preserve makeup=1', dest);
  } else if (loc.includes('code=') || Object.keys(state.handoffs).length) {
    bad('2. staff Make Up must not mint', { loc, handoffs: state.handoffs });
  } else if (STAFF_DISCLOSURE.test(text) || STAFF_DISCLOSURE.test(loc)) {
    bad('2. no staff disclosure on Make Up silent logout', text.slice(0, 320) || loc);
  } else {
    ok('2. Staff + Make Up authorize: silent session clear, 302 Student Sign In, makeup=1 preserved');
  }
}

{
  const state = {};
  const env = makeEnv(state);
  const acc = account();
  state.accounts[acc.username] = acc;
  const res = await authorize(env, await cookieFor(acc), SAFE_RETURN);
  const loc = res.headers.get('Location') || '';
  if (res.status !== 302 || !loc.startsWith('https://mrradle.us/api/stem-daily/student/lantern-callback') || !/[?&]code=/.test(loc)) {
    bad('3. existing student authorize unchanged', { status: res.status, loc });
  } else if (!cookieNotCleared(res)) {
    bad('3. existing student session must not be logged out', res.headers.get('Set-Cookie'));
  } else {
    ok('3. Existing student session is not logged out; successful authorize unchanged');
  }
}

{
  const env = makeEnv({});
  const res = await authorize(env, '', SAFE_RETURN);
  const loc = res.headers.get('Location') || '';
  const login = parseStudentSignIn(loc);
  const dest = authorizeReturnFromLogin(login);
  if (res.status !== 302 || !login || !login.pathname.endsWith('/login.html')) {
    bad('4. no-session continues to Student Sign In', { status: res.status, loc });
  } else if (cookieCleared(res)) {
    bad('4. no-session must not emit a session-clear cookie', res.headers.get('Set-Cookie'));
  } else if (login.searchParams.get('intent') !== 'class-website') {
    bad('4. no-session Student Sign In intent', loc);
  } else if (!dest.includes('digital-art.html') || /makeup=1/.test(dest)) {
    bad('4. no-session generic continuation', dest);
  } else if (STAFF_DISCLOSURE.test(loc)) {
    bad('4. no-session must not mention staff', loc);
  } else {
    ok('4. No session: ordinary Student Sign In redirect unchanged');
  }
}

{
  const state = {};
  const env = makeEnv(state);
  state.accounts[staff.username] = staff;
  const res = await authorize(env, await cookieFor(staff), 'https://evil.example/steal');
  const text = await res.text();
  const loc = res.headers.get('Location') || '';
  if (res.status === 302 || loc) {
    bad('5. unsafe return must remain rejected', { status: res.status, loc });
  } else if (cookieCleared(res)) {
    bad('5. unsafe return must not silently log out / continue', res.headers.get('Set-Cookie'));
  } else if (Object.keys(state.handoffs).length) {
    bad('5. unsafe return must not mint', state.handoffs);
  } else if (STAFF_DISCLOSURE.test(text)) {
    bad('5. unsafe return must not disclose staff', text.slice(0, 320));
  } else if (sanitizeGeppettoStudentReturn('https://evil.example/api/stem-daily/student/lantern-callback')) {
    bad('5. allowlist widened');
  } else if (sanitizeGeppettoStudentAuthorizeContinue('/api/auth/geppetto-student-authorize?return=https://evil.example/steal')) {
    bad('5. helper accepted authorize+evil return');
  } else if (geppettoStudentAuthorizeLoginLocation('/login.html?return=https://evil.example')) {
    bad('5. login location helper accepted open redirect');
  } else {
    ok('5. Unsafe return remains rejected and cannot pass through silent logout');
  }
}

{
  const state = {};
  const env = makeEnv(state);
  state.accounts[staff.username] = staff;
  const cookie = await cookieFor(staff);
  const me = await worker.fetch(
    new Request('https://tmslantern.org/api/auth/me', { method: 'GET', headers: { Cookie: cookie } }),
    env
  );
  const meJson = await me.json();
  if (me.status !== 200 || !meJson || meJson.authenticated !== true || meJson.username !== staff.username) {
    bad('6. ordinary staff /api/auth/me must stay signed in', { status: me.status, meJson });
  } else if (cookieCleared(me)) {
    bad('6. ordinary staff navigation must not auto-log out', me.headers.get('Set-Cookie'));
  } else {
    ok('6. Normal staff Lantern navigation does not auto-log out');
  }
}

{
  const env = makeEnv({});
  const res = await logout(env, { cookie: await cookieFor(staff) });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch (_) { json = null; }
  if (res.status !== 200 || !json || json.ok !== true) {
    bad('7. ordinary JSON logout unchanged', { status: res.status, text: text.slice(0, 200) });
  } else if (!cookieCleared(res)) {
    bad('7. ordinary logout still clears cookie');
  } else if (res.headers.get('Location')) {
    bad('7. ordinary logout must not redirect', res.headers.get('Location'));
  } else {
    ok('7. Ordinary /api/auth/logout remains JSON cookie-clear');
  }
}

{
  const env = makeEnv({});
  const cont = geppettoStudentAuthorizeSelfHref(SAFE_RETURN);
  const res = await logout(env, { cookie: await cookieFor(staff), form: cont });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch (_) { json = null; }
  if (res.status !== 200 || !json || json.ok !== true) {
    bad('7b. form POST logout must stay ordinary JSON', { status: res.status, text: text.slice(0, 200) });
  } else if (res.headers.get('Location')) {
    bad('7b. logout must not honor a continue form field', res.headers.get('Location'));
  } else if (!cookieCleared(res)) {
    bad('7b. form POST logout still clears cookie');
  } else {
    ok('7b. Logout form continue is ignored; ordinary logout unchanged');
  }
}

{
  const getLogout = await worker.fetch(
    new Request('https://tmslantern.org/api/auth/logout', { method: 'GET' }),
    makeEnv({})
  );
  const workerSrc = fs.readFileSync(fileURLToPath(new URL('../index.js', import.meta.url)), 'utf8');
  const handoffSrc = fs.readFileSync(fileURLToPath(new URL('../geppetto-student-handoff.js', import.meta.url)), 'utf8');
  if (getLogout.status === 302 && /login\.html/.test(getLogout.headers.get('Location') || '')) {
    bad('GET logout must not auto-log-out / continue', getLogout.headers.get('Location'));
  } else if (/readPilotLogoutContinueField/.test(workerSrc)) {
    bad('logout continue helper must be removed');
  } else if (/Log Out of Lantern/.test(handoffSrc) || /staff account/.test(handoffSrc)) {
    bad('handoff failure page must not disclose staff');
  } else if (sanitizeGeppettoStudentReturn('https://evil.example/api/stem-daily/student/lantern-callback')) {
    bad('allowlist widened');
  } else {
    ok('role guard / allowlist / ordinary logout remain constrained');
  }
}

{
  const navLogout = fs.readFileSync(fileURLToPath(new URL('../../app/js/lantern-pilot-auth.js', import.meta.url)), 'utf8');
  if (!/\/api\/auth\/logout/.test(navLogout) || !/location\.replace\('\/login\.html'\)/.test(navLogout)) {
    bad('client ordinary logout still posts and goes to /login.html');
  } else {
    ok('client ordinary logout path unchanged');
  }
}

console.log('\ngeppetto-staff-logout-246c-test:', pass, 'PASS', fail, 'FAIL');
if (fail) process.exit(1);
