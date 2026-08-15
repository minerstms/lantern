/**
 * Prompt #52 — Add Student preserves exact first_name / last_name.
 * Usage: node worker/scripts/admin-name-parts-52-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import worker from '../index.js';
import { ADD_STUDENT_PATH } from '../admin-add-student.js';
import { buildGeppettoStudentRosterPayload } from '../geppetto-student-handoff.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

const TEST_PILOT_SECRET = 'test-secret-not-a-real-pilot-session-secret';
const TEST_BRIDGE_SECRET = 'test-bridge-secret-not-real';

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
    scn: null,
    tid: null,
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
    _state: state,
  };
}

function adminReq(body, cookie) {
  return new Request('https://lantern.test' + ADD_STUDENT_PATH, {
    method: 'POST',
    headers: { Cookie: cookie || '', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const originalFetch = globalThis.fetch;

async function withMockedBridge(env, fn) {
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    const body = init && init.body ? JSON.parse(init.body) : {};
    env._state.bridgeCalls.push({ url: u, body });
    const sub = u.split('/api/lantern-bridge/')[1];
    if (sub === 'roster/list') {
      return new Response(JSON.stringify({ ok: true, students: env._state.tmsStudents }), { status: 200 });
    }
    if (sub === 'roster/create') {
      if (env._state.createFail) {
        return new Response(JSON.stringify({ ok: false, error: 'tms_create_failed' }), { status: 502 });
      }
      const sid = String(body.student_id || '').trim();
      const row = {
        student_name: body.student_name,
        first_name: body.first_name,
        last_name: body.last_name,
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
  const res = await worker.fetch(adminReq(body, cookie), env);
  const json = await res.json();
  return { status: res.status, json };
}

async function run() {
  const addSrc = read('worker/admin-add-student.js');
  const handoffSrc = read('worker/geppetto-student-handoff.js');
  if (/first_name: spec\.firstName/.test(addSrc) && /last_name: spec\.lastName/.test(addSrc)) {
    ok('Add Student bridge payload includes exact first_name and last_name');
  } else bad('add payload missing parts');
  if (!/findTmsStudentsByName|match.*student_name|fuzzy/.test(addSrc)) {
    ok('12. Add Student does not introduce name-based linking');
  } else bad('name-based linking');
  if (handoffSrc.includes('const hasParts = s.first_name != null || s.last_name != null')) {
    ok('Geppetto roster payload prefers TMS parts over split');
  } else bad('geppetto roster still always splits');

  const admin = account();
  const adminCookie = await cookieFor(admin);
  const env = makeEnv({ accounts: { admin } });

  await withMockedBridge(env, async () => {
    const created = await addStudent(env, adminCookie, {
      first_name: 'Mary Ann',
      last_name: 'Van der Berg',
      student_id: '52001',
      grade: '6',
    });
    const createCall = env._state.bridgeCalls.find((c) => c.url.includes('roster/create'));
    const tms = env._state.tmsStudents.find((s) => s.student_id === '52001');
    const lantern = env._state.accounts['52001'];
    if (createCall && createCall.body.first_name === 'Mary Ann') {
      ok('1. Add Student preserves exact first_name');
    } else bad('1 first_name', createCall && createCall.body);
    if (createCall && createCall.body.last_name === 'Van der Berg') {
      ok('2. Add Student preserves exact last_name');
    } else bad('2 last_name', createCall && createCall.body);
    if (
      createCall &&
      createCall.body.student_name === 'Mary Ann Van der Berg' &&
      created.json.student_name === 'Mary Ann Van der Berg' &&
      created.json.display_name === 'Mary Ann Van der Berg'
    ) {
      ok('3. student_name remains correct compatibility/display data');
    } else bad('3 student_name', created.json);
    if (created.json.student_id === '52001' && created.json.mtss_student_id === '52001' && tms && tms.student_id === '52001') {
      ok('4. exact student_id remains authoritative');
    } else bad('4 student_id', created.json);
    if (
      tms &&
      tms.first_name === 'Mary Ann' &&
      tms.last_name === 'Van der Berg' &&
      lantern &&
      lantern.first_name === 'Mary Ann' &&
      lantern.last_name === 'Van der Berg'
    ) {
      ok('TMS and Lantern store the same exact parts');
    } else bad('stored parts', { tms, lantern });

    const payload = buildGeppettoStudentRosterPayload(env._state.tmsStudents);
    const geppetto = (payload.students || []).find((s) => s.student_id === '52001');
    if (geppetto && geppetto.first_name === 'Mary Ann' && geppetto.last_name === 'Van der Berg') {
      ok('Geppetto S2S roster keeps multi-word first and last names');
    } else bad('geppetto payload', geppetto);

    env._state.createFail = true;
    const tmsFail = await addStudent(env, adminCookie, {
      first_name: 'Fail',
      last_name: 'Case',
      student_id: '52002',
    });
    env._state.createFail = false;
    if (
      !tmsFail.json.ok &&
      tmsFail.json.lantern_login === 'not_created' &&
      !env._state.accounts['52002'] &&
      !env._state.tmsStudents.some((s) => s.student_id === '52002')
    ) {
      ok('5. TMS failure prevents Lantern account creation');
    } else bad('5 TMS fail', tmsFail);

    env._state.insertFailOnce = true;
    const split = await addStudent(env, adminCookie, {
      first_name: 'Keep',
      last_name: 'Tms',
      student_id: '52003',
    });
    if (
      !split.json.ok &&
      split.json.tms_roster === 'created' &&
      split.json.lantern_login === 'not_created' &&
      env._state.tmsStudents.some((s) => s.student_id === '52003' && s.first_name === 'Keep' && s.last_name === 'Tms') &&
      !env._state.accounts['52003']
    ) {
      ok('6. TMS-success/Lantern-failure does not delete the TMS student');
    } else bad('6 split failure', split);
  });

  console.log('\nadmin-name-parts-52-test:', pass, 'PASS', fail, 'FAIL');
  if (fail) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
