/**
 * Approvals + Class-Access authorization hardening tests — Prompt #92.
 *
 * Exercises the REAL worker/index.js fetch(request, env) entry point (not a stub), with a mocked
 * D1 (env.DB) and a real HS256 pilot JWT cookie built the same way login does, so
 * getPilotAccountFromRequest / verifyPilotJwt / handleApprovalsRoutes / handleClassAccessRoutes
 * all run their actual production code paths. Proves:
 *  - /api/approvals/* now requires an authenticated Lantern teacher/admin session (was open).
 *  - /api/class-access/session/{start,end,status} now requires that same session instead of the
 *    old hardcoded teacherA/teacherB/mr_radle allowlist (was unauthenticated + spoofable).
 *  - Client-supplied staff_id/staff_name/teacher_id/reviewed_by_* fields can no longer establish
 *    identity or authorization; the acting identity always comes from the session account.
 *
 * Usage: node worker/scripts/approvals-classaccess-auth-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import worker from '../index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
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

/** Reimplements the worker's signPilotJwt (HS256) locally so the test never needs to export
 * or otherwise expose internal signing helpers from worker/index.js. */
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
  }, TEST_SECRET);
  return `lantern_pilot=${token}`;
}

function makeEnv(state) {
  state.accounts = state.accounts || {};
  state.approvals = state.approvals || {};
  state.classAccessSessions = state.classAccessSessions || [];
  state.classAccessTokens = state.classAccessTokens || [];

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
        if (s.includes('FROM lantern_approvals WHERE id = ?')) {
          return state.approvals[binds[0]] || null;
        }
        if (s.includes('FROM class_access_sessions WHERE teacher_id = ?')) {
          const teacherId = binds[0];
          const now = binds[binds.length - 1];
          const rows = state.classAccessSessions
            .filter((r) => r.teacher_id === teacherId && r.is_active === 1 && !r.revoked_at && r.expires_at > now)
            .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
          return rows[0] || null;
        }
        return null;
      },
      async all() {
        if (s.includes('FROM lantern_approvals a WHERE a.status = ?')) {
          const status = binds[0];
          const itemType = s.includes('AND a.item_type = ?') ? binds[1] : null;
          const rows = Object.values(state.approvals).filter(
            (a) => a.status === status && (!itemType || a.item_type === itemType)
          );
          return { results: rows };
        }
        if (s.includes("a.status IN (?, ?, ?)")) {
          const statuses = binds.slice(0, 3);
          const rows = Object.values(state.approvals).filter((a) => statuses.includes(a.status));
          return { results: rows };
        }
        if (s.includes('SELECT id FROM class_access_sessions WHERE teacher_id = ?')) {
          const teacherId = binds[0];
          const now = binds[1];
          const rows = state.classAccessSessions.filter(
            (r) => r.teacher_id === teacherId && r.is_active === 1 && !r.revoked_at && r.expires_at > now
          );
          return { results: rows };
        }
        return { results: [] };
      },
      async run() {
        if (s.includes('UPDATE lantern_approvals SET status')) {
          const [status, reviewed_at, reviewed_by_staff_id, reviewed_by_staff_name, decision_note, id] = binds;
          const row = state.approvals[id];
          if (row) Object.assign(row, { status, reviewed_at, reviewed_by_staff_id, reviewed_by_staff_name, decision_note });
          return { success: true };
        }
        if (s.includes('UPDATE lantern_approvals SET assigned_to_staff_id')) {
          const [assigned_to_staff_id, assigned_to_staff_name, id] = binds;
          const row = state.approvals[id];
          if (row) Object.assign(row, { assigned_to_staff_id, assigned_to_staff_name });
          return { success: true };
        }
        if (s.includes('INSERT INTO class_access_sessions')) {
          const [id, teacher_id, access_code, access_code_normalized, starts_at, expires_at, created_at] = binds;
          state.classAccessSessions.push({
            id, teacher_id, access_code, access_code_normalized, starts_at, expires_at,
            is_active: 1, revoked_at: null, created_at,
          });
          return { success: true };
        }
        if (s.includes('UPDATE class_access_sessions SET is_active = 0')) {
          const [revoked_at, id] = binds;
          const row = state.classAccessSessions.find((r) => r.id === id);
          if (row) { row.is_active = 0; row.revoked_at = revoked_at; }
          return { success: true };
        }
        if (s.includes('UPDATE class_access_tokens SET revoked_at')) {
          return { success: true };
        }
        return { success: true };
      },
    };
    return api;
  }
  return { DB: { prepare }, PILOT_SESSION_SECRET: TEST_SECRET };
}

function account(overrides) {
  return {
    username: 'user1',
    display_name: 'Test User',
    role: 'teacher',
    password_hash: 'x',
    password_salt: 'y',
    student_character_name: null,
    teacher_id: null,
    mtss_student_id: null,
    is_active: 1,
    must_change_password: 0,
    ...overrides,
  };
}

function req(url, opts, cookie) {
  const headers = new Headers(opts.headers || {});
  if (cookie) headers.set('Cookie', cookie);
  return new Request(url, { ...opts, headers });
}

async function jsonOf(res) { return res.json(); }

// ---------------------------------------------------------------------------
// APPROVALS
// ---------------------------------------------------------------------------

async function testApprovalsUnauthenticatedRejected() {
  const env = makeEnv({});
  const res = await worker.fetch(req('https://x.test/api/approvals/pending', { method: 'GET' }, null), env);
  const body = await jsonOf(res);
  if (res.status !== 401 || body.error !== 'not_authenticated') return bad('approvals unauthenticated rejected', { status: res.status, body });
  ok('GET /api/approvals/pending with no session -> 401 not_authenticated');
}

async function testApprovalsStudentRejected() {
  const lucas = account({ username: 'lucas', role: 'student', student_character_name: 'Lucas' });
  const env = makeEnv({ accounts: { lucas } });
  const cookie = await cookieFor(lucas);
  const res = await worker.fetch(req('https://x.test/api/approvals/approve', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'apr_1' }),
  }, cookie), env);
  const body = await jsonOf(res);
  if (res.status !== 403 || body.error !== 'forbidden') return bad('student rejected from approvals', { status: res.status, body });
  ok('authenticated student -> 403 forbidden on POST /api/approvals/approve');
}

async function testApprovalsTeacherAllowed() {
  const teacherA = account({ username: 'ms_carter', role: 'teacher', teacher_id: 't_carter', display_name: 'Ms. Carter' });
  const approvals = { apr_1: { id: 'apr_1', item_type: 'test_item', item_id: 'itm_1', status: 'pending' } };
  const env = makeEnv({ accounts: { ms_carter: teacherA }, approvals });
  const cookie = await cookieFor(teacherA);
  const res = await worker.fetch(req('https://x.test/api/approvals/approve', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'apr_1' }),
  }, cookie), env);
  const body = await jsonOf(res);
  if (res.status !== 200 || !body.ok || body.status !== 'approved') return bad('authenticated teacher approve allowed', { status: res.status, body });
  ok('authenticated teacher -> 200 ok approving a pending item');
}

async function testApprovalsAdminAllowed() {
  const admin = account({ username: 'rick', role: 'admin', teacher_id: null });
  const approvals = { apr_2: { id: 'apr_2', item_type: 'test_item', item_id: 'itm_2', status: 'pending' } };
  const env = makeEnv({ accounts: { rick: admin }, approvals });
  const cookie = await cookieFor(admin);
  const res = await worker.fetch(req('https://x.test/api/approvals/reject', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'apr_2', reason: 'not appropriate' }),
  }, cookie), env);
  const body = await jsonOf(res);
  if (res.status !== 200 || !body.ok || body.status !== 'rejected') return bad('authenticated admin reject allowed', { status: res.status, body });
  ok('authenticated admin -> 200 ok rejecting a pending item');
}

async function testApprovalsSpoofedIdentityIgnored() {
  const teacherA = account({ username: 'ms_carter', role: 'teacher', teacher_id: 't_carter', display_name: 'Ms. Carter' });
  const approvals = { apr_3: { id: 'apr_3', item_type: 'test_item', item_id: 'itm_3', status: 'pending' } };
  const env = makeEnv({ accounts: { ms_carter: teacherA }, approvals });
  const cookie = await cookieFor(teacherA);
  const res = await worker.fetch(req('https://x.test/api/approvals/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: 'apr_3',
      staff_id: 'someone_else',
      staff_name: 'Someone Else',
      reviewed_by_staff_id: 'principal_admin',
      reviewed_by_staff_name: 'Impersonated Admin',
    }),
  }, cookie), env);
  const body = await jsonOf(res);
  if (res.status !== 200 || !body.ok) return bad('spoofed-identity approve still succeeds for real teacher', { status: res.status, body });
  const row = approvals.apr_3;
  if (row.reviewed_by_staff_id === 'someone_else' || row.reviewed_by_staff_id === 'principal_admin') {
    return bad('spoofed staff_id was recorded as reviewer', row);
  }
  if (row.reviewed_by_staff_name === 'Someone Else' || row.reviewed_by_staff_name === 'Impersonated Admin') {
    return bad('spoofed staff_name was recorded as reviewer', row);
  }
  if (row.reviewed_by_staff_id !== 't_carter' || row.reviewed_by_staff_name !== 'Ms. Carter') {
    return bad('recorded reviewer is not the authenticated session account', row);
  }
  ok('spoofed staff_id/staff_name/reviewed_by_* in request body cannot impersonate another staff member');
  ok('recorded acting identity (reviewed_by_staff_id/name) comes from the authenticated session account');
}

async function testApprovalsTakeIgnoresClientStaffId() {
  const teacherB = account({ username: 'mr_lee', role: 'teacher', teacher_id: 't_lee', display_name: 'Mr. Lee' });
  const approvals = { apr_4: { id: 'apr_4', item_type: 'test_item', item_id: 'itm_4', status: 'pending' } };
  const env = makeEnv({ accounts: { mr_lee: teacherB }, approvals });
  const cookie = await cookieFor(teacherB);
  const res = await worker.fetch(req('https://x.test/api/approvals/take', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'apr_4', staff_id: 'spoofed_id', staff_name: 'Spoofed Name' }),
  }, cookie), env);
  const body = await jsonOf(res);
  if (res.status !== 200 || !body.ok) return bad('take succeeds for authenticated teacher', { status: res.status, body });
  const row = approvals.apr_4;
  if (row.assigned_to_staff_id !== 't_lee' || row.assigned_to_staff_name !== 'Mr. Lee') {
    return bad('take assignment identity is not session-derived', row);
  }
  ok('POST /api/approvals/take ignores client staff_id/staff_name; assignment uses session identity');
}

// ---------------------------------------------------------------------------
// CLASS ACCESS
// ---------------------------------------------------------------------------

async function testClassAccessUnauthenticatedRejected() {
  const env = makeEnv({});
  const res = await worker.fetch(req('https://x.test/api/class-access/session/start', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teacher_id: 'teacherA' }),
  }, null), env);
  const body = await jsonOf(res);
  if (res.status !== 401 || body.error !== 'not_authenticated') return bad('class-access unauthenticated rejected', { status: res.status, body });
  ok('POST /api/class-access/session/start with no session -> 401 not_authenticated');
}

async function testClassAccessStudentRejected() {
  const lucas = account({ username: 'lucas', role: 'student', student_character_name: 'Lucas' });
  const env = makeEnv({ accounts: { lucas } });
  const cookie = await cookieFor(lucas);
  const res = await worker.fetch(req('https://x.test/api/class-access/session/start', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
  }, cookie), env);
  const body = await jsonOf(res);
  if (res.status !== 403 || body.error !== 'forbidden') return bad('student rejected from class-access', { status: res.status, body });
  ok('authenticated student -> 403 forbidden on POST /api/class-access/session/start');
}

async function testClassAccessTeacherAllowedRegardlessOfLegacyAllowlist() {
  // Prompt #92: a real teacher account whose teacher_id is NOT one of the old hardcoded
  // teacherA/teacherB/mr_radle values must now succeed — proving the allowlist is gone and the
  // authenticated teacher/admin session is the sole gate (no permission expansion: still
  // teacher/admin only, just the correct population instead of 3 hardcoded demo ids).
  const newTeacher = account({ username: 'ms_new', role: 'teacher', teacher_id: 'ms_new_teacher_2026', display_name: 'Ms. New' });
  const env = makeEnv({ accounts: { ms_new: newTeacher } });
  const cookie = await cookieFor(newTeacher);
  const res = await worker.fetch(req('https://x.test/api/class-access/session/start', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ duration_minutes: 30 }),
  }, cookie), env);
  const body = await jsonOf(res);
  if (res.status !== 200 || !body.ok || !body.access_code) return bad('teacher outside old hardcoded allowlist can start class access', { status: res.status, body });
  ok('teacher with teacher_id NOT in the old teacherA/teacherB/mr_radle allowlist can start class access (allowlist replaced by session auth)');
}

async function testClassAccessSpoofedTeacherIdDoesNotGrantAccess() {
  const env = makeEnv({});
  // No cookie at all, but the request body claims one of the formerly-magic allowed ids.
  const res = await worker.fetch(req('https://x.test/api/class-access/session/start', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teacher_id: 'teacherA' }),
  }, null), env);
  const body = await jsonOf(res);
  if (res.status !== 401 || body.error !== 'not_authenticated') return bad('spoofed teacher_id without session must not grant access', { status: res.status, body });
  ok('spoofing teacher_id=teacherA in the request body without an authenticated session does not grant access');
}

async function testClassAccessCannotReadOrEndAnotherTeachersSession() {
  const teacherA = account({ username: 'ms_carter', role: 'teacher', teacher_id: 't_carter', display_name: 'Ms. Carter' });
  const teacherB = account({ username: 'mr_lee', role: 'teacher', teacher_id: 't_lee', display_name: 'Mr. Lee' });
  const env = makeEnv({ accounts: { ms_carter: teacherA, mr_lee: teacherB } });
  const cookieA = await cookieFor(teacherA);
  const cookieB = await cookieFor(teacherB);
  const startRes = await worker.fetch(req('https://x.test/api/class-access/session/start', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
  }, cookieA), env);
  const startBody = await jsonOf(startRes);
  if (!startBody.ok) return bad('teacher A could not start a session to test isolation', startBody);

  // Teacher B tries to read/end teacher A's session by claiming teacher A's id in the request —
  // ignored: teacher B's own (empty) session state is used instead.
  const statusRes = await worker.fetch(req('https://x.test/api/class-access/session/status?teacher_id=t_carter', { method: 'GET' }, cookieB), env);
  const statusBody = await jsonOf(statusRes);
  if (statusBody.active !== false) return bad('teacher B could read teacher A session by spoofing teacher_id', statusBody);

  const endRes = await worker.fetch(req('https://x.test/api/class-access/session/end', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teacher_id: 't_carter' }),
  }, cookieB), env);
  const endBody = await jsonOf(endRes);
  if (endBody.ended !== 0) return bad('teacher B ended teacher A session by spoofing teacher_id', endBody);

  const statusAgain = await worker.fetch(req('https://x.test/api/class-access/session/status', { method: 'GET' }, cookieA), env);
  const statusAgainBody = await jsonOf(statusAgain);
  if (statusAgainBody.active !== true) return bad('teacher A session was incorrectly ended/cleared by teacher B', statusAgainBody);
  ok('a spoofed teacher_id in body/query cannot read or end another authenticated teacher\'s class-access session');
}

// ---------------------------------------------------------------------------
// Static inspection — no continued authoritative use of client-supplied identity
// ---------------------------------------------------------------------------

async function testStaticSourceInspection() {
  const workerIndex = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
  function extractFunctionSource(src, name) {
    const startMarker = `async function ${name}(`;
    const start = src.indexOf(startMarker);
    if (start === -1) return '';
    const next = src.indexOf('\nasync function ', start + startMarker.length);
    return next === -1 ? src.slice(start) : src.slice(start, next);
  }
  const approvalsBlock = extractFunctionSource(workerIndex, 'handleApprovalsRoutes');
  const classAccessBlock = extractFunctionSource(workerIndex, 'handleClassAccessRoutes');

  if (/requireStaffPilotSession/.test(approvalsBlock)) ok('handleApprovalsRoutes calls the shared teacher/admin session guard');
  else bad('handleApprovalsRoutes missing requireStaffPilotSession call');

  if (!/body\.(staff_id|staff_name|reviewed_by_staff_id|reviewed_by_staff_name)/.test(approvalsBlock)) {
    ok('handleApprovalsRoutes no longer reads client body.staff_id/staff_name/reviewed_by_* for authorization or identity');
  } else bad('handleApprovalsRoutes still reads client staff identity fields', approvalsBlock.match(/body\.(staff_id|staff_name|reviewed_by_staff_id|reviewed_by_staff_name)/g));

  if (/reviewerLabelFromAccount\(account\)/.test(approvalsBlock) && /sessionTeacherId\(account\)/.test(approvalsBlock)) {
    ok('handleApprovalsRoutes derives staffName/staffId from the authenticated account (reviewerLabelFromAccount/sessionTeacherId)');
  } else bad('handleApprovalsRoutes missing session-derived identity helpers');

  if (!/isAllowedTeacherId/.test(workerIndex)) {
    ok('the old isAllowedTeacherId hardcoded-allowlist function has been removed entirely (dead code, not left behind)');
  } else bad('isAllowedTeacherId still present in worker/index.js');

  if (/requireStaffPilotSession/.test(classAccessBlock) && classAccessBlock.split('requireStaffPilotSession').length - 1 >= 3) {
    ok('handleClassAccessRoutes gates session/start, session/end, and session/status behind the shared teacher/admin session guard');
  } else bad('handleClassAccessRoutes missing session guard on one or more of start/end/status', classAccessBlock.split('requireStaffPilotSession').length - 1);

  if (!/body\.teacher_id/.test(classAccessBlock.replace(/\/\/.*$/gm, ''))) {
    ok('handleClassAccessRoutes no longer trusts body.teacher_id for authorization (session-derived teacherId only)');
  } else bad('handleClassAccessRoutes still reads body.teacher_id', classAccessBlock.match(/body\.teacher_id/g));

  // VERIFY_CONFIG.teachers itself must remain untouched (unrelated /api/verify/* config), only its
  // former class-access authorization consumer (isAllowedTeacherId) was removed.
  if (/VERIFY_CONFIG\.teachers/.test(workerIndex)) ok('VERIFY_CONFIG.teachers is preserved for the unrelated /api/verify/* config endpoint');
  else bad('VERIFY_CONFIG.teachers unexpectedly removed (out of scope for this prompt)');
}

await testApprovalsUnauthenticatedRejected();
await testApprovalsStudentRejected();
await testApprovalsTeacherAllowed();
await testApprovalsAdminAllowed();
await testApprovalsSpoofedIdentityIgnored();
await testApprovalsTakeIgnoresClientStaffId();
await testClassAccessUnauthenticatedRejected();
await testClassAccessStudentRejected();
await testClassAccessTeacherAllowedRegardlessOfLegacyAllowlist();
await testClassAccessSpoofedTeacherIdDoesNotGrantAccess();
await testClassAccessCannotReadOrEndAnotherTeachersSession();
await testStaticSourceInspection();

console.log('\napprovals-classaccess-auth-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
