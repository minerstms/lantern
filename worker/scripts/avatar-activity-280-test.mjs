/**
 * Prompt #280 — Avatar Activity exclusion, Avatar Match mission taxonomy, Hunt/Live Trivia archive.
 * Usage: node worker/scripts/avatar-activity-280-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import { formatAvatarActivityDisplayName } from '../avatar-activity-name.js';
import {
  buildAvatarActivityBank,
  publicAvatarActivityEntries,
  buildAvatarMultipleChoiceQuestion,
  isTeacherOriginatedAvatarSubmission,
} from '../avatar-activity-bank.js';
import {
  emptyAvatarActivityExclusionSets,
  isAvatarActivityExcluded,
  setAvatarActivityExclusion,
} from '../avatar-activity-exclusion.js';
import { isUnpaidMissionCatalogGame, resolveRegisteredLeaderboardGame, leaderboardGameNames } from '../lantern-game-catalog.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

const catalogJs = fs.readFileSync(path.join(root, 'app/js/lantern-game-catalog.js'), 'utf8');
const gamesPageJs = fs.readFileSync(path.join(root, 'app/js/lantern-games-page.js'), 'utf8');
const paidStartJs = fs.readFileSync(path.join(root, 'app/js/lantern-games-paid-start.js'), 'utf8');
const gamesHtml = fs.readFileSync(path.join(root, 'app/games.html'), 'utf8');
const missionsHtml = fs.readFileSync(path.join(root, 'app/missions.html'), 'utf8');
const adminHtml = fs.readFileSync(path.join(root, 'app/admin.html'), 'utf8');
const workerIndex = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
const bankJs = fs.readFileSync(path.join(root, 'worker/avatar-activity-bank.js'), 'utf8');
const eduJs = fs.readFileSync(path.join(root, 'app/js/lantern-educational-trivia-missions.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'worker/migrations/075_lantern_avatar_activity_exclusions.sql'), 'utf8');
const quiz277 = fs.readFileSync(path.join(root, 'worker/scripts/quiz-mc-277-test.mjs'), 'utf8');

function loadClientCatalog() {
  const sandbox = { window: {}, console };
  sandbox.globalThis = sandbox.window;
  vm.runInNewContext(catalogJs, sandbox);
  return sandbox.window.LANTERN_GAME_CATALOG || sandbox.LANTERN_GAME_CATALOG;
}

function loadPaidStart() {
  const toasts = [];
  const sandbox = {
    window: {},
    console,
    Promise,
    Number,
    Math,
    Date,
    setTimeout,
    clearTimeout,
  };
  sandbox.globalThis = sandbox.window;
  sandbox.window.LANTERN_GAME_CATALOG = loadClientCatalog();
  sandbox.window.LanternGamesRuntime = {
    toast: function (m) { toasts.push(String(m)); },
    loadAdopted: function () { return { name: '20889' }; },
  };
  vm.runInNewContext(paidStartJs, sandbox);
  return { api: sandbox.window.LanternGamesPaidStart, toasts };
}

function makeExclusionDb(store) {
  return {
    prepare(sql) {
      const q = String(sql);
      return {
        bind(...args) {
          return {
            async run() {
              if (/INSERT OR REPLACE/.test(q)) {
                store.set(String(args[0]), { submission_id: args[0], image_key: args[1], excluded: 1 });
              } else if (/DELETE FROM lantern_avatar_activity_exclusions/.test(q)) {
                store.delete(String(args[0]));
              }
              return { success: true };
            },
            async all() {
              const rows = [...store.values()].filter((r) => r.excluded === 1);
              return { results: rows };
            },
            async first() { return null; },
          };
        },
        async all() {
          return { results: [...store.values()].filter((r) => r.excluded === 1) };
        },
      };
    },
  };
}

const accounts = [
  { username: '20889', first_name: 'Lucas', last_name: 'Radle', role: 'student', is_active: 1 },
  { username: '21050', first_name: 'Maya', last_name: 'Chen', role: 'student', is_active: 0 },
  { username: 'ms_carter', first_name: 'Pat', last_name: 'Carter', role: 'teacher' },
];
const rosterStudents = [
  { student_id: '21050', first_name: 'Maya', last_name: 'Chen', is_active: 0 },
  { student_id: '20890', first_name: 'Restricted', last_name: 'Kid' },
];

function bankFrom(submissions, extra) {
  return buildAvatarActivityBank({
    origin: 'https://lantern.example',
    submissions,
    profiles: (extra && extra.profiles) || [],
    accounts,
    rosterStudents,
    restrictedSet: new Set(['20890']),
    exclusionSets: extra && extra.exclusionSets,
  });
}

const historicalA = { id: 'av-a', character_name: '20889', image_key: 'avatars/lucas-a.png', status: 'approved', approved_by: 'staged:Web Admin' };
const historicalB = { id: 'av-b', character_name: '20889', image_key: 'avatars/lucas-b.png', status: 'approved', approved_by: 'staged:Web Admin' };
const newC = { id: 'av-c', character_name: '20889', image_key: 'avatars/lucas-c.png', status: 'pending', approved_by: 'staged:Web Admin' };
const maya = { id: 'av-maya', character_name: '21050', image_key: 'avatars/maya.png', status: 'approved', approved_by: 'staged:Web Admin' };
const pat = { id: 'av-pat', character_name: 'ms_carter', image_key: 'avatars/pat.png', status: 'approved', approved_by: 'Web Admin' };
const restricted = { id: 'av-r', character_name: '20890', image_key: 'avatars/restricted.png', status: 'approved', approved_by: 'staged:Web Admin' };
const selfUpload = { id: 'av-self', character_name: '20889', image_key: 'avatars/self.png', status: 'pending', approved_by: null };

const defaultBank = bankFrom([historicalA, historicalB, maya, pat, restricted, selfUpload]);
if (defaultBank.some((e) => e.avatar_key === 'avatars/lucas-a.png') && defaultBank.some((e) => e.avatar_key === 'avatars/lucas-b.png')) {
  ok('A. eligible historical teacher-uploaded avatars default INCLUDED');
} else bad('A historical default', defaultBank);
if (bankFrom([newC, maya, pat, historicalA]).some((e) => e.avatar_key === 'avatars/lucas-c.png')) {
  ok('A. newly uploaded eligible avatar defaults INCLUDED');
} else bad('A new default');
if (defaultBank.some((e) => e.display_name === 'Maya C.')) ok('historical inactive student avatar remains eligible');
else bad('inactive excluded', defaultBank.map((e) => e.display_name));

const exclA = emptyAvatarActivityExclusionSets();
exclA.submissionIds.add('av-a');
exclA.imageKeys.add('avatars/lucas-a.png');
const afterExclude = bankFrom([historicalA, historicalB, maya, pat], { exclusionSets: exclA });
if (!afterExclude.some((e) => e.avatar_key === 'avatars/lucas-a.png') && afterExclude.some((e) => e.avatar_key === 'avatars/lucas-b.png')) {
  ok('B/C. exclude Avatar A removes only A; B remains');
} else bad('exclude A', afterExclude);

const afterC = bankFrom([historicalA, historicalB, newC, maya, pat], { exclusionSets: exclA });
if (afterC.some((e) => e.avatar_key === 'avatars/lucas-c.png') && !afterC.some((e) => e.avatar_key === 'avatars/lucas-a.png')) {
  ok('D. replacement Avatar C defaults INCLUDED; A stays excluded');
} else bad('replacement C', afterC);

const store = new Map();
const db = makeExclusionDb(store);
const setEx = await setAvatarActivityExclusion(db, { submission_id: 'av-a', image_key: 'avatars/lucas-a.png', excluded: true, updated_by: 'admin' });
const setIn = await setAvatarActivityExclusion(db, { submission_id: 'av-a', image_key: 'avatars/lucas-a.png', excluded: false, updated_by: 'admin' });
if (setEx.ok && setEx.activity_included === false && setIn.ok && setIn.activity_included === true && !store.has('av-a')) {
  ok('E/F. re-include deletes exclusion row (authoritative, not localStorage)');
} else bad('re-include persist', { setEx, setIn, store: [...store.keys()] });

if (
  !/DELETE FROM lantern_avatar_submissions/.test(workerIndex.slice(workerIndex.indexOf('activity-exclusion'), workerIndex.indexOf('activity-exclusion') + 1800)) &&
  workerIndex.includes('current_avatar_unchanged: true') &&
  workerIndex.includes('moderation_status:')
) {
  ok('G. exclude API does not delete image or rewrite moderation/profile');
} else bad('G side effects');

const restrictedBank = bankFrom([restricted, maya, pat, historicalA], { exclusionSets: emptyAvatarActivityExclusionSets() });
if (!restrictedBank.some((e) => /restricted\.png/.test(e.avatar_url || ''))) {
  ok('H. media-publicity restricted avatar stays out even without an exclusion row');
} else bad('H restricted leaked');

if (
  workerIndex.includes("path === '/api/admin/avatar/activity-exclusion'") &&
  /activity-exclusion[\s\S]{0,250}canManageLanternAvatars\(account\)/.test(workerIndex)
) {
  ok('I. exclusion write uses canManageLanternAvatars (Web Admin only)');
} else bad('I auth gate');

if (!isTeacherOriginatedAvatarSubmission(selfUpload) && !defaultBank.some((e) => /self\.png/.test(e.avatar_url || ''))) {
  ok('unreviewed self-upload excluded from bank');
} else bad('self upload');
if (!defaultBank.some((e) => /test_/.test(JSON.stringify(e)))) ok('no fake/test filler entries');
else bad('fake entries');

if (formatAvatarActivityDisplayName({ first_name: 'Lucas', last_name: 'Radle' }) === 'Lucas R.') ok('formatter First + Last Initial');
else bad('formatter');
if (!/\bRadle\b/.test(formatAvatarActivityDisplayName({ first_name: 'Lucas', last_name: 'Radle' }))) ok('no full surname leakage');
else bad('surname');

const qBank = afterExclude.concat([
  { display_name: 'Jacob C.', avatar_url: 'https://lantern.example/j' },
  { display_name: 'Alex M.', avatar_url: 'https://lantern.example/x' },
]);
const q = buildAvatarMultipleChoiceQuestion(qBank, { target: afterExclude.find((e) => e.display_name === 'Lucas R.') });
if (q.ok && q.choices.length === 4 && new Set(q.choices).size === 4 && q.choices.filter((c) => c === q.correctIdentity).length === 1) {
  ok('builder: 4 distinct labels, one correct');
} else bad('builder', q);
if (q.ok && !q.choices.includes('Restricted K.') && q.targetAvatar.avatar_key !== 'avatars/lucas-a.png') {
  ok('excluded/restricted avatars cannot be target or distractor from this bank');
} else bad('builder exclusion', q);

const pub = publicAvatarActivityEntries(defaultBank);
if (pub.every((p) => p.submission_id == null && p.avatar_key == null && p.username == null && !/20889|activity_included|excluded/.test(JSON.stringify(p)))) {
  ok('privacy: student bank omits ids, keys, exclusion metadata');
} else bad('privacy', pub);

if (!/Waiting for 4 approved avatars|at least four approved avatars/i.test(gamesHtml) && /available right now/.test(gamesHtml)) {
  ok('obsolete approved-avatar gate remains gone');
} else bad('gate copy');

if (
  gamesHtml.includes('lockAndPaintMcResult') &&
  gamesHtml.includes('sfxCultureCorrect') &&
  gamesHtml.includes('sfxCultureWrong') &&
  quiz277.includes('lockAndPaintMcResult')
) {
  ok('#277 one-tap / correct-wrong sound path preserved');
} else bad('#277 path');

const cat = loadClientCatalog();
const match = cat.getGameById('avatar-match');
if (match && match.play_cost === 0 && match.mission_activity && match.student_surface === 'missions' && match.status === 'playable') {
  ok('Avatar Match catalog: free mission, not play_cost 1');
} else bad('avatar match catalog', match);
if (cat.getGameById('nuggetHunt').status === 'archived' && cat.getGameById('lantern-live-trivia').status === 'archived') {
  ok('Nugget Hunt and Lantern Live Trivia archived, implementation rows remain');
} else bad('archive status');
if (typeof cat.isStudentGameLibraryEntry === 'function' && !cat.isStudentGameLibraryEntry(match) && !cat.isStudentGameLibraryEntry(cat.getGameById('nuggetHunt'))) {
  ok('student Games library hides Avatar Match + archived Hunt/Live Trivia');
} else bad('student library filter');

const paid = loadPaidStart();
if (paid.api.playCostForGame('Avatar Match') === 0) ok('paid-start play cost for Avatar Match is 0');
else bad('paid cost', paid.api.playCostForGame('Avatar Match'));
const startRes = await paid.api.startPaidGame('Avatar Match', function () { throw new Error('must not charge'); });
if (startRes && startRes.ok === false && startRes.error === 'not_a_paid_game') {
  ok('startPaidGame refuses to debit Avatar Match');
} else bad('startPaidGame', startRes);

if (isUnpaidMissionCatalogGame('avatar-match') && isUnpaidMissionCatalogGame('Avatar Match') && workerIndex.includes('mission_no_play_cost')) {
  ok('Worker rejects game_play debit for Avatar Match');
} else bad('worker unpaid guard');

if (
  missionsHtml.includes("id: 'mission_avatar_match'") &&
  missionsHtml.includes("url: 'games.html?game=avatar-match'") &&
  !eduJs.includes('perm_avatar_quiz') &&
  !eduJs.includes('Avatar Quiz')
) {
  ok('Avatar Match is a Missions card; Avatar Quiz Mission is not exposed');
} else bad('missions taxonomy');

if (
  adminHtml.includes('Included in Avatar Activities') &&
  adminHtml.includes('Excluded from Avatar Activities') &&
  adminHtml.includes('Exclude from Avatar Activities') &&
  adminHtml.includes('Include in Avatar Activities') &&
  adminHtml.includes('/api/admin/avatar/activity-exclusion')
) {
  ok('Web Admin Manage Avatar shows include/exclude controls');
} else bad('admin UI');

if (
  migration.includes('lantern_avatar_activity_exclusions') &&
  migration.includes('submission_id TEXT PRIMARY KEY') &&
  !/DROP |DELETE FROM/.test(migration)
) {
  ok('D1 exclusion table is additive and keyed by submission id');
} else bad('migration');

if (bankJs.includes('isAvatarActivityExcluded') && bankJs.includes('loadAvatarActivityExclusionSets')) {
  ok('shared bank applies exclusion centrally');
} else bad('bank exclusion wiring');

if (!isAvatarActivityExcluded({ id: 'av-a', image_key: 'avatars/lucas-a.png' }, emptyAvatarActivityExclusionSets())) {
  ok('no exclusion metadata → included');
} else bad('default included helper');

if (resolveRegisteredLeaderboardGame('nuggetHunt') && resolveRegisteredLeaderboardGame('lantern-live-trivia')) {
  ok('archived games remain in the catalog for later restore');
} else bad('catalog rows deleted');

if (!leaderboardGameNames().includes('Nugget Hunt') && !leaderboardGameNames().includes('Lantern Live Trivia')) {
  ok('archived games hidden from student-facing leaderboard name list');
} else bad('leaderboard names', leaderboardGameNames());

if (gamesPageJs.includes('isStudentGameLibraryEntry') && gamesPageJs.includes('mission_activity')) {
  ok('Games page filters mission/archived rows out of the student library');
} else bad('games page filter');

console.log('\nAvatar activity #280:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
