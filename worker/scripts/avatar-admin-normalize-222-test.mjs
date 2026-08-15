/**
 * Prompt #222 — Rick-only avatar management, consistent Admin controls, shared Avatar Match pool.
 * Usage: node worker/scripts/avatar-admin-normalize-222-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import worker from '../index.js';
import { canManageLanternAvatars } from '../avatar-media-gate.js';
import { buildAvatarMatchPool, uniqueAvatarMatchByLabel } from '../avatar-match-pool.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

const TEST_PILOT_SECRET = 'test-secret-not-a-real-pilot-session-secret';
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
  state.approvals = state.approvals || [];
  state.identities = state.identities || {};
  state.objects = state.objects || {};
  state.puts = [];
  state.profileWrites = [];
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
        if (s.includes('FROM lantern_avatar_submissions WHERE id = ?')) {
          return state.submissions.find((r) => r.id === binds[0]) || null;
        }
        if (s.includes('FROM lantern_approvals WHERE id = ?')) {
          return state.approvals.find((r) => r.id === binds[0]) || null;
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
        if (s.includes('FROM lantern_pilot_accounts') && s.includes('is_active')) {
          return { results: Object.values(state.accounts).filter((a) => Number(a.is_active) !== 0) };
        }
        if (s.includes('FROM lantern_avatar_profiles')) {
          return {
            results: Object.keys(state.profiles).map((k) => ({
              character_name: k,
              current_avatar_key: state.profiles[k].current_avatar_key,
            })),
          };
        }
        if (s.includes('FROM lantern_avatar_submissions') && s.includes('status = ?')) {
          return { results: state.submissions.filter((r) => r.status === binds[0]) };
        }
        if (s.includes('FROM lantern_student_identities')) return { results: [] };
        return { results: [] };
      },
      async run() {
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
          state.profileWrites.push({ character_name: binds[0], current_avatar_key: binds[1] });
          state.profiles[binds[0]] = { character_name: binds[0], current_avatar_key: binds[1], updated_at: binds[2] };
        }
        if (s.includes('UPDATE lantern_avatar_submissions SET status')) {
          state.submissions.forEach((r) => {
            if (r.character_name === binds[3] && r.status === 'pending') r.status = 'rejected';
          });
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
      state.puts.push(key);
      state.objects[key] = bytes;
      return { key };
    },
    async get(key) {
      if (!state.objects[key]) return null;
      return { body: state.objects[key], httpMetadata: { contentType: 'image/png' } };
    },
    async delete() {},
  };
  return {
    DB: { prepare },
    PILOT_SESSION_SECRET: TEST_PILOT_SECRET,
    AVATAR_BUCKET: bucket,
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

const adminHtml = fs.readFileSync(path.join(root, 'app/admin.html'), 'utf8');
const lockerHtml = fs.readFileSync(path.join(root, 'app/locker.html'), 'utf8');
const teacherHtml = fs.readFileSync(path.join(root, 'app/teacher.html'), 'utf8');
const gamesHtml = fs.readFileSync(path.join(root, 'app/games.html'), 'utf8');
const profileJs = fs.readFileSync(path.join(root, 'app/js/lantern-profile-app.js'), 'utf8');
const workerIndex = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
const gateSrc = fs.readFileSync(path.join(root, 'worker/avatar-media-gate.js'), 'utf8');

const actionsFn = adminHtml.match(/function studentRowActionsHtml[\s\S]*?return html;\s*\}/);
const actionsSrc = actionsFn ? actionsFn[0] : '';
if (
  actionsSrc.includes("studentRowActionAttrs(s, 'manage-avatar')") &&
  actionsSrc.includes('isWebSystemAdminSession()') &&
  actionsSrc.includes('is_active') &&
  !/lucas/i.test(actionsSrc) &&
  !/has_avatar/.test(actionsSrc) &&
  !/lantern_account === 'Linked'[\s\S]{0,200}manage-avatar/.test(actionsSrc)
) {
  ok('1-3. Manage Avatar on every active student; not Lucas/avatar/login gated');
} else bad('student Manage Avatar visibility', actionsSrc.slice(0, 400));

if (
  adminHtml.includes("textContent = 'Manage Avatar'") &&
  /isWebSystemAdminSession\(\) && active/.test(adminHtml) &&
  adminHtml.includes('openAdminAvatarPanel(u.username')
) {
  ok('4-5. Manage Avatar on every active staff row for Rick');
} else bad('staff Manage Avatar visibility');

if (
  canManageLanternAvatars({ username: 'admin', role: 'admin', display_name: 'Web Admin', is_active: 1 }) &&
  !canManageLanternAvatars({ username: 'rick.radle', role: 'teacher', display_name: 'Rick Radle', is_active: 1 }) &&
  !canManageLanternAvatars({ username: 'ms.carter', role: 'teacher', is_active: 1 }) &&
  !canManageLanternAvatars({ username: '20889', role: 'student', is_active: 1 }) &&
  !canManageLanternAvatars({ username: 'rradle', role: 'admin', display_name: 'Rick Radle', is_active: 1 }) &&
  !canManageLanternAvatars({ username: 'admin', role: 'admin', is_active: 0 }) &&
  !canManageLanternAvatars({ username: 'Web Admin', role: 'admin', is_active: 1 })
) {
  ok('6-10. canManageLanternAvatars is locked username admin only');
} else bad('canManageLanternAvatars identity');

if (
  gateSrc.includes("!== 'admin'") &&
  !/display_name/.test(gateSrc.match(/function canManageLanternAvatars[\s\S]*?\n\}/)?.[0] || '')
) {
  ok('auth uses immutable username admin, not display name');
} else bad('auth identity source');

if (!lockerHtml.includes('openAvatarUploadBtn') && !lockerHtml.includes('Replace Avatar') && lockerHtml.includes('Ask in person')) {
  ok('12. student locker has no change/request upload control');
} else bad('locker self-service still present');

if (/data-kind-filter="avatar" hidden/.test(teacherHtml) && /pendingAvatars = \[\]/.test(teacherHtml)) {
  ok('13. teacher avatar request/approval queue hidden');
} else bad('teacher avatar queue still live');

if (profileJs.includes('Your current avatar is shown') && /openUploadBtn\.hidden = true/.test(profileJs)) {
  ok('14. existing avatar still displays; change controls hidden');
} else bad('profile display/self-service');

const student = {
  username: '20889', display_name: 'Lucas R.', public_display_name: 'Lucas R.', role: 'student',
  student_character_name: 'Lucas', mtss_student_id: '20889', first_name: 'Lucas', last_name: 'Radle',
  is_active: 1, must_change_password: 0,
};
const noAvatarStudent = {
  username: '20900', display_name: 'Sam S.', public_display_name: 'Sam S.', role: 'student',
  mtss_student_id: '20900', is_active: 1, must_change_password: 0,
};
const archived = {
  username: '20901', display_name: 'Old O.', public_display_name: 'Old O.', role: 'student',
  mtss_student_id: '20901', is_active: 0, must_change_password: 0,
};
const teacher = {
  username: 'ms_carter', display_name: 'Ms. Carter', public_display_name: 'Ms. Carter', honorific: 'Ms.',
  last_name: 'Carter', role: 'teacher', staff_id: 10, is_active: 1, must_change_password: 0,
};
const rickTeacher = {
  username: 'rick.radle', display_name: 'Rick Radle', public_display_name: 'Mr. Radle', honorific: 'Mr.',
  last_name: 'Radle', role: 'teacher', staff_id: 4, is_active: 1, must_change_password: 0,
};
const otherAdmin = {
  username: 'rradle', display_name: 'Rick Radle', role: 'admin', staff_id: 5, is_active: 1, must_change_password: 0,
};
const privileged = {
  username: 'admin', display_name: 'Web Admin', public_display_name: 'Web Admin', role: 'admin',
  staff_id: 1, is_active: 1, must_change_password: 0,
};

const state = {
  accounts: {
    '20889': student,
    '20900': noAvatarStudent,
    '20901': archived,
    ms_carter: teacher,
    'rick.radle': rickTeacher,
    rradle: otherAdmin,
    admin: privileged,
  },
  profiles: {
    '20889': { character_name: '20889', current_avatar_key: 'avatars/lucas.png', updated_at: '2026-08-15T00:00:00.000Z' },
    ms_carter: { character_name: 'ms_carter', current_avatar_key: 'avatars/carter.png', updated_at: '2026-08-15T00:00:00.000Z' },
    '20901': { character_name: '20901', current_avatar_key: 'avatars/old.png', updated_at: '2026-08-15T00:00:00.000Z' },
  },
  objects: {
    'avatars/lucas.png': new Uint8Array([1]),
    'avatars/carter.png': new Uint8Array([2]),
  },
  submissions: [
    { id: 'av-hist', character_name: '20889', image_key: 'avatars/old-pending.png', status: 'pending', approved_by: null },
  ],
  approvals: [
    { id: 'approval-hist', item_type: 'avatar', item_id: 'av-hist', status: 'pending' },
  ],
};
const env = makeEnv(state);
const studentCookie = await cookieFor(student);
const teacherCookie = await cookieFor(teacher);
const rickCookie = await cookieFor(rickTeacher);
const otherAdminCookie = await cookieFor(otherAdmin);
const adminCookie = await cookieFor(privileged);

const allowed = await req(env, 'POST', '/api/admin/avatar/set', adminCookie, { username: 'ms_carter', image: TINY_PNG_B64 });
if (allowed.status === 200 && allowed.json && allowed.json.ok) ok('6. privileged admin username admin may mutate avatars');
else bad('privileged mutate', allowed);

for (const [label, cookie] of [
  ['7. rick.radle teacher', rickCookie],
  ['8. ordinary teacher', teacherCookie],
  ['9. student', studentCookie],
  ['10. other admin-role account', otherAdminCookie],
]) {
  const r = await req(env, 'POST', '/api/admin/avatar/set', cookie, { username: '20889', image: TINY_PNG_B64 });
  if (r.status === 403 && r.json && r.json.error === 'forbidden') ok(label + ' forbidden');
  else bad(label, r);
}

const upload = await req(env, 'POST', '/api/avatar/upload', studentCookie, { image: TINY_PNG_B64, character_name: 'ms_carter' });
if (upload.status === 403 && upload.json && upload.json.code === 'avatar_self_service_disabled') {
  ok('11. direct upload API cannot bypass UI; body.character_name ignored');
} else bad('upload bypass', upload);

const teacherPend = await req(env, 'GET', '/api/avatar/pending', teacherCookie);
if (teacherPend.status === 403) ok('11b. teacher pending list forbidden');
else bad('teacher pending', teacherPend);

const teacherAppr = await req(env, 'POST', '/api/approvals/approve', teacherCookie, { id: 'approval-hist' });
if (teacherAppr.status === 403 && teacherAppr.json && teacherAppr.json.error === 'forbidden') {
  ok('11c. unified approvals avatar branch Rick-only');
} else bad('approvals avatar', teacherAppr);

if (state.submissions.some((s) => s.id === 'av-hist' && s.status === 'pending')) {
  ok('historical pending request preserved');
} else bad('pending history mutated');

const keyFn = (row) => (String(row.role).toLowerCase() === 'student' ? String(row.mtss_student_id || row.username) : String(row.username));
const pool = uniqueAvatarMatchByLabel(buildAvatarMatchPool(
  Object.values(state.accounts),
  {
    '20889': 'avatars/lucas.png',
    ms_carter: 'avatars/carter.png',
    '20901': 'avatars/old.png',
  },
  'https://lantern.example',
  keyFn
));
if (pool.some((p) => p.display_name === 'Lucas R.' && p.person_type === 'student')) ok('15. active student + valid avatar included');
else bad('student pool', pool);
if (pool.some((p) => p.display_name === 'Ms. Carter' && p.person_type === 'staff')) ok('16. active staff + valid avatar included');
else bad('staff pool', pool);
if (!pool.some((p) => p.display_name === 'Sam S.')) ok('17. no-avatar person not an owner');
else bad('no-avatar leaked', pool);
if (!pool.some((p) => p.display_name === 'Old O.')) ok('18. inactive/archived excluded');
else bad('archived leaked', pool);
if (pool.every((p) => p.display_name && p.public_display_name === p.display_name)) ok('20. game uses displayName');
else bad('display names', pool);
if (pool.every((p) => p.username == null && p.character_name == null && p.email == null && p.mtss_student_id == null)) {
  ok('24. no private fields exposed');
} else bad('private fields', pool);

const pendingOnly = buildAvatarMatchPool(
  [student],
  {},
  'https://lantern.example',
  keyFn
);
if (pendingOnly.length === 0) ok('19. pending/unapproved avatar excluded as owner');
else bad('pending owner', pendingOnly);

if (/unusedOwners/.test(gamesHtml) && /display_name/.test(gamesHtml) && !/opt\.display_name \|\| opt\.character_name/.test(gamesHtml)) {
  ok('21-23. Avatar Match uses display names, unused-owner coverage, shuffled choices');
} else bad('games.html pickOptions');

if (workerIndex.includes('buildAvatarMatchPool') && workerIndex.includes('uniqueAvatarMatchByLabel') && workerIndex.includes('canManageLanternAvatars')) {
  ok('shared pool + canonical auth predicate reused');
} else bad('shared helpers missing');

const match = await req(env, 'GET', '/api/games/characters', studentCookie);
if (match.status === 200 && match.json && match.json.ok) {
  const chars = match.json.characters || [];
  const names = chars.map((c) => c.display_name);
  if (names.includes('Lucas R.') && names.includes('Ms. Carter') && !names.includes('Sam S.') && !names.includes('Old O.')) {
    ok('game endpoint includes student+staff owners only');
  } else bad('game endpoint pool', chars);
  if (chars.every((c) => c.username == null && c.email == null && !/20889|20900/.test(JSON.stringify(c)))) {
    ok('game endpoint omits private ids');
  } else bad('game endpoint privacy', chars);
} else bad('game endpoint', match);

console.log('\navatar-admin-normalize-222-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
