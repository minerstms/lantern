/**
 * Prompt #235 — ticker uses subject avatars (not viewer); Web Admin Approve All + Unapprove.
 * Usage: node worker/scripts/ticker-subject-avatar-admin-235-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import worker from '../index.js';
import { canManageLanternAvatars, selectPublicAvatarKey } from '../avatar-media-gate.js';
import { eventsToTickerSlides } from '../marquee-events.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }
function hasAvatarKey(url, key) {
  const u = decodeURIComponent(String(url || ''));
  return u.indexOf(key) !== -1;
}

const TEST_PILOT_SECRET = 'test-secret-not-a-real-pilot-session-secret';

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
  state.restricted = state.restricted || [];
  state.puts = [];
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
        if (s.includes('FROM lantern_avatar_submissions') && s.includes('AND image_key = ?')) {
          return state.submissions.filter((r) => r.character_name === binds[0] && r.image_key === binds[1]).slice(-1)[0] || null;
        }
        if (s.includes('FROM lantern_avatar_submissions') && s.includes("status = 'pending'") && s.includes('character_name = ?')) {
          return state.submissions.filter((r) => r.character_name === binds[0] && r.status === 'pending').slice(-1)[0] || null;
        }
        if (s.includes('FROM lantern_avatar_submissions') && s.includes("status = 'approved'") && s.includes('character_name = ?')) {
          const rows = state.submissions.filter((r) => r.character_name === binds[0] && r.status === 'approved');
          rows.sort((a, b) => String(b.approved_at || b.created_at || '').localeCompare(String(a.approved_at || a.created_at || '')));
          return rows[0] || null;
        }
        if (s.includes('FROM lantern_avatar_submissions WHERE id = ?')) {
          return state.submissions.find((r) => r.id === binds[0]) || null;
        }
        return null;
      },
      async all() {
        if (s.includes('FROM lantern_student_identities') && s.includes('media_publicity_restricted')) {
          return {
            results: state.restricted.map((id) => ({ character_name: id })),
          };
        }
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
        if (s.includes('UPDATE lantern_avatar_submissions SET status = ?') && s.includes('approved_at')) {
          const row = state.submissions.find((r) => r.id === binds[3]);
          if (row && (binds[4] == null || row.status === binds[4])) {
            row.status = binds[0];
            row.approved_at = binds[1];
            row.approved_by = binds[2];
          }
          return { success: true, meta: { changes: row ? 1 : 0 } };
        }
        if (s.includes('UPDATE lantern_avatar_submissions SET status = ?') && s.includes('WHERE id = ? AND status = ?')) {
          const row = state.submissions.find((r) => r.id === binds[1]);
          if (row && row.status === binds[2]) row.status = binds[0];
          return { success: true, meta: { changes: row ? 1 : 0 } };
        }
        if (s.includes('INSERT INTO lantern_avatar_profiles') || s.includes('current_avatar_key')) {
          state.profileWrites = (state.profileWrites || 0) + 1;
          state.profiles[binds[0]] = { character_name: binds[0], current_avatar_key: binds[1], updated_at: binds[2] };
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

const studentA = {
  username: '20889', display_name: 'Lilian S.', public_display_name: 'Lilian S.', role: 'student',
  student_character_name: 'Lilian', mtss_student_id: '20889', is_active: 1, must_change_password: 0,
};
const studentB = {
  username: '20900', display_name: 'Athena D.', public_display_name: 'Athena D.', role: 'student',
  student_character_name: 'Athena', mtss_student_id: '20900', is_active: 1, must_change_password: 0,
};
const studentC = {
  username: '20910', display_name: 'No Face', public_display_name: 'No Face', role: 'student',
  student_character_name: 'None', mtss_student_id: '20910', is_active: 1, must_change_password: 0,
};
const teacher = {
  username: 'ms_carter', display_name: 'Ms. Carter', role: 'teacher', staff_id: 10, is_active: 1, must_change_password: 0,
};
const otherAdmin = {
  username: 'rradle', display_name: 'Rick', role: 'admin', staff_id: 2, is_active: 1, must_change_password: 0,
};
const privileged = {
  username: 'admin', display_name: 'Web Admin', role: 'admin', staff_id: 1, is_active: 1, must_change_password: 0,
};

const lockerHtml = fs.readFileSync(path.join(root, 'app/locker.html'), 'utf8');
const profileJs = fs.readFileSync(path.join(root, 'app/js/lantern-profile-app.js'), 'utf8');
const workerIndex = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
const tickerJs = fs.readFileSync(path.join(root, 'app/js/lantern-ticker.js'), 'utf8');
const adminHtml = fs.readFileSync(path.join(root, 'app/admin.html'), 'utf8');

const statusFn = workerIndex.slice(
  workerIndex.indexOf("path === '/api/avatar/status'"),
  workerIndex.indexOf("path === '/api/avatar/pending'")
);
const resolveSlice = statusFn.slice(0, statusFn.indexOf('canSeePending'));
if (
  resolveSlice.includes('requested subject') &&
  resolveSlice.includes('avatarCandidatesFromPilotAccount(targetAccount)') &&
  !resolveSlice.includes('avatarCandidatesFromPilotAccount(account)')
) {
  ok('status source no longer mixes viewer candidates into subject resolve');
} else bad('status still mixes viewer aliases');

if (
  workerIndex.includes("path === '/api/admin/avatar/approve-all'") &&
  workerIndex.includes("path === '/api/admin/avatar/unapprove'") &&
  workerIndex.includes("path === '/api/admin/avatar/pending-approval-summary'") &&
  /approve-all[\s\S]{0,400}canManageLanternAvatars/.test(workerIndex) &&
  /unapprove[\s\S]{0,400}canManageLanternAvatars/.test(workerIndex)
) {
  ok('batch approve + unapprove routes exist and reuse Web Admin gate');
} else bad('admin batch routes missing or ungated');

if (
  adminHtml.includes('Approve All Pending') &&
  adminHtml.includes('adminApproveAllOverlay') &&
  adminHtml.includes('adminAvatarUnapproveBtn') &&
  adminHtml.includes('Unapprove')
) {
  ok('Web Admin UI has Approve All Pending confirm + Unapprove');
} else bad('admin UI missing #235 actions');

const sandbox = {
  window: {},
  document: {
    getElementById: function () { return null; },
    addEventListener: function () {},
    readyState: 'complete',
  },
};
sandbox.window = sandbox;
sandbox.global = sandbox;
vm.runInNewContext(tickerJs, sandbox);
const LT = sandbox.LanternTicker;
const Contract = sandbox.LanternTickerContract;

const slides = eventsToTickerSlides([
  {
    id: 'e-a', type: 'leaderboard_entry', public_text: 'Leaderboard: Avatar Match — Lilian S.',
    author_avatar_key: '20889', subject_avatar_key: '20889', public_display_name: 'Lilian S.',
    source_title: 'Avatar Match', ticker_type_label: 'Leaderboard',
  },
  {
    id: 'e-b', type: 'mission_completed', public_text: 'Mission: Photo Walk — Athena D.',
    author_avatar_key: '20900', subject_avatar_key: '20900', public_display_name: 'Athena D.',
    source_title: 'Photo Walk', ticker_type_label: 'Mission',
  },
  {
    id: 'e-c', type: 'leaderboard_entry', public_text: 'Leaderboard: Memory Match — No Face',
    author_avatar_key: '20910', subject_avatar_key: '20910', public_display_name: 'No Face',
    source_title: 'Memory Match', ticker_type_label: 'Leaderboard',
  },
  {
    id: 'e-shout', type: 'shout_out', public_text: 'Shout-Out: Lilian S. — Mr. Radle',
    author_avatar_key: 'rick.radle', subject_avatar_key: '20889', public_display_name: 'Mr. Radle',
    source_title: 'Lilian S.', ticker_type_label: 'Shout-Out',
  },
]);

const map = {
  '20889': { imageUrl: '/api/avatar/image?key=avatars/a.png', emoji: '' },
  '20900': { imageUrl: '/api/avatar/image?key=avatars/b.png', emoji: '' },
  '20910': { imageUrl: '', emoji: '' },
  'rick.radle': { imageUrl: '/api/avatar/image?key=avatars/rick.png', emoji: '' },
};
slides.forEach((s) => {
  const keys = Contract.tickerFaceLookupKeys(s.meta);
  const hit = keys.map((k) => map[k]).find((v) => v && v.imageUrl);
  s.meta._canonicalAvatar = hit || { imageUrl: '' };
});
const items = LT.buildDisplayTickerItems(slides);
const byAuthor = {};
items.forEach((it) => { byAuthor[it.authorAvatarKey] = it; });

if (items[0].authorAvatarKey === '20889' && /avatars\/a\.png/.test(items[0].avatarUrl)) {
  ok('1. ticker A uses subject A avatar');
} else bad('1. ticker A', items[0]);

if (items[1].authorAvatarKey === '20900' && /avatars\/b\.png/.test(items[1].avatarUrl)) {
  ok('2. ticker B uses subject B avatar');
} else bad('2. ticker B', items[1]);

if (items[2].authorAvatarKey === '20910' && !/avatars\/a\.png/.test(items[2].avatarUrl) && !/avatars\/b\.png/.test(items[2].avatarUrl)) {
  ok('2b. ticker C with no public avatar does not reuse A or B');
} else bad('2b. ticker C leak', items[2]);

const shoutItem = items[3];
if (shoutItem.authorAvatarKey === '20889' && /avatars\/a\.png/.test(shoutItem.avatarUrl) && !/avatars\/rick\.png/.test(shoutItem.avatarUrl)) {
  ok('1b. shout-out face is recognized subject, not sender');
} else bad('1b. shout subject', shoutItem);

if (
  Contract.tickerFaceLookupKeys({ marquee_type: 'shout_out', author_avatar_key: 'rick.radle' }).length === 0 &&
  Contract.tickerFaceLookupKeys({ marquee_type: 'leaderboard_entry', subject_avatar_key: '20889' })[0] === '20889'
) {
  ok('ticker face keys never guess shout subject from author');
} else bad('ticker face key contract');

const state = {
  accounts: {
    '20889': studentA,
    '20900': studentB,
    '20910': studentC,
    ms_carter: teacher,
    rradle: otherAdmin,
    admin: privileged,
  },
  profiles: {
    '20889': { character_name: '20889', current_avatar_key: 'avatars/a.png', updated_at: '2026-08-01T00:00:00.000Z' },
    '20900': { character_name: '20900', current_avatar_key: 'avatars/pending-b.png', updated_at: '2026-08-02T00:00:00.000Z' },
    '20920': { character_name: '20920', current_avatar_key: 'avatars/keep-current.png', updated_at: '2026-08-01T00:00:00.000Z' },
  },
  submissions: [
    { id: 'av-a', character_name: '20889', image_key: 'avatars/a.png', status: 'approved', approved_at: '2026-08-01T00:00:00.000Z' },
    { id: 'av-b-pend', character_name: '20900', image_key: 'avatars/pending-b.png', status: 'pending', created_at: '2026-08-02T00:00:00.000Z' },
    { id: 'av-c-rej', character_name: '20910', image_key: 'avatars/rej.png', status: 'rejected', created_at: '2026-08-03T00:00:00.000Z' },
    { id: 'av-keep', character_name: '20920', image_key: 'avatars/keep-current.png', status: 'approved', approved_at: '2026-08-01T00:00:00.000Z' },
    { id: 'av-new-pend', character_name: '20920', image_key: 'avatars/new-pend.png', status: 'pending', created_at: '2026-08-10T00:00:00.000Z' },
    { id: 'av-restricted', character_name: '20930', image_key: 'avatars/restricted.png', status: 'pending', created_at: '2026-08-11T00:00:00.000Z' },
    { id: 'av-fallback', character_name: '20889', image_key: 'avatars/older-approved.png', status: 'approved', approved_at: '2026-07-01T00:00:00.000Z' },
  ],
  objects: {
    'avatars/a.png': new Uint8Array([1]),
    'avatars/pending-b.png': new Uint8Array([2]),
    'avatars/new-pend.png': new Uint8Array([3]),
    'avatars/restricted.png': new Uint8Array([4]),
    'avatars/keep-current.png': new Uint8Array([5]),
    'avatars/older-approved.png': new Uint8Array([6]),
  },
  restricted: ['20930'],
};
const env = makeEnv(state);
const cookieA = await cookieFor(studentA);
const cookieB = await cookieFor(studentB);
const teacherCookie = await cookieFor(teacher);
const otherAdminCookie = await cookieFor(otherAdmin);
const adminCookie = await cookieFor(privileged);

const statusBAsA = await req(env, 'GET', '/api/avatar/status?character_name=20900', cookieA);
const statusAImg = statusBAsA.json && statusBAsA.json.status && String(statusBAsA.json.status.active_image || '');
if (statusBAsA.status === 200 && statusBAsA.json && statusBAsA.json.ok && !/avatars\/a\.png/.test(statusAImg)) {
  ok('1c. signed-in A does not receive A avatar when asking for B');
} else bad('1c. viewer leak on B status', statusBAsA);

const statusBPend = await req(env, 'GET', '/api/avatar/status?character_name=20900', cookieB);
if (statusBPend.json && !statusBPend.json.status.active_image && statusBPend.json.status.has_pending) {
  ok('3. pending current is not public active_image; owner still sees pending');
} else bad('3. pending public leak', statusBPend);

const statusC = await req(env, 'GET', '/api/avatar/status?character_name=20910', cookieA);
if (statusC.json && !statusC.json.status.active_image && !statusC.json.status.has_pending) {
  ok('3b. rejected avatar is not public and not shown as pending to another student');
} else bad('3b. rejected', statusC);

const statusRestricted = await req(env, 'GET', '/api/avatar/status?character_name=20930', cookieA);
if (statusRestricted.json && !statusRestricted.json.status.active_image) {
  ok('3c. restricted student has no public ticker/status image');
} else bad('3c. restricted', statusRestricted);

const statusAAsA = await req(env, 'GET', '/api/avatar/status?character_name=20889', cookieA);
if (statusAAsA.json && hasAvatarKey(statusAAsA.json.status.active_image, 'avatars/a.png')) {
  ok('viewer still receives own public avatar');
} else bad('own status', statusAAsA);

const statusAAsB = await req(env, 'GET', '/api/avatar/status?character_name=20889', cookieB);
if (statusAAsB.json && hasAvatarKey(statusAAsB.json.status.active_image, 'avatars/a.png') && !statusAAsB.json.status.has_pending) {
  ok('repeat as viewer B: A still resolves to A, no B pending leak');
} else bad('viewer B looking at A', statusAAsB);

const summaryTeacher = await req(env, 'GET', '/api/admin/avatar/pending-approval-summary', teacherCookie);
if (summaryTeacher.status === 403) ok('5. ordinary staff cannot read pending-approval-summary');
else bad('5. teacher summary', summaryTeacher);

const summaryStudent = await req(env, 'POST', '/api/admin/avatar/approve-all', cookieA, {});
if (summaryStudent.status === 403) ok('6. student cannot bulk approve');
else bad('6. student approve-all', summaryStudent);

const otherAdminAll = await req(env, 'POST', '/api/admin/avatar/approve-all', otherAdminCookie, {});
if (otherAdminAll.status === 403 && otherAdminAll.json && otherAdminAll.json.error === 'forbidden') {
  ok('5b. non-Web-Admin admin-role cannot bulk approve');
} else bad('5b. other admin', otherAdminAll);

const summary = await req(env, 'GET', '/api/admin/avatar/pending-approval-summary', adminCookie);
if (summary.status === 200 && summary.json && summary.json.pending_count === 2 && summary.json.skipped_restricted === 1) {
  ok('8-count. preview counts eligible pending and skips restricted');
} else bad('preview count', summary);

const rejectedBefore = state.submissions.filter((r) => r.status === 'rejected').length;
const keepCurrentBefore = state.profiles['20920'].current_avatar_key;
const batch = await req(env, 'POST', '/api/admin/avatar/approve-all', adminCookie, {});
if (batch.status === 200 && batch.json && batch.json.ok && batch.json.approved_count === 2 && batch.json.current_selections_preserved === true) {
  ok('4. Web Admin Approve All Pending succeeds');
} else bad('4. approve-all', batch);

if (state.submissions.find((r) => r.id === 'av-b-pend').status === 'approved' &&
    state.submissions.find((r) => r.id === 'av-new-pend').status === 'approved') {
  ok('4b. eligible pending rows are approved');
} else bad('4b. pending not approved');

if (state.submissions.find((r) => r.id === 'av-c-rej').status === 'rejected' &&
    state.submissions.filter((r) => r.status === 'rejected').length === rejectedBefore) {
  ok('7. batch approval does not change rejected records');
} else bad('7. rejected mutated');

if (state.submissions.find((r) => r.id === 'av-restricted').status === 'pending') {
  ok('7b. media-restricted pending stays pending');
} else bad('7b. restricted approved');

if (state.profiles['20920'].current_avatar_key === keepCurrentBefore && !state.profileWrites) {
  ok('9. batch approval does not switch current-avatar selection');
} else bad('9. current switched', state.profiles['20920']);

if (selectPublicAvatarKey('avatars/pending-b.png', 'avatars/pending-b.png', 'approved') === 'avatars/pending-b.png') {
  ok('9b. pending that was already current becomes publicly eligible after approval');
} else bad('9b. current+approved');

const unapprove = await req(env, 'POST', '/api/admin/avatar/unapprove', adminCookie, { id: 'av-a' });
if (unapprove.status === 200 && unapprove.json && unapprove.json.ok && unapprove.json.status === 'pending' && unapprove.json.media_deleted === false) {
  ok('8. Unapprove converts approved → pending');
} else bad('8. unapprove', unapprove);

if (state.submissions.find((r) => r.id === 'av-a').status === 'pending' && state.deletes.length === 0 && state.objects['avatars/a.png']) {
  ok('9-media. Unapprove does not delete media');
} else bad('9-media', state.deletes);

if (state.profiles['20889'].current_avatar_key === 'avatars/a.png') {
  ok('11-store. current key remains stored after unapprove');
} else bad('current wiped');

const publicAfterUnapprove = await req(env, 'GET', '/api/avatar/status?character_name=20889', cookieB);
const pubUrl = publicAfterUnapprove.json && publicAfterUnapprove.json.status && String(publicAfterUnapprove.json.status.active_image || '');
if (hasAvatarKey(pubUrl, 'avatars/older-approved.png') && !hasAvatarKey(pubUrl, 'avatars/a.png')) {
  ok('10/11. unapproved current disappears from public resolver; approved fallback used');
} else bad('10/11 public after unapprove', publicAfterUnapprove);

const reapprove = await req(env, 'POST', '/api/avatar/approve', adminCookie, { id: 'av-a' });
if (reapprove.status === 200 && reapprove.json && reapprove.json.ok && state.submissions.find((r) => r.id === 'av-a').status === 'approved') {
  ok('12. re-approve works without a new upload');
} else bad('12. re-approve', reapprove);

const teacherUnapprove = await req(env, 'POST', '/api/admin/avatar/unapprove', teacherCookie, { id: 'av-keep' });
if (teacherUnapprove.status === 403) ok('5c. ordinary staff cannot unapprove');
else bad('5c. teacher unapprove', teacherUnapprove);

if (
  !canManageLanternAvatars(teacher) &&
  !canManageLanternAvatars(studentA) &&
  canManageLanternAvatars(privileged)
) {
  ok('12b. canManageLanternAvatars still Web Admin only');
} else bad('capability widened');

if (
  !lockerHtml.includes('id="avatarCropOverlay"') &&
  !lockerHtml.includes('avatarFileInput') &&
  profileJs.includes("error: 'student_avatar_upload_disabled'") &&
  workerIndex.includes('student_avatar_upload_disabled')
) {
  ok('13. #234 student-upload blocks remain intact');
} else bad('13. student upload regression');

const studentUpload = await req(env, 'POST', '/api/avatar/upload', cookieA, { image: 'x', character_name: '20889' });
const studentSpend = await req(env, 'POST', '/api/economy/transact', cookieA, { kind: 'avatar_upload', delta: -10, character_name: '20889' });
if (studentUpload.status === 403 && studentUpload.json && studentUpload.json.error === 'student_avatar_upload_disabled' &&
    studentSpend.status === 403 && studentSpend.json && studentSpend.json.error === 'student_avatar_upload_disabled') {
  ok('13b. student upload + avatar_upload spend still 403');
} else bad('13b. student blocks', { studentUpload, studentSpend });

console.log('\n--- ticker-subject-avatar-admin-235-test: ' + pass + ' passed, ' + fail + ' failed ---');
process.exit(fail ? 1 : 0);
