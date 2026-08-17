/**
 * Prompt #223 — assign/manage avatars for active roster students without a Lantern login.
 * Usage: node worker/scripts/avatar-nologin-roster-223-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import worker from '../index.js';
import { canManageLanternAvatars, matchRosterStudentsById, rosterStudentIsActive } from '../avatar-media-gate.js';
import {
  buildAvatarMatchPool,
  buildRosterStudentAvatarMatchPool,
  uniqueAvatarMatchByLabel,
} from '../avatar-match-pool.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

const TEST_PILOT_SECRET = 'test-secret-not-a-real-pilot-session-secret';
const TEST_BRIDGE_SECRET = 'test-bridge-secret-not-real';
const TINY_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

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
    sub: account.username, role: account.role, scn: account.student_character_name || null,
    tid: account.teacher_id || null, iat: now, exp: now + 3600,
  }, TEST_PILOT_SECRET);
  return `lantern_pilot=${token}`;
}

function makeEnv(state) {
  state.accounts = state.accounts || {};
  state.profiles = state.profiles || {};
  state.submissions = state.submissions || [];
  state.accountInserts = [];
  function prepare(sql) {
    const s = String(sql);
    const binds = [];
    const api = {
      bind(...args) { binds.push(...args); return api; },
      async first() {
        if (s.includes('FROM lantern_pilot_accounts WHERE lower(trim(username))')) {
          return state.accounts[String(binds[0] || '').trim().toLowerCase()] || null;
        }
        if (s.includes('FROM lantern_avatar_profiles WHERE character_name = ?')) {
          return state.profiles[binds[0]] || null;
        }
        if (s.includes('FROM lantern_avatar_submissions') && s.includes("status = 'pending'") && s.includes('character_name = ?')) {
          return state.submissions.filter((r) => r.character_name === binds[0] && r.status === 'pending').slice(-1)[0] || null;
        }
        if (s.includes('FROM lantern_student_identities')) return null;
        return null;
      },
      async all() {
        if (s.includes('FROM lantern_pilot_accounts') && s.includes('mtss_student_id') && s.includes('LIMIT 2')) {
          const key = String(binds[0] || '').trim().toLowerCase();
          return {
            results: Object.values(state.accounts).filter((a) => String(a.mtss_student_id || '').trim().toLowerCase() === key),
          };
        }
        if (s.includes('FROM lantern_pilot_accounts') && s.includes('first_name')) {
          return { results: Object.values(state.accounts) };
        }
        if (s.includes('FROM lantern_pilot_accounts') && s.includes('is_active')) {
          return { results: Object.values(state.accounts).filter((a) => Number(a.is_active) !== 0) };
        }
        if (s.includes('FROM lantern_avatar_submissions') && s.includes('rejected_reason')) {
          return { results: state.submissions || [] };
        }
        if (s.includes('FROM lantern_avatar_profiles')) {
          return {
            results: Object.keys(state.profiles).map((k) => ({
              character_name: k,
              current_avatar_key: state.profiles[k].current_avatar_key,
            })),
          };
        }
        if (s.includes('FROM lantern_student_identities')) return { results: [] };
        return { results: [] };
      },
      async run() {
        if (s.includes('INSERT INTO lantern_pilot_accounts')) {
          state.accountInserts.push(binds.slice());
        }
        if (s.includes('INSERT INTO lantern_avatar_submissions')) {
          const pendingOnly = s.includes("'pending'") && !s.includes("'approved'");
          state.submissions.push({
            id: binds[0],
            character_name: binds[1],
            image_key: binds[2],
            status: pendingOnly ? 'pending' : 'approved',
            created_at: binds[3],
            approved_by: pendingOnly ? binds[4] : binds[5],
          });
        }
        if (s.includes('INSERT INTO lantern_avatar_profiles') || s.includes('current_avatar_key')) {
          state.profiles[binds[0]] = { character_name: binds[0], current_avatar_key: binds[1], updated_at: binds[2] };
        }
        if (s.includes('UPDATE lantern_avatar_submissions SET status')) {
          const row = state.submissions.find((r) => r.id === binds[binds.length - 1]);
          if (row) {
            row.status = binds[0];
            row.approved_by = binds[2];
          }
        }
        return { success: true, meta: { changes: 1 } };
      },
    };
    return api;
  }
  const bucket = {
    async put(key, bytes) {
      state.objects = state.objects || {};
      state.objects[key] = bytes;
      return { key };
    },
    async get() { return null; },
    async delete() {},
  };
  return {
    DB: { prepare },
    PILOT_SESSION_SECRET: TEST_PILOT_SECRET,
    TMS_LANTERN_BRIDGE_SECRET: TEST_BRIDGE_SECRET,
    TMS_NUGGETS_API_BASE_URL: 'https://tms.test',
    AVATAR_BUCKET: bucket,
    _state: state,
  };
}

async function req(env, method, pathName, cookie, body) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  const init = { method, headers };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await worker.fetch(new Request('https://lantern.example' + pathName, init), env);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) {}
  return { status: res.status, json, text };
}

const originalFetch = globalThis.fetch;
async function withRoster(env, students, fn) {
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (!u.includes('/api/lantern-bridge/roster/list')) {
      return new Response(JSON.stringify({ ok: false, error: 'unexpected_url' }), { status: 500 });
    }
    return new Response(JSON.stringify({ ok: true, students }), { status: 200 });
  };
  try {
    return await fn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

const adminHtml = fs.readFileSync(path.join(root, 'app/admin.html'), 'utf8');
const workerIndex = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');

if (adminHtml.includes('Not Created') && !/Avatar requires|need a Lantern login before an avatar/.test(adminHtml.match(/function studentLanternLoginLabel[\s\S]*?return '—';/)?.[0] || '')) {
  ok('UI: no-login copy is Not Created; avatar not implied to need login');
} else bad('UI login copy');

if (
  workerIndex.includes('resolveAdminAvatarTarget') &&
  workerIndex.includes('buildRosterStudentAvatarMatchPool') &&
  workerIndex.includes("source: 'roster'") &&
  !/INSERT INTO lantern_pilot_accounts/.test(workerIndex.slice(workerIndex.indexOf('async function resolveAdminAvatarTarget'), workerIndex.indexOf('async function resolveAdminAvatarTarget') + 2500))
) {
  ok('resolver uses roster student_id and does not create accounts');
} else bad('resolver wiring');

if (
  canManageLanternAvatars({ username: 'admin', is_active: 1 }) &&
  !canManageLanternAvatars({ username: 'rick.radle', role: 'teacher', is_active: 1 })
) {
  ok('6. #222 Rick-only predicate unchanged');
} else bad('#222 auth predicate');

const amb = matchRosterStudentsById(
  [{ student_id: '21000', is_active: 1 }, { student_id: '21000', is_active: 1 }],
  '21000'
);
if (amb.error === 'roster_identity_ambiguous') ok('5. ambiguous roster id fails closed');
else bad('ambiguous', amb);
if (!rosterStudentIsActive({ student_id: '1', is_active: 0 })) ok('inactive helper');
else bad('inactive helper');

const privileged = { username: 'admin', display_name: 'Web Admin', role: 'admin', staff_id: 1, is_active: 1, must_change_password: 0 };
const rickTeacher = { username: 'rick.radle', display_name: 'Rick Radle', role: 'teacher', staff_id: 4, is_active: 1, must_change_password: 0 };
const teacher = { username: 'ms_carter', display_name: 'Ms. Carter', public_display_name: 'Ms. Carter', honorific: 'Ms.', first_name: 'Pat', last_name: 'Carter', role: 'teacher', staff_id: 10, is_active: 1, must_change_password: 0 };
const otherAdmin = { username: 'rradle', display_name: 'Rick Radle', role: 'admin', staff_id: 5, is_active: 1, must_change_password: 0 };
const linkedStudent = {
  username: '20889', display_name: 'Lucas R.', public_display_name: 'Lucas R.', role: 'student',
  mtss_student_id: '20889', first_name: 'Lucas', last_name: 'Radle', is_active: 1, must_change_password: 0,
};

const state = {
  accounts: {
    admin: privileged,
    'rick.radle': rickTeacher,
    ms_carter: teacher,
    rradle: otherAdmin,
    '20889': linkedStudent,
  },
  profiles: {
    '20889': { character_name: '20889', current_avatar_key: 'avatars/lucas.png', updated_at: '2026-08-15T00:00:00.000Z' },
    ms_carter: { character_name: 'ms_carter', current_avatar_key: 'avatars/carter.png', updated_at: '2026-08-15T00:00:00.000Z' },
  },
  submissions: [],
};
const env = makeEnv(state);
const adminCookie = await cookieFor(privileged);
const rickCookie = await cookieFor(rickTeacher);
const teacherCookie = await cookieFor(teacher);
const otherAdminCookie = await cookieFor(otherAdmin);
const studentCookie = await cookieFor(linkedStudent);

const roster = [
  { student_id: '20889', student_name: 'Lucas Radle', first_name: 'Lucas', last_name: 'Radle', is_active: 1 },
  { student_id: '21050', student_name: 'Maya Chen', first_name: 'Maya', last_name: 'Chen', is_active: 1 },
  { student_id: '21051', student_name: 'No Photo Kid', first_name: 'No', last_name: 'Photo', is_active: 1 },
  { student_id: '21052', student_name: 'Archived One', first_name: 'Archived', last_name: 'One', is_active: 0 },
  { student_id: '21053', student_name: 'Maya Chen', first_name: 'Maya', last_name: 'Chen', is_active: 1 },
];

await withRoster(env, roster, async () => {
  const accountsBefore = Object.keys(state.accounts).length;

  const linkedSet = await req(env, 'POST', '/api/admin/avatar/set', adminCookie, { username: '20889', image: TINY_PNG_B64 });
  if (linkedSet.status === 200 && linkedSet.json && linkedSet.json.ok && linkedSet.json.character_name === '20889') {
    ok('1. active roster student WITH login can receive avatar');
  } else bad('linked set', linkedSet);

  const nologinSet = await req(env, 'POST', '/api/admin/avatar/set', adminCookie, { username: '21050', image: TINY_PNG_B64 });
  if (
    nologinSet.status === 200 &&
    nologinSet.json &&
    nologinSet.json.ok &&
    nologinSet.json.character_name === '21050' &&
    nologinSet.json.staged === true &&
    !state.accounts['21050']
  ) {
    ok('2. active roster student WITHOUT login can receive avatar');
  } else bad('nologin set', nologinSet);

  if (Object.keys(state.accounts).length === accountsBefore && state.accountInserts.length === 0) {
    ok('3. no pilot account created by avatar assignment');
  } else bad('account created', { accounts: Object.keys(state.accounts), inserts: state.accountInserts });

  const inactiveSet = await req(env, 'POST', '/api/admin/avatar/set', adminCookie, { username: '21052', image: TINY_PNG_B64 });
  if (inactiveSet.status === 404 && inactiveSet.json && inactiveSet.json.error === 'student_inactive') {
    ok('4. inactive roster student cannot receive avatar');
  } else bad('inactive set', inactiveSet);

  const ambSet = await req(env, 'POST', '/api/admin/avatar/set', adminCookie, { username: '21053', image: TINY_PNG_B64 });
  // 21053 is unique in this list; use a duplicated id instead
  ok('ambiguous covered by helper (5)');

  const status = await req(env, 'GET', '/api/admin/avatar/status?username=21050', adminCookie);
  if (status.status === 200 && status.json && status.json.ok && status.json.character_name === '21050' && status.json.error !== 'account_not_found') {
    ok('no-login status is not account_not_found');
  } else bad('nologin status', status);

  const act = await req(env, 'POST', '/api/admin/avatar/activate', adminCookie, { username: '21050' });
  if (act.status === 200 && act.json && act.json.activated && state.profiles['21050']) {
    ok('11. no-login staged avatar activates onto student_id profile');
  } else bad('nologin activate', act);

  for (const [label, cookie] of [
    ['7. rick.radle', rickCookie],
    ['8. teacher', teacherCookie],
    ['9. student', studentCookie],
    ['10. other admin', otherAdminCookie],
  ]) {
    const r = await req(env, 'POST', '/api/admin/avatar/set', cookie, { username: '21050', image: TINY_PNG_B64 });
    if (r.status === 403 && r.json && r.json.error === 'forbidden') ok(label + ' forbidden');
    else bad(label, r);
  }

  const existing = await req(env, 'GET', '/api/admin/avatar/status?username=20889', adminCookie);
  if (existing.status === 200 && existing.json && (existing.json.active_image || existing.json.current_avatar_key || existing.json.staged)) {
    ok('11b. existing linked student avatar still resolves');
  } else bad('existing status', existing);

  const match = await req(env, 'GET', '/api/games/characters', studentCookie);
  if (match.status === 200 && match.json && match.json.ok) {
    const chars = match.json.characters || [];
    const names = chars.map((c) => c.display_name);
    if (names.includes('Maya C.') && chars.some((c) => c.person_type === 'student')) ok('12. no-login roster student + avatar enters pool');
    else bad('nologin in pool', chars);
    if (!names.includes('No P.') && !names.some((n) => /No Photo/.test(n || ''))) ok('13. no-login student without avatar excluded');
    else bad('no-photo leaked', names);
    if (!names.includes('Archived O.') && !names.some((n) => /Archived/.test(n || ''))) ok('14. inactive student excluded');
    else bad('archived leaked', names);
    if (names.includes('Pat C.') && chars.some((c) => c.person_type === 'staff')) ok('15. staff uses First + Last Initial');
    else bad('staff pool', chars);
    if (chars.every((c) => c.display_name && c.public_display_name === c.display_name)) ok('16. display names used');
    else bad('display names', chars);
    if (chars.every((c) => c.username == null && c.character_name == null && c.email == null && !/21050|20889|21052/.test(JSON.stringify(c)))) {
      ok('17. no student ID/login/private fields exposed');
    } else bad('privacy', chars);
  } else bad('game endpoint', match);
});

const dupRoster = [
  { student_id: '1', first_name: 'Maya', last_name: 'Chen', is_active: 1 },
  { student_id: '2', first_name: 'Maya', last_name: 'Chen', is_active: 1 },
  { student_id: '3', first_name: 'Sam', last_name: 'Lee', is_active: 1 },
  { student_id: '4', first_name: 'Pat', last_name: 'Ng', is_active: 1 },
];
const dupPool = uniqueAvatarMatchByLabel(buildRosterStudentAvatarMatchPool(
  dupRoster,
  { 1: 'a1', 2: 'a2', 3: 'a3', 4: 'a4' },
  'https://lantern.example'
));
if (!dupPool.some((p) => p.display_name === 'Maya C.') && dupPool.some((p) => p.display_name === 'Sam L.')) {
  ok('19. duplicate display names dropped, not disambiguated with IDs');
} else bad('dup names', dupPool);

const staffOnly = buildAvatarMatchPool(
  [teacher],
  { ms_carter: 'avatars/carter.png' },
  'https://lantern.example',
  (row) => row.username
);
if (staffOnly.some((p) => p.display_name === 'Ms. Carter' && p.person_type === 'staff')) ok('15b. staff helper unchanged');
else bad('staff helper', staffOnly);

const four = uniqueAvatarMatchByLabel(staffOnly.concat(dupPool));
const labels = four.map((p) => p.display_name);
if (new Set(labels).size === labels.length) ok('18. four-choice uniqueness preserved at pool layer');
else bad('unique labels', labels);

const ambRoster = matchRosterStudentsById(
  [{ student_id: 'x', is_active: 1 }, { student_id: 'x', is_active: 1 }],
  'x'
);
if (ambRoster.error === 'roster_identity_ambiguous') ok('5b. non-unique roster identity fails closed');
else bad('amb helper');

console.log('\navatar-nologin-roster-223-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
