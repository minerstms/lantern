/**
 * STAFF_RESET_NO_FORCE_CHANGE_V140
 *
 * Prompt #140 — an ordinary teacher/admin password reset must NOT force the
 * student through a password-change screen on their next login. The deliberate
 * "must change at next login" workflow is preserved as an explicit opt-in, and
 * login / authorization keep respecting must_change_password exactly as before.
 *
 * Usage: node worker/scripts/staff-reset-no-force-change-v140-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import worker from '../index.js';

const MARKER = 'STAFF_RESET_NO_FORCE_CHANGE_V140';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workerSrc = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
const adminHtml = fs.readFileSync(path.join(root, 'app/admin.html'), 'utf8');

let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

const TEST_PILOT_SECRET = 'test-secret-not-a-real-pilot-session-secret';
const TEST_GEPPETTO_BRIDGE = 'test-geppetto-bridge-secret-not-real';
const ORIGIN = 'https://tmslantern.org';
const SAFE_RETURN =
  'https://mrradle.us/api/stem-daily/student/lantern-callback?next=%2Fdigital-art.html';

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

async function cookieFor(acct) {
  const now = Math.floor(Date.now() / 1000);
  const token = await signTestJwt(
    { sub: acct.username, role: acct.role, iat: now, exp: now + 3600 },
    TEST_PILOT_SECRET
  );
  return `lantern_pilot=${token}`;
}

function tokenFromSetCookie(res) {
  const raw = res.headers.get('Set-Cookie') || '';
  const m = raw.match(/lantern_pilot=([^;]+)/);
  return m ? `lantern_pilot=${m[1]}` : '';
}

function account(overrides) {
  return {
    username: 'admin',
    display_name: 'Web Admin',
    role: 'admin',
    student_character_name: null,
    teacher_id: null,
    mtss_student_id: null,
    staff_id: null,
    is_active: 1,
    must_change_password: 0,
    password_hash: 'SEED_HASH',
    password_salt: 'SEED_SALT',
    ...overrides,
  };
}

function makeEnv(state) {
  state.accounts = state.accounts || {};
  state.mutations = [];
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
      async all() { return { results: Object.values(state.accounts) }; },
      async run() {
        // Prompt #140 staff reset: parameterized must_change_password + password_reset_by
        if (
          s.includes('UPDATE lantern_pilot_accounts SET password_hash') &&
          s.includes('password_reset_by = ?') &&
          s.includes('must_change_password = ?')
        ) {
          const [hash, salt, mcp, resetBy, username] = binds;
          const key = String(username || '').trim().toLowerCase();
          if (state.accounts[key]) {
            state.accounts[key] = {
              ...state.accounts[key],
              password_hash: hash,
              password_salt: salt,
              must_change_password: Number(mcp),
              password_reset_by: resetBy,
            };
            state.mutations.push({ type: 'staff_reset', username: key, mcp: Number(mcp) });
          }
          return { success: true, meta: { changes: 1 } };
        }
        // Legacy shape that must no longer exist: literal must_change_password = 1 on reset
        if (
          s.includes('UPDATE lantern_pilot_accounts SET password_hash') &&
          s.includes('password_reset_by = ?') &&
          s.includes('must_change_password = 1')
        ) {
          state.mutations.push({ type: 'legacy_forced_reset' });
          return { success: true, meta: { changes: 1 } };
        }
        // Self-service / forced-change completion: clears the flag
        if (
          s.includes('UPDATE lantern_pilot_accounts SET password_hash') &&
          s.includes('password_changed_at') &&
          s.includes('must_change_password = 0')
        ) {
          const [hash, salt, username] = binds;
          const key = String(username || '').trim().toLowerCase();
          if (state.accounts[key]) {
            state.accounts[key] = {
              ...state.accounts[key],
              password_hash: hash,
              password_salt: salt,
              must_change_password: 0,
            };
            state.mutations.push({ type: 'self_change', username: key });
          }
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes('INSERT INTO geppetto_student_handoffs')) {
          return { success: true, meta: { changes: 1 } };
        }
        return { success: true, meta: { changes: 0 } };
      },
    };
    return api;
  }
  return {
    DB: { prepare },
    PILOT_SESSION_SECRET: TEST_PILOT_SECRET,
    LANTERN_GEPPETTO_BRIDGE_SECRET: TEST_GEPPETTO_BRIDGE,
    GEPPETTO_ORIGIN_URL: 'https://mrradle.us',
    _state: state,
  };
}

function req(method, p, body, cookie) {
  const headers = { Cookie: cookie || '' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return new Request(ORIGIN + p, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function resetPassword(env, adminCookie, username, newPassword, extra) {
  return worker.fetch(
    req('POST', '/api/admin/users/reset-password', { username, new_password: newPassword, ...(extra || {}) }, adminCookie),
    env
  );
}

async function login(env, username, password) {
  return worker.fetch(req('POST', '/api/auth/login', { username, password }), env);
}

async function authorize(env, cookie) {
  const qs = new URLSearchParams({ return: SAFE_RETURN });
  return worker.fetch(
    new Request(`${ORIGIN}/api/auth/geppetto-student-authorize?${qs.toString()}`, {
      method: 'GET',
      headers: cookie ? { Cookie: cookie } : {},
    }),
    env
  );
}

/* -------------------- static / contract assertions -------------------- */

// Anchor on the reset-password handler body.
const resetIdx = workerSrc.indexOf("path === '/api/admin/users/reset-password'");
const resetBlock = resetIdx >= 0 ? workerSrc.slice(resetIdx, resetIdx + 2600) : '';

if (resetIdx >= 0) ok('reset-password handler present');
else bad('reset-password handler present');

if (resetBlock.includes(MARKER)) ok('reset handler carries ' + MARKER + ' marker');
else bad('reset handler carries marker');

if (!/must_change_password = 1/.test(resetBlock)) ok('routine staff reset never hard-codes must_change_password = 1');
else bad('routine staff reset still hard-codes must_change_password = 1', resetBlock);

if (
  resetBlock.includes('must_change_next_login === true') &&
  resetBlock.includes('force_must_change_password === true') &&
  /must_change_password = \?/.test(resetBlock)
) {
  ok('explicit force-change opt-in preserved on reset endpoint');
} else bad('explicit force-change opt-in missing on reset endpoint');

// Forced-change support elsewhere must remain intact.
if (/force_must_change_password === true \|\| body\.must_change_next_login === true/.test(workerSrc) &&
    /SET must_change_password = 1, password_reset_at/.test(workerSrc)) {
  ok('deliberate force-change workflow still present in /api/admin/users/update');
} else bad('deliberate force-change workflow missing from users/update');

// Forced-change completion path must still clear the flag.
if (/path === '\/api\/auth\/change-password'/.test(workerSrc) &&
    /must_change_password = 0, password_changed_at/.test(workerSrc)) {
  ok('/api/auth/change-password still clears must_change_password');
} else bad('change-password no longer clears flag');

// No global bypass: the predicate that gates login/authorize is unchanged.
if (/function pilotAccountRequiresChangePassword\(row\) \{[\s\S]{0,160}Number\(row\.must_change_password\) !== 0/.test(workerSrc)) {
  ok('no global must_change_password bypass — predicate intact');
} else bad('must_change_password predicate changed', 'possible global bypass');

// Authorization still enforces the flag.
const authCount = (workerSrc.match(/pilotAccountRequiresChangePassword\(/g) || []).length;
if (authCount >= 5) ok('must_change_password still enforced across auth surfaces (' + authCount + ' call sites)');
else bad('must_change_password enforcement call sites dropped', authCount);

// Admin UI copy no longer promises a forced change on a routine reset.
if (!/choose their own password before the rest of the app unlocks/.test(adminHtml)) {
  ok('admin reset success copy no longer promises a forced password change');
} else bad('admin reset success copy still promises forced change');

/* -------------------- behavioral assertions -------------------- */

async function run() {
  const admin = account();
  const student = account({
    username: '100200',
    display_name: 'Test Student',
    role: 'student',
    mtss_student_id: '100200300',
    must_change_password: 0,
  });
  const teacher = account({ username: 'ms_carter', role: 'teacher' });
  const disabled = account({
    username: '200300',
    role: 'student',
    mtss_student_id: '200300400',
    is_active: 0,
  });
  const state = {
    accounts: { admin, '100200': student, ms_carter: teacher, '200300': disabled },
  };
  const env = makeEnv(state);
  const adminCookie = await cookieFor(admin);
  const teacherCookie = await cookieFor(teacher);

  const OLD_PW = 'old-classroom-pw-1';
  const NEW_PW = 'new-classroom-pw-2';
  const NEW_PW2 = 'new-classroom-pw-3';
  const SELF_PW = 'student-chosen-pw-4';

  // Seed a known "old" password through the same handler (also proves the
  // ordinary path does not set the flag).
  {
    const res = await resetPassword(env, adminCookie, '100200', OLD_PW);
    const body = await res.json();
    if (res.status === 200 && body.ok) ok('1. ordinary staff reset writes the new password');
    else bad('1. ordinary staff reset writes the new password', JSON.stringify(body));
    if (state.accounts['100200'].must_change_password === 0 && body.must_change_password === false) {
      ok('2. ordinary staff reset does not set must_change_password');
    } else bad('2. ordinary staff reset does not set must_change_password', state.accounts['100200'].must_change_password);
  }

  // Login with the seeded password works and is not flagged.
  {
    const res = await login(env, '100200', OLD_PW);
    const body = await res.json();
    if (res.status === 200 && body.ok && body.must_change_password === false) {
      ok('login with freshly reset password succeeds without a forced-change flag');
    } else bad('login with freshly reset password', JSON.stringify(body));
  }

  // Now the real classroom action: admin resets to a brand-new password.
  {
    const res = await resetPassword(env, adminCookie, '100200', NEW_PW);
    const body = await res.json();
    if (res.status === 200 && body.ok && body.must_change_password === false) ok('routine reset to a new password stays unflagged');
    else bad('routine reset to a new password stays unflagged', JSON.stringify(body));
  }

  {
    const res = await login(env, '100200', OLD_PW);
    const body = await res.json();
    if (res.status === 401 && !body.ok) ok('3. old password no longer authenticates after reset');
    else bad('3. old password no longer authenticates', res.status + ' ' + JSON.stringify(body));
  }

  let studentSession = '';
  {
    const res = await login(env, '100200', NEW_PW);
    const body = await res.json();
    studentSession = tokenFromSetCookie(res);
    if (res.status === 200 && body.ok) ok('4. new password authenticates after reset');
    else bad('4. new password authenticates', JSON.stringify(body));
    if (body.must_change_password === false) ok('9. ordinary login after staff reset is not redirected to forced password change');
    else bad('9. login after staff reset still forces password change', JSON.stringify(body));
  }

  // Session invalidation on reset: a session minted with the OLD password can no
  // longer be re-established, and a re-reset flips the credential again.
  {
    const beforeHash = state.accounts['100200'].password_hash;
    await resetPassword(env, adminCookie, '100200', NEW_PW2);
    const afterHash = state.accounts['100200'].password_hash;
    const stale = await login(env, '100200', NEW_PW);
    const staleBody = await stale.json();
    if (beforeHash !== afterHash && stale.status === 401 && !staleBody.ok) {
      ok('5. password reset rotates the credential so prior passwords/sessions cannot be re-minted');
    } else bad('5. reset does not rotate the credential', beforeHash + ' / ' + afterHash + ' / ' + stale.status);
  }

  // Re-authenticate on the current password for the Geppetto checks.
  {
    const res = await login(env, '100200', NEW_PW2);
    studentSession = tokenFromSetCookie(res);
    const body = await res.json();
    if (res.status === 200 && body.ok && studentSession) ok('student re-auth on current password for handoff checks');
    else bad('student re-auth on current password', JSON.stringify(body));
  }

  // Geppetto authorization proceeds once the (unflagged) student is authenticated.
  {
    const res = await authorize(env, studentSession);
    const loc = res.headers.get('Location') || '';
    if (res.status === 302 && /[?&]code=/.test(loc) && loc.startsWith('https://mrradle.us/')) {
      ok('10. Geppetto authorization is allowed after the new password authenticates');
    } else bad('10. Geppetto authorization after reset', res.status + ' ' + loc);
  }

  // Disabled accounts stay disabled even after a reset.
  {
    const res = await resetPassword(env, adminCookie, '200300', NEW_PW);
    const body = await res.json();
    const rl = await login(env, '200300', NEW_PW);
    const rlBody = await rl.json();
    if (res.status === 200 && body.ok && rl.status === 403 && rlBody.error === 'account_disabled') {
      ok('6. disabled accounts remain disabled after a reset');
    } else bad('6. disabled account state', res.status + ' / ' + rl.status + ' ' + JSON.stringify(rlBody));
  }

  // Endpoint guardrails (authorization + validation) unchanged.
  {
    const nonAdmin = await resetPassword(env, teacherCookie, '100200', NEW_PW);
    const nonAdminBody = await nonAdmin.json();
    if (nonAdmin.status === 403 && nonAdminBody.error === 'forbidden') ok('7a. non-admin cannot call the staff reset endpoint');
    else bad('7a. non-admin reset not blocked', nonAdmin.status + ' ' + JSON.stringify(nonAdminBody));

    const noSession = await worker.fetch(req('POST', '/api/admin/users/reset-password', { username: '100200', new_password: NEW_PW }), env);
    if (noSession.status === 403) ok('7b. unauthenticated reset is refused');
    else bad('7b. unauthenticated reset not refused', noSession.status);

    const short = await resetPassword(env, adminCookie, '100200', 'short');
    const shortBody = await short.json();
    if (short.status === 400 && shortBody.error === 'username_and_password_required') ok('7c. minimum password length still enforced');
    else bad('7c. min length not enforced', short.status + ' ' + JSON.stringify(shortBody));

    const missing = await resetPassword(env, adminCookie, 'no-such-user', NEW_PW);
    const missingBody = await missing.json();
    if (missing.status === 404 && missingBody.error === 'not_found') ok('7d. unknown account returns not_found');
    else bad('7d. unknown account handling', missing.status + ' ' + JSON.stringify(missingBody));
  }

  // Generic auth errors preserved: wrong password is an opaque 401.
  {
    const res = await login(env, '100200', 'definitely-wrong-pw');
    const body = await res.json();
    if (res.status === 401 && body.error === 'Invalid credentials') ok('8. generic auth error preserved for a bad password');
    else bad('8. generic auth error', res.status + ' ' + JSON.stringify(body));
  }

  // ----- Explicit force-change workflow still works end to end -----
  {
    const res = await resetPassword(env, adminCookie, '100200', NEW_PW, { must_change_next_login: true });
    const body = await res.json();
    if (res.status === 200 && body.ok && body.must_change_password === true && state.accounts['100200'].must_change_password === 1) {
      ok('explicit opt-in reset sets must_change_password = 1');
    } else bad('explicit opt-in reset', JSON.stringify(body) + ' flag=' + state.accounts['100200'].must_change_password);
  }

  let flaggedSession = '';
  {
    const res = await login(env, '100200', NEW_PW);
    flaggedSession = tokenFromSetCookie(res);
    const body = await res.json();
    if (res.status === 200 && body.ok && body.must_change_password === true) {
      ok('15. deliberately flagged account is still told to change at next login');
    } else bad('15. flagged account not forced', JSON.stringify(body));
  }

  {
    const res = await authorize(env, flaggedSession);
    const loc = res.headers.get('Location') || '';
    if (res.status === 302 && loc.includes('/change-password.html') && !/[?&]code=/.test(loc)) {
      ok('11. Geppetto authorization still refuses a genuinely flagged account');
    } else bad('11. Geppetto authorization for flagged account', res.status + ' ' + loc);
  }

  {
    const res = await worker.fetch(
      req('POST', '/api/auth/change-password', { new_password: SELF_PW }, flaggedSession),
      env
    );
    const body = await res.json();
    if (res.status === 200 && body.ok && state.accounts['100200'].must_change_password === 0) {
      ok('12. forced-change flow still clears the flag after a successful password change');
    } else bad('12. forced-change completion', JSON.stringify(body) + ' flag=' + state.accounts['100200'].must_change_password);
  }

  {
    const relog = await login(env, '100200', SELF_PW);
    const relogBody = await relog.json();
    const res = await authorize(env, tokenFromSetCookie(relog));
    const loc = res.headers.get('Location') || '';
    if (relog.status === 200 && relogBody.must_change_password === false && res.status === 302 && /[?&]code=/.test(loc)) {
      ok('16. completing the forced-change flow unblocks Geppetto authorization');
    } else bad('16. post forced-change authorization', relog.status + ' / ' + res.status + ' ' + loc);
  }

  // No accidental global bypass: an account left flagged (never reset, never
  // completed) is still blocked.
  {
    state.accounts['100200'].must_change_password = 1;
    const relog = await login(env, '100200', SELF_PW);
    const relogBody = await relog.json();
    const res = await authorize(env, tokenFromSetCookie(relog));
    const loc = res.headers.get('Location') || '';
    if (relogBody.must_change_password === true && loc.includes('/change-password.html')) {
      ok('13. no global must_change_password bypass — a still-flagged account stays blocked');
    } else bad('13. still-flagged account leaked through', JSON.stringify(relogBody) + ' ' + loc);
    state.accounts['100200'].must_change_password = 0;
  }
}

await run();

console.log('\n' + MARKER + ': ' + pass + ' PASS ' + fail + ' FAIL');
if (fail) process.exit(1);
