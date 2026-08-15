/**
 * Prompt #42 — end-to-end identified-student name save.
 * Admin save handler → Lantern update route → actual TMS update helper → reread → roster reload → UI.
 * Usage: node worker/scripts/student-edit-42-e2e-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import lanternWorker from '../index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmsCandidates = [
  process.env.TMS_WORKER_PATH,
  path.resolve(root, '..', 'mtss-p49', 'worker', 'index.js'),
  path.resolve(root, '..', 'tms-42-save', 'worker', 'index.js'),
  'C:/Users/mrrad/AppData/Local/Temp/mtss-p49/worker/index.js',
].filter(Boolean);

let tmsWorkerPath = tmsCandidates.find((p) => {
  try {
    return fs.existsSync(p);
  } catch (_) {
    return false;
  }
});
if (!tmsWorkerPath) {
  console.error('STOPPED — TMS worker module not found. Set TMS_WORKER_PATH.');
  process.exit(1);
}

const tmsWorker = (await import(pathToFileUrl(tmsWorkerPath))).default;

function pathToFileUrl(p) {
  const abs = path.resolve(p).replace(/\\/g, '/');
  return abs.startsWith('/') ? 'file://' + abs : 'file:///' + abs;
}

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
const TEST_BRIDGE_SECRET = 'test-bridge-secret-not-real';
const adminHtml = fs.readFileSync(path.join(root, 'app/admin.html'), 'utf8');
const lanternSrc = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
const tmsSrc = fs.readFileSync(tmsWorkerPath, 'utf8');

function extractFunction(src, name) {
  const needle = 'function ' + name + '(';
  const start = src.indexOf(needle);
  if (start < 0) throw new Error('missing ' + name);
  const brace = src.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error('unclosed ' + name);
}

function loadAdminHelpers() {
  const src =
    'var STUDENT_EDIT_DEBUG_REVISION = "student-edit-42";\n' +
    extractFunction(adminHtml, 'studentsRosterVisibleName') +
    '\n' +
    extractFunction(adminHtml, 'buildStudentIdEditPayload') +
    '\n' +
    extractFunction(adminHtml, 'studentEditRequestedName') +
    '\n' +
    extractFunction(adminHtml, 'studentEditSaveAccepted') +
    '\n' +
    'return { studentsRosterVisibleName, buildStudentIdEditPayload, studentEditRequestedName, studentEditSaveAccepted, STUDENT_EDIT_DEBUG_REVISION };';
  return new Function(src)();
}

const helpers = loadAdminHelpers();

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

async function adminCookie() {
  const now = Math.floor(Date.now() / 1000);
  const token = await signTestJwt(
    { sub: 'admin', role: 'admin', scn: null, tid: null, iat: now, exp: now + 3600 },
    TEST_PILOT_SECRET
  );
  return `lantern_pilot=${token}`;
}

function makeLanternEnv() {
  const accounts = {
    admin: {
      username: 'admin',
      display_name: 'Web Admin',
      role: 'admin',
      is_active: 1,
      must_change_password: 0,
      password_hash: 'HASH_SHOULD_NEVER_APPEAR',
      password_salt: 'SALT_SHOULD_NEVER_APPEAR',
    },
  };
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
          return accounts[String(binds[0] || '').trim().toLowerCase()] || null;
        }
        return null;
      },
      async all() {
        return { results: [] };
      },
      async run() {
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
  };
}

function makeTmsDb(state, opts) {
  const options = opts || {};
  state.students = state.students || [];
  state.memberships = state.memberships || [];
  state.logs = state.logs || [];
  state.sql = state.sql || [];
  state.gradeCatId = 6;
  state.gradeGroups = [
    { id: 61, slug: 'grade-6', category_id: 6 },
    { id: 62, slug: 'grade-7', category_id: 6 },
    { id: 63, slug: 'grade-8', category_id: 6 },
  ];

  function prepare(sql) {
    const s = String(sql);
    const binds = [];
    const api = {
      bind(...args) {
        binds.push(...args);
        return api;
      },
      async first() {
        if (s.includes('FROM students WHERE student_name = ? AND student_id = ?')) {
          return (
            state.students.find(
              (r) => r.student_name === binds[0] && String(r.student_id ?? '') === String(binds[1] ?? '')
            ) || null
          );
        }
        if (s.includes("FROM student_group_categories WHERE slug = 'grade'")) return { id: 6 };
        if (s.includes('FROM student_groups WHERE category_id = ? AND slug = ?')) {
          return state.gradeGroups.find((g) => g.category_id === binds[0] && g.slug === binds[1]) || null;
        }
        return null;
      },
      async all() {
        if (
          s.includes('FROM students') &&
          s.includes('WHERE student_id = ?') &&
          s.includes("TRIM(COALESCE(student_id, '')) != ''") &&
          !s.includes('NOT (')
        ) {
          const rows = state.students.filter(
            (r) => String(r.student_id || '') === String(binds[0]) && String(r.student_id || '').trim()
          );
          if (options.staleReadbackName) {
            return { results: rows.map((r) => ({ ...r, student_name: options.staleReadbackName })) };
          }
          return { results: rows };
        }
        if (s.includes('FROM students') && s.includes('NOT (student_id = ?')) {
          return {
            results: state.students
              .filter(
                (r) =>
                  r.student_name === binds[0] &&
                  !(String(r.student_id || '') === String(binds[1] ?? '') && String(r.student_id || '').trim() !== '')
              )
              .map((r) => ({ student_id: r.student_id })),
          };
        }
        if (s.includes('FROM student_group_memberships WHERE student_id = ?')) {
          return { results: state.memberships.filter((m) => String(m.student_id ?? '') === String(binds[0] ?? '')) };
        }
        if (s.includes('FROM student_groups WHERE category_id = ? AND id != ?')) {
          return { results: state.gradeGroups.filter((g) => g.category_id === binds[0] && g.id !== binds[1]) };
        }
        if (s.includes('FROM student_groups WHERE category_id = ?')) {
          return { results: state.gradeGroups.filter((g) => g.category_id === binds[0]) };
        }
        if (s.includes('FROM student_group_memberships WHERE group_id IN')) {
          const ids = new Set(binds.map(Number));
          return { results: state.memberships.filter((m) => ids.has(Number(m.group_id))) };
        }
        if (s.includes('FROM students')) {
          const rows = s.includes('WHERE is_active = 1')
            ? state.students.filter((r) => Number(r.is_active) === 1)
            : state.students.slice();
          return { results: rows };
        }
        return { results: [] };
      },
      async run() {
        state.sql.push({ sql: s, binds: binds.slice() });
        if (s.includes('UPDATE students SET first_name')) {
          let n = 0;
          state.students.forEach((r) => {
            if (String(r.student_id ?? '') === String(binds[2] ?? '') && String(r.student_id || '').trim()) {
              r.first_name = binds[0];
              r.last_name = binds[1];
              n += 1;
            }
          });
          return { success: true, meta: { changes: n } };
        }
        if (s.includes('UPDATE students SET student_name')) {
          if (options.skipNameWrite) return { success: true, meta: { changes: 0 } };
          const newName = binds[0];
          const sid = String(binds[1] ?? '');
          const blocking = state.memberships.filter((m) => String(m.student_id ?? '') === sid);
          if (blocking.length) {
            const err = new Error('FOREIGN KEY constraint failed');
            err.status = 400;
            throw err;
          }
          let n = 0;
          state.students.forEach((r) => {
            if (String(r.student_id ?? '') === sid && String(r.student_id || '').trim()) {
              r.student_name = newName;
              n += 1;
            }
          });
          return { success: true, meta: { changes: n } };
        }
        if (s.includes('DELETE FROM student_group_memberships') && !s.includes('group_id')) {
          const sid = String(binds[0] ?? '');
          state.memberships = state.memberships.filter((m) => String(m.student_id ?? '') !== sid);
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes('INSERT INTO student_group_memberships') || s.includes('INSERT OR IGNORE INTO student_group_memberships')) {
          const rec = { student_name: binds[0], student_id: binds[1], group_id: binds[2] };
          const exists = state.memberships.some(
            (m) =>
              m.student_name === rec.student_name &&
              String(m.student_id) === String(rec.student_id) &&
              Number(m.group_id) === Number(rec.group_id)
          );
          if (!exists) state.memberships.push(rec);
          return { success: true, meta: { changes: exists ? 0 : 1 } };
        }
        if (s.includes('DELETE FROM student_group_memberships') && s.includes('group_id IN')) {
          const name = binds[0];
          const sid = String(binds[1] ?? '');
          const ids = new Set(binds.slice(2).map(Number));
          state.memberships = state.memberships.filter(
            (m) => !(m.student_name === name && String(m.student_id ?? '') === sid && ids.has(Number(m.group_id)))
          );
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes('UPDATE logs SET student_name')) {
          state.logs.forEach((r) => {
            if (r.student_name === binds[1]) r.student_name = binds[0];
          });
          return { success: true, meta: { changes: 1 } };
        }
        return { success: true, meta: { changes: 0 } };
      },
    };
    return api;
  }
  return { prepare };
}

function fixtureState() {
  return {
    students: [
      { student_name: 'Phay Son Khuu', student_id: '21004', is_active: 1 },
      { student_name: 'Other Student', student_id: '19999', is_active: 1 },
    ],
    memberships: [{ student_name: 'Phay Son Khuu', student_id: '21004', group_id: 62 }],
    logs: [{ student_name: 'Phay Son Khuu' }],
    sql: [],
  };
}

function renderRosterRowHtml(s) {
  const visible = helpers.studentsRosterVisibleName(s);
  return (
    '<details data-student-id="' +
    String(s.student_id || '') +
    '" data-visible-name="' +
    visible +
    '"><span>' +
    String(s.first_name || '—') +
    '</span><span>' +
    String(s.last_name || '—') +
    '</span></details>'
  );
}

const saveDefs = adminHtml.split('function saveStudentIdEdit');
if (saveDefs.length === 2) ok('exactly one saveStudentIdEdit in Admin');
else bad('duplicate saveStudentIdEdit', saveDefs.length - 1);
if ((adminHtml.match(/student-edit-42/g) || []).length >= 1) ok('Admin source contains student-edit-42');
else bad('admin marker');
if (lanternSrc.includes("debug_revision: STUDENT_EDIT_DEBUG_REVISION") || lanternSrc.includes("student-edit-42")) {
  ok('Lantern update route stamps student-edit-42');
} else bad('lantern marker');
if (tmsSrc.includes('rows_changed') && tmsSrc.includes('roster_name_not_updated') && tmsSrc.includes('student-edit-42')) {
  ok('TMS rename requires exactly one changed roster row');
} else bad('tms mutation marker');
if (adminHtml.includes('studentsEditIdSaveBtn') && adminHtml.includes("addEventListener('click', saveStudentIdEdit)")) {
  ok('Save button click is the winning handler');
} else bad('click handler');
if (adminHtml.includes('type="button"') && adminHtml.includes('id="studentsEditIdSaveBtn"')) {
  ok('Save is type=button (no form-submit twin path)');
} else bad('button type');

const formFields = {
  previous_student_name: 'Phay Son Khuu',
  previous_student_id: '21004',
  first_name: 'Test',
  last_name: 'Rename',
  student_id: '21004',
  grade: '7',
};
const browserPayload = helpers.buildStudentIdEditPayload(formFields);
const requestedName = helpers.studentEditRequestedName(formFields.first_name, formFields.last_name);
if (
  browserPayload.first_name === 'Test' &&
  browserPayload.last_name === 'Rename' &&
  browserPayload.student_id === '21004' &&
  browserPayload.previous_student_name === 'Phay Son Khuu' &&
  requestedName === 'Test Rename'
) {
  ok('1. browser payload contains Test Rename');
} else bad('1 payload', browserPayload);

async function runChain(state, payload, opts) {
  const forwarded = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const parsed = JSON.parse(init && init.body ? init.body : '{}');
    forwarded.push({ url: String(url), body: parsed });
    const req = new Request(String(url), {
      method: 'POST',
      headers: init.headers || {},
      body: JSON.stringify(parsed),
    });
    return tmsWorker.fetch(req, {
      DB: makeTmsDb(state, opts),
      TMS_LANTERN_BRIDGE_SECRET: TEST_BRIDGE_SECRET,
    });
  };
  try {
    const cookie = await adminCookie();
    const updateRes = await lanternWorker.fetch(
      new Request('https://lantern.test/api/admin/tms-roster/update', {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
      makeLanternEnv()
    );
    const updateBody = await updateRes.json();
    const listRes = await lanternWorker.fetch(
      new Request('https://lantern.test/api/admin/tms-roster?include_inactive=1', {
        method: 'GET',
        headers: { Cookie: cookie },
      }),
      makeLanternEnv()
    );
    const listBody = await listRes.json();
    return { updateRes, updateBody, listRes, listBody, forwarded };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function run() {
  const state = fixtureState();
  const chain = await runChain(state, browserPayload);
  const updateFwd = chain.forwarded.find((f) => String(f.url).includes('roster/update'));
  if (updateFwd && updateFwd.body.next_student_name === 'Test Rename' && updateFwd.body.first_name === 'Test') {
    ok('2. Lantern forwards Test Rename');
  } else bad('2 lantern forward', chain.forwarded);
  const nameWrite = state.sql.find((q) => q.sql.includes('UPDATE students SET student_name'));
  if (nameWrite && nameWrite.binds[0] === 'Test Rename' && nameWrite.binds[1] === '21004') {
    ok('3. TMS SQL updates Test Rename');
  } else bad('3 sql', state.sql);
  const row = state.students.find((s) => s.student_id === '21004');
  if (row && row.student_name === 'Test Rename') ok('4. authoritative reread row is Test Rename');
  else bad('4 db', state.students);
  if (
    chain.updateRes.status === 200 &&
    chain.updateBody.ok &&
    chain.updateBody.verified === true &&
    chain.updateBody.debug_revision === 'student-edit-42' &&
    chain.updateBody.authoritative_student_name === 'Test Rename' &&
    chain.updateBody.authoritative_student_id === '21004'
  ) {
    ok('5. response verified=true with student-edit-42');
  } else bad('5 response', { status: chain.updateRes.status, body: chain.updateBody });
  if (helpers.studentEditSaveAccepted(chain.updateBody, 'Test Rename', '21004')) {
    ok('6. client accepts success');
  } else bad('6 client accept', chain.updateBody);
  const listed = (chain.listBody.students || []).find((s) => String(s.student_id) === '21004');
  if (listed && listed.student_name === 'Test Rename' && listed.first_name === 'Test' && listed.last_name === 'Rename') {
    ok('7. subsequent roster GET returns Test Rename');
  } else bad('7 list', { status: chain.listRes.status, listed, body: chain.listBody });
  const html = listed ? renderRosterRowHtml(listed) : '';
  if (html.includes('data-visible-name="Test Rename"') && html.includes('Test') && html.includes('Rename')) {
    ok('8. UI renderer displays Test Rename');
  } else bad('8 ui', html);

  const stale = fixtureState();
  const staleChain = await runChain(stale, browserPayload, { skipNameWrite: true });
  if (
    staleChain.updateBody.ok !== true &&
    staleChain.updateBody.verified !== true &&
    staleChain.updateBody.debug_revision === 'student-edit-42' &&
    !helpers.studentEditSaveAccepted(staleChain.updateBody, 'Test Rename', '21004') &&
    stale.students.some((s) => s.student_id === '21004' && s.student_name === 'Phay Son Khuu')
  ) {
    ok('authoritative no-op: verified=false and client MUST NOT show success');
  } else bad('noop', staleChain.updateBody);

  const probe = await lanternWorker.fetch(
    new Request('https://lantern.test/api/admin/tms-roster/update', { method: 'GET' }),
    makeLanternEnv()
  );
  const probeBody = await probe.json();
  if (probe.status === 200 && probeBody.debug_revision === 'student-edit-42' && probeBody.mutating === false) {
    ok('non-mutating GET probe returns student-edit-42');
  } else bad('probe', { status: probe.status, body: probeBody });

  console.log('\nstudent-edit-42-e2e-test:', pass, 'PASS', fail, 'FAIL');
  if (fail) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
