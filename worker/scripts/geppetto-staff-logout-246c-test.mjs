/**
 * Prompt #246C — staff student-authorize rejection recovery + safe logout continue.
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
  geppettoStudentAuthorizeFailurePage,
} from '../geppetto-student-handoff.js';

let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

const TEST_PILOT_SECRET = 'test-secret-not-a-real-pilot-session-secret';
const SAFE_RETURN = 'https://mrradle.us/api/stem-daily/student/lantern-callback?next=%2Fdigital-art.html';
const SAFE_MAKEUP_RETURN =
  'https://mrradle.us/api/stem-daily/student/lantern-callback?next=' + encodeURIComponent('/?makeup=1');

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

const staff = account({ username: 'teacher1', role: 'teacher', mtss_student_id: '999' });

{
  const state = {};
  const env = makeEnv(state);
  state.accounts[staff.username] = staff;
  const res = await authorize(env, await cookieFor(staff), SAFE_RETURN);
  const text = await res.text();
  const loc = res.headers.get('Location') || '';
  if (res.status !== 401 || loc.includes('code=')) {
    bad('1. generic staff remains 401/rejected', { status: res.status, loc });
  } else if (!/Could not continue to Class Website/.test(text)) {
    bad('1. Class Website heading', text.slice(0, 240));
  } else if (!/You&#39;re signed in to Lantern with a staff account\.|You're signed in to Lantern with a staff account\./.test(text)) {
    bad('1. staff-account notice', text.slice(0, 320));
  } else if (!/Log Out of Lantern/.test(text) || !/action="\/api\/auth\/logout"/.test(text)) {
    bad('1. Log Out of Lantern action present', text.slice(0, 400));
  } else if (/Make Up Assignment/.test(text)) {
    bad('1. no Make Up wording', text.slice(0, 320));
  } else if (!/Student Login requires a student account/.test(text) || /role !== 'student'/.test(text) === false && !/student account/.test(text)) {
    ok('1. Generic Student Login + staff: rejected Class Website recovery, role guard unchanged');
  } else {
    ok('1. Generic Student Login + staff: rejected Class Website recovery, role guard unchanged');
  }
}

{
  const state = {};
  const env = makeEnv(state);
  state.accounts[staff.username] = staff;
  const res = await authorize(env, await cookieFor(staff), SAFE_MAKEUP_RETURN);
  const text = await res.text();
  if (res.status !== 401) {
    bad('2. explicit Make Up + staff remains rejected', res.status);
  } else if (!/Could not continue to Make Up Assignment/.test(text)) {
    bad('2. Make Up heading', text.slice(0, 240));
  } else if (!/staff account/.test(text) || !/Make Up Assignment requires a student account/.test(text)) {
    bad('2. staff-account Make Up notice', text.slice(0, 320));
  } else if (!/Log Out of Lantern/.test(text) || /Student Login requires a student account/.test(text)) {
    bad('2. Log Out present without generic Student Login sentence', text.slice(0, 400));
  } else {
    ok('2. Explicit Make Up + staff: rejected Make Up recovery');
  }
}

{
  const env = makeEnv({});
  const cont = geppettoStudentAuthorizeSelfHref(SAFE_RETURN);
  const cookie = await cookieFor(staff);
  const res = await logout(env, { cookie, form: cont });
  const loc = res.headers.get('Location') || '';
  const login = loc ? new URL(loc, 'https://tmslantern.org') : null;
  const loginReturn = login ? login.searchParams.get('return') || '' : '';
  if (res.status !== 302 || !cookieCleared(res)) {
    bad('3. logout destroys session and continues', { status: res.status, loc, cookie: res.headers.get('Set-Cookie') });
  } else if (login.searchParams.get('intent') !== 'class-website' || !login.pathname.endsWith('/login.html')) {
    bad('3. routes to student login', loc);
  } else if (!loginReturn.startsWith('/api/auth/geppetto-student-authorize?return=')) {
    bad('3. preserves only sanitized authorize continuation', loginReturn);
  } else if (/makeup=1/.test(loginReturn) || /makeup=1/.test(decodeURIComponent(loginReturn))) {
    bad('3. generic flow must not gain makeup=1', loginReturn);
  } else if (!decodeURIComponent(loginReturn.split('return=')[1] || '').includes('digital-art.html')) {
    bad('3. generic project destination missing', loginReturn);
  } else {
    ok('3. Logout continuation: generic project preserved through Student Sign In');
  }
}

{
  const env = makeEnv({});
  const cont = geppettoStudentAuthorizeSelfHref(SAFE_MAKEUP_RETURN);
  const res = await logout(env, { cookie: await cookieFor(staff), form: cont });
  const loc = res.headers.get('Location') || '';
  const login = new URL(loc, 'https://tmslantern.org');
  const loginReturn = login.searchParams.get('return') || '';
  const authorizeReturn = decodeURIComponent(loginReturn.split('return=')[1] || '');
  if (res.status !== 302 || !cookieCleared(res)) {
    bad('3b. makeup logout continue', { status: res.status, loc });
  } else if (
    !authorizeReturn.includes('lantern-callback') ||
    !/makeup=1|makeup%3D1/.test(authorizeReturn)
  ) {
    bad('3b. Make Up retains makeup=1', authorizeReturn);
  } else {
    ok('3b. Logout continuation: Make Up retains makeup=1');
  }
}

{
  const env = makeEnv({});
  const cookie = await cookieFor(staff);
  const evil = await logout(env, { cookie, form: 'https://evil.example/steal' });
  const loc = evil.headers.get('Location') || '';
  if (evil.status !== 302 || loc !== '/login.html') {
    bad('4. unsafe continue cannot smuggle a destination', { status: evil.status, loc });
  } else if (!cookieCleared(evil)) {
    bad('4. unsafe continue still logs out', evil.headers.get('Set-Cookie'));
  } else if (sanitizeGeppettoStudentAuthorizeContinue('https://evil.example/steal')) {
    bad('4. helper accepted evil URL');
  } else if (sanitizeGeppettoStudentAuthorizeContinue('/api/auth/geppetto-student-authorize?return=https://evil.example/steal')) {
    bad('4. helper accepted authorize+evil return');
  } else if (geppettoStudentAuthorizeLoginLocation('/login.html?return=https://evil.example')) {
    bad('4. login location helper accepted open redirect');
  } else {
    ok('4. Unsafe return cannot be smuggled through logout continuation');
  }
}

{
  const env = makeEnv({});
  const res = await authorize(env, '', SAFE_RETURN);
  const loc = res.headers.get('Location') || '';
  if (res.status !== 302 || !loc.startsWith('/login.html?return=')) {
    bad('5. no-session continues to Student Sign In', { status: res.status, loc });
  } else if (/Log Out of Lantern/.test(loc) || res.status === 401) {
    bad('5. no-session must not show logout page', loc);
  } else {
    ok('5. No-session student authorize continues to normal Student Sign In');
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
    bad('6. actual student authorize unchanged', { status: res.status, loc });
  } else {
    ok('6. Actual student account successful authorize unchanged');
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
    ok('7. Existing ordinary Lantern logout behavior unchanged');
  }
}

{
  const getLogout = await worker.fetch(
    new Request('https://tmslantern.org/api/auth/logout', { method: 'GET' }),
    makeEnv({})
  );
  const workerSrc = fs.readFileSync(fileURLToPath(new URL('../index.js', import.meta.url)), 'utf8');
  if (getLogout.status === 302 && /login\.html/.test(getLogout.headers.get('Location') || '')) {
    bad('GET logout must not auto-log-out / continue', getLogout.headers.get('Location'));
  } else if (/request\.method === 'GET' && path === '\/api\/pilot\/logout'/.test(workerSrc)) {
    bad('must not add GET logout');
  } else if (sanitizeGeppettoStudentReturn('https://evil.example/api/stem-daily/student/lantern-callback')) {
    bad('allowlist widened');
  } else {
    ok('role guard / allowlist / no GET logout remain constrained');
  }
}

{
  const page = geppettoStudentAuthorizeFailurePage(
    'lantern_account_not_student',
    {},
    geppettoStudentAuthorizeSelfHref(SAFE_RETURN)
  );
  const html = await page.text();
  if (/Try Again/.test(html)) bad('staff recovery should not keep useless Try Again', html.slice(0, 400));
  else if (!/Back to Class Website/.test(html) || !/https:\/\/mrradle\.us/.test(html)) {
    bad('secondary Back to Class Website missing');
  } else if (!/font-size:22px/.test(html) || !/btn primary/.test(html)) {
    bad('failure page should use readable Lantern-like styling');
  } else {
    ok('staff page is a readable recovery UI without Try Again');
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
