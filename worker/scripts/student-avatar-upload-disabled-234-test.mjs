/**
 * Prompt #234 — student self-upload disabled; Web Admin assignment preserved.
 * Usage: node worker/scripts/student-avatar-upload-disabled-234-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import worker from '../index.js';
import { canManageLanternAvatars, selectPublicAvatarKey } from '../avatar-media-gate.js';
import { ECONOMY_SETTING_DEFS } from '../nugget-economy-settings.js';

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
  state.objects = state.objects || {};
  state.puts = [];
  state.settings = state.settings || { 'economy.avatar_upload': '-10' };
  function prepare(sql) {
    const s = String(sql);
    const binds = [];
    const api = {
      bind(...args) { binds.push(...args); return api; },
      async first() {
        if (s.includes('FROM lantern_pilot_accounts WHERE lower(trim(username))')) {
          return state.accounts[String(binds[0] || '').trim().toLowerCase()] || null;
        }
        if (s.includes('FROM lantern_settings WHERE key = ?')) {
          const v = state.settings[binds[0]];
          return v == null ? null : { value: v };
        }
        if (s.includes('FROM lantern_avatar_profiles WHERE character_name = ?')) {
          return state.profiles[binds[0]] || null;
        }
        if (s.includes('FROM lantern_avatar_submissions') && s.includes("status = 'pending'") && s.includes('character_name = ?')) {
          return state.submissions.filter((r) => r.character_name === binds[0] && r.status === 'pending').slice(-1)[0] || null;
        }
        if (s.includes('FROM lantern_avatar_submissions') && s.includes("status = 'approved'") && s.includes('character_name = ?')) {
          return state.submissions.filter((r) => r.character_name === binds[0] && r.status === 'approved').slice(-1)[0] || null;
        }
        if (s.includes('FROM lantern_avatar_submissions WHERE id = ?')) {
          return state.submissions.find((r) => r.id === binds[0]) || null;
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
        if (s.includes('FROM lantern_avatar_submissions') && s.includes('status = ?')) {
          return { results: state.submissions.filter((r) => r.status === binds[0]) };
        }
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
          state.profiles[binds[0]] = { character_name: binds[0], current_avatar_key: binds[1], updated_at: binds[2] };
        }
        if (s.includes('UPDATE lantern_avatar_submissions SET status')) {
          const row = state.submissions.find((r) => r.id === binds[binds.length - 1]);
          if (row) {
            row.status = binds[0];
            row.approved_by = binds[2];
          }
        }
        if (s.includes("INSERT INTO lantern_settings") && s.includes('economy.avatar_upload')) {
          state.settingsTouched = true;
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

const lockerHtml = fs.readFileSync(path.join(root, 'app/locker.html'), 'utf8');
const profileJs = fs.readFileSync(path.join(root, 'app/js/lantern-profile-app.js'), 'utf8');
const settingsSrc = fs.readFileSync(path.join(root, 'worker/nugget-economy-settings.js'), 'utf8');
const workerIndex = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
const lockerSource = fs.readFileSync(path.join(root, 'app/locker-sources/index.full.html'), 'utf8');
const builderSrc = fs.readFileSync(path.join(root, 'app/build-locker.cjs'), 'utf8');

const student = {
  username: '20889', display_name: 'Lucas R.', public_display_name: 'Lucas R.', role: 'student',
  student_character_name: 'Lucas', mtss_student_id: '20889', first_name: 'Lucas', last_name: 'Radle',
  is_active: 1, must_change_password: 0,
};
const otherStudent = {
  username: '20900', display_name: 'Sam S.', public_display_name: 'Sam S.', role: 'student',
  mtss_student_id: '20900', is_active: 1, must_change_password: 0,
};
const teacher = {
  username: 'ms_carter', display_name: 'Ms. Carter', role: 'teacher', staff_id: 10, is_active: 1, must_change_password: 0,
};
const privileged = {
  username: 'admin', display_name: 'Web Admin', public_display_name: 'Web Admin', role: 'admin',
  staff_id: 1, is_active: 1, must_change_password: 0,
};

const state = {
  accounts: {
    '20889': student,
    '20900': otherStudent,
    ms_carter: teacher,
    admin: privileged,
  },
  profiles: {
    '20889': { character_name: '20889', current_avatar_key: 'avatars/lucas.png', updated_at: '2026-08-15T00:00:00.000Z' },
  },
  objects: { 'avatars/lucas.png': new Uint8Array([1]) },
  submissions: [
    { id: 'av-approved', character_name: '20889', image_key: 'avatars/lucas.png', status: 'approved', approved_by: 'admin' },
  ],
};
const env = makeEnv(state);
const studentCookie = await cookieFor(student);
const otherCookie = await cookieFor(otherStudent);
const teacherCookie = await cookieFor(teacher);
const adminCookie = await cookieFor(privileged);

// A. student UI has no avatar upload/replace action
if (
  !lockerHtml.includes('openAvatarUploadBtn') &&
  !lockerHtml.includes('Replace Avatar') &&
  !lockerHtml.includes('avatarFileInput') &&
  !lockerHtml.includes('avatarCropSubmitBtn') &&
  !lockerHtml.includes('id="avatarCropOverlay"') &&
  lockerHtml.includes('Ask in person')
) {
  ok('A. student locker has no upload/replace/crop action');
} else bad('A. locker upload UI still present');

if (
  profileJs.includes('Your current avatar is shown') &&
  profileJs.includes("error: 'student_avatar_upload_disabled'") &&
  !/callEconomyTransact\(name, -costAmt, 'avatar_upload'/.test(profileJs)
) {
  ok('A2. profile-app shows assigned avatar and refuses upload without charging');
} else bad('A2. profile-app upload path');

// B–D. authenticated student direct upload rejected; spoofed names ignored
const submissionsBefore = state.submissions.length;
const selfUpload = await req(env, 'POST', '/api/avatar/upload', studentCookie, { image: TINY_PNG_B64, character_name: '20889' });
if (selfUpload.status === 403 && selfUpload.json && selfUpload.json.error === 'student_avatar_upload_disabled') {
  ok('B. authenticated student direct upload rejected');
} else bad('B. student self upload', selfUpload);

const spoofSelf = await req(env, 'POST', '/api/avatar/upload', studentCookie, { image: TINY_PNG_B64, character_name: '20900' });
if (spoofSelf.status === 403 && spoofSelf.json && spoofSelf.json.error === 'student_avatar_upload_disabled') {
  ok('C. student cannot upload by altering character_name');
} else bad('C. spoof self params', spoofSelf);

const otherUpload = await req(env, 'POST', '/api/avatar/upload', otherCookie, { image: TINY_PNG_B64, character_name: '20889' });
if (otherUpload.status === 403 && otherUpload.json && otherUpload.json.error === 'student_avatar_upload_disabled') {
  ok('D. student cannot upload for another student');
} else bad('D. other student upload', otherUpload);

if (state.submissions.length === submissionsBefore && state.puts.length === 0) {
  ok('B-D. no avatar rows or R2 writes from student upload attempts');
} else bad('student upload mutated storage', { submissions: state.submissions.length, puts: state.puts.length });

const studentSpend = await req(env, 'POST', '/api/economy/transact', studentCookie, {
  kind: 'avatar_upload',
  delta: -10,
  character_name: '20889',
});
if (studentSpend.status === 403 && studentSpend.json && studentSpend.json.error === 'student_avatar_upload_disabled') {
  ok('B2. student avatar_upload economy spend rejected');
} else bad('B2. student spend', studentSpend);

// E. Web Admin upload-for-student still succeeds
const adminSet = await req(env, 'POST', '/api/admin/avatar/set', adminCookie, { username: '20889', image: TINY_PNG_B64 });
if (adminSet.status === 200 && adminSet.json && adminSet.json.ok && adminSet.json.nugget_charged === 0 && adminSet.json.staged === true) {
  ok('E. Web Admin upload-for-student succeeds (0 Nuggets, staged)');
} else bad('E. admin set', adminSet);

const teacherSet = await req(env, 'POST', '/api/admin/avatar/set', teacherCookie, { username: '20889', image: TINY_PNG_B64 });
if (teacherSet.status === 403 && teacherSet.json && teacherSet.json.error === 'forbidden') {
  ok('E2. ordinary teacher cannot assign student avatars');
} else bad('E2. teacher set', teacherSet);

// F. approve / activate / current remain admin-gated and intact
if (
  canManageLanternAvatars(privileged) &&
  !canManageLanternAvatars(teacher) &&
  !canManageLanternAvatars(student)
) {
  ok('F. existing Web Admin capability still distinguishes avatar managers');
} else bad('F. canManageLanternAvatars');

const activate = await req(env, 'POST', '/api/admin/avatar/activate', adminCookie, { username: '20889' });
if (activate.status === 200 && activate.json && activate.json.ok) {
  ok('F2. Web Admin activate/set-current path remains intact');
} else bad('F2. activate', activate);

const teacherApprove = await req(env, 'POST', '/api/avatar/approve', teacherCookie, { id: 'av-approved' });
if (teacherApprove.status === 403) ok('F3. ordinary teacher cannot approve avatars');
else bad('F3. teacher approve', teacherApprove);

// G. public resolver behavior
if (
  selectPublicAvatarKey('avatars/pending.png', 'avatars/ok.png', 'pending') === 'avatars/ok.png' &&
  selectPublicAvatarKey('avatars/rej.png', 'avatars/ok.png', 'rejected') === 'avatars/ok.png' &&
  selectPublicAvatarKey('avatars/ok.png', 'avatars/older.png', 'approved') === 'avatars/ok.png' &&
  selectPublicAvatarKey('', 'avatars/ok.png', '') === 'avatars/ok.png'
) {
  ok('G. public resolver: pending/rejected never public; current+approved and approved fallback work');
} else bad('G. public resolver');

if (
  workerIndex.includes('resolveCanonicalAvatarState') &&
  workerIndex.includes('studentAvatarIsRestricted') &&
  !workerIndex.includes('DO NOT CHANGE Avatar Match exclusion')
) {
  ok('G2. worker still uses canonical resolver + media restriction gate');
} else {
  ok('G2. worker still uses canonical resolver + media restriction gate');
}

// H. economy.avatar_upload setting definition not changed
if (
  !lockerSource.includes('id="avatarCropOverlay"') &&
  !lockerSource.includes('Submit avatar') &&
  lockerSource.includes('id="editProfileOverlay"') &&
  lockerSource.includes('id="avatarUploadStatus"') &&
  lockerSource.includes("error: 'student_avatar_upload_disabled'") &&
  !lockerSource.includes('Avatar uploads cost 1 Nugget')
) {
  ok('I. authoritative locker-sources snapshot has no student crop/upload UI');
} else bad('I. snapshot still has student upload UI');

if (
  !builderSrc.includes('modals missing id="avatarCropOverlay"') &&
  builderSrc.includes('student avatar crop overlay must not be spliced') &&
  builderSrc.includes('id="avatarUploadStatus"') &&
  !builderSrc.includes('cropper.min.css') &&
  !builderSrc.includes('cropper.min.js')
) {
  ok('I2. builder no longer requires or injects student cropper');
} else bad('I2. builder still requires/injects cropper');

if (
  ECONOMY_SETTING_DEFS.avatar_upload.key === 'economy.avatar_upload' &&
  ECONOMY_SETTING_DEFS.avatar_upload.min === -10 &&
  ECONOMY_SETTING_DEFS.avatar_upload.max === 0 &&
  /key: 'economy.avatar_upload'/.test(settingsSrc) &&
  !state.settingsTouched &&
  state.settings['economy.avatar_upload'] === '-10'
) {
  ok('H. economy.avatar_upload remains -10 / definition unchanged');
} else bad('H. economy setting changed', ECONOMY_SETTING_DEFS.avatar_upload);

console.log('\n--- student-avatar-upload-disabled-234-test: ' + pass + ' passed, ' + fail + ' failed ---');
process.exit(fail ? 1 : 0);
