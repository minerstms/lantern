/**
 * Prompt #33 — Admin safe student delete / archive.
 * Usage: node worker/scripts/admin-student-delete-33-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import worker from '../index.js';
import { ADD_STUDENT_PATH } from '../admin-add-student.js';
import {
  STUDENT_ARCHIVE_PATH,
  STUDENT_DELETE_INSPECT_PATH,
  STUDENT_DELETE_PATH,
} from '../admin-student-delete.js';
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

function tmsInspectFromState(state, studentId) {
  const matches = (state.tmsStudents || []).filter((s) => String(s.student_id || '') === String(studentId));
  if (!matches.length) {
    return { ok: true, already_removed: true, student_id: studentId, classification: 'already_removed', can_permanently_delete: false, can_archive: false, categories: [] };
  }
  if (matches.length > 1) {
    return { ok: false, error: 'ambiguous_student_id', _httpStatus: 409 };
  }
  const row = matches[0];
  const hist = state.tmsHistory && state.tmsHistory[studentId] ? state.tmsHistory[studentId] : {};
  const categories = [];
  if (hist.behavior_logs) categories.push('Behavior history');
  if (hist.nugget_transactions) categories.push('Nugget transactions');
  if (hist.store_redeems) categories.push('Store history');
  const has = categories.length > 0;
  return {
    ok: true,
    already_removed: false,
    student_id: studentId,
    student_name: row.student_name,
    is_active: row.is_active != null ? Number(row.is_active) : 1,
    classification: has ? 'cannot_delete_has_history' : 'safe_mistake',
    can_permanently_delete: !has,
    can_archive: row.is_active == null || Number(row.is_active) === 1,
    categories,
    history: hist,
    membership_count: (state.tmsMemberships || []).filter((m) => String(m.student_id) === String(studentId)).length,
  };
}

function makeEnv(state) {
  state.accounts = state.accounts || {};
  state.tmsStudents = state.tmsStudents || [];
  state.tmsHistory = state.tmsHistory || {};
  state.tmsMemberships = state.tmsMemberships || [];
  state.lanternHistory = state.lanternHistory || {};
  state.bridgeCalls = state.bridgeCalls || [];
  state.ledgerWipes = state.ledgerWipes || 0;
  state.geppettoWrites = state.geppettoWrites || 0;

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
        if (s.includes('SELECT COUNT(*) AS c FROM')) {
          const table = (s.match(/FROM (\w+)/) || [])[1] || '';
          const key = String(binds[0] || '').trim().toLowerCase();
          const bag = state.lanternHistory[key] || {};
          return { c: Number(bag[table] || 0) };
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
        if (s.includes('FROM lantern_pilot_accounts WHERE lower(trim(role)) = \'student\'')) {
          return {
            results: Object.values(state.accounts).filter((a) => String(a.role || '').toLowerCase() === 'student'),
          };
        }
        return { results: [] };
      },
      async run() {
        if (s.includes('INSERT INTO lantern_pilot_accounts')) {
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
        if (s.includes('UPDATE lantern_pilot_accounts') && s.includes('mtss_student_id = NULL')) {
          const username = String(binds[0] || '').trim().toLowerCase();
          if (state.accounts[username]) state.accounts[username].mtss_student_id = null;
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes('UPDATE lantern_pilot_accounts SET mtss_student_id')) {
          const mtss = binds[0];
          const username = String(binds[1] || '').trim().toLowerCase();
          if (state.accounts[username]) state.accounts[username].mtss_student_id = mtss;
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes('DELETE FROM lantern_pilot_accounts')) {
          const username = String(binds[0] || '').trim().toLowerCase();
          delete state.accounts[username];
          return { success: true, meta: { changes: 1 } };
        }
        if (/DELETE FROM (logs|store_redeems|nugget_bridge|lantern_mission|lantern_feed|lantern_transactions)/.test(s)) {
          state.ledgerWipes += 1;
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
    if (u.includes('geppetto') && /INSERT|DELETE|UPDATE/.test(JSON.stringify(body))) env._state.geppettoWrites += 1;
    if (!u.includes('/api/lantern-bridge/')) {
      return new Response(JSON.stringify({ ok: false, error: 'unexpected_url' }), { status: 500 });
    }
    const sub = u.split('/api/lantern-bridge/')[1];
    if (sub === 'roster/list') {
      const includeInactive = !!body.include_inactive;
      const students = env._state.tmsStudents.filter((s) => includeInactive || Number(s.is_active) !== 0);
      return new Response(JSON.stringify({ ok: true, students }), { status: 200 });
    }
    if (sub === 'roster/create') {
      const sid = String(body.student_id || '').trim();
      const row = { student_name: body.student_name, student_id: sid, is_active: 1 };
      env._state.tmsStudents.push(row);
      return new Response(JSON.stringify({ ok: true, ...row }), { status: 200 });
    }
    if (sub === 'roster/inspect-delete') {
      const inspect = tmsInspectFromState(env._state, String(body.student_id || '').trim());
      return new Response(JSON.stringify(inspect), { status: inspect.ok ? 200 : inspect._httpStatus || 400 });
    }
    if (sub === 'roster/safe-delete') {
      const sid = String(body.student_id || '').trim();
      const inspect = tmsInspectFromState(env._state, sid);
      if (!inspect.ok) return new Response(JSON.stringify(inspect), { status: inspect._httpStatus || 400 });
      if (inspect.already_removed) return new Response(JSON.stringify({ ok: true, already_removed: true, student_id: sid }), { status: 200 });
      if (!inspect.can_permanently_delete) {
        return new Response(JSON.stringify({ ok: false, error: 'cannot_delete_has_history', categories: inspect.categories }), { status: 409 });
      }
      env._state.tmsStudents = env._state.tmsStudents.filter((s) => String(s.student_id) !== sid);
      env._state.tmsMemberships = (env._state.tmsMemberships || []).filter((m) => String(m.student_id) !== sid);
      return new Response(JSON.stringify({ ok: true, action: 'permanent_delete', student_id: sid, student_name: inspect.student_name }), { status: 200 });
    }
    if (sub === 'roster/archive') {
      const sid = String(body.student_id || '').trim();
      const row = env._state.tmsStudents.find((s) => String(s.student_id) === sid);
      if (!row) return new Response(JSON.stringify({ ok: false, error: 'already_removed' }), { status: 404 });
      row.is_active = 0;
      return new Response(JSON.stringify({ ok: true, action: 'archive', student_id: sid, student_name: row.student_name }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: false, error: 'unhandled_sub', sub }), { status: 404 });
  };
  try {
    return await fn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function call(env, cookie, path, body) {
  const res = await worker.fetch(adminReq('POST', path, body, cookie), env);
  const json = await res.json();
  return { status: res.status, json };
}

async function run() {
  const adminHtml = read('app/admin.html');
  const delSrc = read('worker/admin-student-delete.js');
  const indexSrc = read('worker/index.js');
  if (adminHtml.includes("textContent = 'Delete'") && adminHtml.includes('/api/admin/students/delete-inspect')) {
    ok('UI exposes compact Delete and inspect-first modal');
  } else bad('UI delete wiring');
  if (adminHtml.includes('Type DELETE to confirm') && adminHtml.includes('closeStudentDeleteModal')) {
    ok('13. typed DELETE confirmation; backdrop/Escape close only');
  } else bad('confirm UX');
  if (adminHtml.includes('Archive Student') && adminHtml.includes('/api/admin/students/archive')) {
    ok('15. Archive Student exposed in Admin UI');
  } else bad('archive UI');
  if (!/TMS_LANTERN_BRIDGE_SECRET/.test(adminHtml) && !/LANTERN_GEPPETTO_BRIDGE_SECRET/.test(adminHtml)) {
    ok('25. no TMS/Geppetto secret in Admin HTML');
  } else bad('secret in browser');
  if (!/DELETE FROM logs|DELETE FROM store_redeems|DELETE FROM nugget_bridge/.test(delSrc)) {
    ok('16. lantern delete module does not wipe TMS ledgers');
  } else bad('ledger wipe in lantern module');
  if (indexSrc.includes('use_safe_delete') && indexSrc.includes('permanentlyDeleteStudent')) {
    ok('unsafe tms-ops deleteStudent blocked; dedicated routes wired');
  } else bad('route wiring');

  const admin = account();
  const teacher = account({ username: 'ms_carter', display_name: 'Ms Carter', role: 'teacher' });
  const adminCookie = await cookieFor(admin);
  const teacherCookie = await cookieFor(teacher);

  const env = makeEnv({
    accounts: {
      admin,
      [teacher.username]: teacher,
      91001: account({ username: '91001', role: 'student', mtss_student_id: '91001', display_name: 'Safe Linked' }),
      91002: account({ username: '91002', role: 'student', mtss_student_id: '91002', display_name: 'History Login' }),
      99999: account({ username: '99999', role: 'student', mtss_student_id: '99999', display_name: 'Other Linked' }),
    },
    tmsStudents: [
      { student_name: 'Jamie Smith', student_id: '91000', is_active: 1 },
      { student_name: 'Wrong Name', student_id: '91010', is_active: 1 },
      { student_name: 'Safe Linked', student_id: '91001', is_active: 1 },
      { student_name: 'History Login', student_id: '91002', is_active: 1 },
      { student_name: 'Behavior Kid', student_id: '91003', is_active: 1 },
      { student_name: 'Other Linked', student_id: '99999', is_active: 1 },
    ],
    tmsMemberships: [{ student_name: 'Jamie Smith', student_id: '91000', group_id: 61 }],
    tmsHistory: {
      91003: { behavior_logs: 2 },
    },
    lanternHistory: {
      91002: { lantern_mission_submissions: 1 },
    },
  });

  await withMockedBridge(env, async () => {
    const teacherInspect = await call(env, teacherCookie, STUDENT_DELETE_INSPECT_PATH, { student_id: '91000' });
    if (teacherInspect.status === 403) ok('1. non-admin cannot inspect delete eligibility');
    else bad('1 teacher inspect', teacherInspect);

    const teacherDel = await call(env, teacherCookie, STUDENT_DELETE_PATH, { student_id: '91000', confirm: 'DELETE' });
    if (teacherDel.status === 403 && env._state.tmsStudents.some((s) => s.student_id === '91000')) {
      ok('2. non-admin cannot delete');
    } else bad('2 teacher delete', teacherDel);

    const inspect = await call(env, adminCookie, STUDENT_DELETE_INSPECT_PATH, { student_id: '91000' });
    if (
      inspect.status === 200 &&
      inspect.json.ok &&
      inspect.json.can_permanently_delete &&
      inspect.json.classification === 'safe_mistake' &&
      inspect.json.lantern_login &&
      inspect.json.lantern_login.linked === false &&
      env._state.tmsStudents.some((s) => s.student_id === '91000')
    ) {
      ok('3/17. safe mistake with no history / no linked login classified deletable; inspect does not mutate');
    } else bad('3 inspect', inspect);

    const noConfirm = await call(env, adminCookie, STUDENT_DELETE_PATH, { student_id: '91000' });
    if (noConfirm.status === 400 && noConfirm.json.error === 'confirmation_required') {
      ok('typed confirmation required');
    } else bad('confirm required', noConfirm);

    const del = await call(env, adminCookie, STUDENT_DELETE_PATH, {
      student_id: '91000',
      student_name: 'Wrong Name',
      confirm: 'DELETE',
    });
    if (del.status === 200 && del.json.ok && !env._state.tmsStudents.some((s) => s.student_id === '91000') && env._state.tmsStudents.some((s) => s.student_id === '91010')) {
      ok('4/5. safe TMS student deletes by exact student_id; unrelated name untouched');
    } else bad('5 delete', del);

    const again = await call(env, adminCookie, STUDENT_DELETE_PATH, { student_id: '91000', confirm: 'DELETE' });
    if (again.status === 200 && again.json.ok && again.json.already_removed) ok('7. second delete is safe/idempotent');
    else bad('7 idempotent', again);

    const payloadAfter = buildGeppettoStudentRosterPayload(env._state.tmsStudents);
    if (!payloadAfter.students.some((s) => s.student_id === '91000') && payloadAfter.students.some((s) => s.student_id === '91010')) {
      ok('22. deleted TMS student absent from Geppetto roster payload');
    } else bad('22 geppetto payload', payloadAfter);

    const rosterRes = await worker.fetch(
      new Request('https://lantern.test' + GEPPETTO_STUDENT_ROSTER_PATH, {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + TEST_GEPPETTO_SECRET },
      }),
      env
    );
    const rosterJson = await rosterRes.json();
    const ids = (rosterJson.students || []).map((s) => s.student_id);
    if (rosterRes.status === 200 && !ids.includes('91000') && ids.includes('91010')) {
      ok('22b. Geppetto S2S roster response omits deleted student');
    } else bad('22b s2s', rosterJson);
    if (env._state.geppettoWrites === 0 && !delSrc.includes('roster_student_id')) {
      ok('23/24. future sync cannot recreate from TMS; no Geppetto history delete');
    } else bad('geppetto write', env._state.geppettoWrites);

    const behavior = await call(env, adminCookie, STUDENT_DELETE_PATH, { student_id: '91003', confirm: 'DELETE' });
    if (behavior.status === 409 && behavior.json.error === 'cannot_delete_has_history' && env._state.tmsStudents.some((s) => s.student_id === '91003')) {
      ok('11. student with behavior logs cannot ordinary-delete');
    } else bad('11 behavior', behavior);

    const arch = await call(env, adminCookie, STUDENT_ARCHIVE_PATH, { student_id: '91003' });
    const archived = env._state.tmsStudents.find((s) => s.student_id === '91003');
    if (arch.status === 200 && arch.json.ok && archived && Number(archived.is_active) === 0) {
      ok('15. archive path available where supported');
    } else bad('15 archive', arch);

    const linkedInspect = await call(env, adminCookie, STUDENT_DELETE_INSPECT_PATH, { student_id: '91001' });
    if (
      linkedInspect.json.ok &&
      linkedInspect.json.can_permanently_delete &&
      linkedInspect.json.lantern_login.linked &&
      linkedInspect.json.lantern_login.can_delete_login &&
      linkedInspect.json.lantern_login.options.includes('delete_login')
    ) {
      ok('18. linked no-history login offers explicit delete/unlink options');
    } else bad('18 linked inspect', linkedInspect);

    const linkedNeedChoice = await call(env, adminCookie, STUDENT_DELETE_PATH, { student_id: '91001', confirm: 'DELETE' });
    if (linkedNeedChoice.status === 400 && linkedNeedChoice.json.error === 'lantern_login_action_required' && env._state.accounts['91001']) {
      ok('18b. linked login is not silently deleted');
    } else bad('18b silent', linkedNeedChoice);

    const linkedDel = await call(env, adminCookie, STUDENT_DELETE_PATH, {
      student_id: '91001',
      confirm: 'DELETE',
      lantern_login_action: 'delete_login',
    });
    if (linkedDel.status === 200 && linkedDel.json.lantern_login === 'deleted' && !env._state.accounts['91001'] && env._state.accounts['99999']) {
      ok('18c/20. explicit linked-login delete works; other mtss_student_id untouched');
    } else bad('18c linked delete', linkedDel);

    const histInspect = await call(env, adminCookie, STUDENT_DELETE_INSPECT_PATH, { student_id: '91002' });
    if (histInspect.json.ok && histInspect.json.lantern_login.has_history && !histInspect.json.lantern_login.can_delete_login) {
      ok('14/19. meaningful Lantern history prevents linked-login hard delete');
    } else bad('14 lantern history', histInspect);

    const histSilent = await call(env, adminCookie, STUDENT_DELETE_PATH, {
      student_id: '91002',
      confirm: 'DELETE',
      lantern_login_action: 'delete_login',
    });
    if (histSilent.status === 409 && histSilent.json.error === 'lantern_login_has_history' && env._state.accounts['91002']) {
      ok('19. linked account with history is not silently deleted');
    } else bad('19 hist delete', histSilent);

    const histUnlink = await call(env, adminCookie, STUDENT_DELETE_PATH, {
      student_id: '91002',
      confirm: 'DELETE',
      lantern_login_action: 'unlink',
    });
    if (
      histUnlink.status === 200 &&
      histUnlink.json.lantern_login === 'unlinked' &&
      env._state.accounts['91002'] &&
      env._state.accounts['91002'].mtss_student_id == null &&
      !env._state.tmsStudents.some((s) => s.student_id === '91002')
    ) {
      ok('19b. roster deleted and Lantern account unlinked when it has history');
    } else bad('19b unlink', histUnlink);

    const recreate = await worker.fetch(
      adminReq('POST', ADD_STUDENT_PATH, {
        first_name: 'Correct',
        last_name: 'Student',
        student_id: '91000',
        grade: '6',
      }, adminCookie),
      env
    );
    const recreateJson = await recreate.json();
    if (
      recreate.status === 200 &&
      recreateJson.ok &&
      recreateJson.tms_roster === 'created' &&
      recreateJson.lantern_login === 'created' &&
      env._state.tmsStudents.some((s) => s.student_id === '91000') &&
      env._state.accounts['91000']
    ) {
      ok('21. Add Student can create corrected student after mistaken record removed');
    } else bad('21 add after delete', recreateJson);

    const ops = await call(env, adminCookie, '/api/admin/tms-ops', { action: 'deleteStudent', student_id: '91010', student_name: 'Wrong Name' });
    if (ops.status === 400 && ops.json.error === 'use_safe_delete' && env._state.tmsStudents.some((s) => s.student_id === '91010')) {
      ok('unsafe generic deleteStudent is blocked');
    } else bad('tms-ops block', ops);

    if (env._state.ledgerWipes === 0) ok('16. no historical ledger rows cascade-wiped');
    else bad('ledger wipes', env._state.ledgerWipes);

    const secretLeak = JSON.stringify(inspect.json) + JSON.stringify(del.json);
    if (!secretLeak.includes(TEST_BRIDGE_SECRET) && !secretLeak.includes(TEST_GEPPETTO_SECRET)) {
      ok('25. responses do not expose bridge secrets');
    } else bad('secret leak');
  });

  console.log('\nadmin-student-delete-33-test:', pass, 'PASS', fail, 'FAIL');
  if (fail) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
