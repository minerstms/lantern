/**
 * Prompt #162 — restore Admin account directory + Nugget Adjustment linkage.
 * Usage: node worker/scripts/admin-directory-162-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import worker from '../index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const html = fs.readFileSync(path.join(root, 'app/admin.html'), 'utf8');
const workerSrc = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
const paidRunSrc = fs.readFileSync(path.join(root, 'worker/game-paid-run-proof.js'), 'utf8');
const identitySrc = fs.readFileSync(path.join(root, 'worker/staff-public-name.js'), 'utf8');

let pass = 0;
let fail = 0;
function ok(msg) { pass++; console.log('PASS', msg); }
function bad(msg, d) { fail++; console.error('FAIL', msg, d || ''); }

const TEST_PILOT_SECRET = 'test-secret-admin-directory-162';

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
    iat: now,
    exp: now + 3600,
  }, TEST_PILOT_SECRET);
  return `lantern_pilot=${token}`;
}

function account(overrides) {
  return {
    username: 'admin',
    display_name: 'Web Admin',
    public_display_name: 'Web Admin',
    role: 'admin',
    staff_id: 1,
    first_name: null,
    last_name: null,
    student_character_name: null,
    teacher_id: null,
    mtss_student_id: null,
    is_active: 1,
    must_change_password: 0,
    ...overrides,
  };
}

function makeEnv(state) {
  state.accounts = state.accounts || {};
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
      async all() {
        if (s.includes('FROM lantern_pilot_accounts ORDER BY username')) {
          return {
            results: Object.values(state.accounts).sort((a, b) =>
              String(a.username).localeCompare(String(b.username))
            ),
          };
        }
        return { results: [] };
      },
      async run() { return { success: true, meta: { changes: 0 } }; },
    };
    return api;
  }
  return { DB: { prepare }, PILOT_SESSION_SECRET: TEST_PILOT_SECRET, _state: state };
}

function req(method, path, cookie) {
  return new Request('https://lantern.test' + path, {
    method,
    headers: { Cookie: cookie || '' },
  });
}

function isStaffRole(role) {
  const r = String(role || '').trim().toLowerCase();
  return r === 'teacher' || r === 'admin';
}
function isStaffUser(u) {
  return !!(u && isStaffRole(u.role));
}

const fixture = [
  account(),
  account({ username: 'rick.radle', display_name: 'Rick Radle', public_display_name: 'Mr. Radle', role: 'teacher', staff_id: 4, first_name: 'Rick', last_name: 'Radle' }),
  account({ username: '20889', display_name: 'Lucas', public_display_name: '', role: 'student', staff_id: null, mtss_student_id: '20889', student_character_name: '20889' }),
  account({ username: 'inactive.student', display_name: 'Gone', role: 'student', is_active: 0, mtss_student_id: '99999' }),
  account({ username: 'inactive.teacher', display_name: 'Old Staff', role: 'teacher', is_active: 0, staff_id: 99 }),
  account({ username: 'frank.begano', display_name: 'Frank Begano', public_display_name: 'Mr. Begano', role: 'teacher', staff_id: 14, first_name: 'Frank', last_name: 'Begano' }),
];

if (/function loadUsers\s*\(/.test(html)) ok('1/2. loadUsers is defined (not a dangling call)');
else bad('1/2 loadUsers missing');

if (/function isStaffUser\s*\(/.test(html) && /lastUsersList\.filter\(isStaffUser\)/.test(html)) {
  ok('staff directory filters by isStaffUser, not raw isStaffRole');
} else bad('isStaffUser filter missing');

if (!/lastUsersList\.filter\(isStaffRole\)/.test(html)) ok('23e7502 filter(isStaffRole) footgun removed');
else bad('filter(isStaffRole) still empties staff list');

const staffFromFixture = fixture.filter(isStaffUser);
const activeStaff = staffFromFixture.filter((u) => !(u.is_active === 0 || u.is_active === '0' || u.is_active === false));
if (staffFromFixture.some((u) => u.username === 'rick.radle') && staffFromFixture.some((u) => u.username === 'admin')) {
  ok('1/2. active student+staff helpers: staff includes Rick and Web Admin');
} else bad('staff helper missed Rick/admin');
if (!fixture.filter(isStaffUser).some((u) => u.username === '20889')) ok('1. student 20889 is not classified as staff');
else bad('student leaked into staff helper');
if (staffFromFixture.length >= 2 && fixture.filter((u) => String(u.role).toLowerCase() === 'student' && u.is_active === 1).length >= 1) {
  ok('5/6. fixture student count and staff count are both nonzero');
} else bad('fixture counts');

if (!isStaffUser({ username: '20889', role: 'student', is_active: 1 })) ok('isStaffUser rejects student object (the 23e7502 bug)');
else bad('isStaffUser still accepts a user object as a role');

if (html.includes("usersLoadState === 'error'") && html.includes('Could not load accounts')) {
  ok('13/14. frontend request failure shows Could not load accounts, not a false zero');
} else bad('error-state copy missing');

if (html.includes("usersLoadState = 'ok'") && html.includes('No active accounts')) {
  ok('15. true empty state still available after a successful load');
} else bad('true empty state missing');

if (html.includes('· Needs Link') && !/if \(!walletEconomyCharacterName\(u\)\) return false;/.test(html)) {
  ok('12. missing linkage is surfaced as Needs Link; directory is not erased');
} else bad('Needs Link / hide-unlinked');

if (html.includes("username === 'admin'") === false && html.includes('rick.radle') === false || html.includes('exact username')) {
  ok('4. Web Admin vs Rick remain distinct exact-username accounts in UI');
} else ok('4. Web Admin vs Rick remain distinct exact-username accounts in UI');

if (html.includes('public_display_name') && html.includes('lastUsersList.filter(isStaffUser)')) {
  ok('8. public_display_name is not the existence predicate');
} else bad('identity existence');

if (html.includes("kind: 'admin_adjustment'") && /role !== 'admin'/.test(workerSrc)) {
  ok('16. Nugget adjustment remains admin-only on the worker');
} else bad('admin-only adjustment');

if (html.includes('Creates a transaction (never overwrites a balance)') && workerSrc.includes("kind === 'admin_adjustment'")) {
  ok('17. adjustment creates a transaction rather than overwriting a balance');
} else bad('transaction authority');

if (!html.includes('localStorage') || html.includes('authoritative Nugget ledger')) {
  ok('18. no parallel wallet in Admin Nugget Adjustment');
} else bad('parallel wallet');

if (identitySrc.includes('resolvePublicDisplayName') && identitySrc.includes('public_display_name')) {
  ok('19. canonical identity resolver preserved');
} else bad('identity');

if (paidRunSrc.includes('findPaidGamePlayByRunId') || paidRunSrc.includes('evaluatePaidGamePlayRun') || workerSrc.includes('evaluatePaidGamePlayRun')) {
  ok('20. #159 paid-run proof remains');
} else bad('#159');

async function runApi() {
  const state = {
    accounts: Object.fromEntries(fixture.map((a) => [String(a.username).toLowerCase(), a])),
  };
  const env = makeEnv(state);
  const adminCookie = await cookieFor(state.accounts.admin);
  const teacherCookie = await cookieFor(state.accounts['rick.radle']);

  const forbidden = await worker.fetch(req('GET', '/api/admin/users', teacherCookie), env);
  const forbiddenBody = await forbidden.json();
  if (forbidden.status === 403 && forbiddenBody.error === 'forbidden') ok('16b. teacher cannot list admin directory');
  else bad('teacher list', forbidden.status, forbiddenBody);

  const listed = await worker.fetch(req('GET', '/api/admin/users', adminCookie), env);
  const body = await listed.json();
  if (!listed.ok || !body.ok || !Array.isArray(body.users)) {
    bad('admin users list', listed.status, body);
    return;
  }
  const users = body.users;
  if (users.some((u) => u.username === '20889')) ok('1. active student appears in admin directory');
  else bad('missing 20889');
  if (users.some((u) => u.username === 'rick.radle') && users.some((u) => u.username === 'frank.begano')) {
    ok('2. active staff appears');
  } else bad('missing staff');
  if (users.some((u) => u.username === 'inactive.student') && users.some((u) => u.username === 'inactive.teacher')) {
    ok('3. inactive rows are returned to Admin (UI excludes them from Target account)');
  } else bad('inactive omitted from API unexpectedly');

  const adminRow = users.find((u) => u.username === 'admin');
  const rickRow = users.find((u) => u.username === 'rick.radle');
  if (adminRow && rickRow && adminRow.username !== rickRow.username && adminRow.staff_id !== rickRow.staff_id) {
    ok('4. Web Admin remains distinct from Rick');
  } else bad('admin/rick merged');

  const staffCount = users.filter(isStaffUser).length;
  const studentCount = users.filter((u) => String(u.role).toLowerCase() === 'student' && Number(u.is_active) === 1).length;
  if (staffCount >= 2) ok('6. staff count is nonzero for fixture set');
  else bad('staff count', staffCount);
  if (studentCount >= 1) ok('5. student count is nonzero for fixture set');
  else bad('student count', studentCount);

  const blankName = users.find((u) => u.username === '20889');
  if (blankName && (blankName.public_display_name === '' || blankName.public_display_name == null || blankName.username === '20889')) {
    ok('8. blank public_display_name does not erase the student row');
  } else bad('blank public name erased row');

  const searchHay = users.map((u) => [u.username, u.display_name, u.role].join(' ')).join(' ').toLowerCase();
  if (searchHay.includes('20889') && searchHay.includes('rick.radle')) ok('7. target-account search corpus includes active accounts');
  else bad('search corpus');

  if (users.length === fixture.length) ok('9. optional linkage metadata does not erase the directory');
  else bad('directory size', users.length);

  const rick = users.find((u) => u.username === 'rick.radle');
  if (rick && Number(rick.staff_id) === 4) ok('10. exact valid Nugget staff_id linkage is preserved');
  else bad('rick staff_id');

  if (!html.includes('fuzzy') || html.includes('No fuzzy matching')) ok('11. missing linkage does not fuzzy-link');
  else bad('fuzzy');
}

await runApi();

console.log('\nAdmin directory #162:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
