/**
 * Prompt #48 — exact-ID student rename: DOM requested name, Lantern route,
 * TMS reread, fresh roster proof, editor close rules.
 * Usage: node worker/scripts/student-rename-48-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import lanternWorker from '../index.js';
import { STUDENT_RENAME_PATH, STUDENT_RENAME_REVISION, buildRenameRequestedName, renameAuthoritativeStudent } from '../admin-student-rename.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmsCandidates = [
  process.env.TMS_WORKER_PATH,
  path.resolve(root, '..', 'tms-48-rename', 'worker', 'index.js'),
  'C:/Users/mrrad/AppData/Local/Temp/tms-48-rename/worker/index.js',
].filter(Boolean);

function pathToFileUrl(p) {
  const abs = path.resolve(p).replace(/\\/g, '/');
  return abs.startsWith('/') ? 'file://' + abs : 'file:///' + abs;
}

let tmsWorkerPath = tmsCandidates.find((p) => {
  try {
    return fs.existsSync(p);
  } catch (_) {
    return false;
  }
});

let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

const TEST_PILOT_SECRET = 'test-secret-not-a-real-pilot-session-secret';
const TEST_BRIDGE_SECRET = 'test-bridge-secret-not-real';
const adminHtml = fs.readFileSync(path.join(root, 'app/admin.html'), 'utf8');
const lanternSrc = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');

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

if (adminHtml.split('function saveStudentIdEdit').length === 2) ok('exactly one saveStudentIdEdit');
else bad('duplicate saveStudentIdEdit');
if (adminHtml.includes('id="studentsEditSaveProof"') && adminHtml.includes('Save verification')) {
  ok('persistent Save verification box is in the editor');
} else bad('proof box missing');
if (
  adminHtml.includes('/api/admin/students/rename') &&
  adminHtml.includes('studentRenameFourStateAccepted') &&
  adminHtml.includes("cache: 'no-store'") &&
  adminHtml.includes('fetchFreshStudentsRosterForVerify') &&
  !/lastStudentsRoster/.test(extractFunction(adminHtml, 'fetchFreshStudentsRosterForVerify'))
) {
  ok('Save uses dedicated rename + fresh no-store roster, not lastStudentsRoster');
} else bad('save verification path');
if (
  lanternSrc.includes('path === STUDENT_RENAME_PATH') &&
  lanternSrc.includes('renameAuthoritativeStudent') &&
  lanternSrc.includes("from './admin-student-rename.js'")
) {
  ok('Lantern wires POST /api/admin/students/rename');
} else bad('lantern route');
if (
  lanternSrc.includes('handleAdminRoutes') &&
  lanternSrc.indexOf("toLowerCase() !== 'admin'") >= 0 &&
  lanternSrc.indexOf('path === STUDENT_RENAME_PATH') > lanternSrc.indexOf("toLowerCase() !== 'admin'")
) {
  ok('rename route is inside the admin-gated handler');
} else bad('admin gate');

const helpers = new Function(
  extractFunction(adminHtml, 'studentsRosterVisibleName') +
    '\n' +
    extractFunction(adminHtml, 'studentEditRequestedName') +
    '\n' +
    extractFunction(adminHtml, 'namesEqualForSaveProof') +
    '\n' +
    extractFunction(adminHtml, 'studentRenameFourStateAccepted') +
    '\n' +
    extractFunction(adminHtml, 'findRosterStudentByExactId') +
    '\n' +
    'return { studentsRosterVisibleName, studentEditRequestedName, namesEqualForSaveProof, studentRenameFourStateAccepted, findRosterStudentByExactId };'
)();

const firstInput = { value: 'Phay' };
const lastInput = { value: 'Son Son Khuu' };
if (helpers.studentEditRequestedName(firstInput.value, lastInput.value) === 'Phay Son Son Khuu') {
  ok('initial editor inputs request Phay Son Son Khuu');
} else bad('initial requested');
lastInput.value = 'Son Khuu';
const requestedFromDom = helpers.studentEditRequestedName(firstInput.value, lastInput.value);
if (requestedFromDom === 'Phay Son Khuu') {
  ok('DOM input test: REQUESTED is Phay Son Khuu from actual First/Last inputs');
} else bad('DOM requested', requestedFromDom);
if (buildRenameRequestedName('Phay', 'Son Khuu') === 'Phay Son Khuu') {
  ok('server requested-name builder matches DOM');
} else bad('server builder');
if (
  helpers.studentRenameFourStateAccepted('Phay Son Khuu', 'Phay Son Khuu', 'Phay Son Khuu', '21004', '21004') &&
  !helpers.studentRenameFourStateAccepted('Phay Son Khuu', 'Phay Son Son Khuu', 'Phay Son Khuu', '21004', '21004') &&
  !helpers.studentRenameFourStateAccepted('Phay Son Khuu', 'Phay Son Khuu', 'Phay Son Son Khuu', '21004', '21004')
) {
  ok('four-state success requires REQUESTED == CONFIRMED == RELOADED');
} else bad('four-state helper');

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
      bind(...args) { binds.push(...args); return api; },
      async first() {
        if (s.includes('FROM lantern_pilot_accounts WHERE lower(trim(username))')) {
          return accounts[String(binds[0] || '').trim().toLowerCase()] || null;
        }
        return null;
      },
      async all() { return { results: [] }; },
      async run() { return { success: true, meta: { changes: 0 } }; },
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

function makeEl(id, value) {
  return {
    id,
    value: value == null ? '' : value,
    hidden: false,
    disabled: false,
    style: { display: '' },
    innerHTML: '',
    textContent: '',
  };
}

function compileSave(harness) {
  const src = [
    'var studentsEditConflictState = null;',
    extractFunction(adminHtml, 'studentsRosterVisibleName'),
    extractFunction(adminHtml, 'buildStudentIdEditPayload'),
    extractFunction(adminHtml, 'studentEditRequestedName'),
    extractFunction(adminHtml, 'namesEqualForSaveProof'),
    extractFunction(adminHtml, 'studentRenameFourStateAccepted'),
    extractFunction(adminHtml, 'showStudentsEditSaveProof'),
    extractFunction(adminHtml, 'hideStudentsEditSaveProof'),
    extractFunction(adminHtml, 'fetchFreshStudentsRosterForVerify'),
    extractFunction(adminHtml, 'findRosterStudentByExactId'),
    extractFunction(adminHtml, 'studentEditSaveAccepted'),
    extractFunction(adminHtml, 'saveStudentIdEdit'),
    'return saveStudentIdEdit;',
  ].join('\n');
  return new Function(
    'document',
    'window',
    'api',
    'studentEditorState',
    'postAdminJson',
    'showStudentsRosterMsg',
    'setStudentsEditServerConfirm',
    'closeStudentsEditPanels',
    'loadStudentsRoster',
    'escapeRosterHtml',
    'isWebSystemAdminSession',
    'STUDENT_EDIT_DEBUG_REVISION',
    src
  )(
    harness.document,
    harness.window,
    harness.api,
    harness.studentEditorState,
    harness.postAdminJson,
    harness.showStudentsRosterMsg,
    harness.setStudentsEditServerConfirm,
    harness.closeStudentsEditPanels,
    harness.loadStudentsRoster,
    harness.escapeRosterHtml,
    harness.isWebSystemAdminSession,
    'student-edit-42'
  );
}

function makeSaveHarness(opts) {
  const els = {
    studentsEditPrevName: makeEl('studentsEditPrevName', opts.beforeName),
    studentsEditPrevId: makeEl('studentsEditPrevId', opts.studentId),
    studentsEditIdInput: makeEl('studentsEditIdInput', opts.studentId),
    studentsEditFirst: makeEl('studentsEditFirst', opts.first),
    studentsEditLast: makeEl('studentsEditLast', opts.last),
    studentsEditGrade: makeEl('studentsEditGrade', opts.grade || '6'),
    studentsEditMediaPublicity: makeEl('studentsEditMediaPublicity', 'Allowed'),
    studentsEditLanternUsername: makeEl('studentsEditLanternUsername', ''),
    studentsEditPublicDisplay: makeEl('studentsEditPublicDisplay', ''),
    studentsEditIdSaveBtn: makeEl('studentsEditIdSaveBtn'),
    studentsEditSaveProof: makeEl('studentsEditSaveProof'),
    studentsEditSaveProofBody: makeEl('studentsEditSaveProofBody'),
    studentsEditConflictBox: makeEl('studentsEditConflictBox'),
    studentsEditRetryBtn: makeEl('studentsEditRetryBtn'),
    studentsEditReviewConflictBtn: makeEl('studentsEditReviewConflictBtn'),
    studentsEditServerConfirm: makeEl('studentsEditServerConfirm'),
  };
  const log = { closed: false, rosterLoads: 0, msgs: [], posts: [], fetches: [], proof: '' };
  const document = {
    getElementById(id) { return els[id] || null; },
  };
  const harness = {
    document,
    window: { confirm() { return true; } },
    api: 'https://lantern.test',
    studentEditorState: {
      open: true,
      beforeName: opts.beforeName,
      beforeGrade: opts.grade || '6',
      beforeMedia: 'Allowed',
      beforePublicDisplay: '',
      studentId: opts.studentId,
    },
    postAdminJson(path, body) {
      log.posts.push({ path, body });
      return Promise.resolve(opts.onPost ? opts.onPost(path, body, log) : { okHttp: false, status: 500, body: { ok: false } });
    },
    showStudentsRosterMsg(text) { log.msgs.push(String(text || '')); },
    setStudentsEditServerConfirm() {},
    closeStudentsEditPanels() { log.closed = true; },
    loadStudentsRoster() { log.rosterLoads += 1; },
    escapeRosterHtml(s) { return String(s || '').replace(/</g, '&lt;'); },
    isWebSystemAdminSession() { return true; },
    log,
    els,
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    log.fetches.push({ url: String(url), cache: init && init.cache, headers: init && init.headers });
    const payload = opts.onRosterFetch ? opts.onRosterFetch() : { ok: true, students: [] };
    return {
      ok: true,
      status: 200,
      json: async () => payload,
    };
  };
  harness.restore = () => { globalThis.fetch = originalFetch; };
  harness.save = compileSave(harness);
  return harness;
}

async function runEditorCase(label, opts, assertFn) {
  const harness = makeSaveHarness(opts);
  try {
    await Promise.resolve(harness.save());
    await new Promise((r) => setTimeout(r, 0));
    assertFn(harness.log, harness.els);
  } finally {
    harness.restore();
  }
}

{
  const echo = await renameAuthoritativeStudent(null, {}, {
    student_id: '21004',
    first_name: 'Phay',
    last_name: 'Son Khuu',
  }, {
    async callTmsRosterBridge() {
      return {
        ok: true,
        verified: true,
        student_id: '21004',
        before_name: 'Phay Son Son Khuu',
        requested_name: 'Phay Son Khuu',
        authoritative_name: 'Phay Son Khuu',
        changes: 1,
      };
    },
  });
  if (echo.ok && echo.verified && echo.authoritative_name === 'Phay Son Khuu' && echo.revision === STUDENT_RENAME_REVISION) {
    ok('Lantern rename helper accepts TMS reread, not request echo construction');
  } else bad('helper success', echo);
}

{
  const faked = await renameAuthoritativeStudent(null, {}, {
    student_id: '21004',
    first_name: 'Phay',
    last_name: 'Son Khuu',
  }, {
    async callTmsRosterBridge() {
      return {
        ok: true,
        verified: true,
        student_id: '21004',
        before_name: 'Phay Son Son Khuu',
        requested_name: 'Phay Son Khuu',
        authoritative_name: '',
        changes: 1,
      };
    },
  });
  if (!faked.ok && faked.verified !== true && faked.authoritative_name == null) {
    ok('Lantern refuses success when TMS omits authoritative_name');
  } else bad('no echo fallback', faked);
}

await runEditorCase('happy path', {
  beforeName: 'Phay Son Son Khuu',
  studentId: '21004',
  first: 'Phay',
  last: 'Son Khuu',
  onPost(path) {
    if (path === '/api/admin/students/rename') {
      return {
        okHttp: true,
        status: 200,
        body: {
          ok: true,
          verified: true,
          revision: 'student-rename-48',
          student_id: '21004',
          before_name: 'Phay Son Son Khuu',
          requested_name: 'Phay Son Khuu',
          authoritative_name: 'Phay Son Khuu',
          changes: 1,
        },
      };
    }
    return { okHttp: true, status: 200, body: { ok: true } };
  },
  onRosterFetch() {
    return {
      ok: true,
      students: [{ student_id: '21004', student_name: 'Phay Son Khuu', first_name: 'Phay', last_name: 'Son Khuu' }],
    };
  },
}, (log) => {
  const renamePost = log.posts.find((p) => p.path === '/api/admin/students/rename');
  if (
    renamePost &&
    renamePost.body.student_id === '21004' &&
    renamePost.body.first_name === 'Phay' &&
    renamePost.body.last_name === 'Son Khuu' &&
    !('grade' in renamePost.body) &&
    !('previous_student_name' in renamePost.body)
  ) {
    ok('Save posts name-only rename from actual inputs');
  } else bad('rename post', log.posts);
  if (log.fetches.some((f) => f.cache === 'no-store' && String(f.url).includes('/api/admin/tms-roster'))) {
    ok('verification roster fetch uses cache no-store');
  } else bad('fresh fetch', log.fetches);
  if (log.closed === true) ok('editor closes after REQUESTED == CONFIRMED == RELOADED');
  else bad('happy close', log);
});

await runEditorCase('A zero changes', {
  beforeName: 'Phay Son Son Khuu',
  studentId: '21004',
  first: 'Phay',
  last: 'Son Khuu',
  onPost() {
    return {
      okHttp: false,
      status: 409,
      body: { ok: false, verified: false, revision: 'student-rename-48', code: 'roster_name_not_updated', authoritative_name: 'Phay Son Son Khuu' },
    };
  },
}, (log) => {
  if (log.closed !== true && log.msgs.some((m) => /still open|couldn\'t save|failed/i.test(m))) {
    ok('A. TMS zero changes keeps editor open');
  } else bad('A', log);
});

await runEditorCase('B stale reread', {
  beforeName: 'Phay Son Son Khuu',
  studentId: '21004',
  first: 'Phay',
  last: 'Son Khuu',
  onPost() {
    return {
      okHttp: false,
      status: 409,
      body: { ok: false, verified: false, revision: 'student-rename-48', code: 'authoritative_update_not_applied', authoritative_name: 'Phay Son Son Khuu' },
    };
  },
}, (log) => {
  if (log.closed !== true) ok('B. TMS reread old name keeps editor open');
  else bad('B', log);
});

await runEditorCase('C roster stale', {
  beforeName: 'Phay Son Son Khuu',
  studentId: '21004',
  first: 'Phay',
  last: 'Son Khuu',
  onPost(path) {
    if (path === '/api/admin/students/rename') {
      return {
        okHttp: true,
        status: 200,
        body: {
          ok: true,
          verified: true,
          revision: 'student-rename-48',
          student_id: '21004',
          authoritative_name: 'Phay Son Khuu',
        },
      };
    }
    return { okHttp: true, status: 200, body: { ok: true } };
  },
  onRosterFetch() {
    return {
      ok: true,
      students: [{ student_id: '21004', student_name: 'Phay Son Son Khuu', first_name: 'Phay', last_name: 'Son Son Khuu' }],
    };
  },
}, (log, els) => {
  if (log.closed !== true && /Phay Son Khuu/.test(els.studentsEditSaveProofBody.innerHTML) && /Phay Son Son Khuu/.test(els.studentsEditSaveProofBody.innerHTML)) {
    ok('C. TMS new / roster old keeps editor open and shows both values');
  } else bad('C', { closed: log.closed, html: els.studentsEditSaveProofBody.innerHTML });
});

await runEditorCase('D dest conflict', {
  beforeName: 'Phay Son Son Khuu',
  studentId: '21004',
  first: 'Phay',
  last: 'Son Khuu',
  onPost() {
    return {
      okHttp: false,
      status: 409,
      body: { ok: false, verified: false, code: 'destination_name_taken', authoritative_name: 'Phay Son Son Khuu' },
    };
  },
}, (log) => {
  if (log.closed !== true && log.msgs.some((m) => /blocking/i.test(m))) ok('D. destination-name conflict keeps editor open');
  else bad('D', log);
});

await runEditorCase('E duplicate id', {
  beforeName: 'Phay Son Son Khuu',
  studentId: '21004',
  first: 'Phay',
  last: 'Son Khuu',
  onPost() {
    return {
      okHttp: false,
      status: 409,
      body: { ok: false, verified: false, code: 'duplicate_student_id' },
    };
  },
}, (log) => {
  if (log.closed !== true && !log.msgs.some((m) => m === 'Saved')) ok('E. duplicate student_id keeps editor open with no generic Saved');
  else bad('E', log);
});

if (!tmsWorkerPath) {
  bad('TMS worker module not found for e2e');
} else {
  const tmsWorker = (await import(pathToFileUrl(tmsWorkerPath))).default;
  const tmsSrc = fs.readFileSync(tmsWorkerPath, 'utf8');
  if (tmsSrc.includes("sub === 'roster/rename'") && tmsSrc.includes('student-rename-48')) {
    ok('TMS roster/rename revision is present');
  } else bad('tms rename route');

  function makeTmsDb(state, opts) {
    const options = opts || {};
    function prepare(sql) {
      const s = String(sql);
      const binds = [];
      const api = {
        bind(...args) { binds.push(...args); return api; },
        async first() { return null; },
        async all() {
          if (s.includes('FROM students') && s.includes('WHERE student_id = ?') && s.includes("TRIM(COALESCE(student_id, '')) != ''") && !s.includes('NOT (')) {
            const rows = state.students.filter((r) => String(r.student_id || '') === String(binds[0]) && String(r.student_id || '').trim());
            if (options.staleReadbackName && s.includes('is_active')) {
              return { results: rows.map((r) => ({ ...r, student_name: options.staleReadbackName })) };
            }
            return { results: rows };
          }
          if (s.includes('FROM students') && s.includes('NOT (student_id = ?')) {
            return {
              results: state.students
                .filter((r) => r.student_name === binds[0] && String(r.student_id || '') !== String(binds[1] ?? ''))
                .map((r) => ({ student_id: r.student_id })),
            };
          }
          if (s.includes('FROM student_group_memberships WHERE student_id = ?')) {
            return { results: state.memberships.filter((m) => String(m.student_id ?? '') === String(binds[0] ?? '')) };
          }
          if (s.includes('FROM students')) {
            return { results: state.students.slice() };
          }
          return { results: [] };
        },
        async run() {
          state.sql.push({ sql: s, binds: binds.slice() });
          if (s.includes('UPDATE students SET student_name')) {
            if (options.skipNameWrite) return { success: true, meta: { changes: 0 } };
            const newName = binds[0];
            const sid = String(binds[1] ?? '');
            state.memberships = state.memberships.filter((m) => String(m.student_id ?? '') !== sid);
            let n = 0;
            state.students.forEach((r) => {
              if (String(r.student_id ?? '') === sid) {
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
          if (s.includes('INSERT INTO student_group_memberships')) {
            state.memberships.push({ student_name: binds[0], student_id: binds[1], group_id: binds[2] });
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true, meta: { changes: 0 } };
        },
      };
      return api;
    }
    return { prepare };
  }

  async function runChain(state, opts) {
    const forwarded = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      const parsed = JSON.parse(init && init.body ? init.body : '{}');
      forwarded.push({ url: String(url), body: parsed });
      return tmsWorker.fetch(new Request(String(url), {
        method: 'POST',
        headers: init.headers || {},
        body: JSON.stringify(parsed),
      }), {
        DB: makeTmsDb(state, opts),
        TMS_LANTERN_BRIDGE_SECRET: TEST_BRIDGE_SECRET,
      });
    };
    try {
      const cookie = await adminCookie();
      const renameRes = await lanternWorker.fetch(new Request('https://lantern.test/api/admin/students/rename', {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: '21004', first_name: 'Phay', last_name: 'Son Khuu' }),
      }), makeLanternEnv());
      const renameBody = await renameRes.json();
      const listRes = await lanternWorker.fetch(new Request('https://lantern.test/api/admin/tms-roster?include_inactive=1', {
        method: 'GET',
        headers: { Cookie: cookie },
      }), makeLanternEnv());
      const listBody = await listRes.json();
      return { renameRes, renameBody, listRes, listBody, forwarded };
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  const state = {
    students: [
      { student_name: 'Phay Son Son Khuu', student_id: '21004', is_active: 1 },
      { student_name: 'Other Student', student_id: '19999', is_active: 1 },
    ],
    memberships: [{ student_name: 'Phay Son Son Khuu', student_id: '21004', group_id: 62 }],
    sql: [],
  };
  const chain = await runChain(state);
  const fwd = chain.forwarded.find((f) => String(f.url).includes('roster/rename'));
  if (fwd && fwd.body.student_id === '21004' && fwd.body.first_name === 'Phay' && fwd.body.last_name === 'Son Khuu' && fwd.body.grade == null) {
    ok('e2e Lantern forwards name-only roster/rename');
  } else bad('e2e forward', chain.forwarded);
  if (state.sql.some((q) => q.sql.includes('UPDATE students SET student_name') && q.binds[0] === 'Phay Son Khuu' && q.binds[1] === '21004')) {
    ok('e2e TMS helper updates Phay Son Khuu');
  } else bad('e2e sql', state.sql);
  if (
    chain.renameRes.status === 200 &&
    chain.renameBody.ok &&
    chain.renameBody.verified === true &&
    chain.renameBody.revision === 'student-rename-48' &&
    chain.renameBody.authoritative_name === 'Phay Son Khuu' &&
    chain.renameBody.requested_name === 'Phay Son Khuu' &&
    chain.renameBody.before_name === 'Phay Son Son Khuu'
  ) {
    ok('e2e TMS reread equals requested Phay Son Khuu');
  } else bad('e2e rename', { status: chain.renameRes.status, body: chain.renameBody });
  const listed = (chain.listBody.students || []).find((s) => String(s.student_id) === '21004');
  if (listed && listed.student_name === 'Phay Son Khuu' && listed.first_name === 'Phay' && listed.last_name === 'Son Khuu') {
    ok('e2e fresh roster GET returns Phay Son Khuu for exact ID 21004');
  } else bad('e2e list', listed);
  if (helpers.studentRenameFourStateAccepted(requestedFromDom, chain.renameBody.authoritative_name, helpers.studentsRosterVisibleName(listed), '21004', listed && listed.student_id)) {
    ok('e2e four-state proof would close the editor');
  } else bad('e2e four-state');
}

console.log('\nstudent-rename-48-test:', pass, 'PASS', fail, 'FAIL');
if (fail) process.exit(1);
