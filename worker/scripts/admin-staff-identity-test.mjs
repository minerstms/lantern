/**
 * Prompt #136 — Staff ID + First/Last identity migration regression tests.
 * Usage: node worker/scripts/admin-staff-identity-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import worker from '../index.js';
import {
  allocateStaffId,
  composeStaffDisplayName,
  ensureStaffIdsAllocated,
  formatStaffIdLabel,
  generateStaffTempPassword,
  staffNeedsNameSetup,
  validateStaffNamePart,
} from '../admin-account-utils.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const html = fs.readFileSync(path.join(root, 'app/admin.html'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'worker/migrations/056_lantern_staff_identity.sql'), 'utf8');
const css = fs.readFileSync(path.join(root, 'app/css/lantern-collapsible-list.css'), 'utf8');

let pass = 0;
let fail = 0;
function ok(label) {
  pass++;
  console.log('PASS', label);
}
function bad(label, detail) {
  fail++;
  console.error('FAIL', label, detail != null ? detail : '');
}

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
  const token = await signTestJwt(
    {
      sub: account.username,
      role: account.role,
      scn: account.student_character_name || null,
      tid: account.teacher_id || null,
      iat: now,
      exp: now + 3600,
    },
    TEST_PILOT_SECRET
  );
  return `lantern_pilot=${token}`;
}

function account(overrides) {
  return {
    username: 'admin',
    display_name: 'Web Admin',
    first_name: null,
    last_name: null,
    staff_id: null,
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
  state.allocSeq = state.allocSeq || 0;
  state.allocRows = state.allocRows || [];
  state.lastInsert = null;
  function prepare(sql) {
    const s = String(sql);
    const binds = [];
    const api = {
      bind(...args) {
        binds.push(...args);
        return api;
      },
      async first() {
        if (s.includes('FROM lantern_pilot_accounts WHERE lower(trim(username))')) {
          const key = String(binds[0] || '')
            .trim()
            .toLowerCase();
          const row = state.accounts[key] || null;
          return row ? { ...row } : null;
        }
        if (s.includes('SELECT staff_id FROM lantern_pilot_accounts WHERE username')) {
          const key = String(binds[0] || '')
            .trim()
            .toLowerCase();
          const row = state.accounts[key];
          return row ? { staff_id: row.staff_id } : null;
        }
        return null;
      },
      async all() {
        if (s.includes('FROM lantern_pilot_accounts ORDER BY username')) {
          return {
            results: Object.values(state.accounts).sort((a, b) => String(a.username).localeCompare(String(b.username))),
          };
        }
        if (s.includes('staff_id IS NULL') && s.includes("IN ('teacher', 'admin')")) {
          return {
            results: Object.values(state.accounts)
              .filter((a) => {
                const r = String(a.role || '').toLowerCase();
                return (r === 'teacher' || r === 'admin') && (a.staff_id == null || a.staff_id === '');
              })
              .sort((a, b) => String(a.username).toLowerCase().localeCompare(String(b.username).toLowerCase()))
              .map((a) => ({ username: a.username })),
          };
        }
        return { results: [] };
      },
      async run() {
        if (s.includes('INSERT INTO lantern_staff_id_alloc')) {
          state.allocSeq += 1;
          state.allocRows.push(state.allocSeq);
          state.lastInsert = { meta: { last_row_id: state.allocSeq, changes: 1 }, success: true };
          return state.lastInsert;
        }
        if (s.includes('INSERT INTO lantern_pilot_accounts')) {
          const [
            username,
            display_name,
            first_name,
            last_name,
            staff_id,
            role,
            password_hash,
            password_salt,
            student_character_name,
            teacher_id,
            mtss_student_id,
          ] = binds;
          const row = account({
            username,
            display_name,
            first_name,
            last_name,
            staff_id,
            role,
            password_hash,
            password_salt,
            student_character_name,
            teacher_id,
            mtss_student_id,
            must_change_password: 1,
          });
          state.accounts[String(username).toLowerCase()] = row;
          state.lastMutation = { type: 'insert', username, staff_id };
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes('UPDATE lantern_pilot_accounts SET staff_id = ?') && s.includes('staff_id IS NULL')) {
          const staffId = binds[0];
          const username = String(binds[1] || '').trim();
          const key = username.toLowerCase();
          if (state.accounts[key] && (state.accounts[key].staff_id == null || state.accounts[key].staff_id === '')) {
            state.accounts[key] = { ...state.accounts[key], staff_id: staffId };
          }
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes('UPDATE lantern_pilot_accounts SET is_active')) {
          const active = binds[0];
          const username = String(binds[1] || '').trim();
          const key = username.toLowerCase();
          if (state.accounts[key]) {
            state.accounts[key] = { ...state.accounts[key], is_active: active };
            state.lastMutation = { type: 'is_active', username, active, staff_id: state.accounts[key].staff_id };
          }
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes('UPDATE lantern_pilot_accounts SET first_name = ?') && s.includes('last_name = ?') && s.includes('display_name = ?')) {
          const [first_name, last_name, display_name, username] = binds;
          const key = String(username || '')
            .trim()
            .toLowerCase();
          if (state.accounts[key]) {
            state.accounts[key] = {
              ...state.accounts[key],
              first_name,
              last_name,
              display_name,
            };
            state.lastMutation = { type: 'names', username, first_name, last_name, display_name, staff_id: state.accounts[key].staff_id };
          }
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes('UPDATE lantern_pilot_accounts SET') && s.includes('display_name') && !s.includes('first_name')) {
          const key = String(binds[binds.length - 1] || '')
            .trim()
            .toLowerCase();
          if (state.accounts[key] && binds[0] != null) {
            state.accounts[key] = { ...state.accounts[key], display_name: binds[0] };
          }
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes('UPDATE lantern_pilot_accounts SET role = ?')) {
          const role = binds[0];
          const username = String(binds[1] || '').trim();
          const key = username.toLowerCase();
          if (state.accounts[key]) state.accounts[key] = { ...state.accounts[key], role };
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes('UPDATE lantern_pilot_accounts SET must_change_password = ?')) {
          const mcp = binds[0];
          const username = String(binds[1] || '').trim();
          const key = username.toLowerCase();
          if (state.accounts[key]) state.accounts[key] = { ...state.accounts[key], must_change_password: mcp };
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes('UPDATE lantern_pilot_accounts SET password_hash')) {
          return { success: true, meta: { changes: 1 } };
        }
        return { success: true, meta: { changes: 0 } };
      },
    };
    return api;
  }
  return { DB: { prepare }, PILOT_SESSION_SECRET: TEST_PILOT_SECRET, _state: state };
}

function req(method, pathName, body, cookie) {
  const headers = { Cookie: cookie || '' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return new Request('https://lantern.test' + pathName, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/* ---------- Static / migration contract ---------- */
if (/lantern_staff_id_alloc/.test(migration) && /AUTOINCREMENT/.test(migration)) ok('migration uses AUTOINCREMENT alloc table');
else bad('migration missing never-reuse allocator');

if (!/MAX\s*\(\s*staff_id\s*\)\s*\+\s*1/i.test(migration)) ok('migration does not use MAX(staff_id)+1');
else bad('migration uses MAX+1');

if (/ADD COLUMN first_name/.test(migration) && /ADD COLUMN last_name/.test(migration) && /ADD COLUMN staff_id/.test(migration)) {
  ok('migration adds first_name, last_name, staff_id');
} else bad('migration columns incomplete');

if (/ORDER BY lower\(trim\(username\)\)/.test(migration) && /first_name \/ last_name intentionally left NULL/i.test(migration)) {
  ok('backfill order documented as deterministic username ASC; names left NULL');
} else bad('backfill policy missing from migration');

if (/editUserLastName/.test(html) && /nu_first/.test(html) && /nu_last/.test(html) && /Needs Name Setup/.test(html)) {
  ok('Admin UI has First/Last + Needs Name Setup');
} else bad('Admin First/Last UI missing');

if (/Staff ID/.test(html) && /lanternMgmtRecordListHd--staff/.test(html) && /formatStaffIdLabel/.test(html)) {
  ok('Staff compact header includes Staff ID');
} else bad('Staff ID column missing in UI');

if (/temporary_password|Temp password|shown once/i.test(html) && /nu_password" type="hidden"/.test(html)) {
  ok('Add Staff uses server temp password (no admin-chosen password field)');
} else bad('Add Staff temp-password UX incomplete');

if (/lanternMgmtRecord--staff/.test(css) && /lanternMgmtRecordListHd--staff/.test(css)) ok('staff compact grid CSS present');
else bad('staff compact CSS missing');

if (formatStaffIdLabel(1) === 'Staff #0001' && formatStaffIdLabel(12) === 'Staff #0012') ok('Staff ID display formatting');
else bad('Staff ID formatting', formatStaffIdLabel(1));

if (composeStaffDisplayName('Rick', 'Radle') === 'Rick Radle') ok('display_name composed from first+last');
else bad('compose display name');

if (staffNeedsNameSetup({ role: 'teacher', first_name: null, last_name: null, display_name: 'Ms. Carter' })) {
  ok('ambiguous display_name still Needs Name Setup');
} else bad('Needs Name Setup detection failed');

{
  const r = validateStaffNamePart('Ms.', 'first_name', { required: true });
  if (r.ok && r.value === 'Ms.') ok('name parts accepted as supplied (no auto-split logic)');
  else bad('name part validation', r);
}

{
  const a = generateStaffTempPassword();
  const b = generateStaffTempPassword();
  if (a && b && a.length >= 8 && a !== b) ok('temp password generator produces unique 8+ secrets');
  else bad('temp password generator', a + ' / ' + b);
}

async function runApi() {
  const admin = account({ username: 'admin',
    display_name: 'Web Admin', role: 'admin' });
  const teacher1 = account({
    username: 'teacher1',
    display_name: 'Ms. Carter',
    role: 'teacher',
    teacher_id: 'teacher1',
  });
  const teacher2 = account({
    username: 'teacher2',
    display_name: 'Mr. Lee',
    role: 'teacher',
    teacher_id: 'teacher2',
  });
  const student = account({
    username: '20889',
    display_name: 'Lucas',
    role: 'student',
    mtss_student_id: '20889',
    student_character_name: '20889',
  });
  const state = {
    accounts: {
      [admin.username.toLowerCase()]: admin,
      [teacher1.username.toLowerCase()]: teacher1,
      [teacher2.username.toLowerCase()]: teacher2,
      [student.username.toLowerCase()]: student,
    },
    allocSeq: 0,
    allocRows: [],
  };
  const env = makeEnv(state);
  const adminCookie = await cookieFor(admin);

  // 1+2: ensureStaffIdsAllocated — staff get IDs, students do not
  {
    const res = await ensureStaffIdsAllocated(env.DB);
    if (res.allocated === 3) ok('existing staff receive unique Staff IDs (3 allocated)');
    else bad('staff backfill count', res);
    const ids = [admin, teacher1, teacher2].map((a) => state.accounts[a.username.toLowerCase()].staff_id);
    if (new Set(ids).size === 3 && ids.every((id) => id > 0)) ok('Staff IDs unique and positive');
    else bad('Staff ID uniqueness', ids);
    // deterministic username order: admin, teacher1, teacher2
    if (
      state.accounts.admin.staff_id === 1 &&
      state.accounts.teacher1.staff_id === 2 &&
      state.accounts.teacher2.staff_id === 3
    ) {
      ok('deterministic backfill order: admin=1, teacher1=2, teacher2=3');
    } else {
      bad('backfill order', {
        rick: state.accounts.admin.staff_id,
        t1: state.accounts.teacher1.staff_id,
        t2: state.accounts.teacher2.staff_id,
      });
    }
    if (state.accounts['20889'].staff_id == null) ok('student rows receive NO Staff ID');
    else bad('student got staff_id', state.accounts['20889'].staff_id);
    if (
      state.accounts.teacher1.display_name === 'Ms. Carter' &&
      state.accounts.teacher1.first_name == null &&
      state.accounts.teacher1.last_name == null
    ) {
      ok('ambiguous display_name NOT auto-split');
    } else bad('Ms. Carter was altered', state.accounts.teacher1);
  }

  // GET list includes staff_id fields; teacher cookie forbidden
  {
    const res = await worker.fetch(req('GET', '/api/admin/users', undefined, adminCookie), env);
    const body = await res.json();
    const users = body.users || [];
    const rick = users.find((u) => u.username === 'admin');
    const lucas = users.find((u) => u.username === '20889');
    if (rick && rick.staff_id === 1 && rick.display_name === 'Web Admin') ok('GET users returns Staff ID + unchanged username/display');
    else bad('GET users staff fields', rick);
    if (lucas && (lucas.staff_id == null || lucas.staff_id === '')) ok('GET users student staff_id null');
    else bad('GET student staff_id', lucas);
  }

  // 3: Staff ID cannot be edited
  {
    const res = await worker.fetch(
      req('POST', '/api/admin/users/update', { username: 'teacher1', staff_id: 999 }, adminCookie),
      env
    );
    const body = await res.json();
    if (res.status === 400 && body.error === 'staff_id_immutable' && state.accounts.teacher1.staff_id === 2) {
      ok('Staff ID cannot be edited');
    } else bad('staff_id edit rejection', { status: res.status, body, id: state.accounts.teacher1.staff_id });
  }

  // 4+5: archive/restore preserves Staff ID
  {
    const before = state.accounts.teacher2.staff_id;
    let res = await worker.fetch(
      req('POST', '/api/admin/users/update', { username: 'teacher2', is_active: 0 }, adminCookie),
      env
    );
    let body = await res.json();
    if (body.ok && state.accounts.teacher2.is_active === 0 && state.accounts.teacher2.staff_id === before) {
      ok('archived Staff ID remains reserved on row');
    } else bad('archive staff_id', body);
    res = await worker.fetch(
      req('POST', '/api/admin/users/update', { username: 'teacher2', is_active: 1 }, adminCookie),
      env
    );
    body = await res.json();
    if (body.ok && state.accounts.teacher2.is_active === 1 && state.accounts.teacher2.staff_id === before) {
      ok('restored account keeps same Staff ID');
    } else bad('restore staff_id', body);
  }

  // 6+7+8: new staff gets higher ID; first/last separate; display_name sync
  {
    const res = await worker.fetch(
      req(
        'POST',
        '/api/admin/users',
        { username: 'newstaff', first_name: 'Ada', last_name: 'Lovelace', role: 'teacher' },
        adminCookie
      ),
      env
    );
    const body = await res.json();
    const row = state.accounts.newstaff;
    if (
      res.status === 200 &&
      body.ok &&
      row &&
      row.staff_id > 3 &&
      row.first_name === 'Ada' &&
      row.last_name === 'Lovelace' &&
      row.display_name === 'Ada Lovelace' &&
      row.username === 'newstaff' &&
      body.temporary_password &&
      String(body.temporary_password).length >= 8
    ) {
      ok('new staff gets higher Staff ID + first/last + synced display_name + temp password');
    } else bad('new staff create', { status: res.status, body, row });
  }

  // client cannot choose staff_id on create
  {
    const res = await worker.fetch(
      req(
        'POST',
        '/api/admin/users',
        { username: 'evil', first_name: 'Evil', last_name: 'Actor', role: 'teacher', staff_id: 1 },
        adminCookie
      ),
      env
    );
    const body = await res.json();
    if (res.status === 400 && body.error === 'staff_id_not_assignable') ok('create rejects client-chosen Staff ID');
    else bad('create staff_id assign', body);
  }

  // 9 already covered; 10 username unchanged on name save
  {
    const beforeUser = 'teacher1';
    const beforeId = state.accounts.teacher1.staff_id;
    const res = await worker.fetch(
      req(
        'POST',
        '/api/admin/users/update',
        { username: beforeUser, first_name: 'Casey', last_name: 'Carter' },
        adminCookie
      ),
      env
    );
    const body = await res.json();
    const row = state.accounts.teacher1;
    if (
      body.ok &&
      row.username === 'teacher1' &&
      row.staff_id === beforeId &&
      row.first_name === 'Casey' &&
      row.last_name === 'Carter' &&
      row.display_name === 'Casey Carter'
    ) {
      ok('edit sets first/last, syncs display_name, username+Staff ID unchanged');
    } else bad('edit names', { body, row });
  }

  // 11 student identity unchanged via display_name-only update path
  {
    const before = { ...state.accounts['20889'] };
    const res = await worker.fetch(
      req('POST', '/api/admin/users/update', { username: '20889', display_name: 'Lucas M' }, adminCookie),
      env
    );
    const body = await res.json();
    const row = state.accounts['20889'];
    if (
      body.ok &&
      row.display_name === 'Lucas M' &&
      row.mtss_student_id === before.mtss_student_id &&
      row.staff_id == null &&
      row.first_name == null &&
      row.last_name == null &&
      row.username === '20889'
    ) {
      ok('student first/last remain unset; TMS identity keys unchanged');
    } else bad('student update identity', row);
  }

  // Admin auth: teacher cannot create staff
  {
    const teacherCookie = await cookieFor(teacher1);
    const res = await worker.fetch(
      req('POST', '/api/admin/users', { username: 'x', first_name: 'A', last_name: 'B', role: 'teacher' }, teacherCookie),
      env
    );
    if (res.status === 403) ok('Admin authorization: teacher forbidden from staff create');
    else bad('teacher create auth', res.status);
  }

  // allocateStaffId never reuses after "delete" (gap OK)
  {
    const a = await allocateStaffId(env.DB);
    const b = await allocateStaffId(env.DB);
    if (b === a + 1) ok('allocator monotonically increases (gaps acceptable)');
    else bad('allocator monotonic', { a, b });
  }
}

await runApi();

console.log('\nadmin-staff-identity-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
