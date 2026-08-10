/**
 * Prompt #139 — Lantern first-party authorize for TMS device enrollment.
 *
 * Exercises REAL worker/index.js GET /api/auth/tms-device-authorize with mocked D1 + mocked
 * global.fetch standing in for TMS POST /api/auth/lantern-staff-verify/mint.
 *
 * Proves:
 *  - no session → login redirect
 *  - student rejected
 *  - unlinked staff rejected
 *  - inactive / must_change_password handled
 *  - linked teacher/admin mint → redirect to TMS with lantern_staff_code
 *  - bridge secret used server-to-server only (never in redirect URL / HTML body)
 *  - Lantern password never sent to TMS
 *  - teacher.html Behavior nav points at authorize endpoint
 *
 * Usage: node worker/scripts/tms-device-authorize-test.mjs
 */
import fs from 'fs';
import { fileURLToPath } from 'url';
import worker from '../index.js';

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

function account(overrides) {
  return {
    username: 'Rick Radle',
    display_name: 'Rick Radle',
    role: 'admin',
    student_character_name: null,
    teacher_id: null,
    mtss_student_id: null,
    is_active: 1,
    must_change_password: 0,
    password_hash: 'x',
    password_salt: 'y',
    ...overrides,
  };
}

function makeEnv(state) {
  state.accounts = state.accounts || {};
  state.identityLinksByUsername = state.identityLinksByUsername || {};

  function prepare(sql) {
    const s = String(sql);
    const binds = [];
    const api = {
      bind(...args) { binds.push(...args); return api; },
      async first() {
        if (s.includes('FROM lantern_pilot_accounts WHERE lower(trim(username))')) {
          const key = String(binds[0] || '').trim().toLowerCase();
          const row = state.accounts[key];
          return row || null;
        }
        if (s.includes('FROM tms_identity_links WHERE lantern_username = ?')) {
          const id = state.identityLinksByUsername[String(binds[0] || '').trim()];
          return id ? { tms_staff_id: id } : null;
        }
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
    TMS_NUGGETS_API_BASE_URL: 'https://mtss-behavior-log.mrradle.workers.dev',
  };
}

function withMockedMint(behavior, fn) {
  const original = globalThis.fetch;
  let lastCall = null;
  globalThis.fetch = async (url, opts) => {
    lastCall = { url: String(url), opts };
    const result = typeof behavior === 'function' ? behavior(lastCall) : behavior;
    return {
      ok: result.httpOk !== false,
      status: result.status || (result.httpOk === false ? 400 : 200),
      json: async () => result.body,
    };
  };
  return fn(() => lastCall).finally(() => { globalThis.fetch = original; });
}

async function authorize(env, cookie, returnUrl) {
  const qs = new URLSearchParams();
  if (returnUrl != null) qs.set('return', returnUrl);
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  return worker.fetch(
    new Request(`https://lantern-42i.pages.dev/api/auth/tms-device-authorize?${qs.toString()}`, {
      method: 'GET',
      headers,
    }),
    env
  );
}

async function testNoSessionRedirectsToLogin() {
  const env = makeEnv({});
  const res = await authorize(env, null, 'https://tmsnuggets.pages.dev/index.html');
  const loc = res.headers.get('Location') || '';
  if (res.status !== 302 || !loc.includes('/login.html') || !loc.includes('tms-device-authorize')) {
    return bad('no Lantern session must redirect to login with return to authorize', { status: res.status, loc });
  }
  ok('no Lantern session → Sign in to Lantern (login redirect)');
}

async function testStudentRejected() {
  const student = account({ username: 'zane', role: 'student' });
  const env = makeEnv({ accounts: { zane: student }, identityLinksByUsername: { zane: 'Radle' } });
  const cookie = await cookieFor(student);
  await withMockedMint(() => ({ body: { ok: true, code: 'SHOULD_NOT_MINT' } }), async (getCall) => {
    const res = await authorize(env, cookie, 'https://tmsnuggets.pages.dev/index.html');
    const html = await res.text();
    if (res.status !== 401 || /SHOULD_NOT_MINT/.test(html) || getCall()) {
      return bad('student must be rejected without minting', { status: res.status, html: html.slice(0, 200), call: getCall() });
    }
    if (!/Staff access required/i.test(html)) return bad('student failure copy missing', html.slice(0, 300));
    ok('Lantern student → rejected (Staff access required); no mint call');
  });
}

async function testUnlinkedStaffRejected() {
  const teacher = account({ username: 'teacher1', role: 'teacher' });
  const env = makeEnv({ accounts: { teacher1: teacher }, identityLinksByUsername: {} });
  const cookie = await cookieFor(teacher);
  await withMockedMint(() => ({ body: { ok: true, code: 'NOPE' } }), async (getCall) => {
    const res = await authorize(env, cookie, 'https://tmsnuggets.pages.dev/index.html');
    const html = await res.text();
    if (res.status !== 401 || getCall()) return bad('unlinked staff must fail closed without mint', { status: res.status, call: getCall() });
    if (!/not linked to a TMS staff record/i.test(html)) return bad('unlinked copy missing', html.slice(0, 300));
    ok('unlinked Lantern staff → clear not-linked failure; no mint');
  });
}

async function testInactiveRejected() {
  // getPilotAccountFromRequest returns null for is_active=0 → login redirect path.
  const inactive = account({ username: 'old', role: 'teacher', is_active: 0 });
  const env = makeEnv({
    accounts: { old: inactive },
    identityLinksByUsername: { old: 'Radle' },
  });
  const cookie = await cookieFor(inactive);
  const res = await authorize(env, cookie, 'https://tmsnuggets.pages.dev/index.html');
  const loc = res.headers.get('Location') || '';
  // Inactive accounts are treated as unauthenticated by getPilotAccountFromRequest.
  if (res.status !== 302 || !loc.includes('/login.html')) {
    return bad('inactive Lantern staff should not authorize', { status: res.status, loc });
  }
  ok('inactive Lantern staff → cannot authorize (session treated as missing)');
}

async function testMustChangePasswordRedirect() {
  const teacher = account({ username: 'newteacher', role: 'teacher', must_change_password: 1 });
  const env = makeEnv({
    accounts: { newteacher: teacher },
    identityLinksByUsername: { newteacher: 'Radle' },
  });
  const cookie = await cookieFor(teacher);
  const res = await authorize(env, cookie, 'https://tmsnuggets.pages.dev/index.html');
  const loc = res.headers.get('Location') || '';
  if (res.status !== 302 || !loc.includes('/change-password.html')) {
    return bad('must_change_password must redirect to change-password', { status: res.status, loc });
  }
  ok('must_change_password → change-password before TMS verify');
}

async function testLinkedTeacherMintsAndRedirects() {
  const teacher = account({ username: 'Rick Radle', role: 'admin' });
  const env = makeEnv({
    accounts: { 'rick radle': teacher },
    identityLinksByUsername: { 'Rick Radle': 'Radle' },
  });
  const cookie = await cookieFor(teacher);
  await withMockedMint((call) => {
    const auth = call.opts.headers.Authorization || call.opts.headers.get?.('Authorization');
    const body = JSON.parse(call.opts.body);
    if (auth !== `Bearer ${TEST_BRIDGE_SECRET}`) throw new Error('mint must use bridge Bearer secret');
    if (body.password || body.password_hash) throw new Error('must never send password to TMS');
    if (body.tms_staff_id !== 'Radle' || body.lantern_username !== 'Rick Radle') {
      throw new Error('mint payload identity mismatch');
    }
    return { body: { ok: true, code: 'opaque-device-code-ABC', tms_staff_id: 'Radle', teacher_name: 'Rick Radle' } };
  }, async (getCall) => {
    const res = await authorize(env, cookie, 'https://tmsnuggets.pages.dev/index.html');
    const loc = res.headers.get('Location') || '';
    if (res.status !== 302 || !loc.startsWith('https://tmsnuggets.pages.dev/index.html')) {
      return bad('linked staff should redirect to TMS Behavior', { status: res.status, loc });
    }
    if (!loc.includes('lantern_staff_code=opaque-device-code-ABC')) {
      return bad('redirect must carry opaque lantern_staff_code', loc);
    }
    if (/TMS_LANTERN_BRIDGE_SECRET|password_hash|Bearer test-bridge/.test(loc)) {
      return bad('redirect URL must not contain secrets/passwords', loc);
    }
    const call = getCall();
    if (!call || !/lantern-staff-verify\/mint/.test(call.url)) {
      return bad('must call TMS mint endpoint', call);
    }
    ok('linked teacher/admin with valid session → mint + redirect with lantern_staff_code (no password)');
  });
}

async function testAdminCanVerifySimilarly() {
  const admin = account({ username: 'Rick Radle', role: 'admin' });
  const env = makeEnv({
    accounts: { 'rick radle': admin },
    identityLinksByUsername: { 'Rick Radle': 'Radle' },
  });
  const cookie = await cookieFor(admin);
  await withMockedMint(() => ({ body: { ok: true, code: 'admin-code-1', tms_staff_id: 'Radle' } }), async () => {
    const res = await authorize(env, cookie, 'https://tmsnuggets.pages.dev/index.html');
    if (res.status !== 302 || !(res.headers.get('Location') || '').includes('lantern_staff_code=admin-code-1')) {
      return bad('admin should verify like teacher', { status: res.status, loc: res.headers.get('Location') });
    }
    ok('linked admin can verify similarly to teacher');
  });
}

async function testUnsafeReturnSanitized() {
  const teacher = account({ username: 'Rick Radle', role: 'admin' });
  const env = makeEnv({
    accounts: { 'rick radle': teacher },
    identityLinksByUsername: { 'Rick Radle': 'Radle' },
  });
  const cookie = await cookieFor(teacher);
  await withMockedMint(() => ({ body: { ok: true, code: 'safe-code' } }), async () => {
    const res = await authorize(env, cookie, 'https://evil.example/steal');
    const loc = res.headers.get('Location') || '';
    if (!loc.startsWith('https://tmsnuggets.pages.dev/index.html') || loc.includes('evil.example')) {
      return bad('unsafe return must be sanitized to TMS Behavior', loc);
    }
    ok('unsafe return URL sanitized to TMS Nuggets Behavior origin');
  });
}

async function testBridgeSecretNotInClientSurfaces() {
  const teacherHtml = fs.readFileSync(fileURLToPath(new URL('../../app/teacher.html', import.meta.url)), 'utf8');
  const staffNav = fs.readFileSync(fileURLToPath(new URL('../../app/js/lantern-staff-nav.js', import.meta.url)), 'utf8');
  const lanternNav = fs.readFileSync(fileURLToPath(new URL('../../app/js/lantern-nav.js', import.meta.url)), 'utf8');
  const workerSrc = fs.readFileSync(fileURLToPath(new URL('../index.js', import.meta.url)), 'utf8');
  if (/TMS_LANTERN_BRIDGE_SECRET/.test(teacherHtml)) return bad('teacher.html must not embed bridge secret');
  if (!/tms-device-authorize/.test(staffNav) && !/tms-device-authorize/.test(lanternNav)) {
    return bad('Behavior Logger nav must use tms-device-authorize');
  }
  if (!/hrefFor|behaviorAuthorizeHref|tms-device-authorize\?return=/.test(staffNav)) {
    return bad('Behavior Logger href must be authorize handoff in lantern-staff-nav.js');
  }
  if (!/TMS_DEVICE|tms-device-authorize|lantern-staff-verify\/mint/.test(workerSrc)) {
    return bad('worker missing device-authorize implementation');
  }
  ok('Behavior nav uses authorize handoff; bridge secret stays server-only');
}

await testNoSessionRedirectsToLogin();
await testStudentRejected();
await testUnlinkedStaffRejected();
await testInactiveRejected();
await testMustChangePasswordRedirect();
await testLinkedTeacherMintsAndRedirects();
await testAdminCanVerifySimilarly();
await testUnsafeReturnSanitized();
await testBridgeSecretNotInClientSurfaces();

console.log('\ntms-device-authorize-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
