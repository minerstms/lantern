/**
 * Geppetto student SSO handoff — authorize + redeem.
 *
 * Usage: node worker/scripts/geppetto-student-handoff-test.mjs
 */
import fs from 'fs';
import { fileURLToPath } from 'url';
import worker from '../index.js';
import {
  sanitizeGeppettoStudentReturn,
  redeemGeppettoStudentHandoff,
  GEPPETTO_STUDENT_AUDIENCE,
} from '../geppetto-student-handoff.js';
import { hashOpaqueSecret } from '../device-enrollment.js';

let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

const TEST_PILOT_SECRET = 'test-secret-not-a-real-pilot-session-secret';
const TEST_GEPPETTO_BRIDGE = 'test-geppetto-bridge-secret-not-real';
const SAFE_RETURN = 'https://mrradle.us/api/stem-daily/student/lantern-callback?next=%2Fdigital-art.html';

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
        if (s.includes('FROM lantern_student_identities')) {
          const key = String(binds[0] || '').trim().toLowerCase();
          const identities = state.identities || {};
          return identities[key] || null;
        }
        if (s.includes('FROM geppetto_student_handoffs WHERE code_hash')) {
          const row = state.handoffs[String(binds[0] || '')];
          return row || null;
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
          if (
            row &&
            row.audience === audience &&
            !row.consumed_at &&
            String(row.expires_at || '') > String(now || '')
          ) {
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

async function redeem(env, body, bearer) {
  const headers = { 'Content-Type': 'application/json' };
  if (bearer != null) headers.Authorization = 'Bearer ' + bearer;
  return worker.fetch(
    new Request('https://tmslantern.org/api/auth/geppetto-student-handoff/redeem', {
      method: 'POST',
      headers,
      body: JSON.stringify(body || {}),
    }),
    env
  );
}

async function testStudentWithRosterMints() {
  const state = {};
  const env = makeEnv(state);
  const acc = account();
  state.accounts[acc.username] = acc;
  const res = await authorize(env, await cookieFor(acc), SAFE_RETURN);
  const loc = res.headers.get('Location') || '';
  if (res.status !== 302 || !loc.startsWith('https://mrradle.us/api/stem-daily/student/lantern-callback')) {
    return bad('linked student mint must redirect to allowlisted callback', { status: res.status, loc });
  }
  if (!/[?&]code=/.test(loc)) return bad('callback must include one-time code', loc);
  if (loc.includes(TEST_GEPPETTO_BRIDGE) || loc.includes('password')) {
    return bad('redirect must not contain secrets', loc);
  }
  ok('1. student with mtss_student_id can mint handoff');
}

async function testMissingRosterFails() {
  const state = {};
  const env = makeEnv(state);
  const acc = account({ mtss_student_id: '' });
  state.accounts[acc.username] = acc;
  const res = await authorize(env, await cookieFor(acc), SAFE_RETURN);
  const text = await res.text();
  if (res.status === 302) return bad('missing roster must not mint', res.headers.get('Location'));
  if (!/not linked to a school student ID/i.test(text)) return bad('missing roster should explain link needed', text.slice(0, 200));
  ok('2. student without mtss_student_id cannot mint');
}

async function testTeacherAdminFailClosed() {
  for (const role of ['teacher', 'admin']) {
    const state = {};
    const env = makeEnv(state);
    const acc = account({ username: role + '1', role, mtss_student_id: '999' });
    state.accounts[acc.username] = acc;
    const res = await authorize(env, await cookieFor(acc), SAFE_RETURN);
    if (res.status === 302 && (res.headers.get('Location') || '').includes('code=')) {
      return bad(role + ' must not mint student handoff', res.headers.get('Location'));
    }
  }
  ok('3. teacher/admin cannot mint student handoff');
}

async function testExpiredHandoff() {
  const state = {};
  const env = makeEnv(state);
  const code = 'expired-code-material';
  const hash = await hashOpaqueSecret(code);
  state.handoffs[hash] = {
    code_hash: hash,
    lantern_username: 'student1',
    mtss_student_id: '100200300',
    display_name: 'Test Student',
    audience: GEPPETTO_STUDENT_AUDIENCE,
    created_at: new Date(Date.now() - 120000).toISOString(),
    expires_at: new Date(Date.now() - 1000).toISOString(),
    consumed_at: null,
  };
  const out = await redeemGeppettoStudentHandoff(env.DB, code, GEPPETTO_STUDENT_AUDIENCE);
  if (out.ok || out.error !== 'expired') return bad('expired handoff must reject', out);
  ok('4. handoff expires after TTL');
}

async function testReplayRejected() {
  const state = {};
  const env = makeEnv(state);
  const acc = account();
  state.accounts[acc.username] = acc;
  const res = await authorize(env, await cookieFor(acc), SAFE_RETURN);
  const loc = res.headers.get('Location') || '';
  const code = new URL(loc).searchParams.get('code');
  const first = await redeem(env, { code, audience: GEPPETTO_STUDENT_AUDIENCE }, TEST_GEPPETTO_BRIDGE);
  const firstJson = await first.json();
  if (!first.ok || !firstJson.ok || firstJson.mtss_student_id !== '100200300') {
    return bad('first redeem should succeed', firstJson);
  }
  const second = await redeem(env, { code, audience: GEPPETTO_STUDENT_AUDIENCE }, TEST_GEPPETTO_BRIDGE);
  const secondJson = await second.json();
  if (second.ok || secondJson.ok) return bad('second redeem must fail', secondJson);
  ok('5. handoff cannot be redeemed twice');
}

async function testWrongAudience() {
  const state = {};
  const env = makeEnv(state);
  const acc = account();
  state.accounts[acc.username] = acc;
  const res = await authorize(env, await cookieFor(acc), SAFE_RETURN);
  const code = new URL(res.headers.get('Location')).searchParams.get('code');
  const out = await redeem(env, { code, audience: 'lantern' }, TEST_GEPPETTO_BRIDGE);
  const json = await out.json();
  if (out.ok || json.ok || json.error !== 'wrong_audience') return bad('wrong audience must fail', json);
  ok('6. wrong audience fails');
}

async function testWrongSecret() {
  const state = {};
  const env = makeEnv(state);
  const acc = account();
  state.accounts[acc.username] = acc;
  const res = await authorize(env, await cookieFor(acc), SAFE_RETURN);
  const code = new URL(res.headers.get('Location')).searchParams.get('code');
  const tms = await redeem(env, { code, audience: GEPPETTO_STUDENT_AUDIENCE }, env.TMS_LANTERN_BRIDGE_SECRET);
  const tmsJson = await tms.json();
  if (tms.ok || tmsJson.ok) return bad('TMS staff secret must not redeem Geppetto handoff', tmsJson);
  const wrong = await redeem(env, { code, audience: GEPPETTO_STUDENT_AUDIENCE }, 'wrong-secret-value-not-real');
  const wrongJson = await wrong.json();
  if (wrong.ok || wrongJson.ok) return bad('wrong bridge secret must fail', wrongJson);
  ok('7. wrong bridge secret fails');
}

async function testReturnAllowlist() {
  const unsafe = sanitizeGeppettoStudentReturn('https://evil.example/api/stem-daily/student/lantern-callback');
  if (unsafe) return bad('off-allowlist host must be rejected', unsafe);
  const pathOpen = sanitizeGeppettoStudentReturn('https://mrradle.us/digital-art.html');
  if (pathOpen) return bad('non-callback path must be rejected', pathOpen);
  const good = sanitizeGeppettoStudentReturn(SAFE_RETURN);
  if (!good.startsWith('https://mrradle.us/api/stem-daily/student/lantern-callback')) {
    return bad('allowlisted callback must pass', good);
  }
  const state = {};
  const env = makeEnv(state);
  const acc = account();
  state.accounts[acc.username] = acc;
  const res = await authorize(env, await cookieFor(acc), 'https://evil.example/steal');
  if (res.status === 302) return bad('unsafe return must not redirect', res.headers.get('Location'));
  ok('8. return URL outside allowlist fails');
}

async function testStaffRoutesUnchanged() {
  const workerSrc = fs.readFileSync(fileURLToPath(new URL('../index.js', import.meta.url)), 'utf8');
  const handoffSrc = fs.readFileSync(fileURLToPath(new URL('../geppetto-student-handoff.js', import.meta.url)), 'utf8');
  if (!/tms-device-authorize/.test(workerSrc)) return bad('TMS device authorize route missing');
  if (!/TMS_LANTERN_BRIDGE_SECRET/.test(workerSrc)) return bad('TMS staff bridge secret still referenced');
  if (/env\.TMS_LANTERN_BRIDGE_SECRET/.test(handoffSrc) || /Bearer \$\{.*TMS_LANTERN/.test(handoffSrc)) {
    return bad('Geppetto handoff must not use TMS staff secret');
  }
  if (/FROM lantern_handoffs|INTO lantern_handoffs/.test(handoffSrc)) {
    return bad('Geppetto handoff must not use TMS lantern_handoffs');
  }
  ok('17. Lantern/TMS staff auth routes remain present and separate');
}

async function testNoSessionRedirectsToLogin() {
  const makeupReturn =
    'https://mrradle.us/api/stem-daily/student/lantern-callback?next=' +
    encodeURIComponent('/?makeup=1');
  const env = makeEnv({});
  const res = await authorize(env, '', makeupReturn);
  const loc = res.headers.get('Location') || '';
  if (res.status !== 302 || !loc.startsWith('/login.html?return=')) {
    return bad('no session must redirect to login', { status: res.status, loc });
  }
  const login = new URL(loc, 'https://tmslantern.org');
  if (login.searchParams.get('intent') !== 'class-website') {
    return bad('login must mark class-website intent', loc);
  }
  const loginReturn = login.searchParams.get('return') || '';
  if (!loginReturn.startsWith('/api/auth/geppetto-student-authorize?return=')) {
    return bad('4. login return must resume authorize', loginReturn);
  }
  const authorizeReturn = decodeURIComponent(loginReturn.split('return=')[1] || '');
  if (!authorizeReturn.includes('lantern-callback') || !authorizeReturn.includes('makeup')) {
    return bad('4. makeup callback must survive login return', authorizeReturn);
  }
  ok('4. no session preserves authorize + makeup return through login');
}

async function testFailurePageNeutralCopy() {
  const env = makeEnv({});
  const res = await authorize(env, '', 'https://evil.example/steal');
  const text = await res.text();
  if (res.status === 302) return bad('unsafe return must not redirect', res.headers.get('Location'));
  if (/Continue with Lantern|Sign in to Lantern|Log in with Lantern|Lantern account required/i.test(text)) {
    return bad('failure page must not tell students to log in with Lantern', text.slice(0, 240));
  }
  if (!/Back to Class Website/.test(text) || !/https:\/\/mrradle\.us/.test(text)) {
    return bad('failure page must offer Back to Class Website', text.slice(0, 240));
  }
  ok('11. authorize failure stays neutral and returns to mrradle.us');
}

async function testLoginPagesPreserveAuthorize() {
  const login = fs.readFileSync(fileURLToPath(new URL('../../app/login.html', import.meta.url)), 'utf8');
  const change = fs.readFileSync(fileURLToPath(new URL('../../app/change-password.html', import.meta.url)), 'utf8');
  const authJs = fs.readFileSync(fileURLToPath(new URL('../../app/js/lantern-pilot-auth.js', import.meta.url)), 'utf8');
  if (!authJs.includes('function isGeppettoStudentAuthorizeReturn')) {
    return bad('login helper must recognize geppetto authorize return');
  }
  if (!login.includes('Student Sign In') || !login.includes('Sign in to continue to your Make Up Assignment.')) {
    return bad('class-website login copy missing');
  }
  if (!login.includes('isClassWebsiteSsoReturn') || !login.includes('location.replace(returnTo)')) {
    return bad('login must hard-preserve authorize return');
  }
  if (!change.includes('isClassWebsiteSsoReturn') || !change.includes('location.replace(dest)')) {
    return bad('change-password must not rewrite authorize to Explore');
  }
  if (!login.includes('Sign in | Lantern')) return bad('normal Lantern login title must remain');
  ok('8. login/change-password preserve authorize and use contextual Student Sign In');
}

async function testHumanDisplayNotRosterId() {
  const state = {};
  const env = makeEnv(state);
  const acc = account({
    username: '20889',
    display_name: 'Lucas',
    student_character_name: '20889',
    mtss_student_id: '20889',
  });
  state.accounts['20889'] = acc;
  const res = await authorize(env, await cookieFor(acc), SAFE_RETURN);
  if (res.status !== 302) return bad('linked 20889 student must mint', res.status);
  const row = Object.values(state.handoffs)[0];
  if (!row || row.mtss_student_id !== '20889') return bad('roster id must remain 20889', row);
  if (row.display_name !== 'Lucas') return bad('display_name must be human account name, not roster id', row);
  ok('linked student display_name uses human Lantern display_name');
}

async function testIdentitiesDisplayWhenAccountNameIsRosterId() {
  const state = { identities: { '20889': { character_name: '20889', display_name: 'Lucas R.' } } };
  const env = makeEnv(state);
  const acc = account({
    username: '20889',
    display_name: '20889',
    student_character_name: '20889',
    mtss_student_id: '20889',
  });
  state.accounts['20889'] = acc;
  const res = await authorize(env, await cookieFor(acc), SAFE_RETURN);
  if (res.status !== 302) return bad('identities fallback must still mint', res.status);
  const row = Object.values(state.handoffs)[0];
  if (!row || row.mtss_student_id !== '20889') return bad('roster id must remain 20889', row);
  if (row.display_name !== 'Lucas R.') return bad('identities display_name should be used when account name is roster id', row);
  ok('exact mtss_student_id identities display_name is used when account name is numeric');
}

await testStudentWithRosterMints();
await testHumanDisplayNotRosterId();
await testIdentitiesDisplayWhenAccountNameIsRosterId();
await testMissingRosterFails();
await testTeacherAdminFailClosed();
await testExpiredHandoff();
await testReplayRejected();
await testWrongAudience();
await testWrongSecret();
await testReturnAllowlist();
await testStaffRoutesUnchanged();
await testNoSessionRedirectsToLogin();
await testFailurePageNeutralCopy();
await testLoginPagesPreserveAuthorize();

console.log(pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
