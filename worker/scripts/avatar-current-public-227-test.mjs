/**
 * Prompt #227 — current vs approved/public avatar resolver, Locker/Explore safety,
 * admin set-current, Avatar Match source. No live D1.
 * Usage: node worker/scripts/avatar-current-public-227-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  avatarCandidatesFromPilotAccount,
  buildAvatarImageUrl,
  collectAvatarLookupCandidates,
  loadAvatarProfileByCandidates,
  loadLatestApprovedAvatarSubmission,
  resolveCanonicalAvatarState,
} from '../avatar-media-gate.js';
import { buildAvatarMatchPool } from '../avatar-match-pool.js';
import { buildLockerMeResponse } from '../locker-handlers.js';
import { resolveAuthorAvatarKey, buildPilotAvatarKeyIndex } from '../author-avatar-key.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(msg) { pass++; console.log('PASS', msg); }
function bad(msg, detail) { fail++; console.error('FAIL', msg, detail != null ? detail : ''); }

function makeDb(state) {
  return {
    prepare(sql) {
      const s = String(sql);
      const binds = [];
      const api = {
        bind(...args) { binds.push(...args); return api; },
        async first() {
          if (s.includes('FROM lantern_avatar_profiles WHERE character_name = ?')) {
            return state.profiles[binds[0]] || null;
          }
          if (s.includes('FROM lantern_avatar_submissions') && s.includes("status = 'approved'")) {
            const rows = (state.submissions || []).filter((r) => r.character_name === binds[0] && r.status === 'approved');
            rows.sort((a, b) => String(b.approved_at || b.created_at || '').localeCompare(String(a.approved_at || a.created_at || '')));
            return rows[0] || null;
          }
          if (s.includes('FROM lantern_avatar_submissions') && s.includes("status = 'pending'")) {
            const rows = (state.submissions || []).filter((r) => r.character_name === binds[0] && r.status === 'pending');
            return rows[rows.length - 1] || null;
          }
          if (s.includes('FROM lantern_pilot_accounts WHERE username = ?')) {
            return state.pilotBio || null;
          }
          if (s.includes('FROM lantern_wallets')) return null;
          if (s.includes('FROM lantern_achievements') && s.includes('achievement_id = ?')) return null;
          if (s.includes('FROM lantern_cosmetic_ownership')) return null;
          return null;
        },
        async all() {
          if (s.includes('FROM lantern_transactions')) return { results: [] };
          if (s.includes('FROM lantern_news_submissions')) return { results: [] };
          if (s.includes('FROM lantern_mission_submissions')) return { results: [] };
          if (s.includes('FROM lantern_poll_contributions')) return { results: [] };
          if (s.includes('FROM lantern_teacher_recognition')) return { results: [] };
          if (s.includes('FROM lantern_achievements')) return { results: [] };
          if (s.includes('FROM lantern_missions WHERE id IN')) return { results: [] };
          return { results: [] };
        },
        async run() { return { success: true }; },
      };
      return api;
    },
  };
}

const student = {
  username: 'lucas',
  display_name: 'Lucas R.',
  role: 'student',
  student_character_name: '20889',
  mtss_student_id: '20889',
  is_active: 1,
};

if (collectAvatarLookupCandidates('20889', 'staff_id:4', 'lucas', '20889').join(',') === '20889,lucas') {
  ok('lookup candidates de-dupe and drop staff_id economy keys');
} else bad('lookup candidates');

if (avatarCandidatesFromPilotAccount(student).indexOf('20889') === 0) {
  ok('student candidates prefer mtss/economy id');
} else bad('student candidates', avatarCandidatesFromPilotAccount(student));

if (avatarCandidatesFromPilotAccount({ username: 'rick.radle', role: 'teacher' }).join(',') === 'rick.radle') {
  ok('staff candidate is login username');
} else bad('staff candidates');

const db = makeDb({
  profiles: {
    '20889': { character_name: '20889', current_avatar_key: 'avatars/current.png', updated_at: '2026-08-01T00:00:00.000Z', bio: null },
  },
  submissions: [
    { id: 'av-old', character_name: '20889', image_key: 'avatars/old-approved.png', status: 'approved', approved_at: '2026-07-01T00:00:00.000Z' },
    { id: 'av-pend', character_name: '20889', image_key: 'avatars/pending.png', status: 'pending', created_at: '2026-08-10T00:00:00.000Z' },
  ],
});

const byAlias = await loadAvatarProfileByCandidates(db, ['lucas', '20889']);
if (byAlias && byAlias.current_avatar_key === 'avatars/current.png') ok('profile resolves via alias candidates');
else bad('alias profile', byAlias);

const currentState = await resolveCanonicalAvatarState(db, 'lucas', { candidates: ['20889'], includePending: true });
if (currentState.source === 'current' && currentState.publicImageKey === 'avatars/current.png' && currentState.pending && currentState.pending.image_key === 'avatars/pending.png') {
  ok('canonical state prefers current over approved/pending');
} else bad('canonical current', currentState);

const noCurrentDb = makeDb({
  profiles: {},
  submissions: [
    { id: 'av-ok', character_name: '20889', image_key: 'avatars/approved-only.png', status: 'approved', approved_at: '2026-08-01T00:00:00.000Z' },
    { id: 'av-pend2', character_name: '20889', image_key: 'avatars/still-pending.png', status: 'pending', created_at: '2026-08-11T00:00:00.000Z' },
  ],
});
const fallback = await resolveCanonicalAvatarState(noCurrentDb, '20889', { includePending: true });
if (fallback.source === 'approved_fallback' && fallback.publicImageKey === 'avatars/approved-only.png' && fallback.publicImageKey !== 'avatars/still-pending.png') {
  ok('approved fallback used when current is missing; pending excluded');
} else bad('approved fallback', fallback);

const pendingOnly = await resolveCanonicalAvatarState(makeDb({
  profiles: {},
  submissions: [{ id: 'av-p', character_name: '20889', image_key: 'avatars/pending-only.png', status: 'pending' }],
}), '20889', { includePending: true });
if (!pendingOnly.publicImageKey && pendingOnly.pending && pendingOnly.pending.image_key === 'avatars/pending-only.png') {
  ok('pending-only identity has no public image key');
} else bad('pending public leak', pendingOnly);

const approvedRow = await loadLatestApprovedAvatarSubmission(noCurrentDb, ['lucas', '20889']);
if (approvedRow && approvedRow.image_key === 'avatars/approved-only.png') ok('latest approved submission found by alias');
else bad('latest approved', approvedRow);

const lockerBody = await buildLockerMeResponse(
  { ...student, _economy_character_name: '20889' },
  { DB: makeDb({
    profiles: { '20889': { character_name: '20889', current_avatar_key: 'avatars/locker.png', updated_at: '2026-08-01T00:00:00.000Z', bio: 'Hi' } },
    submissions: [],
  }) },
  'https://lantern.example'
);
if (lockerBody && lockerBody.profile && /key=avatars%2Flocker.png/.test(String(lockerBody.profile.avatar || ''))) {
  ok('Locker /api/locker/me returns current approved avatar URL');
} else bad('locker current', lockerBody && lockerBody.profile);

const lockerAlias = await buildLockerMeResponse(
  { username: 'lucas', role: 'student', student_character_name: 'Lucas R.', mtss_student_id: '20889', _economy_character_name: '20889' },
  { DB: makeDb({
    profiles: { '20889': { character_name: '20889', current_avatar_key: 'avatars/alias.png', updated_at: '2026-08-01T00:00:00.000Z' } },
    submissions: [],
  }) },
  'https://lantern.example'
);
if (lockerAlias && lockerAlias.profile && /alias\.png/.test(String(lockerAlias.profile.avatar || ''))) {
  ok('Locker resolves avatar stored under mtss id, not display name');
} else bad('locker alias', lockerAlias && lockerAlias.profile);

const lockerApprovedOnly = await buildLockerMeResponse(
  { ...student, _economy_character_name: '20889' },
  { DB: makeDb({
    profiles: {},
    submissions: [{ id: 'av-a', character_name: '20889', image_key: 'avatars/approved-locker.png', status: 'approved', approved_at: '2026-08-01T00:00:00.000Z' }],
  }) },
  'https://lantern.example'
);
if (lockerApprovedOnly && lockerApprovedOnly.profile && /approved-locker\.png/.test(String(lockerApprovedOnly.profile.avatar || ''))) {
  ok('Locker uses approved fallback when current profile is missing');
} else bad('locker approved fallback', lockerApprovedOnly && lockerApprovedOnly.profile);

const staffLocker = await buildLockerMeResponse(
  { username: 'rick.radle', role: 'teacher', display_name: 'Rick Radle', teacher_id: '4', staff_id: 4 },
  { DB: makeDb({
    profiles: { 'rick.radle': { character_name: 'rick.radle', current_avatar_key: 'avatars/rick.png', updated_at: '2026-08-01T00:00:00.000Z' } },
    submissions: [],
  }) },
  'https://lantern.example'
);
if (staffLocker && staffLocker.profile && /rick\.png/.test(String(staffLocker.profile.avatar || ''))) {
  ok('staff Locker uses username avatar key, not staff_id economy key');
} else bad('staff locker key', staffLocker && staffLocker.profile);

const idx = buildPilotAvatarKeyIndex([
  { username: '20889', display_name: 'Lucas R.', role: 'student', mtss_student_id: '20889' },
]);
if (resolveAuthorAvatarKey(idx, { authorId: '20889', authorDisplayName: 'Lucas R.' }) === '20889') {
  ok('Explore authorAvatarKey stays on durable student id');
} else bad('explore author key');

const matchPool = buildAvatarMatchPool(
  [student, { username: 'pending.kid', display_name: 'Pending P.', role: 'student', mtss_student_id: '20999', is_active: 1 }],
  { '20889': 'avatars/current.png' },
  'https://lantern.example',
  (row) => String(row.mtss_student_id || row.username)
);
if (matchPool.length === 1 && /current\.png/.test(matchPool[0].avatar_url) && !matchPool.some((p) => p.display_name === 'Pending P.')) {
  ok('Avatar Match uses current avatar and excludes people with no current/approved key');
} else bad('avatar match pool', matchPool);

const url = buildAvatarImageUrl('https://lantern.example', 'avatars/x.png', '2026-08-01T12:00:00.000Z');
if (url && url.indexOf('/api/avatar/image?key=avatars%2Fx.png') >= 0 && /v=/.test(url)) {
  ok('shared image URL builder cache-busts current avatars');
} else bad('image url', url);

const workerIndex = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
const lockerHandlers = fs.readFileSync(path.join(root, 'worker/locker-handlers.js'), 'utf8');
const adminHtml = fs.readFileSync(path.join(root, 'app/admin.html'), 'utf8');
const lockerShell = fs.readFileSync(path.join(root, 'app/js/lantern-locker-shell.js'), 'utf8');
const avatarJs = fs.readFileSync(path.join(root, 'app/js/lantern-avatar.js'), 'utf8');

if (workerIndex.includes('isApprovedPublicKey') && workerIndex.includes("status || '').toLowerCase() === 'approved'")) {
  ok('image route treats approved keys as public-safe, not pending');
} else bad('image approved public gate');
if (workerIndex.includes('already_approved') && workerIndex.includes('can_set_current') && workerIndex.includes('loadLatestApprovedAvatarSubmission')) {
  ok('admin activate can Set as Current an already-approved avatar');
} else bad('admin set-current path');
if (/targetRole === 'student'/.test(workerIndex) && /staged: true/.test(workerIndex) && /writeCurrentAvatarKey/.test(workerIndex)) {
  ok('admin new student upload still stages pending (not auto-approved)');
} else bad('admin stage preserved');
if (lockerHandlers.includes('durableAccountKeyFromPilotAccount') && lockerHandlers.includes('resolveCanonicalAvatarState')) {
  ok('Locker uses shared canonical avatar resolver');
} else bad('locker resolver wiring');
if (adminHtml.includes('Approve & Use') && adminHtml.includes('Set as Current') && adminHtml.includes('can_set_current')) {
  ok('admin UI distinguishes Approve & Use vs Set as Current');
} else bad('admin UI copy');
if (lockerShell.includes('img.lockerHeaderAvatar') && lockerShell.includes('onerror')) {
  ok('Locker header has broken-image fallback');
} else bad('locker broken-image');
if (/getCanonicalAvatar/.test(avatarJs) && /active_image/.test(avatarJs) && !/pending_image/.test(avatarJs.split('function getCanonicalAvatar')[1] || '')) {
  ok('client canonical resolver uses status.active_image only');
} else bad('client pending leak');

const css = fs.readFileSync(path.join(root, 'app/css/lantern-surface-theme.css'), 'utf8');
if (/\.lockerHeaderAvatar \{[\s\S]*border-radius:\s*50%[\s\S]*object-fit:\s*cover/.test(css)) {
  ok('Locker avatar stays circular with object-fit cover');
} else bad('locker visual css');

console.log('\n--- avatar-current-public-227-test: ' + pass + ' passed, ' + fail + ' failed ---');
process.exit(fail ? 1 : 0);
