/**
 * Prompt #32 — unified Admin Add Student (TMS first, then Lantern login).
 * Usage: node worker/scripts/admin-add-student-32-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import worker from '../index.js';
import { ADD_STUDENT_PATH, findTmsStudentsById } from '../admin-add-student.js';
import { GEPPETTO_STUDENT_ROSTER_PATH, buildGeppettoStudentRosterPayload } from '../geppetto-student-handoff.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

const TEST_PILOT_SECRET = 'test-secret-not-a-real-pilot-session-secret';
const TEST_BRIDGE_SECRET = 'test-bridge-secret-not-real';
const TEST_GEPPETTO_SECRET = 'test-geppetto-bridge-secret-not-real';

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

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
  state.tmsStudents = state.tmsStudents || [];
  state.bridgeCalls = state.bridgeCalls || [];
  state.insertFailOnce = !!state.insertFailOnce;
  state.legacyWalletWrites = state.legacyWalletWrites || 0;

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
        if (s.includes('mtss_student_id IS NOT NULL') && s.includes('lower(trim(mtss_student_id))')) {
          const sid = String(binds[0] || '').trim().toLowerCase();
          return {
            results: Object.values(state.accounts).filter((a) => {
              const mid = a.mtss_student_id != null ? String(a.mtss_student_id).trim().toLowerCase() : '';
              return mid && mid === sid;
            }),
          };
        }
        return { results: [] };
      },
      async run() {
        if (s.includes('INSERT INTO lantern_pilot_accounts')) {
          if (state.insertFailOnce) {
            state.insertFailOnce = false;
            return { success: false, meta: { changes: 0 } };
          }
          const username = String(binds[0] || '').trim();
          state.accounts[username.toLowerCase()] = {
            username,
            display_name: binds[1],
            first_name: binds[2],
            last_name: binds[3],
            role: binds[8],
            password_hash: binds[9],
            password_salt: binds[10],
            mtss_student_id: binds[13],
            is_active: 1,
            must_change_password: binds[14],
          };
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes('UPDATE lantern_pilot_accounts SET mtss_student_id')) {
          const mtss = binds[0];
          const username = String(binds[1] || '').trim();
          const key = username.toLowerCase();
          if (state.accounts[key]) state.accounts[key] = { ...state.accounts[key], mtss_student_id: mtss };
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
    TMS_LANTERN_BRIDGE_SECRET: TEST_BRIDGE_SECRET,
    TMS_NUGGETS_API_BASE_URL: 'https://tms.test',
    LANTERN_GEPPETTO_BRIDGE_SECRET: TEST_GEPPETTO_SECRET,
    _state: state,
  };
}

function adminReq(method, path, body, cookie) {
  const headers = { Cookie: cookie || '' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return new Request('https://lantern.test' + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const originalFetch = globalThis.fetch;

async function withMockedBridge(env, fn) {
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    const body = init && init.body ? JSON.parse(init.body) : {};
    env._state.bridgeCalls.push({ url: u, body, auth: (init && init.headers && init.headers.Authorization) || '' });
    if (!u.includes('/api/lantern-bridge/')) {
      return new Response(JSON.stringify({ ok: false, error: 'unexpected_url' }), { status: 500 });
    }
    const sub = u.split('/api/lantern-bridge/')[1];
    if (sub === 'roster/list') {
      return new Response(JSON.stringify({ ok: true, students: env._state.tmsStudents }), { status: 200 });
    }
    if (sub === 'roster/create') {
      if (env._state.createFail) {
        return new Response(JSON.stringify({ ok: false, error: 'tms_create_failed' }), { status: 502 });
      }
      const sid = String(body.student_id || '').trim();
      const dup = env._state.tmsStudents.filter((s) => String(s.student_id || '').trim() === sid);
      if (sid && dup.length) {
        return new Response(
          JSON.stringify({ ok: false, error: 'duplicate_student_id', code: 'duplicate_student_id' }),
          { status: 409 }
        );
      }
      const row = {
        student_name: body.student_name,
        first_name: body.first_name != null ? body.first_name : null,
        last_name: body.last_name != null ? body.last_name : null,
        student_id: sid,
        is_active: 1,
        grade: body.grade || '6',
      };
      env._state.tmsStudents.push(row);
      return new Response(JSON.stringify({ ok: true, ...row, grade_slug: 'grade-' + (body.grade || '6') }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: false, error: 'unhandled_sub', sub }), { status: 404 });
  };
  try {
    return await fn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function addStudent(env, cookie, body) {
  const res = await worker.fetch(adminReq('POST', ADD_STUDENT_PATH, body, cookie), env);
  const json = await res.json();
  return { status: res.status, json };
}

async function run() {
  const admin = account();
  const teacher = account({ username: 'ms_carter', display_name: 'Ms Carter', role: 'teacher' });
  const adminCookie = await cookieFor(admin);
  const teacherCookie = await cookieFor(teacher);

  if (findTmsStudentsById([{ student_id: '20889' }, { student_id: '1' }], '20889').length === 1) {
    ok('helper matches exact Student ID only');
  } else bad('helper');

  const adminHtml = read('app/admin.html');
  const addSrc = read('worker/admin-add-student.js');
  const indexSrc = read('worker/index.js');
  if (adminHtml.includes("postAdminJson('/api/admin/students/add'") && /School Student ID/.test(adminHtml)) {
    ok('UI posts unified add and requires School Student ID');
  } else bad('UI add wiring');
  if (!/TMS_LANTERN_BRIDGE_SECRET/.test(adminHtml) && !/LANTERN_GEPPETTO_BRIDGE_SECRET/.test(adminHtml)) {
    ok('10. no TMS/Geppetto secret in Admin HTML');
  } else bad('secret in browser');
  if (!/INSERT INTO students/.test(addSrc) && !/geppetto.*D1|roster_student_id/.test(addSrc)) {
    ok('13. Add Student does not write Geppetto or TMS D1 directly');
  } else bad('direct write');
  if (indexSrc.includes('addAuthoritativeStudent') && indexSrc.includes('callTmsRosterBridge')) {
    ok('uses existing TMS roster bridge');
  } else bad('bridge wiring');
  if (/pilotHashPassword/.test(indexSrc) && addSrc.includes('generateStaffTempPassword')) {
    ok('11. password hashing/temp-password pattern unchanged');
  } else bad('password pattern');

  const env = makeEnv({
    accounts: {
      admin,
      [teacher.username]: teacher,
    },
    tmsStudents: [{ student_name: 'Lucas Radle', student_id: '20889', is_active: 1, grade: '8' }],
  });

  await withMockedBridge(env, async () => {
    const created = await addStudent(env, adminCookie, {
      first_name: 'New',
      last_name: 'Miner',
      student_id: '33001',
      grade: '6',
    });
    const row = env._state.accounts['33001'];
    const tms = env._state.tmsStudents.find((s) => s.student_id === '33001');
    if (
      created.status === 200 &&
      created.json.ok &&
      created.json.tms_roster === 'created' &&
      created.json.lantern_login === 'created' &&
      created.json.mtss_student_id === '33001' &&
      created.json.lantern_username === '33001' &&
      created.json.temporary_password &&
      created.json.geppetto === 'available_on_next_roster_sync' &&
      tms &&
      row &&
      row.mtss_student_id === '33001' &&
      row.role === 'student' &&
      row.must_change_password === 1 &&
      row.password_hash &&
      row.password_hash !== created.json.temporary_password
    ) {
      ok('1. new student ID creates TMS + Lantern login with matching mtss_student_id');
    } else bad('1 new student', created);

    const createCalls = env._state.bridgeCalls.filter((c) => c.url.includes('roster/create'));
    if (createCalls.length === 1 && createCalls[0].auth === 'Bearer ' + TEST_BRIDGE_SECRET && createCalls[0].body.student_id === '33001') {
      ok('TMS create uses existing S2S bridge secret');
    } else bad('create bridge', createCalls);
    if (
      createCalls[0] &&
      createCalls[0].body.first_name === 'New' &&
      createCalls[0].body.last_name === 'Miner' &&
      createCalls[0].body.student_name === 'New Miner' &&
      tms &&
      tms.first_name === 'New' &&
      tms.last_name === 'Miner' &&
      row.first_name === 'New' &&
      row.last_name === 'Miner'
    ) {
      ok('TMS create and Lantern login keep exact first_name, last_name, and student_name');
    } else bad('exact name parts', { create: createCalls[0] && createCalls[0].body, tms, row });

    const existingTms = await addStudent(env, adminCookie, {
      first_name: 'Pat',
      last_name: 'Existing',
      student_id: '20889',
      grade: '8',
    });
    const pat = env._state.accounts['20889'];
    const lucasRows = env._state.tmsStudents.filter((s) => s.student_id === '20889');
    if (
      existingTms.status === 200 &&
      existingTms.json.ok &&
      existingTms.json.tms_roster === 'existing' &&
      existingTms.json.lantern_login === 'created' &&
      existingTms.json.mtss_student_id === '20889' &&
      lucasRows.length === 1 &&
      pat &&
      pat.mtss_student_id === '20889'
    ) {
      ok('2. existing TMS student is not duplicated; Lantern login created/linked');
    } else bad('2 existing TMS', existingTms);

    const again = await addStudent(env, adminCookie, {
      first_name: 'New',
      last_name: 'Miner',
      student_id: '33001',
      grade: '6',
    });
    const tms33001 = env._state.tmsStudents.filter((s) => s.student_id === '33001');
    if (
      again.status === 200 &&
      again.json.ok &&
      again.json.already_linked &&
      again.json.lantern_login === 'linked' &&
      tms33001.length === 1 &&
      !again.json.temporary_password
    ) {
      ok('3. both already linked is idempotent / no duplicate');
    } else bad('3 idempotent', again);

    env._state.accounts['44002'] = account({
      username: '44002',
      display_name: 'Unlinked',
      role: 'student',
      mtss_student_id: null,
    });
    env._state.tmsStudents.push({ student_name: 'Unlinked Kid', student_id: '44002', is_active: 1 });
    const linked = await addStudent(env, adminCookie, {
      first_name: 'Unlinked',
      last_name: 'Kid',
      student_id: '44002',
    });
    if (
      linked.status === 200 &&
      linked.json.ok &&
      linked.json.lantern_login === 'linked' &&
      env._state.accounts['44002'].mtss_student_id === '44002' &&
      env._state.accounts['44002'].password_hash === 'HASH_SHOULD_NEVER_APPEAR'
    ) {
      ok('4. unlinked exact-ID username is safely linked; password unchanged');
    } else bad('4 unlinked link', linked);

    env._state.accounts['55003'] = account({
      username: '55003',
      role: 'student',
      mtss_student_id: '99991',
    });
    const conflict = await addStudent(env, adminCookie, {
      first_name: 'Conflict',
      last_name: 'Kid',
      student_id: '55003',
    });
    if (
      conflict.status === 409 &&
      conflict.json.error === 'account_has_different_mtss_student_id' &&
      env._state.accounts['55003'].mtss_student_id === '99991'
    ) {
      ok('5. Lantern account linked to a different ID is a conflict / no overwrite');
    } else bad('5 conflict', conflict);

    env._state.tmsStudents.push(
      { student_name: 'Dup A', student_id: '66004', is_active: 1 },
      { student_name: 'Dup B', student_id: '66004', is_active: 1 }
    );
    const dup = await addStudent(env, adminCookie, { first_name: 'Dup', last_name: 'Id', student_id: '66004' });
    if (dup.status === 409 && dup.json.error === 'duplicate_student_id' && !env._state.accounts['66004']) {
      ok('6. duplicate TMS Student ID fails safely; no Lantern account');
    } else bad('6 duplicate TMS', dup);

    env._state.createFail = true;
    const tmsFail = await addStudent(env, adminCookie, { first_name: 'Fail', last_name: 'Tms', student_id: '77005' });
    env._state.createFail = false;
    if (
      !tmsFail.json.ok &&
      tmsFail.json.lantern_login === 'not_created' &&
      !env._state.accounts['77005'] &&
      !env._state.tmsStudents.some((s) => s.student_id === '77005')
    ) {
      ok('7. TMS create failure does not create a Lantern account');
    } else bad('7 TMS fail', tmsFail);

    env._state.insertFailOnce = true;
    const split = await addStudent(env, adminCookie, { first_name: 'Split', last_name: 'Case', student_id: '88006' });
    if (
      !split.json.ok &&
      split.json.tms_roster === 'created' &&
      split.json.lantern_login === 'not_created' &&
      env._state.tmsStudents.some((s) => s.student_id === '88006') &&
      !env._state.accounts['88006']
    ) {
      ok('8. TMS success + Lantern create failure preserves TMS row');
    } else bad('8 split failure', split);
    const retry = await addStudent(env, adminCookie, { first_name: 'Split', last_name: 'Case', student_id: '88006' });
    if (retry.status === 200 && retry.json.ok && retry.json.tms_roster === 'existing' && retry.json.lantern_login === 'created' && env._state.accounts['88006']) {
      ok('8b. retry completes Lantern login against existing TMS identity');
    } else bad('8b retry', retry);

    const teacherTry = await addStudent(env, teacherCookie, { first_name: 'Nope', last_name: 'X', student_id: '99007' });
    if (teacherTry.status === 403 && !env._state.accounts['99007']) {
      ok('9. non-admin cannot add student');
    } else bad('9 teacher', teacherTry);

    const rosterRes = await worker.fetch(
      new Request('https://lantern.test' + GEPPETTO_STUDENT_ROSTER_PATH, {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + TEST_GEPPETTO_SECRET },
      }),
      env
    );
    const rosterJson = await rosterRes.json();
    const ids = (rosterJson.students || []).map((s) => s.student_id);
    if (rosterRes.status === 200 && rosterJson.ok && ids.includes('33001') && ids.includes('88006')) {
      ok('12. new students appear in Geppetto S2S roster output');
    } else bad('12 geppetto roster', rosterJson);

    const payload = buildGeppettoStudentRosterPayload(env._state.tmsStudents);
    if (payload.ok && payload.students.some((s) => s.student_id === '33001')) {
      ok('Geppetto payload builder sees the new TMS id');
    } else bad('payload builder');
  });

  console.log('\nadmin-add-student-32-test:', pass, 'PASS', fail, 'FAIL');
  if (fail) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
