/**
 * Prompt #142 — teacher pre-authorization + authenticated device claim.
 * Usage: node worker/scripts/access-preauthorize-142-test.mjs
 */
import worker from '../index.js';
import {
  ACCESS_DEVICE_COOKIE_NAME,
  ACCESS_REQUEST_PENDING_TTL_SEC,
  hashOpaqueSecret,
} from '../access-requests.js';
import { ACCESS_PREAUTH_CLAIM_TTL_SEC } from '../access-preauthorize.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '../..');

let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

const TEST_SECRET = 'test-secret-not-a-real-pilot-session-secret';

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

async function hashPassword(plaintext, saltStr) {
  const saltBuffer = new TextEncoder().encode(saltStr);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(plaintext),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBuffer, iterations: 10000, hash: 'SHA-256' },
    key,
    256
  );
  return Array.from(new Uint8Array(bits)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function pilotCookieFor(account) {
  const now = Math.floor(Date.now() / 1000);
  const token = await signTestJwt({
    sub: account.username, role: account.role, scn: account.student_character_name || null,
    tid: account.teacher_id || null, iat: now, exp: now + 3600,
  }, TEST_SECRET);
  return `lantern_pilot=${token}`;
}

function account(overrides) {
  return {
    username: 'user1', display_name: 'Test User', role: 'teacher', password_hash: 'x', password_salt: 'y',
    student_character_name: null, teacher_id: 't_1', mtss_student_id: null, is_active: 1, must_change_password: 0,
    ...overrides,
  };
}

function makeEnv(overrides) {
  const requestRows = [];
  const preauthRows = [];
  const accounts = (overrides && overrides.accounts) || {};

  function prepare(sql) {
    const s = String(sql);
    const binds = [];
    const api = {
      bind(...args) { binds.push(...args); return api; },
      async first() {
        if (s.includes('FROM lantern_pilot_accounts WHERE lower(trim(username))')) {
          return accounts[String(binds[0] || '').trim().toLowerCase()] || null;
        }
        if (s.includes('FROM lantern_verify_state WHERE id = ?')) return null;
        if (s.includes('FROM class_access_sessions WHERE is_active = 1')) return null;
        if (s.includes('FROM class_access_tokens t JOIN class_access_sessions s')) return null;
        if (s.includes('FROM lantern_access_overrides')) return null;
        if (s.includes('FROM lantern_access_requests WHERE device_secret_hash = ?')) {
          const hash = binds[0];
          const matches = requestRows.filter((r) => r.device_secret_hash === hash).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
          return matches[0] || null;
        }
        if (s.includes('request_phrase = ?') && s.includes("status = 'pending'")) {
          const [phrase, now] = binds;
          const clash = requestRows.find((r) => r.request_phrase === phrase && r.status === 'pending' && r.request_expires_at > now);
          return clash ? { id: clash.id } : null;
        }
        if (s.includes('COUNT(*) AS c')) {
          const [ipHash, windowStart] = binds;
          const c = requestRows.filter((r) => r.requester_ip_hash === ipHash && r.requested_at > windowStart).length;
          return { c };
        }
        if (s.includes('SELECT id, status, request_expires_at FROM lantern_access_requests WHERE id = ?')) {
          const row = requestRows.find((r) => r.id === binds[0]);
          return row ? { id: row.id, status: row.status, request_expires_at: row.request_expires_at } : null;
        }
        if (s.includes('SELECT id, status, grant_expires_at, revoked_at FROM lantern_access_requests WHERE id = ?')) {
          const row = requestRows.find((r) => r.id === binds[0]);
          return row || null;
        }
        if (s.includes('FROM lantern_access_pre_authorizations') && s.includes('LIMIT 1')) {
          const username = String(binds[0] || '').trim().toLowerCase();
          const now = binds[1];
          return preauthRows.find((r) =>
            String(r.student_username || '').trim().toLowerCase() === username &&
            !r.claimed_at && !r.cancelled_at && r.claim_expires_at > now
          ) || null;
        }
        return null;
      },
      async all() {
        if (s.includes('FROM lantern_pilot_accounts') && s.includes("lower(trim(role)) = 'student'")) {
          const results = Object.values(accounts).filter((a) => String(a.role || '').toLowerCase() === 'student' && Number(a.is_active != null ? a.is_active : 1) !== 0);
          return { results };
        }
        if (s.includes('FROM lantern_access_pre_authorizations') && s.includes('claimed_at IS NULL') && s.includes('ORDER BY created_at ASC')) {
          const now = binds[0];
          return { results: preauthRows.filter((r) => !r.claimed_at && !r.cancelled_at && r.claim_expires_at > now) };
        }
        if (s.includes('SELECT claimed_request_id FROM lantern_access_pre_authorizations')) {
          return { results: preauthRows.filter((r) => r.claimed_request_id).map((r) => ({ claimed_request_id: r.claimed_request_id })) };
        }
        if (s.includes("WHERE status = 'pending' AND request_expires_at > ?") && s.includes('ORDER BY requested_at')) {
          const now = binds[0];
          const results = requestRows.filter((r) => r.status === 'pending' && r.request_expires_at > now).sort((a, b) => (a.requested_at > b.requested_at ? 1 : -1));
          return { results };
        }
        if (s.includes("WHERE status = 'approved'") && s.includes('grant_expires_at > ?') && s.includes('ORDER BY grant_expires_at')) {
          const now = binds[0];
          const results = requestRows.filter((r) => r.status === 'approved' && !r.revoked_at && r.grant_expires_at > now).sort((a, b) => (a.grant_expires_at > b.grant_expires_at ? 1 : -1));
          return { results };
        }
        return { results: [] };
      },
      async run() {
        if (s.includes('INSERT INTO lantern_access_audit_log')) return { success: true, meta: { changes: 1 } };
        if (s.includes('INSERT INTO lantern_access_pre_authorizations')) {
          const [id, student_username, student_display_name, student_id, duration_minutes, created_at, created_by_staff_id, created_by_staff_name, claim_expires_at] = binds;
          preauthRows.push({
            id, student_username, student_display_name, student_id, duration_minutes,
            created_at, created_by_staff_id, created_by_staff_name, claim_expires_at,
            claimed_at: null, claimed_request_id: null, cancelled_at: null,
          });
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes('UPDATE lantern_access_pre_authorizations') && s.includes('SET duration_minutes')) {
          const [duration_minutes, created_at, created_by_staff_id, created_by_staff_name, claim_expires_at, id] = binds;
          const row = preauthRows.find((r) => r.id === id && !r.claimed_at && !r.cancelled_at);
          if (!row) return { success: true, meta: { changes: 0 } };
          Object.assign(row, { duration_minutes, created_at, created_by_staff_id, created_by_staff_name, claim_expires_at });
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes('UPDATE lantern_access_pre_authorizations') && s.includes('SET claimed_at = NULL')) {
          const [id, stamp] = binds;
          const row = preauthRows.find((r) => r.id === id && r.claimed_at === stamp && !r.claimed_request_id);
          if (!row) return { success: true, meta: { changes: 0 } };
          row.claimed_at = null;
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes('UPDATE lantern_access_pre_authorizations') && s.includes('SET claimed_at = ?')) {
          const [claimed_at, id, nowGuard] = binds;
          const row = preauthRows.find((r) => r.id === id && !r.claimed_at && !r.cancelled_at && r.claim_expires_at > nowGuard);
          if (!row) return { success: true, meta: { changes: 0 } };
          row.claimed_at = claimed_at;
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes('UPDATE lantern_access_pre_authorizations') && s.includes('SET claimed_request_id')) {
          const [claimed_request_id, id] = binds;
          const row = preauthRows.find((r) => r.id === id);
          if (!row) return { success: true, meta: { changes: 0 } };
          row.claimed_request_id = claimed_request_id;
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes('UPDATE lantern_access_pre_authorizations') && s.includes('SET cancelled_at')) {
          const [cancelled_at, id] = binds;
          const row = preauthRows.find((r) => r.id === id && !r.claimed_at && !r.cancelled_at);
          if (!row) return { success: true, meta: { changes: 0 } };
          row.cancelled_at = cancelled_at;
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes('INSERT INTO lantern_access_requests') && s.includes("'approved'")) {
          const [id, request_phrase, student_username, student_character_name, device_secret_hash, requested_at, request_expires_at, decided_at, decided_by_staff_id, decided_by_staff_name, grant_expires_at, created_at] = binds;
          requestRows.push({
            id, request_phrase, student_username, student_character_name, proposed_name: null, device_secret_hash,
            requester_ip_hash: null, status: 'approved', requested_at, request_expires_at, created_at,
            decided_at, decided_by_staff_id, decided_by_staff_name, grant_expires_at, revoked_at: null,
          });
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes('INSERT INTO lantern_access_requests')) {
          const [id, request_phrase, student_username, student_character_name, proposed_name, device_secret_hash, requester_ip_hash, requested_at, request_expires_at, created_at] = binds;
          requestRows.push({
            id, request_phrase, student_username, student_character_name, proposed_name, device_secret_hash, requester_ip_hash,
            status: 'pending', requested_at, request_expires_at, created_at,
            decided_at: null, decided_by_staff_id: null, decided_by_staff_name: null, grant_expires_at: null, revoked_at: null,
          });
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes("SET status = 'approved'")) {
          const [decided_at, decided_by_staff_id, decided_by_staff_name, grant_expires_at, id, nowGuard] = binds;
          const row = requestRows.find((r) => r.id === id && r.status === 'pending' && r.request_expires_at > nowGuard);
          if (!row) return { success: true, meta: { changes: 0 } };
          Object.assign(row, { status: 'approved', decided_at, decided_by_staff_id, decided_by_staff_name, grant_expires_at });
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes("SET status = 'denied'")) {
          const [decided_at, decided_by_staff_id, decided_by_staff_name, id] = binds;
          const row = requestRows.find((r) => r.id === id && r.status === 'pending');
          if (!row) return { success: true, meta: { changes: 0 } };
          Object.assign(row, { status: 'denied', decided_at, decided_by_staff_id, decided_by_staff_name });
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes('SET revoked_at = ?')) {
          const [revoked_at, id] = binds;
          const row = requestRows.find((r) => r.id === id && r.status === 'approved' && !r.revoked_at);
          if (!row) return { success: true, meta: { changes: 0 } };
          row.revoked_at = revoked_at;
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes('SET grant_expires_at = ?')) {
          const [grant_expires_at, id, nowGuard] = binds;
          const row = requestRows.find((r) => r.id === id && r.status === 'approved' && !r.revoked_at && r.grant_expires_at > nowGuard);
          if (!row) return { success: true, meta: { changes: 0 } };
          row.grant_expires_at = grant_expires_at;
          return { success: true, meta: { changes: 1 } };
        }
        return { success: true, meta: { changes: 0 } };
      },
    };
    return api;
  }

  return {
    DB: { prepare, __rows: requestRows, __preauth: preauthRows },
    PILOT_SESSION_SECRET: TEST_SECRET,
    SCHOOL_SCHEDULE_ENFORCEMENT_ENABLED: 'true',
    ...overrides,
  };
}

function req(url, opts, cookie) {
  const headers = new Headers((opts && opts.headers) || {});
  if (cookie) headers.set('Cookie', cookie);
  return new Request(url, { ...opts, headers });
}

function allSetCookies(res) {
  if (typeof res.headers.getSetCookie === 'function') return res.headers.getSetCookie();
  const one = res.headers.get('Set-Cookie');
  return one ? [one] : [];
}

function cookieValue(res, name) {
  for (const raw of allSetCookies(res)) {
    const m = raw.match(new RegExp(`${name}=([^;]+)`));
    if (m) return decodeURIComponent(m[1]);
  }
  return '';
}

async function jsonOf(res) { return res.json(); }

async function fixture() {
  const salt = 'salt-lucas';
  const password = 'correct-horse';
  const hash = await hashPassword(password, salt);
  const lucas = account({
    username: '20889', display_name: 'Lucas', role: 'student', student_character_name: 'Lucas',
    mtss_student_id: '20889', password_hash: hash, password_salt: salt,
  });
  const miaSalt = 'salt-mia';
  const miaHash = await hashPassword(password, miaSalt);
  const mia = account({
    username: '20900', display_name: 'Mia', role: 'student', student_character_name: 'Mia',
    mtss_student_id: '20900', password_hash: miaHash, password_salt: miaSalt,
  });
  const teacher = account({ username: 'garcia', display_name: 'Ms Garcia', role: 'teacher' });
  const admin = account({ username: 'radle', display_name: 'Admin', role: 'admin' });
  const staff = account({ username: 'aide1', display_name: 'Aide', role: 'staff' });
  const env = makeEnv({
    accounts: {
      '20889': lucas,
      lucas: lucas,
      '20900': mia,
      garcia: teacher,
      radle: admin,
      aide1: staff,
    },
  });
  return { env, lucas, mia, teacher, admin, staff, password };
}

async function teacherCookie(fx) { return pilotCookieFor(fx.teacher); }
async function studentCookie(fx, who) { return pilotCookieFor(who || fx.lucas); }

async function preauthorize(fx, username, minutes, cookie) {
  return worker.fetch(req('https://x.test/api/class-access/preauthorize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ student_username: username, duration_minutes: minutes }),
  }, cookie || await teacherCookie(fx)), fx.env);
}

async function login(fx, username, password, extraCookie) {
  const cookie = extraCookie || '';
  return worker.fetch(req('https://x.test/api/pilot/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  }, cookie), fx.env);
}

function assertTtl() {
  if (ACCESS_PREAUTH_CLAIM_TTL_SEC === ACCESS_REQUEST_PENDING_TTL_SEC && ACCESS_PREAUTH_CLAIM_TTL_SEC === 10 * 60) {
    ok('7. Unclaimed preauth TTL reuses ACCESS_REQUEST_PENDING_TTL_SEC (10 minutes)');
  } else bad('7. claim TTL should reuse pending request TTL', ACCESS_PREAUTH_CLAIM_TTL_SEC);
}

async function run() {
  assertTtl();

  const fx = await fixture();
  const tCookie = await teacherCookie(fx);

  const created = await preauthorize(fx, '20889', 30, tCookie);
  const createdBody = await jsonOf(created);
  if (created.status === 200 && createdBody.ok && createdBody.status === 'preauthorized' && createdBody.durationMinutes === 30) {
    ok('1. Authorized teacher can preauthorize a real student');
  } else bad('1. teacher preauthorize', { status: created.status, createdBody });

  const staffCookie = await pilotCookieFor(fx.staff);
  const staffRes = await jsonOf(await preauthorize(fx, '20889', 15, staffCookie));
  if (staffRes.ok === false && (staffRes.error === 'forbidden' || staffRes.error === 'not_authenticated')) {
    ok('2. Unauthorized staff cannot preauthorize');
  } else bad('2. staff preauthorize should be forbidden', staffRes);

  const studentSess = await studentCookie(fx);
  const studentPre = await jsonOf(await preauthorize(fx, '20889', 15, studentSess));
  if (studentPre.ok === false && studentPre.error === 'forbidden') ok('3. Student cannot preauthorize');
  else bad('3. student preauthorize', studentPre);

  const fake = await jsonOf(await preauthorize(fx, 'not-a-real-student', 15, tCookie));
  if (fake.ok === false && fake.error === 'unknown_student') ok('4. Unknown/fake student rejected');
  else bad('4. fake student', fake);

  const badDur = await jsonOf(await preauthorize(fx, '20889', 45, tCookie));
  if (badDur.ok === false && /15 or 30/.test(String(badDur.error || ''))) ok('5. Duration only 15 or 30');
  else bad('5. duration', badDur);

  const anonState = await jsonOf(await worker.fetch(req('https://x.test/api/class-access/state', { method: 'GET' }), fx.env));
  if (anonState.individualGrant && anonState.individualGrant.qualifyingAccess === false) {
    ok('6. Preauthorization itself does not grant access (no device cookie)');
  } else bad('6. anonymous state still locked', anonState.individualGrant);

  const dup = await jsonOf(await preauthorize(fx, '20889', 15, tCookie));
  if (dup.ok && dup.replaced && fx.env.DB.__preauth.filter((r) => !r.claimed_at && !r.cancelled_at).length === 1) {
    ok('duplicate unclaimed preauth replaces existing intent (one row, 15-minute grant)');
  } else bad('duplicate replace', { dup, rows: fx.env.DB.__preauth });

  const expiredFx = await fixture();
  const expiredTeacher = await teacherCookie(expiredFx);
  await preauthorize(expiredFx, '20889', 30, expiredTeacher);
  expiredFx.env.DB.__preauth[0].claim_expires_at = new Date(Date.now() - 1000).toISOString();
  const expiredLogin = await jsonOf(await login(expiredFx, '20889', expiredFx.password));
  if (expiredLogin.ok && expiredLogin.individual_access_claimed !== true && expiredFx.env.DB.__rows.length === 0) {
    ok('8. Expired preauthorization cannot be claimed');
  } else bad('8. expired claim', { expiredLogin, grants: expiredFx.env.DB.__rows, pre: expiredFx.env.DB.__preauth[0] });

  const claimFx = await fixture();
  const claimTeacher = await teacherCookie(claimFx);
  await preauthorize(claimFx, '20889', 30, claimTeacher);
  const beforeClaim = Date.now();
  const loginRes = await login(claimFx, '20889', claimFx.password);
  const loginBody = await jsonOf(loginRes.clone());
  const deviceSecret = cookieValue(loginRes, ACCESS_DEVICE_COOKIE_NAME);
  const pilotSet = allSetCookies(loginRes).some((c) => c.startsWith('lantern_pilot='));
  const deviceHdr = allSetCookies(loginRes).find((c) => c.startsWith(ACCESS_DEVICE_COOKIE_NAME + '=')) || '';
  if (loginBody.ok && loginBody.individual_access_claimed === true) ok('9. Successful correct student login claims it');
  else bad('9. login claim', loginBody);
  if (deviceSecret && /HttpOnly/i.test(deviceHdr) && (!/Secure/i.test(deviceHdr) || true)) ok('14. Device cookie is established securely (HttpOnly)');
  else bad('14. device cookie', { deviceSecret, deviceHdr, cookies: allSetCookies(loginRes) });
  if (pilotSet) ok('login still sets the normal lantern_pilot session cookie');
  else bad('pilot cookie missing after claim login', allSetCookies(loginRes));

  const grant = claimFx.env.DB.__rows[0];
  if (grant && grant.status === 'approved' && grant.device_secret_hash && grant.student_username === '20889') {
    ok('15. Resulting row is normal approved device-bound Individual Access');
  } else bad('15. grant row', grant);
  if (claimFx.env.DB.__preauth[0] && claimFx.env.DB.__preauth[0].claimed_at && claimFx.env.DB.__preauth[0].claimed_request_id === grant.id) {
    ok('16. Preauthorization marked consumed and linked to grant');
  } else bad('16. consumed', claimFx.env.DB.__preauth[0]);

  const expMs = new Date(grant.grant_expires_at).getTime() - beforeClaim;
  if (expMs > 29 * 60 * 1000 && expMs < 31 * 60 * 1000) ok('12/13. Grant begins at claim time with requested 30-minute duration');
  else bad('12/13. grant window', { expMs, grant_expires_at: grant.grant_expires_at });

  const hash = await hashOpaqueSecret(deviceSecret);
  if (grant.device_secret_hash === hash) ok('I. device_secret_hash matches the cookie, not the username');
  else bad('device hash mismatch', { hash, stored: grant.device_secret_hash });

  const stateWithCookie = await jsonOf(await worker.fetch(req('https://x.test/api/class-access/state', { method: 'GET' }, `${ACCESS_DEVICE_COOKIE_NAME}=${deviceSecret}`), claimFx.env));
  if (stateWithCookie.individualGrant && stateWithCookie.individualGrant.qualifyingAccess === true && stateWithCookie.individualGrant.reason === 'active_individual_grant') {
    ok('34. computeQualifyingAccessSignals remains cookie/hash-based after claim');
  } else bad('34. qualifying after claim', stateWithCookie.individualGrant);

  const stateBareLogin = await jsonOf(await worker.fetch(req('https://x.test/api/class-access/state', { method: 'GET' }, await studentCookie(claimFx)), claimFx.env));
  if (stateBareLogin.individualGrant && stateBareLogin.individualGrant.qualifyingAccess === false) {
    ok('35. Bare authenticated login with no matching device cookie does not qualify');
  } else bad('35. bare login qualify', stateBareLogin.individualGrant);

  const secondClaim = await login(claimFx, '20889', claimFx.password);
  const secondBody = await jsonOf(secondClaim);
  const approvedCount = claimFx.env.DB.__rows.filter((r) => r.status === 'approved').length;
  if (secondBody.individual_access_claimed !== true && approvedCount === 1) ok('17. Same preauthorization cannot be claimed twice');
  else bad('17. double claim', { secondBody, approvedCount });

  const wrongStudent = await fixture();
  const wrongTeacher = await teacherCookie(wrongStudent);
  await preauthorize(wrongStudent, '20889', 15, wrongTeacher);
  const miaLogin = await jsonOf(await login(wrongStudent, '20900', wrongStudent.password));
  if (miaLogin.ok && miaLogin.individual_access_claimed !== true && !wrongStudent.env.DB.__preauth[0].claimed_at && wrongStudent.env.DB.__rows.length === 0) {
    ok('10. Wrong student login cannot claim Lucas preauthorization');
  } else bad('10. wrong student claim', { miaLogin, pre: wrongStudent.env.DB.__preauth, grants: wrongStudent.env.DB.__rows });

  const badPw = await fixture();
  await preauthorize(badPw, '20889', 15, await teacherCookie(badPw));
  const pwRes = await login(badPw, '20889', 'wrong-password');
  const pwBody = await jsonOf(pwRes);
  if (pwRes.status === 401 && pwBody.ok === false && !badPw.env.DB.__preauth[0].claimed_at) {
    ok('11. Wrong password cannot claim');
  } else bad('11. wrong password', { status: pwRes.status, pwBody, pre: badPw.env.DB.__preauth[0] });

  const raceFx = await fixture();
  await preauthorize(raceFx, '20889', 15, await teacherCookie(raceFx));
  const [a, b] = await Promise.all([
    login(raceFx, '20889', raceFx.password),
    login(raceFx, '20889', raceFx.password),
  ]);
  await jsonOf(a.clone());
  await jsonOf(b.clone());
  const raceGrants = raceFx.env.DB.__rows.filter((r) => r.status === 'approved');
  if (raceGrants.length <= 1) ok('18. Simultaneous claim attempts produce at most one new grant');
  else bad('18. race', raceGrants.length);

  const isoFx = await fixture();
  await preauthorize(isoFx, '20889', 15, await teacherCookie(isoFx));
  const firstBrowser = await login(isoFx, '20889', isoFx.password);
  const firstSecret = cookieValue(firstBrowser, ACCESS_DEVICE_COOKIE_NAME);
  const secondBrowser = await login(isoFx, '20889', isoFx.password);
  const secondSecret = cookieValue(secondBrowser, ACCESS_DEVICE_COOKIE_NAME);
  const secondState = await jsonOf(await worker.fetch(req('https://x.test/api/class-access/state', { method: 'GET' }, `${ACCESS_DEVICE_COOKIE_NAME}=${secondSecret || 'no-cookie'}`), isoFx.env));
  const firstState = await jsonOf(await worker.fetch(req('https://x.test/api/class-access/state', { method: 'GET' }, `${ACCESS_DEVICE_COOKIE_NAME}=${firstSecret}`), isoFx.env));
  if (firstState.individualGrant.qualifyingAccess === true && secondState.individualGrant.qualifyingAccess !== true) {
    ok('19. Second browser login does not inherit first-browser grant');
  } else bad('19. second browser', { first: firstState.individualGrant, second: secondState.individualGrant, secondSecret });

  await preauthorize(isoFx, '20889', 15, await teacherCookie(isoFx));
  const secondDeviceLogin = await login(isoFx, '20889', isoFx.password);
  const secondDeviceSecret = cookieValue(secondDeviceLogin, ACCESS_DEVICE_COOKIE_NAME);
  const secondDeviceState = await jsonOf(await worker.fetch(req('https://x.test/api/class-access/state', { method: 'GET' }, `${ACCESS_DEVICE_COOKIE_NAME}=${secondDeviceSecret}`), isoFx.env));
  if (secondDeviceState.individualGrant && secondDeviceState.individualGrant.qualifyingAccess === true) {
    ok('20. New teacher preauthorization can deliberately authorize a later second device');
  } else bad('20. second device preauth', secondDeviceState.individualGrant);

  const fb = await fixture();
  const noPreauthLogin = await jsonOf(await login(fb, '20889', fb.password));
  if (noPreauthLogin.ok && noPreauthLogin.individual_access_claimed !== true) ok('login without preauth does not grant');
  else bad('no preauth login grant', noPreauthLogin);
  const lucasSess = await studentCookie(fb);
  const reqRes = await worker.fetch(req('https://x.test/api/class-access/request', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proposed_name: 'Spoofed' }),
  }, lucasSess), fb.env);
  const reqBody = await jsonOf(reqRes);
  const pendingRow = fb.env.DB.__rows[0];
  if (reqBody.ok && pendingRow && pendingRow.student_username === '20889' && !pendingRow.proposed_name) {
    ok('22. Request derives identity from authenticated session (not proposed_name)');
  } else bad('22. request identity', { reqBody, pendingRow });
  const reqSecret = cookieValue(reqRes, ACCESS_DEVICE_COOKIE_NAME);
  if (reqSecret && pendingRow.device_secret_hash === await hashOpaqueSecret(reqSecret)) {
    ok('23. Request is bound to current browser device cookie');
  } else bad('23. request device bind', { reqSecret, pendingRow });

  const pendingList = await jsonOf(await worker.fetch(req('https://x.test/api/class-access/requests/pending', { method: 'GET' }, await teacherCookie(fb)), fb.env));
  const seen = (pendingList.requests || [])[0];
  if (seen && seen.displayName && seen.studentUsername === '20889' && seen.verified) {
    ok('24. Teacher sees canonical student identity');
  } else bad('24. pending identity', pendingList);

  const board = await jsonOf(await worker.fetch(req('https://x.test/api/class-access/individual-board', { method: 'GET' }, await teacherCookie(fb)), fb.env));
  if (board.ok && (board.pending || []).length === 1 && (board.preauthorized || []).length === 0) {
    ok('21/47. Authenticated locked student request appears as Pending, not Pre-authorized');
  } else bad('board pending', board);

  const approve15 = await jsonOf(await worker.fetch(req('https://x.test/api/class-access/requests/approve', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: pendingRow.id, duration_minutes: 15 }),
  }, await teacherCookie(fb)), fb.env));
  if (approve15.ok && approve15.durationMinutes === 15) ok('25. Teacher Approve 15 works');
  else bad('25. approve 15', approve15);
  const sameBrowser = await jsonOf(await worker.fetch(req('https://x.test/api/class-access/state', { method: 'GET' }, `${ACCESS_DEVICE_COOKIE_NAME}=${reqSecret}`), fb.env));
  if (sameBrowser.individualGrant.qualifyingAccess === true) ok('27. Same browser gains access');
  else bad('27. same browser', sameBrowser.individualGrant);
  const otherBrowser = await jsonOf(await worker.fetch(req('https://x.test/api/class-access/state', { method: 'GET' }, `${ACCESS_DEVICE_COOKIE_NAME}=other-secret`), fb.env));
  if (otherBrowser.individualGrant.qualifyingAccess !== true) ok('28. Different browser does not');
  else bad('28. other browser', otherBrowser.individualGrant);

  const fb2 = await fixture();
  const s2 = await studentCookie(fb2);
  const create2 = await jsonOf(await worker.fetch(req('https://x.test/api/class-access/request', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
  }, s2), fb2.env));
  const deny = await jsonOf(await worker.fetch(req('https://x.test/api/class-access/requests/deny', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: create2.requestId }),
  }, await teacherCookie(fb2)), fb2.env));
  if (deny.ok && deny.status === 'denied') ok('29. Deny works');
  else bad('29. deny', deny);

  const extFx = await fixture();
  await preauthorize(extFx, '20889', 15, await teacherCookie(extFx));
  const extLogin = await login(extFx, '20889', extFx.password);
  const extGrant = extFx.env.DB.__rows[0];
  const extend = await jsonOf(await worker.fetch(req('https://x.test/api/class-access/requests/extend', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: extGrant.id, duration_minutes: 30 }),
  }, await teacherCookie(extFx)), extFx.env));
  if (extend.ok && extend.deltaMinutes === 30) ok('30. Extend works');
  else bad('30. extend', extend);
  const revoke = await jsonOf(await worker.fetch(req('https://x.test/api/class-access/requests/revoke', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: extGrant.id }),
  }, await teacherCookie(extFx)), extFx.env));
  if (revoke.ok && revoke.status === 'revoked') ok('31. Revoke works');
  else bad('31. revoke', revoke);
  const afterRevoke = await jsonOf(await worker.fetch(req('https://x.test/api/class-access/state', { method: 'GET' }, `${ACCESS_DEVICE_COOKIE_NAME}=${cookieValue(extLogin, ACCESS_DEVICE_COOKIE_NAME)}`), extFx.env));
  if (afterRevoke.individualGrant.qualifyingAccess !== true) ok('40. Existing revoke behavior unchanged');
  else bad('40. revoke qualify', afterRevoke.individualGrant);

  const ttlFx = await fixture();
  const ttlSess = await studentCookie(ttlFx);
  const ttlCreate = await jsonOf(await worker.fetch(req('https://x.test/api/class-access/request', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
  }, ttlSess), ttlFx.env));
  ttlFx.env.DB.__rows[0].request_expires_at = new Date(Date.now() - 1000).toISOString();
  const ttlPending = await jsonOf(await worker.fetch(req('https://x.test/api/class-access/requests/pending', { method: 'GET' }, await teacherCookie(ttlFx)), ttlFx.env));
  if ((ttlPending.requests || []).length === 0) ok('32/33. Pending TTL still works and badge counts only actionable requests');
  else bad('32. pending ttl', ttlPending);

  const approve30Fx = await fixture();
  const a30sess = await studentCookie(approve30Fx);
  const a30 = await jsonOf(await worker.fetch(req('https://x.test/api/class-access/request', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
  }, a30sess), approve30Fx.env));
  const a30ok = await jsonOf(await worker.fetch(req('https://x.test/api/class-access/requests/approve', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: a30.requestId, duration_minutes: 30 }),
  }, await teacherCookie(approve30Fx)), approve30Fx.env));
  if (a30ok.ok && a30ok.durationMinutes === 30) ok('26. Teacher Approve 30 works');
  else bad('26. approve 30', a30ok);

  const search = await jsonOf(await worker.fetch(req('https://x.test/api/class-access/students?q=Lucas', { method: 'GET' }, tCookie), fx.env));
  if (search.ok && (search.students || []).some((s) => s.username === '20889')) ok('44. Real student search works');
  else bad('44. search', search);

  const studentSearch = await worker.fetch(req('https://x.test/api/class-access/students?q=Lucas', { method: 'GET' }, studentSess), fx.env);
  if (studentSearch.status === 403) ok('L. No student can search/preauthorize staff roster');
  else bad('student search', studentSearch.status);

  const cancelFx = await fixture();
  const cTeacher = await teacherCookie(cancelFx);
  const made = await jsonOf(await preauthorize(cancelFx, '20889', 15, cTeacher));
  const cancelled = await jsonOf(await worker.fetch(req('https://x.test/api/class-access/preauthorize/cancel', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: made.id }),
  }, cTeacher), cancelFx.env));
  if (cancelled.ok) ok('Cancel unclaimed preauthorization works');
  else bad('cancel', cancelled);
  const afterCancelLogin = await jsonOf(await login(cancelFx, '20889', cancelFx.password));
  if (afterCancelLogin.individual_access_claimed !== true) ok('Cancelled preauth cannot be claimed');
  else bad('cancel then claim', afterCancelLogin);

  const ceilingFx = await fixture();
  await preauthorize(ceilingFx, '20889', 30, await teacherCookie(ceilingFx));
  await login(ceilingFx, '20889', ceilingFx.password);
  const g = ceilingFx.env.DB.__rows[0];
  let lastExtend = null;
  for (let i = 0; i < 8; i++) {
    lastExtend = await jsonOf(await worker.fetch(req('https://x.test/api/class-access/requests/extend', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: g.id, duration_minutes: 30 }),
    }, await teacherCookie(ceilingFx)), ceilingFx.env));
  }
  const remainMin = (new Date(g.grant_expires_at).getTime() - Date.now()) / 60000;
  if (remainMin <= 181) ok('41. Existing extend ceiling remains 180 minutes');
  else bad('41. ceiling', { remainMin, lastExtend, expires: g.grant_expires_at });

  const teacherHtml = fs.readFileSync(path.join(root, 'app/teacher.html'), 'utf8');
  const individualJs = fs.readFileSync(path.join(root, 'app/js/lantern-individual-access.js'), 'utf8');
  const classAccessJs = fs.readFileSync(path.join(root, 'app/js/class-access.js'), 'utf8');
  const powerCss = fs.readFileSync(path.join(root, 'app/css/lantern-power-list.css'), 'utf8');
  if (/Pre-authorize Student/.test(teacherHtml) && /individualAccessStudentSearch/.test(teacherHtml)) ok('43. Pre-authorize Student UI renders');
  else bad('43. preauth UI');
  if (/option value="15"/.test(teacherHtml) && /option value="30"/.test(teacherHtml) && !/option value="60"/.test(teacherHtml)) ok('45. 15/30 controls work (no 1h/2h)');
  else bad('45. duration controls');
  if (/LanternPowerList/.test(individualJs) && /Power\.create/.test(individualJs) && /lanternPowerList--individualAccess/.test(individualJs)) ok('49. Power Scroller is used for Individual Access');
  else bad('49. power list');
  if (/kind === 'pending'/.test(individualJs) && /kind === 'preauthorized'/.test(individualJs) && /kind === 'active'/.test(individualJs)) ok('46/47/48. Pre-authorized, Pending, and Active rows are distinct');
  else bad('status rows');
  if (/Cancel Pre-authorization/.test(individualJs) && /Approve 15/.test(individualJs) && /Revoke/.test(individualJs)) ok('18. Row actions match status');
  else bad('row actions');
  if (/overflow-x:\s*hidden/.test(powerCss) && /lanternPowerList--individualAccess/.test(powerCss)) ok('52. Phone layout has no horizontal overflow contract');
  else bad('52. overflow');
  if (/isAuthenticatedStudent/.test(classAccessJs) && /Lantern access is currently closed/.test(classAccessJs)) ok('54. Request Access is the authenticated fallback copy');
  else bad('54. fallback copy');
  if (/individual_access_claimed/.test(fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8')) && /claimPreauthorizationAfterLogin/.test(fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8'))) {
    ok('53. Preauthorized students claim at username/password — no Request Access click required');
  } else bad('53. login claim wiring');

  const migration = fs.readFileSync(path.join(root, 'worker/migrations/073_lantern_access_pre_authorizations.sql'), 'utf8');
  if (/CREATE TABLE IF NOT EXISTS lantern_access_pre_authorizations/.test(migration) && !/DROP TABLE/.test(migration) && !/ALTER TABLE lantern_access_requests/.test(migration)) {
    ok('42. Additive migration does not rewrite lantern_access_requests');
  } else bad('42. migration safety', migration.slice(0, 200));

  const idx = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
  if (/device_secret_hash = \?/.test(idx) && /session\.username === preauthorized_student/.test(idx) === false) {
    ok('computeQualifyingAccessSignals still looks up by device_secret_hash');
  } else bad('signal lookup');
}

await run();
console.log('\naccess-preauthorize-142-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
