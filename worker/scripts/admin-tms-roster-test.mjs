/**
 * Prompt #127 — Admin TMS student roster / readiness APIs.
 *
 * Exercises GET/POST /api/admin/tms-roster* with mocked D1 + mocked TMS lantern-bridge fetch,
 * real HS256 pilot JWTs. Confirms admin-only access, readiness classification, ID edit guards,
 * exact-match link, and create passthrough — without bulk provisioning or password exposure.
 *
 * Usage: node worker/scripts/admin-tms-roster-test.mjs
 */
import worker from '../index.js';

let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

const TEST_PILOT_SECRET = 'test-secret-not-a-real-pilot-session-secret';
const TEST_BRIDGE_SECRET = 'test-bridge-secret-not-real';

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
  state.bridgeCalls = state.bridgeCalls || [];
  state.bridgeHandlers = state.bridgeHandlers || {};

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
        if (s.includes('FROM lantern_pilot_accounts') && s.includes('lower(trim(username)) = lower(trim(?)') && !s.includes('mtss_student_id')) {
          const key = String(binds[0] || '').trim().toLowerCase();
          return state.accounts[key] || null;
        }
        return null;
      },
      async all() {
        if (s.includes("lower(trim(role)) = 'student'") && s.includes('mtss_student_id') && s.includes('is_active') && !s.includes('OR lower(trim(username))')) {
          return {
            results: Object.values(state.accounts).filter((a) => String(a.role || '').toLowerCase() === 'student'),
          };
        }
        // Reconcile guard: match mtss_student_id OR username == old TMS id
        if (
          s.includes("lower(trim(role)) = 'student'") &&
          s.includes('OR lower(trim(username))') &&
          s.includes('mtss_student_id')
        ) {
          const sid = String(binds[0] || '').trim().toLowerCase();
          return {
            results: Object.values(state.accounts).filter((a) => {
              if (String(a.role || '').toLowerCase() !== 'student') return false;
              const mid = a.mtss_student_id != null ? String(a.mtss_student_id).trim().toLowerCase() : '';
              const uname = String(a.username || '').trim().toLowerCase();
              return mid === sid || uname === sid;
            }),
          };
        }
        if (s.includes('mtss_student_id IS NOT NULL') && s.includes('lower(trim(mtss_student_id))') && !s.includes('OR lower(trim(username))')) {
          const sid = String(binds[0] || '').trim().toLowerCase();
          return {
            results: Object.values(state.accounts).filter(
              (a) => a.mtss_student_id && String(a.mtss_student_id).trim().toLowerCase() === sid
            ),
          };
        }
        if (s.includes('lower(trim(username)) = lower(trim(?)') && s.includes('SELECT username, role, mtss_student_id')) {
          const key = String(binds[0] || '').trim().toLowerCase();
          const row = state.accounts[key];
          return { results: row ? [row] : [] };
        }
        return { results: [] };
      },
      async run() {
        if (s.includes('UPDATE lantern_pilot_accounts SET mtss_student_id')) {
          const mtss = binds[0];
          const username = String(binds[1] || '').trim();
          const key = username.toLowerCase();
          if (state.accounts[key]) {
            state.accounts[key] = { ...state.accounts[key], mtss_student_id: mtss };
          }
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes('UPDATE lantern_pilot_accounts') && s.includes('display_name = ?') && s.includes('first_name = ?')) {
          const username = String(binds[3] || '').trim().toLowerCase();
          if (state.accounts[username]) {
            state.accounts[username].display_name = binds[0];
            state.accounts[username].first_name = binds[1];
            state.accounts[username].last_name = binds[2];
          }
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
    const handler = env._state.bridgeHandlers[sub];
    if (!handler) {
      return new Response(JSON.stringify({ ok: false, error: 'unhandled_sub', sub }), { status: 404 });
    }
    const out = await handler(body, init);
    const status = out._httpStatus || 200;
    const { _httpStatus, ...json } = out;
    return new Response(JSON.stringify(json), { status });
  };
  try {
    return await fn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function run() {
  const admin = account();
  const teacher = account({ username: 'ms_carter', display_name: 'Ms Carter', role: 'teacher', teacher_id: 'Carter' });
  const lucas = account({
    username: '20889',
    display_name: 'Lucas',
    role: 'student',
    mtss_student_id: null,
    student_character_name: 'Lucas',
  });
  const janeMissing = account({
    username: 'other_student',
    display_name: 'Other',
    role: 'student',
    mtss_student_id: null,
  });

  const state = {
    accounts: {
      [admin.username.toLowerCase()]: admin,
      [teacher.username.toLowerCase()]: teacher,
      [lucas.username.toLowerCase()]: lucas,
      [janeMissing.username.toLowerCase()]: janeMissing,
    },
    tmsStudents: [
      { student_name: 'Lucas Radle', student_id: '20889', is_active: 1, grade: '8' },
      { student_name: 'Jane Smith', student_id: '', is_active: 1, grade: '7' },
      { student_name: 'Archived Kid', student_id: '99999', is_active: 0, grade: '' },
    ],
    bridgeHandlers: {
      'roster/list': async (body) => {
        const includeInactive = !!(body && body.include_inactive);
        const students = state.tmsStudents.filter((s) => includeInactive || Number(s.is_active) !== 0);
        return {
          ok: true,
          students,
          counts: {
            total: state.tmsStudents.length,
            active: state.tmsStudents.filter((s) => Number(s.is_active) !== 0).length,
            inactive: state.tmsStudents.filter((s) => Number(s.is_active) === 0).length,
            missing_id: state.tmsStudents.filter((s) => Number(s.is_active) !== 0 && !String(s.student_id || '').trim()).length,
          },
        };
      },
      'roster/set-student-id': async (body) => {
        if (!body.student_id) return { ok: false, error: 'student_id is required.', code: 'student_id_required', _httpStatus: 400 };
        if (body.student_id === '20889' && body.student_name !== 'Lucas Radle') {
          return { ok: false, error: 'Student ID already assigned', code: 'duplicate_student_id', _httpStatus: 409 };
        }
        const prevId = String(body.previous_student_id ?? '').trim();
        const row = state.tmsStudents.find(
          (s) => s.student_name === body.student_name && String(s.student_id || '') === prevId
        );
        if (row) row.student_id = String(body.student_id).trim();
        return {
          ok: true,
          student_name: body.student_name,
          previous_student_id: body.previous_student_id,
          student_id: body.student_id,
        };
      },
      'roster/create': async (body) => ({
        ok: true,
        student_name: body.student_name,
        student_id: body.student_id || '',
        grade: body.grade || String(body.grade_slug || 'grade-6').replace(/^grade-/, '') || '6',
        grade_slug: body.grade_slug || ('grade-' + (body.grade || '6')),
        is_active: 1,
      }),
      'roster/set-grade': async (body) => {
        const g = String(body.grade || body.grade_slug || '').replace(/^grade-/, '');
        if (!['6', '7', '8'].includes(g)) {
          return { ok: false, error: 'grade must be 6, 7, or 8', code: 'invalid_grade', _httpStatus: 400 };
        }
        return {
          ok: true,
          student_name: body.student_name,
          student_id: body.student_id || '',
          grade: g,
          grade_slug: 'grade-' + g,
        };
      },
      'roster/update': async (body) => {
        const first = String(body.first_name || '').trim();
        const last = String(body.last_name || '').trim();
        if (!first) {
          return { ok: false, error: 'First name is required.', code: 'first_name_required', _httpStatus: 400 };
        }
        const g = String(body.grade || body.grade_slug || '').replace(/^grade-/, '');
        if (!['6', '7', '8'].includes(g)) {
          return { ok: false, error: 'grade must be 6, 7, or 8', code: 'invalid_grade', _httpStatus: 400 };
        }
        const sid = String(body.student_id || '').trim();
        if (!sid) return { ok: false, error: 'student_id is required.', code: 'student_id_required', _httpStatus: 400 };
        const name = String(body.next_student_name || '').trim() || [first, last].filter(Boolean).join(' ').trim();
        const prevId = String(body.previous_student_id || sid).trim();
        const destTaken = state.tmsStudents.some(
          (s) => s.student_name === name && String(s.student_id || '') !== prevId
        );
        if (destTaken) {
          return {
            ok: false,
            error: 'Another roster row already uses this name.',
            code: 'destination_name_taken',
            _httpStatus: 409,
          };
        }
        const row = state.tmsStudents.find((s) => String(s.student_id || '') === prevId && String(s.student_id || '').trim());
        if (!row) return { ok: false, error: 'Student row not found.', code: 'not_found', _httpStatus: 404 };
        const previousName = row.student_name;
        row.student_name = name;
        row.student_id = sid;
        row.grade = g;
        return {
          ok: true,
          verified: true,
          previous_student_name: previousName,
          previous_student_id: prevId,
          student_name: name,
          student_id: sid,
          first_name: first,
          last_name: last,
          grade: g,
          grade_slug: 'grade-' + g,
          identity_changed: previousName !== name || prevId !== sid,
        };
      },
    },
  };
  const env = makeEnv(state);
  const adminCookie = await cookieFor(admin);
  const teacherCookie = await cookieFor(teacher);

  await withMockedBridge(env, async () => {
    // Non-admin forbidden
    {
      const res = await worker.fetch(adminReq('GET', '/api/admin/tms-roster', undefined, teacherCookie), env);
      if (res.status === 403) ok('teacher cannot GET tms-roster');
      else bad('teacher cannot GET tms-roster', res.status);
    }
    {
      const res = await worker.fetch(adminReq('GET', '/api/admin/tms-roster'), env);
      if (res.status === 403) ok('anon cannot GET tms-roster');
      else bad('anon cannot GET tms-roster', res.status);
    }

    // List + readiness classification
    {
      const res = await worker.fetch(adminReq('GET', '/api/admin/tms-roster', undefined, adminCookie), env);
      const body = await res.json();
      if (res.status === 200 && body.ok && Array.isArray(body.students) && body.students.length === 2) {
        ok('admin GET active roster returns TMS students (not only Lantern accounts)');
      } else bad('admin GET active roster', JSON.stringify(body));

      const lucasRow = body.students.find((s) => s.student_name === 'Lucas Radle');
      const janeRow = body.students.find((s) => s.student_name === 'Jane Smith');
      if (lucasRow && lucasRow.student_id === '20889' && lucasRow.lantern_account === 'Broken' && lucasRow.exact_match_linkable === true) {
        ok('Lucas classified Broken + exact_match_linkable (username match, mtss null)');
      } else bad('Lucas classification', JSON.stringify(lucasRow));
      if (janeRow && !janeRow.student_id && janeRow.lantern_account === 'Missing' && janeRow.locker === 'Not Ready') {
        ok('blank-ID student shows Missing / Not Ready');
      } else bad('Jane classification', JSON.stringify(janeRow));
      if (body.counts && body.counts.active_tms === 2 && body.counts.missing_id === 1 && body.counts.lantern_linked === 0) {
        ok('readiness counts derived from roster');
      } else bad('readiness counts', JSON.stringify(body.counts));
      const dumped = JSON.stringify(body);
      if (!/HASH_SHOULD_NEVER_APPEAR|SALT_SHOULD_NEVER_APPEAR|password_hash|password_salt/.test(dumped)) {
        ok('roster response exposes no passwords/hashes');
      } else bad('roster leaked secrets', dumped.slice(0, 200));
    }

    // Set blank ID
    {
      const res = await worker.fetch(
        adminReq('POST', '/api/admin/tms-roster/set-student-id', {
          student_name: 'Jane Smith',
          previous_student_id: '',
          student_id: '21001',
        }, adminCookie),
        env
      );
      const body = await res.json();
      if (res.status === 200 && body.ok && body.student_id === '21001') ok('set blank→ID succeeds');
      else bad('set blank→ID', JSON.stringify(body));
    }

    // Reject blank new ID
    {
      const res = await worker.fetch(
        adminReq('POST', '/api/admin/tms-roster/set-student-id', {
          student_name: 'Jane Smith',
          previous_student_id: '',
          student_id: '   ',
        }, adminCookie),
        env
      );
      const body = await res.json();
      if (res.status === 400 && body.error === 'student_id_required') ok('blank student_id rejected');
      else bad('blank student_id rejected', JSON.stringify(body));
    }

    // Non-blank change requires confirm
    {
      const res = await worker.fetch(
        adminReq('POST', '/api/admin/tms-roster/set-student-id', {
          student_name: 'Lucas Radle',
          previous_student_id: '20889',
          student_id: '20890',
        }, adminCookie),
        env
      );
      const body = await res.json();
      if (res.status === 400 && body.error === 'confirm_change_required') ok('non-blank ID change requires confirm_change');
      else bad('confirm_change_required', JSON.stringify(body));
    }

    // Non-blank change stopped when Lantern depends on old ID
    {
      const res = await worker.fetch(
        adminReq('POST', '/api/admin/tms-roster/set-student-id', {
          student_name: 'Lucas Radle',
          previous_student_id: '20889',
          student_id: '20890',
          confirm_change: true,
        }, adminCookie),
        env
      );
      const body = await res.json();
      if (res.status === 409 && body.error === 'lantern_reconcile_required') {
        ok('changing Lucas TMS ID stops — Lantern username 20889 must be reconciled first');
      } else bad('lantern_reconcile_required', JSON.stringify(body));
    }

    // Exact-match link
    {
      const res = await worker.fetch(
        adminReq('POST', '/api/admin/tms-roster/link-exact', { student_id: '20889' }, adminCookie),
        env
      );
      const body = await res.json();
      if (res.status === 200 && body.ok && body.username === '20889' && body.mtss_student_id === '20889') {
        ok('Link Existing Account sets mtss_student_id only');
      } else bad('link-exact', JSON.stringify(body));
      if (state.accounts['20889'].mtss_student_id === '20889') ok('Lucas mtss_student_id persisted in mock DB');
      else bad('Lucas mtss persist', state.accounts['20889'].mtss_student_id);
      if (state.accounts['20889'].password_hash === 'HASH_SHOULD_NEVER_APPEAR') ok('link-exact did not touch password hash');
      else bad('password mutated');
    }

    // After link, Lucas is Linked / Ready
    {
      const res = await worker.fetch(adminReq('GET', '/api/admin/tms-roster', undefined, adminCookie), env);
      const body = await res.json();
      const lucasRow = body.students.find((s) => s.student_name === 'Lucas Radle');
      if (lucasRow && lucasRow.lantern_account === 'Linked' && lucasRow.locker === 'Ready' && lucasRow.exact_match_linkable === false) {
        ok('after link Lucas is Linked / Locker Ready');
      } else bad('post-link Lucas', JSON.stringify(lucasRow));
    }

    // Create student
    {
      const res = await worker.fetch(
        adminReq('POST', '/api/admin/tms-roster/create', {
          first_name: 'New',
          last_name: 'Student',
          student_id: '22000',
        }, adminCookie),
        env
      );
      const body = await res.json();
      if (res.status === 200 && body.ok && body.student_name === 'New Student' && body.lantern_account === 'Missing' && String(body.grade) === '6') {
        ok('Add Student creates TMS row without Lantern account (defaults grade 6)');
      } else bad('create student', JSON.stringify(body));
      const createCall = state.bridgeCalls.find((c) => c.url.includes('roster/create'));
      if (createCall && createCall.auth === 'Bearer ' + TEST_BRIDGE_SECRET) ok('create uses existing bridge secret');
      else bad('create bridge auth', JSON.stringify(createCall));
      if (createCall && createCall.body && String(createCall.body.grade) === '6') ok('create bridge payload defaults grade 6');
      else bad('create grade payload', JSON.stringify(createCall && createCall.body));
    }

    // Explicit grade 7 on create
    {
      const res = await worker.fetch(
        adminReq('POST', '/api/admin/tms-roster/create', {
          first_name: 'Seventh',
          last_name: 'Kid',
          student_id: '22001',
          grade: '7',
        }, adminCookie),
        env
      );
      const body = await res.json();
      if (res.status === 200 && body.ok && String(body.grade) === '7') ok('explicit create grade 7 honored');
      else bad('create grade 7', JSON.stringify(body));
    }

    // set-grade
    {
      const res = await worker.fetch(
        adminReq('POST', '/api/admin/tms-roster/set-grade', {
          student_name: 'Lucas Radle',
          student_id: '20889',
          grade: '6',
        }, adminCookie),
        env
      );
      const body = await res.json();
      if (res.status === 200 && body.ok && String(body.grade) === '6' && body.student_id === '20889') {
        ok('admin can change existing student grade');
      } else bad('set-grade', JSON.stringify(body));
      if (state.accounts['20889'].mtss_student_id === '20889' && state.accounts['20889'].password_hash === 'HASH_SHOULD_NEVER_APPEAR') {
        ok('set-grade did not touch Lantern link or password');
      } else bad('set-grade mutated lantern account');
    }

    // Prompt #205 — multi-field update
    {
      const res = await worker.fetch(
        adminReq('POST', '/api/admin/tms-roster/update', {
          previous_student_name: 'Lucas Radle',
          previous_student_id: '20889',
          first_name: 'Lucas',
          last_name: 'Radle',
          student_id: '20889',
          grade: '7',
        }, adminCookie),
        env
      );
      const body = await res.json();
      if (res.status === 200 && body.ok && body.student_id === '20889' && String(body.grade) === '7') {
        ok('admin can update name/grade together via tms-roster/update');
      } else bad('roster update', JSON.stringify(body));
      if (state.accounts['20889'].mtss_student_id === '20889' && state.accounts['20889'].password_hash === 'HASH_SHOULD_NEVER_APPEAR' && state.accounts['20889'].username === '20889') {
        ok('roster update did not touch Lantern link, username, or password');
      } else bad('roster update mutated lantern account');
    }
    {
      const res = await worker.fetch(
        adminReq('POST', '/api/admin/tms-roster/update', {
          previous_student_name: 'Lucas Radle',
          previous_student_id: '20889',
          first_name: '',
          last_name: 'Radle',
          student_id: '20889',
          grade: '6',
        }, adminCookie),
        env
      );
      const body = await res.json();
      if (res.status === 400 && (body.error === 'first_name_required' || /first/i.test(body.message || body.error || ''))) {
        ok('update rejects blank first name');
      } else bad('blank first on update', JSON.stringify(body));
    }
    {
      const res = await worker.fetch(
        adminReq('POST', '/api/admin/tms-roster/update', {
          previous_student_name: 'Lucas Radle',
          previous_student_id: '20889',
          first_name: 'Lucas',
          last_name: 'Radle',
          student_id: '99999',
          grade: '6',
          confirm_change: true,
        }, adminCookie),
        env
      );
      const body = await res.json();
      if (res.status === 409 && body.error === 'lantern_reconcile_required') {
        ok('ID change blocked when Lantern login depends on old ID');
      } else bad('lantern reconcile on update', JSON.stringify(body));
    }

    // Teacher cannot write
    {
      const res = await worker.fetch(
        adminReq('POST', '/api/admin/tms-roster/create', { first_name: 'Nope', last_name: 'X' }, teacherCookie),
        env
      );
      if (res.status === 403) ok('teacher cannot create via admin roster');
      else bad('teacher create forbidden', res.status);
    }
    {
      const res = await worker.fetch(
        adminReq('POST', '/api/admin/tms-roster/set-grade', {
          student_name: 'Lucas Radle',
          student_id: '20889',
          grade: '7',
        }, teacherCookie),
        env
      );
      if (res.status === 403) ok('non-admin cannot change grade');
      else bad('teacher set-grade forbidden', res.status);
    }
    {
      const res = await worker.fetch(
        adminReq('POST', '/api/admin/tms-roster/update', {
          previous_student_name: 'Lucas Radle',
          previous_student_id: '20889',
          first_name: 'Lucas',
          last_name: 'Radle',
          student_id: '20889',
          grade: '6',
        }, teacherCookie),
        env
      );
      if (res.status === 403) ok('non-admin cannot update roster identity');
      else bad('teacher update forbidden', res.status);
    }

    {
      const beforeHash = state.accounts['20889'].password_hash;
      const beforeUser = state.accounts['20889'].username;
      const beforeMtss = state.accounts['20889'].mtss_student_id;
      const janeBefore = state.tmsStudents.find((s) => s.student_name === 'Jane Smith');
      const res = await worker.fetch(
        adminReq('POST', '/api/admin/tms-roster/update', {
          previous_student_name: 'Stale Cached Name',
          previous_student_id: '20889',
          first_name: 'Lucas',
          last_name: 'James',
          student_id: '20889',
          grade: '7',
        }, adminCookie),
        env
      );
      const body = await res.json();
      const updateCall = state.bridgeCalls.filter((c) => c.url.includes('roster/update')).pop();
      if (res.status === 200 && body.ok && body.student_name === 'Lucas James' && body.student_id === '20889' && updateCall && updateCall.body.student_id === '20889') {
        ok('1/2/3. admin name edit targets exact student_id and TMS student_name updates');
      } else bad('authoritative rename', JSON.stringify(body));
      const list = await worker.fetch(adminReq('GET', '/api/admin/tms-roster', undefined, adminCookie), env);
      const listBody = await list.json();
      const row = (listBody.students || []).find((s) => s.student_id === '20889');
      if (list.status === 200 && row && row.student_name === 'Lucas James' && row.first_name === 'Lucas' && row.last_name === 'James') {
        ok('4/5. admin list / refetch returns the new authoritative name');
      } else bad('list after rename', JSON.stringify(row));
      if (state.accounts['20889'].username === beforeUser && state.accounts['20889'].password_hash === beforeHash && state.accounts['20889'].mtss_student_id === beforeMtss) {
        ok('6/7/8. linked mtss_student_id, username, and password unchanged');
      } else bad('identity mutated');
      if (state.accounts['20889'].display_name === 'Lucas James') {
        ok('linked Lantern display_name follows authoritative TMS name');
      } else bad('display_name', state.accounts['20889'].display_name);
      if (janeBefore && state.tmsStudents.some((s) => s.student_name === 'Jane Smith' && String(s.student_id || '') === String(janeBefore.student_id || ''))) {
        ok('12. unrelated student unchanged');
      } else bad('unrelated mutated');
    }

    {
      const res = await worker.fetch(
        adminReq('POST', '/api/admin/tms-roster/update', {
          previous_student_name: 'Lucas James',
          previous_student_id: '20889',
          first_name: 'Jane',
          last_name: 'Smith',
          student_id: '20889',
          grade: '7',
        }, adminCookie),
        env
      );
      const body = await res.json();
      if (res.status === 409 && (body.code === 'destination_name_taken' || body.error === 'destination_name_taken') && /blocking this change|already uses this name/i.test(body.message || body.error || '')) {
        ok('9. duplicate name returns visible failure');
      } else bad('dup name', JSON.stringify(body));
      if (state.tmsStudents.some((s) => s.student_id === '20889' && s.student_name === 'Lucas James')) {
        ok('10. failed TMS update does not persist a rename');
      } else bad('false success persist', JSON.stringify(state.tmsStudents));
    }

    {
      const janeReset = state.tmsStudents.find((s) => s.student_name === 'Jane Smith');
      if (janeReset) janeReset.student_id = '';
      const res = await worker.fetch(
        adminReq('POST', '/api/admin/tms-roster/set-student-id', {
          student_name: 'Jane Smith',
          previous_student_id: '',
          student_id: '33100',
        }, adminCookie),
        env
      );
      const body = await res.json();
      const list = await worker.fetch(adminReq('GET', '/api/admin/tms-roster', undefined, adminCookie), env);
      const listBody = await list.json();
      const jane = (listBody.students || []).find((s) => s.student_name === 'Jane Smith');
      if (res.status === 200 && body.ok && jane && jane.student_id === '33100') {
        ok('15. assigning a real School ID refreshes the missing-ID row');
      } else bad('set id refresh', JSON.stringify({ body, jane }));
      if (jane && jane.student_id === '33100' && jane.student_id !== '00000') {
        ok('16/17. normal ID is now present; no fake/default ID assigned');
      } else bad('fake id', jane);
    }
  });

  console.log('\nadmin-tms-roster-test:', pass, 'PASS', fail, 'FAIL');
  if (fail) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
