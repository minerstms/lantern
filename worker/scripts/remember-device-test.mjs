/**
 * Prompt #140 — Remember this device / tms-link-status (Lantern side).
 *
 * Usage: node worker/scripts/remember-device-test.mjs
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
    scn: null,
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
          return state.accounts[key] || null;
        }
        if (
          s.includes('FROM tms_identity_links WHERE lower(trim(lantern_username))') ||
          s.includes('FROM tms_identity_links WHERE lantern_username = ?')
        ) {
          const raw = String(binds[0] || '').trim();
          const lower = raw.toLowerCase();
          let id = state.identityLinksByUsername[raw] || state.identityLinksByUsername[lower] || null;
          if (!id) {
            for (const [k, v] of Object.entries(state.identityLinksByUsername)) {
              if (String(k).trim().toLowerCase() === lower) {
                id = v;
                break;
              }
            }
          }
          return id ? { tms_staff_id: id } : null;
        }
        if (s.includes('FROM tms_identity_links WHERE lantern_staff_id') || s.includes('INNER JOIN lantern_pilot_accounts')) {
          return null;
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

async function linkStatus(env, cookie) {
  return worker.fetch(
    new Request('https://lantern-42i.pages.dev/api/auth/tms-link-status', {
      method: 'GET',
      headers: cookie ? { Cookie: cookie } : {},
    }),
    env
  );
}

async function authorize(env, cookie, returnUrl) {
  const qs = new URLSearchParams();
  if (returnUrl != null) qs.set('return', returnUrl);
  return worker.fetch(
    new Request(`https://lantern-42i.pages.dev/api/auth/tms-device-authorize?${qs}`, {
      method: 'GET',
      headers: cookie ? { Cookie: cookie } : {},
    }),
    env
  );
}

function withMockedMint(fn) {
  const original = globalThis.fetch;
  let lastCall = null;
  globalThis.fetch = async (url, opts) => {
    lastCall = { url: String(url), opts };
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, code: 'opaque-code', tms_staff_id: 'Radle' }),
    };
  };
  return fn(() => lastCall).finally(() => { globalThis.fetch = original; });
}

async function testUnauthLinkStatus() {
  const env = makeEnv({});
  const res = await linkStatus(env, null);
  const body = await res.json();
  if (res.status !== 401 || body.linked) return bad('unauthenticated link-status', { status: res.status, body });
  ok('tms-link-status unauthenticated → 401');
}

async function testStudentNotLinkedStaff() {
  const student = account({ username: 'zane', role: 'student' });
  const env = makeEnv({ accounts: { zane: student }, identityLinksByUsername: { zane: 'Radle' } });
  const cookie = await cookieFor(student);
  const res = await linkStatus(env, cookie);
  const body = await res.json();
  if (!body.ok || body.linked || body.staff !== false) return bad('student must not be staff-linked for remember path', body);
  ok('student → linked=false staff=false (cannot create staff device trust)');
}

async function testUnlinkedTeacher() {
  const teacher = account({ username: 'teacher1', role: 'teacher' });
  const env = makeEnv({ accounts: { teacher1: teacher } });
  const cookie = await cookieFor(teacher);
  const res = await linkStatus(env, cookie);
  const body = await res.json();
  if (!body.ok || body.linked || !body.staff) return bad('unlinked teacher', body);
  ok('unlinked teacher → staff but linked=false (cannot use remember path)');
}

async function testMustChangePasswordBeforeRemember() {
  const teacher = account({ username: 'Rick Radle', role: 'admin', must_change_password: 1 });
  const env = makeEnv({
    accounts: { 'rick radle': teacher },
    identityLinksByUsername: { 'Rick Radle': 'Radle' },
  });
  const cookie = await cookieFor(teacher);
  const res = await linkStatus(env, cookie);
  const body = await res.json();
  if (res.status !== 403 || body.error !== 'must_change_password') {
    return bad('must_change_password must block link-status/remember', { status: res.status, body });
  }
  const authRes = await authorize(env, cookie, 'https://tmsnuggets.pages.dev/index.html?intent=remember');
  const loc = authRes.headers.get('Location') || '';
  if (authRes.status !== 302 || !loc.includes('/change-password.html')) {
    return bad('authorize must force password change before remember', { status: authRes.status, loc });
  }
  ok('must_change_password occurs BEFORE remember / authorize');
}

async function testLinkedAuthorizePreservesIntent() {
  const teacher = account({ username: 'Rick Radle', role: 'admin' });
  const env = makeEnv({
    accounts: { 'rick radle': teacher },
    identityLinksByUsername: { 'Rick Radle': 'Radle' },
  });
  const cookie = await cookieFor(teacher);
  await withMockedMint(async (getCall) => {
    const res = await authorize(
      env,
      cookie,
      'https://tmsnuggets.pages.dev/index.html?intent=onboard&lantern_return=/teacher.html'
    );
    const loc = res.headers.get('Location') || '';
    if (res.status !== 302 || !/intent=onboard/.test(loc) || !/lantern_staff_code=/.test(loc)) {
      return bad('authorize must preserve intent=onboard and append code', loc);
    }
    if (/password|BRIDGE_SECRET|Bearer/.test(loc)) return bad('secrets in redirect', loc);
    if (!getCall()) return bad('mint must be called', getCall());
    ok('linked staff authorize with intent=onboard → TMS redirect with code (Install then Remember)');
  });
}

async function testFrontendSurfaces() {
  const rememberJs = fs.readFileSync(fileURLToPath(new URL('../../app/js/lantern-remember-device.js', import.meta.url)), 'utf8');
  const loginHtml = fs.readFileSync(fileURLToPath(new URL('../../app/login.html', import.meta.url)), 'utf8');
  const teacherHtml = fs.readFileSync(fileURLToPath(new URL('../../app/teacher.html', import.meta.url)), 'utf8');
  if (!/Remember this device\?/.test(rememberJs) && !/buildAuthorizeUrl\('onboard'/.test(rememberJs)) {
    return bad('onboarding must still reach Remember (via TMS onboard or modal)');
  }
  if (!/buildAuthorizeUrl\('onboard'/.test(rememberJs)) {
    return bad('linked staff after login should authorize with intent=onboard (Install then Remember)');
  }
  if (!/lantern-remember-device\.js/.test(loginHtml)) return bad('login must load remember-device script');
  if (!/maybeOfferRememberDevice/.test(loginHtml)) return bad('login must offer remember/onboard after auth');
  if (!/lantern-remember-device\.js/.test(teacherHtml)) return bad('teacher must load remember-device script');
  const lanternNav = fs.readFileSync(fileURLToPath(new URL('../../app/js/lantern-nav.js', import.meta.url)), 'utf8');
  if (!/handleBehaviorNavClick/.test(lanternNav) || !/data-lantern-behavior-nav/.test(lanternNav)) {
    return bad('Behavior Logger global nav must wire remember handler');
  }
  if (/device-pairing\.html/.test(teacherHtml) && /personal staff sign-in uses Remember this device/i.test(teacherHtml)) {
    ok('device-pairing retained for classroom only; linked staff not onboarded through it');
  } else if (!/Classroom computer pairing/i.test(teacherHtml)) {
    return bad('teacher page should clarify classroom pairing is not personal staff onboarding');
  } else {
    ok('device-pairing retained for classroom only; linked staff not onboarded through it');
  }
  if (/TMS_LANTERN_BRIDGE_SECRET/.test(rememberJs) || /TMS_LANTERN_BRIDGE_SECRET/.test(loginHtml)) {
    return bad('bridge secret must not appear client-side');
  }
  ok('Remember/onboard wiring present; bridge secret server-only');
}

await testUnauthLinkStatus();
await testStudentNotLinkedStaff();
await testUnlinkedTeacher();
await testMustChangePasswordBeforeRemember();
await testLinkedAuthorizePreservesIntent();
await testFrontendSurfaces();

console.log('\nremember-device-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
