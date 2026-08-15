/**
 * Prompt #221 — avatar/media, Avatar Match, image keys, Verify writes.
 * Usage: node worker/scripts/p1-security-221-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import worker from '../index.js';
import { isAvatarObjectKey, isNewsImageObjectKey, isNewsVideoObjectKey, isMediaLibraryObjectKey } from '../r2-key-guards.js';
import { studentAvatarActivationBlocked, isAdminStagedAvatarMarker, adminStagedAvatarMarker } from '../avatar-media-gate.js';
import { buildAvatarMatchPool } from '../avatar-match-pool.js';

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
  state.verify = state.verify || null;
  state.objects = state.objects || {};
  state.puts = [];
  state.profileWrites = [];
  state.deletes = [];
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
        if (s.includes('FROM lantern_avatar_profiles WHERE current_avatar_key = ?')) {
          return Object.keys(state.profiles).map((k) => state.profiles[k]).find((p) => p.current_avatar_key === binds[0]) || null;
        }
        if (s.includes('FROM lantern_avatar_submissions') && s.includes('image_key = ?')) {
          return state.submissions.filter((r) => r.image_key === binds[0]).slice(-1)[0] || null;
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
        if (s.includes('FROM lantern_student_identities') && s.includes('media_publicity_restricted')) {
          return null;
        }
        if (s.includes('FROM lantern_verify_state')) {
          return state.verify;
        }
        return null;
      },
      async all() {
        if (s.includes('FROM lantern_student_identities') && s.includes('media_publicity_restricted')) {
          return {
            results: Object.keys(state.identities)
              .filter((k) => Number(state.identities[k].media_publicity_restricted) === 1)
              .map((k) => ({ character_name: k })),
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
        if (s.includes('FROM lantern_avatar_submissions') && s.includes("status = ?")) {
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
          state.profileWrites.push({ character_name: binds[0], current_avatar_key: binds[1] });
          state.profiles[binds[0]] = { character_name: binds[0], current_avatar_key: binds[1], updated_at: binds[2] };
        }
        if (s.includes('UPDATE lantern_avatar_submissions SET status')) {
          const row = state.submissions.find((r) => r.id === binds[binds.length - 1] || r.character_name === binds[3]);
          if (row && s.includes("'pending'")) {
            /* supersede */
            state.submissions.forEach((r) => {
              if (r.character_name === binds[3] && r.status === 'pending') r.status = 'rejected';
            });
          } else if (row) {
            row.status = binds[0];
            row.approved_by = binds[2];
          }
        }
        if (s.includes('INSERT INTO lantern_verify_state') || s.includes('lantern_verify_state')) {
          state.verify = { id: 'global', state_json: binds[1], updated_at: binds[2] };
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
    async delete(key) {
      state.deletes.push(key);
    },
  };
  return {
    DB: { prepare },
    PILOT_SESSION_SECRET: TEST_PILOT_SECRET,
    AVATAR_BUCKET: bucket,
    NEWS_BUCKET: bucket,
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
  return { status: res.status, json, text, cache: res.headers.get('Cache-Control') };
}

if (isAvatarObjectKey('avatars/av-1.png') && !isAvatarObjectKey('news/x.png') && !isAvatarObjectKey('../avatars/x')) {
  ok('avatar key allowlist');
} else bad('avatar key allowlist');
if (isNewsImageObjectKey('news/n1.png') && !isNewsImageObjectKey('news/video/v1.mp4') && !isNewsImageObjectKey('avatars/a.png')) {
  ok('news image key allowlist');
} else bad('news image key allowlist');
if (isNewsVideoObjectKey('news/video/v1.mp4') && !isNewsVideoObjectKey('news/n1.png')) ok('news video key allowlist');
else bad('news video key allowlist');
if (isMediaLibraryObjectKey('library/ai/ai_1.png') && isMediaLibraryObjectKey('default/default_creation.png') && !isMediaLibraryObjectKey('avatars/a.png')) {
  ok('media library key allowlist');
} else bad('media library key allowlist');
if (isAdminStagedAvatarMarker(adminStagedAvatarMarker('Rick'))) ok('admin staged marker');
else bad('admin staged marker');

const student = {
  username: '20889', display_name: 'Lucas', role: 'student', student_character_name: 'Lucas',
  mtss_student_id: '20889', is_active: 1, must_change_password: 0,
};
const restrictedStudent = {
  username: '20890', display_name: 'Pat', role: 'student', student_character_name: 'Pat',
  mtss_student_id: '20890', is_active: 1, must_change_password: 0,
};
const teacher = {
  username: 'ms_carter', display_name: 'Ms. Carter', role: 'teacher', staff_id: 10, is_active: 1, must_change_password: 0,
};
const otherAdmin = {
  username: 'rradle', display_name: 'Rick Radle', role: 'admin', staff_id: 4, is_active: 1, must_change_password: 0,
};
const privilegedAdmin = {
  username: 'admin', display_name: 'Web Admin', role: 'admin', staff_id: 1, is_active: 1, must_change_password: 0,
};

const state = {
  accounts: { '20889': student, '20890': restrictedStudent, ms_carter: teacher, rradle: otherAdmin, admin: privilegedAdmin },
  identities: { '20890': { media_publicity_restricted: 1 } },
  profiles: { 'rick.radle': { character_name: 'rick.radle', current_avatar_key: 'avatars/staff-active.png', updated_at: '2026-08-15T00:00:00.000Z' } },
  objects: {
    'avatars/staff-active.png': new Uint8Array([1, 2, 3]),
    'avatars/pending-stu.png': new Uint8Array([4, 5, 6]),
    'avatars/restricted-active.png': new Uint8Array([7, 8, 9]),
    'news/ok.png': new Uint8Array([1]),
    'library/ai/ai_1.png': new Uint8Array([1]),
  },
  submissions: [
    { id: 'av-pending', character_name: '20889', image_key: 'avatars/pending-stu.png', status: 'pending', approved_by: 'staged:Rick' },
    { id: 'av-self-restricted', character_name: '20890', image_key: 'avatars/self-restricted.png', status: 'pending', approved_by: null },
  ],
  approvals: [
    { id: 'approval-restricted', item_type: 'avatar', item_id: 'av-self-restricted', status: 'pending' },
  ],
};
state.profiles['20890'] = { character_name: '20890', current_avatar_key: 'avatars/restricted-active.png', updated_at: '2026-08-15T00:00:00.000Z' };
const env = makeEnv(state);
const studentCookie = await cookieFor(student);
const teacherCookie = await cookieFor(teacher);
const adminCookie = await cookieFor(privilegedAdmin);
const otherAdminCookie = await cookieFor(otherAdmin);

const blocked = await studentAvatarActivationBlocked(env.DB, '20890');
if (blocked.blocked && blocked.error === 'media_restricted') ok('Restricted student activation blocked in helper');
else bad('restricted helper', blocked);
const openGate = await studentAvatarActivationBlocked(env.DB, '20889');
if (!openGate.blocked) ok('non-restricted student is not auto-blocked by Restricted flag');
else bad('non-restricted helper', openGate);

const anonMatch = await req(env, 'GET', '/api/games/characters');
if (anonMatch.status === 401 && anonMatch.json && anonMatch.json.error === 'not_authenticated') ok('logged-out Avatar Match blocked');
else bad('anon match', anonMatch);

const stuMatch = await req(env, 'GET', '/api/games/characters', studentCookie);
if (stuMatch.status === 200 && stuMatch.json && stuMatch.json.ok) {
  const chars = stuMatch.json.characters || [];
  if (chars.every((c) => c.username == null && c.character_name == null) && !chars.some((c) => /20890|20889/.test(JSON.stringify(c)))) {
    ok('signed-in Avatar Match omits login/Student ID');
  } else bad('match fields', chars);
  if (!chars.some((c) => /restricted-active/.test(String(c.avatar_url || '')))) ok('Restricted student photo excluded from Avatar Match');
  else bad('restricted in match', chars);
} else bad('student match', stuMatch);

const anonPending = await req(env, 'GET', '/api/avatar/image?key=avatars/pending-stu.png');
if (anonPending.status === 404) ok('anonymous pending avatar image rejected');
else bad('anon pending image', anonPending);

const staffPending = await req(env, 'GET', '/api/avatar/image?key=avatars/pending-stu.png', teacherCookie);
if (staffPending.status === 200 && /private, no-store/.test(String(staffPending.cache || ''))) ok('staff can review pending avatar with private cache');
else bad('staff pending image', { staffPending });

const ownerPending = await req(env, 'GET', '/api/avatar/image?key=avatars/pending-stu.png', studentCookie);
if (ownerPending.status === 200 && /private, no-store/.test(String(ownerPending.cache || ''))) ok('owner can access own pending avatar');
else bad('owner pending image', ownerPending);

const publicStaff = await req(env, 'GET', '/api/avatar/image?key=avatars/staff-active.png');
if (publicStaff.status === 200 && /public/.test(String(publicStaff.cache || ''))) ok('approved public staff avatar still renders');
else bad('public staff avatar', publicStaff);

const restrictedAnon = await req(env, 'GET', '/api/avatar/image?key=avatars/restricted-active.png');
if (restrictedAnon.status === 404) ok('Restricted active avatar not served publicly');
else bad('restricted public image', restrictedAnon);

const wrongPrefix = await req(env, 'GET', '/api/avatar/image?key=news/ok.png');
if (wrongPrefix.status === 403 && wrongPrefix.json && wrongPrefix.json.error === 'invalid_key') ok('avatar route rejects news key');
else bad('wrong avatar prefix', wrongPrefix);

const arb = await req(env, 'GET', '/api/avatar/image?key=../secret.png');
if (arb.status === 403) ok('arbitrary traversal avatar key rejected');
else bad('traversal', arb);

const newsOk = await req(env, 'GET', '/api/news/image?key=news/ok.png');
if (newsOk.status === 200) ok('legitimate news image key still works');
else bad('news ok', newsOk);

const newsWrong = await req(env, 'GET', '/api/news/image?key=avatars/staff-active.png');
if (newsWrong.status === 403) ok('news image rejects avatar key');
else bad('news wrong key', newsWrong);

const mediaOk = await req(env, 'GET', '/api/media/image?key=library/ai/ai_1.png');
if (mediaOk.status === 200) ok('legitimate media library key still works');
else bad('media ok', mediaOk);

const mediaWrong = await req(env, 'GET', '/api/media/image?key=avatars/staff-active.png');
if (mediaWrong.status === 403) ok('media route rejects avatar key');
else bad('media wrong', mediaWrong);

const restrictedStatus = await req(env, 'GET', '/api/avatar/status?character_name=20890');
if (restrictedStatus.status === 200 && restrictedStatus.json && restrictedStatus.json.status && !restrictedStatus.json.status.active_image) {
  ok('Restricted existing active avatar hidden from public status');
} else bad('restricted status', restrictedStatus);

const teacherAct = await req(env, 'POST', '/api/avatar/approve', teacherCookie, { id: 'av-pending' });
if (teacherAct.status === 403 && teacherAct.json && teacherAct.json.error === 'forbidden') {
  ok('teacher cannot activate admin-staged avatar');
} else bad('teacher approve staged', teacherAct);

const teacherRestrict = await req(env, 'POST', '/api/avatar/approve', teacherCookie, { id: 'av-self-restricted' });
if (teacherRestrict.status === 403 && teacherRestrict.json && teacherRestrict.json.error === 'forbidden') {
  ok('teacher cannot approve Restricted student avatar');
} else bad('teacher approve restricted', teacherRestrict);

const approvalsRestrict = await req(env, 'POST', '/api/approvals/approve', teacherCookie, { id: 'approval-restricted' });
if (approvalsRestrict.status === 403 && approvalsRestrict.json && approvalsRestrict.json.error === 'forbidden') {
  ok('approvals path cannot activate Restricted student avatar');
} else bad('approvals restricted', approvalsRestrict);

const otherAdminSet = await req(env, 'POST', '/api/admin/avatar/set', otherAdminCookie, {
  username: '20889',
  image: TINY_PNG_B64,
});
if (otherAdminSet.status === 403 && otherAdminSet.json && otherAdminSet.json.error === 'forbidden') {
  ok('other admin-role account cannot manage avatars');
} else bad('other admin set', otherAdminSet);

const selfAct = await req(env, 'POST', '/api/avatar/approve', studentCookie, { id: 'av-pending' });
if (selfAct.status === 403) ok('student cannot self-activate');
else bad('student approve', selfAct);

const writesBefore = state.profileWrites.length;
const stage = await req(env, 'POST', '/api/admin/avatar/set', adminCookie, {
  username: '20889',
  image: TINY_PNG_B64,
});
if (
  stage.status === 200 &&
  stage.json &&
  stage.json.ok &&
  stage.json.staged === true &&
  stage.json.status === 'pending' &&
  !stage.json.current_avatar_key &&
  state.profileWrites.length === writesBefore
) {
  ok('admin stages student avatar without activating current key');
} else bad('admin stage student', { stage, writes: state.profileWrites });
if (state.deletes.length === 0) ok('no R2 deletion during student stage');
else bad('r2 delete', state.deletes);

const staffSet = await req(env, 'POST', '/api/admin/avatar/set', adminCookie, {
  username: 'ms_carter',
  image: TINY_PNG_B64,
});
if (staffSet.status === 200 && staffSet.json && staffSet.json.ok && staffSet.json.active_image && !staffSet.json.staged) {
  ok('staff admin assignment remains immediate/active');
} else bad('staff set', staffSet);

const restrictAct = await req(env, 'POST', '/api/admin/avatar/activate', adminCookie, { username: '20890' });
if (restrictAct.status === 403 && restrictAct.json && restrictAct.json.error === 'media_restricted') {
  ok('Restricted student cannot be activated');
} else bad('restricted activate', restrictAct);

const activate = await req(env, 'POST', '/api/admin/avatar/activate', adminCookie, { username: '20889' });
if (activate.status === 200 && activate.json && activate.json.ok && activate.json.activated) {
  ok('admin explicit activation works when not Restricted');
} else bad('admin activate', activate);

const anonVerifyPut = await req(env, 'PUT', '/api/verify/state', null, { role: 'admin' });
if (anonVerifyPut.status === 401 && anonVerifyPut.json && anonVerifyPut.json.error === 'not_authenticated') ok('anonymous Verify PUT rejected');
else bad('anon verify put', anonVerifyPut);

const anonVerify = await req(env, 'POST', '/api/verify/state', null, { role: 'admin' });
if (anonVerify.status === 401 && anonVerify.json && anonVerify.json.error === 'not_authenticated') ok('anonymous Verify mutation rejected');
else bad('anon verify', anonVerify);

const stuVerify = await req(env, 'POST', '/api/verify/state', studentCookie, { role: 'admin' });
if (stuVerify.status === 403 && stuVerify.json && stuVerify.json.error === 'forbidden') ok('student Verify mutation rejected');
else bad('student verify', stuVerify);

const staffVerify = await req(env, 'POST', '/api/verify/state', teacherCookie, { build: 'p1-221' });
if (staffVerify.status === 200 && staffVerify.json && staffVerify.json.ok) ok('staff Verify mutation allowed');
else bad('staff verify', staffVerify);

const verifyGet = await req(env, 'GET', '/api/verify/state');
if (verifyGet.status === 200 && verifyGet.json && verifyGet.json.ok) ok('Verify GET remains readable');
else bad('verify get', verifyGet);

const indexSrc = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
const adminHtml = fs.readFileSync(path.join(root, 'app/admin.html'), 'utf8');
const gamesHtml = fs.readFileSync(path.join(root, 'app/games.html'), 'utf8');
if (/Staged — not visible/.test(adminHtml) && /adminAvatarActivateBtn/.test(adminHtml) && /\/api\/admin\/avatar\/activate/.test(indexSrc)) {
  ok('admin UI/API expose staged student activation');
} else bad('admin staged UI');
if (/credentials: 'include'/.test(gamesHtml) && /avatar_url/.test(gamesHtml)) ok('Avatar Match client sends credentials and can use pool avatar_url');
else bad('games client');
if (!/bucket\.delete|R2.*delete/.test(indexSrc.slice(indexSrc.indexOf('/api/admin/avatar/set'), indexSrc.indexOf('/api/admin/tms-identity-links')))) {
  ok('admin avatar paths do not delete R2 objects');
} else bad('unexpected r2 delete in admin avatar');

const restrictedPool = buildAvatarMatchPool(
  [restrictedStudent],
  { '20890': 'avatars/restricted-active.png' },
  'https://tmslantern.org',
  () => '20890',
  { restrictedSet: new Set(['20890']) }
);
if (restrictedPool.length === 0) ok('pool builder drops Restricted photos');
else bad('pool restricted', restrictedPool);

console.log('\np1-security-221-test:', pass, 'PASS', fail, 'FAIL');
if (fail) process.exit(1);
