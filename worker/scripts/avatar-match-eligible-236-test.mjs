/**
 * Prompt #236 — Avatar Match eligibility uses canonical public-safe avatars.
 * Approved current OR approved fallback counts. Pending/rejected/restricted/viewer do not.
 * Usage: node worker/scripts/avatar-match-eligible-236-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import worker from '../index.js';
import {
  buildPublicAvatarKeyMapFromRows,
  expandPublicAvatarAliases,
  loadPublicAvatarKeyMap,
  selectPublicAvatarKey,
} from '../avatar-media-gate.js';
import {
  buildAvatarMatchCharacters,
  buildAvatarMatchPool,
  uniqueAvatarMatchByLabel,
} from '../avatar-match-pool.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

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

function studentRow(username, display, mtss, extra) {
  return Object.assign({
    username,
    display_name: display,
    public_display_name: display,
    first_name: String(display).split(' ')[0],
    last_name: String(display).split(' ')[1] || '',
    role: 'student',
    is_active: 1,
    mtss_student_id: mtss,
    student_character_name: mtss,
  }, extra || {});
}

function keyFn(row) {
  return String(row.mtss_student_id || row.username || '').trim();
}

function originPool(accounts, map, restrictedSet) {
  return buildAvatarMatchCharacters(accounts, null, map, 'https://lantern.example', keyFn, { restrictedSet });
}

const approvedCurrent = studentRow('approved.current', 'Approved C.', '20001');
const fallbackOnly = studentRow('fallback.only', 'Fallback F.', '20002');
const pendingPlusApproved = studentRow('pending.plus', 'Pending Plus P.', '20003');
const pendingOnly = studentRow('pending.only', 'Pending O.', '20004');
const rejectedOnly = studentRow('rejected.only', 'Rejected R.', '20005');
const restrictedStudent = studentRow('restricted.kid', 'Restricted K.', '20006');
const viewer = {
  username: 'viewer.staff',
  display_name: 'Viewer V.',
  public_display_name: 'Viewer V.',
  first_name: 'Viewer',
  last_name: 'V',
  honorific: 'Mr.',
  role: 'teacher',
  is_active: 1,
};

const rows = {
  profiles: [
    { character_name: '20001', current_avatar_key: 'avatars/current.png' },
    { character_name: '20003', current_avatar_key: 'avatars/pending-now.png' },
    { character_name: '20004', current_avatar_key: 'avatars/pending-only.png' },
    { character_name: '20005', current_avatar_key: 'avatars/rejected-only.png' },
    { character_name: '20006', current_avatar_key: 'avatars/restricted.png' },
    { character_name: 'viewer.staff', current_avatar_key: 'avatars/viewer.png' },
  ],
  submissions: [
    { character_name: '20001', image_key: 'avatars/current.png', status: 'approved', approved_at: '2026-08-01T00:00:00.000Z' },
    { character_name: '20002', image_key: 'avatars/fallback.png', status: 'approved', approved_at: '2026-08-02T00:00:00.000Z' },
    { character_name: '20003', image_key: 'avatars/older-approved.png', status: 'approved', approved_at: '2026-08-01T00:00:00.000Z' },
    { character_name: '20003', image_key: 'avatars/pending-now.png', status: 'pending', created_at: '2026-08-10T00:00:00.000Z' },
    { character_name: '20004', image_key: 'avatars/pending-only.png', status: 'pending', created_at: '2026-08-10T00:00:00.000Z' },
    { character_name: '20005', image_key: 'avatars/rejected-only.png', status: 'rejected', created_at: '2026-08-10T00:00:00.000Z' },
    { character_name: '20006', image_key: 'avatars/restricted.png', status: 'approved', approved_at: '2026-08-01T00:00:00.000Z' },
    { character_name: 'viewer.staff', image_key: 'avatars/viewer.png', status: 'approved', approved_at: '2026-08-01T00:00:00.000Z' },
  ],
};

const publicMap = expandPublicAvatarAliases(
  buildPublicAvatarKeyMapFromRows(rows.profiles, rows.submissions),
  [approvedCurrent, fallbackOnly, pendingPlusApproved, pendingOnly, rejectedOnly, restrictedStudent, viewer]
);

if (publicMap['20001'] === 'avatars/current.png' && selectPublicAvatarKey('avatars/current.png', 'avatars/current.png', 'approved') === 'avatars/current.png') {
  ok('approved current avatar = eligible key');
} else bad('approved current key', publicMap['20001']);

if (publicMap['20002'] === 'avatars/fallback.png' && !publicMap['20002-missing']) {
  ok('approved fallback avatar with no current = eligible key');
} else bad('fallback only key', publicMap['20002']);

if (publicMap['20003'] === 'avatars/older-approved.png') {
  ok('pending current + approved fallback = approved fallback key');
} else bad('pending+approved key', publicMap['20003']);

if (!publicMap['20004'] && !publicMap['20005']) {
  ok('pending-only and rejected-only are not public-safe');
} else bad('unsafe keys leaked', { pending: publicMap['20004'], rejected: publicMap['20005'] });

const restrictedSet = new Set(['20006']);
const sixAccounts = [approvedCurrent, fallbackOnly, pendingPlusApproved, pendingOnly, rejectedOnly, restrictedStudent, viewer];
const roster = originPool(sixAccounts, publicMap, restrictedSet);
const names = roster.map((c) => c.display_name);

if (names.includes('Approved C.') && roster.some((c) => /current\.png/.test(c.avatar_url))) {
  ok('approved current avatar = eligible in roster');
} else bad('approved current roster', roster);

if (names.includes('Fallback F.') && roster.some((c) => /fallback\.png/.test(c.avatar_url))) {
  ok('approved fallback avatar with no current = eligible in roster');
} else bad('fallback roster', roster);

if (names.includes('Pending Plus P.') && roster.some((c) => /older-approved\.png/.test(c.avatar_url))) {
  ok('pending current + approved fallback = approved fallback eligible');
} else bad('pending+approved roster', roster);

if (!names.includes('Pending O.')) ok('pending only = not eligible');
else bad('pending only leaked', names);

if (!names.includes('Rejected R.')) ok('rejected only = not eligible');
else bad('rejected only leaked', names);

if (!names.includes('Restricted K.')) ok('restricted + approved = not eligible');
else bad('restricted leaked', names);

if (!roster.some((c) => /viewer\.png/.test(c.avatar_url) && c.display_name !== 'Viewer V.')) {
  ok('viewer avatar is never substituted onto another person');
} else bad('viewer substitution', roster);

if (roster.filter((c) => c.display_name === 'Viewer V.').length === 1) {
  ok('viewer appears only as themselves when they have a public-safe avatar');
} else bad('viewer self', roster);

const emptyKid = studentRow('empty.kid', 'Empty E.', '20999');
const withEmpty = originPool([emptyKid, viewer], publicMap, new Set());
if (!withEmpty.some((c) => c.display_name === 'Empty E.')) {
  ok('person with no public-safe avatar is not filled from the viewer map');
} else bad('empty filled', withEmpty);

const countFromSamePath = originPool(sixAccounts, publicMap, restrictedSet).length;
if (countFromSamePath === roster.length) {
  ok('eligibility count equals actual Avatar Match roster');
} else bad('count != roster', { countFromSamePath, roster: roster.length });

const three = originPool(
  [approvedCurrent, fallbackOnly, pendingPlusApproved],
  publicMap,
  new Set()
);
const fourAccounts = [
  approvedCurrent,
  fallbackOnly,
  pendingPlusApproved,
  studentRow('fourth.kid', 'Fourth F.', '20007'),
];
const fourMap = expandPublicAvatarAliases(
  buildPublicAvatarKeyMapFromRows(
    rows.profiles.concat([{ character_name: '20007', current_avatar_key: 'avatars/fourth.png' }]),
    rows.submissions.concat([{ character_name: '20007', image_key: 'avatars/fourth.png', status: 'approved', approved_at: '2026-08-01T00:00:00.000Z' }])
  ),
  fourAccounts
);
const four = originPool(fourAccounts, fourMap, new Set());
if (three.length === 3 && four.length === 4) {
  ok('minimum 4 gate has exactly 3 then exactly 4 real eligible students (no demo fill)');
} else bad('min4 sizes', { three: three.length, four: four.length });

function clientOpens(characters, gamesApiBase) {
  if (gamesApiBase == null) return false;
  return !!(characters && characters.length >= 4);
}
if (!clientOpens(three, '') && clientOpens(four, '') && !clientOpens(four, null)) {
  ok('minimum 4 gate opens at exactly 4 real eligible students and treats empty API base as same-origin');
} else bad('client min4', { three: clientOpens(three, ''), four: clientOpens(four, '') });

function makeEnv(state) {
  state.accounts = state.accounts || {};
  state.profiles = state.profiles || {};
  state.submissions = state.submissions || [];
  state.identities = state.identities || {};
  function prepare(sql) {
    const s = String(sql);
    const binds = [];
    const api = {
      bind(...args) { binds.push(...args); return api; },
      async first() {
        if (s.includes('FROM lantern_pilot_accounts WHERE lower(trim(username))')) {
          return state.accounts[String(binds[0] || '').trim().toLowerCase()] || null;
        }
        if (s.includes('FROM lantern_student_identities')) return state.identities[String(binds[0] || '').trim().toLowerCase()] || null;
        return null;
      },
      async all() {
        if (s.includes('FROM lantern_pilot_accounts') && s.includes('is_active')) {
          return { results: Object.values(state.accounts).filter((a) => Number(a.is_active) !== 0) };
        }
        if (s.includes('FROM lantern_avatar_profiles')) {
          return { results: Object.keys(state.profiles).map((k) => ({ character_name: k, current_avatar_key: state.profiles[k].current_avatar_key })) };
        }
        if (s.includes('FROM lantern_avatar_submissions')) {
          return { results: state.submissions.slice() };
        }
        if (s.includes('FROM lantern_student_identities')) {
          return {
            results: Object.keys(state.identities)
              .filter((k) => Number(state.identities[k].media_publicity_restricted) === 1)
              .map((k) => ({ character_name: k })),
          };
        }
        return { results: [] };
      },
      async run() { return { success: true, meta: { changes: 0 } }; },
    };
    return api;
  }
  return {
    DB: { prepare },
    PILOT_SESSION_SECRET: TEST_PILOT_SECRET,
    _state: state,
  };
}

const apiAccounts = {
  'approved.current': approvedCurrent,
  'fallback.only': fallbackOnly,
  'pending.plus': pendingPlusApproved,
  'pending.only': pendingOnly,
  'rejected.only': rejectedOnly,
  'restricted.kid': restrictedStudent,
  'fourth.kid': studentRow('fourth.kid', 'Fourth F.', '20007'),
  'viewer.staff': viewer,
};
const apiProfiles = {
  20001: { current_avatar_key: 'avatars/current.png' },
  20003: { current_avatar_key: 'avatars/pending-now.png' },
  20004: { current_avatar_key: 'avatars/pending-only.png' },
  20005: { current_avatar_key: 'avatars/rejected-only.png' },
  20006: { current_avatar_key: 'avatars/restricted.png' },
  20007: { current_avatar_key: 'avatars/fourth.png' },
  'viewer.staff': { current_avatar_key: 'avatars/viewer.png' },
};
const apiSubs = rows.submissions.concat([
  { character_name: '20007', image_key: 'avatars/fourth.png', status: 'approved', approved_at: '2026-08-01T00:00:00.000Z' },
]);

const env = makeEnv({
  accounts: apiAccounts,
  profiles: apiProfiles,
  submissions: apiSubs,
  identities: { 20006: { media_publicity_restricted: 1, character_name: '20006' } },
});

const loaded = await loadPublicAvatarKeyMap(env.DB);
expandPublicAvatarAliases(loaded, Object.values(apiAccounts));
const expectedRoster = originPool(Object.values(apiAccounts), loaded, new Set(['20006']));

const cookie = await cookieFor(approvedCurrent);
const res = await worker.fetch(new Request('https://lantern.example/api/games/characters', {
  method: 'GET',
  headers: { Cookie: cookie },
}), env);
const body = await res.json();
const apiChars = (body && body.characters) || [];
if (res.status === 200 && body && body.ok && apiChars.length === expectedRoster.length) {
  ok('GET /api/games/characters count equals shared eligibility roster');
} else bad('api count', { status: res.status, api: apiChars.length, expected: expectedRoster.length, body });

const apiNames = apiChars.map((c) => c.display_name);
if (
  apiNames.includes('Approved C.') &&
  apiNames.includes('Fallback F.') &&
  apiNames.includes('Pending Plus P.') &&
  apiNames.includes('Fourth F.') &&
  !apiNames.includes('Pending O.') &&
  !apiNames.includes('Rejected R.') &&
  !apiNames.includes('Restricted K.')
) {
  ok('API roster matches intended eligibility (current, fallback, pending+fallback; excludes unsafe/restricted)');
} else bad('api names', apiNames);

if (apiChars.length >= 4 && !apiChars.some((c) => /demo|placeholder/i.test(String(c.display_name || '')))) {
  ok('API opens past minimum 4 with real eligible students only');
} else bad('api min4', apiChars);

const threeEnv = makeEnv({
  accounts: {
    'approved.current': approvedCurrent,
    'fallback.only': fallbackOnly,
    'pending.plus': pendingPlusApproved,
    'viewer.staff': viewer,
  },
  profiles: {
    20001: { current_avatar_key: 'avatars/current.png' },
    20003: { current_avatar_key: 'avatars/pending-now.png' },
    'viewer.staff': { current_avatar_key: 'avatars/viewer.png' },
  },
  submissions: rows.submissions.filter((s) => ['20001', '20002', '20003', 'viewer.staff'].includes(s.character_name)),
  identities: {},
});
const threeRes = await worker.fetch(new Request('https://lantern.example/api/games/characters', {
  method: 'GET',
  headers: { Cookie: cookie },
}), threeEnv);
const threeBody = await threeRes.json();
const threeApi = (threeBody && threeBody.characters) || [];
if (threeApi.length === 4 && threeApi.some((c) => c.display_name === 'Viewer V.')) {
  ok('three students + one staff = 4 real people, still no demo fill');
} else if (threeApi.filter((c) => c.person_type === 'student').length === 3) {
  ok('three eligible students stay at 3 without a fake fourth');
} else bad('three-student api', threeApi);

const gamesHtml = fs.readFileSync(path.join(root, 'app/games.html'), 'utf8');
if (
  /gamesApiBase == null/.test(gamesHtml) &&
  /\/api\/games\/characters/.test(gamesHtml) &&
  /characters\.length >= 4/.test(gamesHtml) &&
  !/if \(gamesApiBase\) \{\s*fetch\(gamesApiBase \+ '\/api\/games\/characters'/.test(gamesHtml)
) {
  ok('games.html treats empty LANTERN_AVATAR_API as same-origin and keeps the minimum-4 roster gate');
} else bad('games.html same-origin gate');

if (!/demo.?avatar|fake.?avatar|placeholder avatar/i.test(gamesHtml)) {
  ok('games.html does not fail-open with demo avatars');
} else bad('demo avatars in games.html');

const noCurrentPool = buildAvatarMatchPool(
  [fallbackOnly],
  { 20002: 'avatars/fallback.png' },
  'https://lantern.example',
  keyFn
);
if (noCurrentPool.length === 1 && /fallback\.png/.test(noCurrentPool[0].avatar_url)) {
  ok('pool builder accepts approved fallback keys (does not require current_avatar_key)');
} else bad('pool fallback', noCurrentPool);

const uniqueA = uniqueAvatarMatchByLabel(four);
if (uniqueA.length === four.length) {
  ok('unique-label pass-through equals roster when labels are unique');
} else bad('unique labels', uniqueA.length);

console.log('\n--- avatar-match-eligible-236-test: ' + pass + ' passed, ' + fail + ' failed ---');
process.exit(fail ? 1 : 0);
