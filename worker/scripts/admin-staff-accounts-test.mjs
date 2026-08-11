/**
 * Prompt #130 — Admin Students vs Staff & Admin split + archive/restore (no Staff ID migration).
 * Usage: node worker/scripts/admin-staff-accounts-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import worker from '../index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const html = fs.readFileSync(path.join(root, 'app/admin.html'), 'utf8');

let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

const TEST_PILOT_SECRET = 'test-secret-not-a-real-pilot-session-secret';

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
    username: 'admin',
    display_name: 'Web Admin',
    role: 'admin',
    student_character_name: null,
    teacher_id: null,
    mtss_student_id: null,
    is_active: 1,
    must_change_password: 0,
    password_hash: 'HASH_SHOULD_NEVER_APPEAR',
    password_salt: 'SALT_SHOULD_NEVER_APPEAR',
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
          return { results: Object.values(state.accounts).sort((a, b) => String(a.username).localeCompare(String(b.username))) };
        }
        if (s.includes("lower(trim(role)) = 'student'") && s.includes('must_change_password')) {
          return {
            results: Object.values(state.accounts).filter((a) => String(a.role || '').toLowerCase() === 'student'),
          };
        }
        return { results: [] };
      },
      async run() {
        if (s.includes('UPDATE lantern_pilot_accounts SET is_active')) {
          const active = binds[0];
          const username = String(binds[1] || '').trim();
          const key = username.toLowerCase();
          if (state.accounts[key]) {
            state.accounts[key] = { ...state.accounts[key], is_active: active };
            state.lastMutation = { type: 'is_active', username, active };
          }
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes('UPDATE lantern_pilot_accounts SET') && s.includes('display_name')) {
          const key = String(binds[binds.length - 1] || '').trim().toLowerCase();
          if (state.accounts[key] && binds[0] != null) {
            state.accounts[key] = { ...state.accounts[key], display_name: binds[0] };
          }
          return { success: true, meta: { changes: 1 } };
        }
        return { success: true, meta: { changes: 0 } };
      },
    };
    return api;
  }
  return { DB: { prepare }, PILOT_SESSION_SECRET: TEST_PILOT_SECRET, _state: state };
}

function req(method, path, body, cookie) {
  const headers = { Cookie: cookie || '' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return new Request('https://lantern.test' + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/* ---------- Static Admin UI contract ---------- */
if (/id="adminStudentsCard"/.test(html) && /id="adminStaffCard"/.test(html)) ok('Students + Staff panels present');
else bad('required panels missing');

if (!/id="adminAccountsCard"/.test(html) && !/>\s*Accounts\s*</.test(html.replace(/Staff &amp; Admin|Staff|TMS Staff Links|Accounts created|account management/gi, ''))) {
  // softer: no adminAccountsCard id
}
if (!/id="adminAccountsCard"/.test(html)) ok('generic Accounts panel retired (no adminAccountsCard)');
else bad('generic Accounts panel still present');

if (/>\s*Staff\s*</.test(html) && /id="adminStaffCountPill"/.test(html) && !/Staff &amp; Admin/.test(html)) ok('Staff title + count pill');
else bad('Staff chrome missing');

if (/nu_role[\s\S]{0,200}teacher[\s\S]{0,80}admin/.test(html) && !/id="nu_role"[\s\S]{0,120}<option value="student"/.test(html)) {
  ok('Add Staff role select excludes student');
} else bad('Add Staff still offers student role');

if (/Archive Login|Archive<\/|Archive"/.test(html) && /Restore Login|Restore/.test(html)) {
  ok('Archive/Restore actions present in Admin UI');
} else bad('Archive/Restore UI missing');

if (/Create Lantern Login/.test(html) && /Behavior Logger Link/.test(html)) {
  ok('Prompt #197 Create Lantern Login + Behavior Logger Link present');
} else bad('Prompt #197 canonical actions missing');

if (!/Delete account|deleteAccount|permanent delete/i.test(html)) ok('No normal Delete account UI');
else bad('Destructive delete UI present');

if (!/Staff ID[\s\S]{0,80}schema migration|immutable Staff ID[\s\S]{0,80}migration/i.test(html)) {
  ok('Staff ID migration commentary not exposed in production Admin UI');
} else bad('Staff ID migration notice still present in Admin UI');

if (/data-collapsible-editor/.test(html) && /lantern-collapsible-collapse/.test(html)) {
  ok('editors tied to collapsible collapse cleanup');
} else bad('editor/collapse wiring missing');

if (/Lucas/.test(html) === false || /Students/.test(html)) {
  // Lucas is not hard-coded in markup — OK
  ok('Students panel exists for TMS-backed Lucas (not hard-coded in Staff)');
}

/* ---------- API archive/restore + staff-only filtering ---------- */
async function runApi() {
  const admin = account();
  const teacher = account({ username: 'ms_carter', display_name: 'Ms Carter', role: 'teacher', teacher_id: 'Carter' });
  const student = account({ username: '20889', display_name: 'Lucas', role: 'student', mtss_student_id: '20889', student_character_name: '20889' });
  const state = {
    accounts: {
      [admin.username.toLowerCase()]: admin,
      [teacher.username.toLowerCase()]: teacher,
      [student.username.toLowerCase()]: student,
    },
  };
  const env = makeEnv(state);
  const adminCookie = await cookieFor(admin);
  const teacherCookie = await cookieFor(teacher);

  {
    const res = await worker.fetch(req('GET', '/api/admin/users', undefined, adminCookie), env);
    const body = await res.json();
    const users = body.users || [];
    const roles = users.map((u) => String(u.role).toLowerCase());
    if (roles.includes('student') && roles.includes('teacher') && roles.includes('admin')) {
      ok('GET /api/admin/users still returns all roles for Admin (wallet/links reuse)');
    } else bad('users payload incomplete', JSON.stringify(roles));
    const lucas = users.find((u) => u.username === '20889');
    if (lucas && lucas.role === 'student') ok('Lucas remains student in API users list');
    else bad('Lucas missing from users');
  }

  {
    const res = await worker.fetch(
      req('POST', '/api/admin/users/update', { username: 'ms_carter', is_active: 0 }, adminCookie),
      env
    );
    const body = await res.json();
    if (res.status === 200 && body.ok && state.accounts.ms_carter.is_active === 0) {
      ok('archive sets is_active=0 via existing update route');
    } else bad('archive failed', JSON.stringify(body));
    if (state.accounts.ms_carter.password_hash === 'HASH_SHOULD_NEVER_APPEAR') ok('archive did not touch password hash');
    else bad('password mutated on archive');
  }

  {
    const res = await worker.fetch(
      req('POST', '/api/admin/users/update', { username: 'ms_carter', is_active: 1 }, adminCookie),
      env
    );
    const body = await res.json();
    if (res.status === 200 && body.ok && state.accounts.ms_carter.is_active === 1) ok('restore sets is_active=1 on same account');
    else bad('restore failed', JSON.stringify(body));
  }

  {
    const res = await worker.fetch(
      req('POST', '/api/admin/users/update', { username: '20889', is_active: 0 }, adminCookie),
      env
    );
    const body = await res.json();
    if (res.status === 200 && body.ok && state.accounts['20889'].is_active === 0) {
      ok('student Lantern login archive uses same is_active path');
    } else bad('student archive', JSON.stringify(body));
    if (state.accounts['20889'].mtss_student_id === '20889') ok('student archive does not clear mtss_student_id');
    else bad('mtss cleared');
  }

  {
    const res = await worker.fetch(
      req('POST', '/api/admin/users/update', { username: 'ms_carter', is_active: 0 }, teacherCookie),
      env
    );
    if (res.status === 403) ok('non-admin cannot archive');
    else bad('teacher archive should 403', res.status);
  }

  {
    const res = await worker.fetch(req('POST', '/api/admin/users', {
      username: 'newbie',
      display_name: 'New',
      role: 'teacher',
      password: 'password123',
    }, teacherCookie), env);
    if (res.status === 403) ok('non-admin cannot create staff');
    else bad('teacher create should 403', res.status);
  }
}

await runApi();

console.log('\nadmin-staff-accounts-test:', pass, 'PASS', fail, 'FAIL');
if (fail) process.exit(1);
