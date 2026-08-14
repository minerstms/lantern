/**
 * Prompt #40 — Admin self-service student identity resolution.
 * Classifier + UI + preflight/unlink/read-back. No production mutation.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import worker from '../index.js';
import {
  STUDENT_HEALTH,
  attachStudentHealth,
  classifyStudentHealth,
  buildRosterPeerIndex,
  summarizeStudentHealth,
} from '../admin-student-health.js';

let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

const here = dirname(fileURLToPath(import.meta.url));
const adminHtml = readFileSync(join(here, '../../app/admin.html'), 'utf8');
const workerSrc = readFileSync(join(here, '../index.js'), 'utf8');

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

function account(overrides) {
  return {
    username: 'admin',
    display_name: 'Web Admin',
    role: 'admin',
    is_active: 1,
    must_change_password: 0,
    password_hash: 'HASH_SHOULD_NEVER_APPEAR',
    password_salt: 'SALT_SHOULD_NEVER_APPEAR',
    ...overrides,
  };
}

function row(partial) {
  return Object.assign(
    {
      student_name: '',
      student_id: '',
      is_active: 1,
      lantern_account: 'Missing',
      exact_match_linkable: false,
    },
    partial
  );
}

function classify(list, i) {
  const index = buildRosterPeerIndex(list);
  return classifyStudentHealth(list[i], index);
}

// ---- A–L fixtures ----
const healthy = row({ student_name: 'Ava Healthy', student_id: '21001', lantern_account: 'Linked', lantern_username: '21001' });
const missingId = row({ student_name: 'Blank Only', student_id: '', lantern_account: 'Missing' });
const blankDup = row({ student_name: 'Phay Son Khuu', student_id: '', lantern_account: 'Missing' });
const canonical = row({ student_name: 'Phay Son Khuu', student_id: '21004', lantern_account: 'Linked', lantern_username: '21004' });
const mistake = row({ student_name: 'Typo Kid', student_id: '', lantern_account: 'Missing' });
const missingLogin = row({ student_name: 'No Login', student_id: '21010', lantern_account: 'Missing' });
const unlinked = row({ student_name: 'Lucas Radle', student_id: '20889', lantern_account: 'Broken', exact_match_linkable: true, lantern_username: '20889' });
const wrongLink = row({ student_name: 'Wrong Link', student_id: '21020', lantern_account: 'Broken', exact_match_linkable: false, lantern_username: '21020' });
const nameA = row({ student_name: 'Jamie Smith', student_id: '11111', lantern_account: 'Linked', lantern_username: '11111' });
const nameB = row({ student_name: 'Jamie Smith', student_id: '22222', lantern_account: 'Linked', lantern_username: '22222' });
const sameIdA = row({ student_name: 'One', student_id: '33333', lantern_account: 'Linked' });
const sameIdB = row({ student_name: 'Two', student_id: '33333', lantern_account: 'Missing' });
const archivedActiveLogin = row({ student_name: 'Archived Active', student_id: '44444', is_active: 0, lantern_account: 'Linked', lantern_username: '44444' });
const activeArchivedLogin = row({ student_name: 'Active Archived', student_id: '55555', lantern_account: 'Linked Archived', lantern_username: '55555' });

if (classify([healthy], 0).health_state === STUDENT_HEALTH.HEALTHY) ok('A. healthy student');
else bad('A. healthy student');

if (classify([missingId], 0).health_state === STUDENT_HEALTH.MISSING_SCHOOL_ID) ok('B. missing school ID');
else bad('B. missing school ID', classify([missingId], 0));

const dupPair = classify([blankDup, canonical], 0);
if (dupPair.health_state === STUDENT_HEALTH.DUPLICATE_ROSTER && dupPair.possible_duplicate && dupPair.possible_duplicate.student_id === '21004') {
  ok('C. blank-ID duplicate + canonical 21004');
} else bad('C. blank-ID duplicate', dupPair);

if (classify([mistake], 0).primary_action === 'resolve') ok('D. mistaken no-history row is resolvable');
else bad('D. mistaken row', classify([mistake], 0));

if (classify([canonical], 0).health_state === STUDENT_HEALTH.HEALTHY) ok('E. identified student with login is healthy');
else bad('E. identified with login', classify([canonical], 0));

if (classify([missingLogin], 0).health_state === STUDENT_HEALTH.MISSING_LANTERN_LOGIN) ok('F. missing Lantern login');
else bad('F. missing login', classify([missingLogin], 0));

if (classify([unlinked], 0).health_state === STUDENT_HEALTH.UNLINKED_LANTERN_LOGIN) ok('G. unlinked existing login');
else bad('G. unlinked', classify([unlinked], 0));

if (classify([wrongLink], 0).health_state === STUDENT_HEALTH.IDENTITY_NEEDS_REVIEW) ok('H. wrong Lantern linkage needs review');
else bad('H. wrong link', classify([wrongLink], 0));

const nameConflict = classify([nameA, nameB], 0);
if (nameConflict.health_state === STUDENT_HEALTH.NAME_CONFLICT) ok('I. duplicate destination name');
else bad('I. name conflict', nameConflict);

const idConflict = classify([sameIdA, sameIdB], 0);
if (idConflict.health_state === STUDENT_HEALTH.CONFLICTING_SCHOOL_ID) ok('J. duplicate School ID');
else bad('J. school id conflict', idConflict);

if (classify([archivedActiveLogin], 0).health_state === STUDENT_HEALTH.ARCHIVED_ROSTER_ACTIVE_LOGIN) ok('K. archived roster + active login');
else bad('K. archived/active', classify([archivedActiveLogin], 0));

if (classify([activeArchivedLogin], 0).health_state === STUDENT_HEALTH.ACTIVE_ROSTER_ARCHIVED_LOGIN) ok('K2. active roster + archived login');
else bad('K2. active/archived', classify([activeArchivedLogin], 0));

const summary = summarizeStudentHealth(attachStudentHealth([healthy, missingId, blankDup, canonical]));
if (summary.needs_attention >= 2 && summary.healthy >= 1) ok('health summary counts Healthy / Needs Attention');
else bad('health summary', summary);

const jargon = /D1|foreign key|mtss_student_id|SQL|Worker|bridge/i;
const details = [
  classify([missingId], 0).health_detail,
  classify([blankDup, canonical], 0).health_detail,
  classify([unlinked], 0).health_detail,
];
if (details.every((d) => d && !jargon.test(d))) ok('health details use admin-facing language');
else bad('jargon leaked', details);

if (
  adminHtml.includes('Needs Attention') &&
  adminHtml.includes('data-health-filter="healthy"') &&
  adminHtml.includes('openStudentIdentityHub') &&
  adminHtml.includes('Review Conflicting Record') &&
  adminHtml.includes('Use Existing Student') &&
  adminHtml.includes('Nothing was reported as saved.') &&
  adminHtml.includes('Another roster row already uses this name.') &&
  adminHtml.includes('Resolve Duplicate') &&
  adminHtml.includes('KEEP canonical student') &&
  adminHtml.includes("textContent = 'Set Student ID'") &&
  adminHtml.includes("textContent = 'Delete Mistaken Row'") &&
  adminHtml.includes('Technical details')
) {
  ok('UI exposes health filters, Resolve hub, conflict review, and existing safe actions');
} else bad('UI strings missing');

if (adminHtml.includes('/api/admin/students/preflight-create') && workerSrc.includes('STUDENT_PREFLIGHT_PATH')) {
  ok('Add Student preflight is wired');
} else bad('preflight wiring');

if (workerSrc.includes("path === '/api/admin/tms-roster/unlink'") && adminHtml.includes('/api/admin/tms-roster/unlink')) {
  ok('Unlink incorrect login is wired');
} else bad('unlink wiring');

if (workerSrc.includes('attachStudentHealth') && workerSrc.includes('needs_attention')) {
  ok('roster GET attaches server-authoritative health');
} else bad('roster health attach');

function makeEnv(state) {
  state.accounts = state.accounts || {};
  state.bridgeCalls = state.bridgeCalls || [];
  function prepare(sql) {
    const s = String(sql);
    const binds = [];
    const api = {
      bind(...args) { binds.push(...args); return api; },
      async first() {
        if (s.includes('FROM lantern_pilot_accounts') && s.includes('lower(trim(username))')) {
          const key = String(binds[0] || '').trim().toLowerCase();
          return state.accounts[key] || null;
        }
        return null;
      },
      async all() {
        if (s.includes("lower(trim(role)) = 'student'")) {
          return { results: Object.values(state.accounts).filter((a) => String(a.role || '').toLowerCase() === 'student') };
        }
        if (s.includes('mtss_student_id IS NOT NULL') && s.includes('lower(trim(mtss_student_id))')) {
          const want = String(binds[0] || '').trim().toLowerCase();
          return {
            results: Object.values(state.accounts).filter((a) => String(a.mtss_student_id || '').trim().toLowerCase() === want),
          };
        }
        return { results: [] };
      },
      async run() {
        if (s.includes('UPDATE lantern_pilot_accounts SET mtss_student_id = NULL')) {
          const user = String(binds[0] || '').trim().toLowerCase();
          const sid = String(binds[1] || '').trim().toLowerCase();
          const acc = state.accounts[user];
          if (acc && String(acc.mtss_student_id || '').trim().toLowerCase() === sid) acc.mtss_student_id = null;
          return { success: true, meta: { changes: 1 } };
        }
        return { success: true, meta: { changes: 1 } };
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

async function cookieFor(acc) {
  const now = Math.floor(Date.now() / 1000);
  const token = await signTestJwt({ sub: acc.username, role: acc.role, iat: now, exp: now + 3600 }, TEST_PILOT_SECRET);
  return `lantern_pilot=${token}`;
}

const originalFetch = globalThis.fetch;
async function withMockedBridge(env, fn) {
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    const body = init && init.body ? JSON.parse(init.body) : {};
    env._state.bridgeCalls.push({ url: u, body });
    const sub = u.split('/api/lantern-bridge/')[1] || '';
    const handler = env._state.bridgeHandlers[sub];
    if (!handler) return new Response(JSON.stringify({ ok: false, error: 'unhandled_sub', sub }), { status: 404 });
    const out = await handler(body);
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

const admin = account();
const state = {
  accounts: {
    admin,
    '21004': account({ username: '21004', role: 'student', mtss_student_id: '21004', display_name: 'Phay Son Khuu' }),
    '20889': account({ username: '20889', role: 'student', mtss_student_id: null, display_name: 'Lucas Radle' }),
  },
  tmsStudents: [
    { student_name: 'Phay Son Khuu', student_id: '21004', is_active: 1, grade: '7' },
    { student_name: 'Phay Son Khuu', student_id: '', is_active: 1, grade: '7' },
    { student_name: 'Lucas Radle', student_id: '20889', is_active: 1, grade: '8' },
    { student_name: 'Jamie Smith', student_id: '11111', is_active: 1, grade: '6' },
  ],
  bridgeHandlers: {
    'roster/list': async (body) => {
      const includeInactive = !!(body && body.include_inactive);
      const students = state.tmsStudents.filter((s) => includeInactive || Number(s.is_active) !== 0);
      return { ok: true, students };
    },
    'roster/update': async () => ({
      ok: false,
      error: 'Another roster row already uses this name.',
      code: 'destination_name_taken',
      _httpStatus: 409,
    }),
  },
};
const env = makeEnv(state);
const cookie = await cookieFor(admin);

await withMockedBridge(env, async () => {
  const rosterRes = await worker.fetch(adminReq('GET', '/api/admin/tms-roster', undefined, cookie), env);
  const rosterBody = await rosterRes.json();
  const phayBlank = (rosterBody.students || []).find((s) => s.student_name === 'Phay Son Khuu' && !s.student_id);
  const phayId = (rosterBody.students || []).find((s) => s.student_id === '21004');
  const lucas = (rosterBody.students || []).find((s) => s.student_id === '20889');
  if (rosterRes.status === 200 && rosterBody.ok && rosterBody.counts && rosterBody.counts.needs_attention >= 2) {
    ok('GET roster returns health counts');
  } else bad('GET roster health counts', { status: rosterRes.status, body: rosterBody });
  if (phayBlank && phayBlank.health_state === 'duplicate_roster' && phayBlank.possible_duplicate && phayBlank.possible_duplicate.student_id === '21004') {
    ok('blank Phay is Duplicate Roster Record pointing at 21004');
  } else bad('blank Phay health', phayBlank);
  if (phayId && phayId.health_state === 'healthy') ok('identified 21004 is Healthy');
  else bad('21004 health', phayId);
  if (lucas && lucas.health_state === 'unlinked_lantern_login' && lucas.primary_action === 'link_login') {
    ok('Lucas is Unlinked Lantern Login with link action');
  } else bad('Lucas health', lucas);

  const pre = await worker.fetch(adminReq('POST', '/api/admin/students/preflight-create', {
    first_name: 'Phay', last_name: 'Son Khuu', student_id: '21004',
  }, cookie), env);
  const preBody = await pre.json();
  if (pre.status === 200 && preBody.has_conflict && preBody.use_existing && preBody.can_create === false) {
    ok('Add Student preflight blocks existing School ID 21004');
  } else bad('preflight existing ID', { status: pre.status, body: preBody });

  const update = await worker.fetch(adminReq('POST', '/api/admin/tms-roster/update', {
    previous_student_name: 'Jamie Smith',
    previous_student_id: '11111',
    first_name: 'Phay',
    last_name: 'Son Khuu',
    student_id: '11111',
    grade: '6',
    confirm_change: false,
  }, cookie), env);
  const updateBody = await update.json();
  if (
    update.status === 409 &&
    updateBody.code === 'destination_name_taken' &&
    updateBody.message === 'Another student record is blocking this change.' &&
    updateBody.conflicting_student &&
    updateBody.conflicting_student.student_id === '21004'
  ) {
    ok('L/I. name conflict returns Review-ready conflicting student, not silent success');
  } else bad('name conflict payload', { status: update.status, body: updateBody });

  const unlinkNoConfirm = await worker.fetch(adminReq('POST', '/api/admin/tms-roster/unlink', {
    username: '21004', student_id: '21004',
  }, cookie), env);
  const unlinkNoBody = await unlinkNoConfirm.json();
  if (unlinkNoConfirm.status === 400 && unlinkNoBody.error === 'confirm_required') ok('unlink requires typed UNLINK');
  else bad('unlink confirm', { status: unlinkNoConfirm.status, body: unlinkNoBody });

  const unlink = await worker.fetch(adminReq('POST', '/api/admin/tms-roster/unlink', {
    username: '21004', student_id: '21004', confirm: 'UNLINK',
  }, cookie), env);
  const unlinkBody = await unlink.json();
  if (unlink.status === 200 && unlinkBody.ok && unlinkBody.verified && state.accounts['21004'].mtss_student_id == null) {
    ok('unlink clears the login link and rereads before success');
  } else bad('unlink verified', { status: unlink.status, body: unlinkBody, acc: state.accounts['21004'] });
});

console.log(`admin-student-resolution-40-test: ${pass} PASS ${fail} FAIL`);
if (fail) process.exit(1);
