/**
 * Prompt #278 — Avatar Activity Bank, Avatar Match gate removal, four-choice harness.
 * Usage: node worker/scripts/avatar-activity-278-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import { formatAvatarActivityDisplayName } from '../avatar-activity-name.js';
import {
  isTeacherOriginatedAvatarSubmission,
  buildAvatarActivityBank,
  publicAvatarActivityEntries,
  buildAvatarMultipleChoiceQuestion,
  countDisplayNameCollisions,
} from '../avatar-activity-bank.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail || ''); }

const gamesHtml = fs.readFileSync(path.join(root, 'app/games.html'), 'utf8');
const playerCss = fs.readFileSync(path.join(root, 'app/css/lantern-game-player.css'), 'utf8');
const catalogJs = fs.readFileSync(path.join(root, 'app/js/lantern-game-catalog.js'), 'utf8');
const gamesPageJs = fs.readFileSync(path.join(root, 'app/js/lantern-games-page.js'), 'utf8');
const clientBank = fs.readFileSync(path.join(root, 'app/js/lantern-avatar-activity-bank.js'), 'utf8');
const missionsJs = fs.readFileSync(path.join(root, 'app/js/lantern-educational-trivia-missions.js'), 'utf8');
const indexJs = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');

function loadClientBank() {
  const sandbox = { window: {}, console };
  sandbox.globalThis = sandbox.window;
  vm.runInNewContext(clientBank, sandbox);
  return sandbox.window.LANTERN_AVATAR_ACTIVITY;
}

const client = loadClientBank();

if (formatAvatarActivityDisplayName({ first_name: 'Lucas', last_name: 'Radle' }) === 'Lucas R.') ok('name: Lucas Radle → Lucas R.');
else bad('name lucas');
if (formatAvatarActivityDisplayName({ first_name: 'Maria', last_name: 'Garcia' }) === 'Maria G.') ok('name: Maria Garcia → Maria G.');
else bad('name maria');
if (formatAvatarActivityDisplayName({ first_name: 'Jacob', last_name: "O'Brien" }) === 'Jacob O.') ok('name: apostrophe last → Jacob O.');
else bad('name apostrophe');
if (formatAvatarActivityDisplayName({ first_name: 'Alex', last_name: 'Smith-Jones' }) === 'Alex S.') ok('name: hyphenated last uses first letter');
else bad('name hyphen');
if (formatAvatarActivityDisplayName({ first_name: 'Ava', last_name: '' }) === 'Ava') ok('name: missing last → first only');
else bad('name first only');
if (formatAvatarActivityDisplayName({ display_name: 'Ms. Carter' }) === 'Carter') ok('name: honorific stripped, single token is first-only');
else bad('name honorific', formatAvatarActivityDisplayName({ display_name: 'Ms. Carter' }));
if (client.formatDisplayName({ first_name: 'Lucas', last_name: 'Radle' }) === 'Lucas R.') ok('client formatter matches worker');
else bad('client formatter drift');
if (!/Radle/.test(formatAvatarActivityDisplayName({ first_name: 'Lucas', last_name: 'Radle' }).slice(6))) ok('name: no full surname leakage');
else bad('surname leak');

if (isTeacherOriginatedAvatarSubmission({ image_key: 'avatars/a.png', status: 'pending', approved_by: 'staged:Web Admin' })) {
  ok('bank: admin-staged pending is eligible (approval state is not the gate)');
} else bad('admin staged pending');
if (!isTeacherOriginatedAvatarSubmission({ image_key: 'avatars/b.png', status: 'pending', approved_by: null })) {
  ok('bank: unreviewed student self-upload is excluded');
} else bad('self pending included');
if (isTeacherOriginatedAvatarSubmission({ image_key: 'avatars/c.png', status: 'approved', approved_by: 'staged:Web Admin' })) {
  ok('bank: admin-uploaded approved asset is eligible');
} else bad('admin approved');
if (!isTeacherOriginatedAvatarSubmission({ image_key: '', status: 'approved', approved_by: 'staged:Web Admin' })) {
  ok('bank: missing image_key is skipped');
} else bad('empty key included');

const fixtureBank = buildAvatarActivityBank({
  origin: 'https://lantern.example',
  submissions: [
    { character_name: '20889', image_key: 'avatars/lucas-1.png', status: 'pending', approved_by: 'staged:Web Admin' },
    { character_name: '20889', image_key: 'avatars/lucas-old.png', status: 'rejected', approved_by: 'staged:Web Admin', rejected_reason: 'Superseded by System Admin avatar assignment' },
    { character_name: '21050', image_key: 'avatars/maya.png', status: 'approved', approved_by: 'staged:Web Admin' },
    { character_name: 'selfy', image_key: 'avatars/self.png', status: 'pending', approved_by: null },
    { character_name: 'test_bot', image_key: 'avatars/test.png', status: 'approved', approved_by: 'staged:Web Admin' },
  ],
  profiles: [
    { character_name: '20890', current_avatar_key: 'avatars/restricted.png' },
    { character_name: 'ms_carter', current_avatar_key: 'avatars/pat.png' },
  ],
  accounts: [
    { username: '20889', first_name: 'Lucas', last_name: 'Radle', role: 'student' },
    { username: 'ms_carter', first_name: 'Pat', last_name: 'Carter', role: 'teacher' },
  ],
  rosterStudents: [
    { student_id: '21050', first_name: 'Maya', last_name: 'Chen' },
    { student_id: '20890', first_name: 'Restricted', last_name: 'Kid' },
  ],
  restrictedSet: new Set(['20890']),
});

const labels = fixtureBank.map((e) => e.display_name).sort();
if (labels.includes('Lucas R.') && labels.includes('Maya C.') && labels.includes('Pat C.')) ok('bank: real uploaded/assigned entries accepted');
else bad('bank labels', labels);
if (fixtureBank.filter((e) => e.display_name === 'Lucas R.').length === 2) ok('bank: replaced admin uploads both remain when assets exist');
else bad('replaced avatars', fixtureBank);
if (!labels.includes('Restricted K.') && !fixtureBank.some((e) => /restricted\.png/.test(e.avatar_url || ''))) ok('bank: restricted student photo excluded');
else bad('restricted leaked', fixtureBank);
if (!fixtureBank.some((e) => /self\.png/.test(e.avatar_url || ''))) ok('bank: no fake/self-service filler entries');
else bad('self upload leaked');
if (!fixtureBank.some((e) => /test_/.test(e.entry_id))) ok('bank: synthetic test_ identities excluded');
else bad('test identity');

const pub = publicAvatarActivityEntries(fixtureBank);
if (pub.every((p) => p.username == null && p.character_name == null && p.email == null && !/20889|21050/.test(JSON.stringify(p)))) {
  ok('privacy: public entries omit ids/login/email');
} else bad('privacy leak', pub);
if (pub.every((p) => !/\bRadle\b|\bChen\b|\bCarter\b/.test(p.display_name))) ok('privacy: no full surnames in activity labels');
else bad('surname in public', pub);

const collisions = countDisplayNameCollisions([
  { display_name: 'Alex M.' },
  { display_name: 'Alex M.' },
  { display_name: 'Sam L.' },
]);
if (collisions.collision_identity_count === 1 && collisions.collisions[0].count === 2) ok('collisions: Alex M. counted once as a duplicate identity');
else bad('collision count', collisions);

const qBank = [
  { display_name: 'Lucas R.', avatar_url: 'https://lantern.example/a1' },
  { display_name: 'Maya C.', avatar_url: 'https://lantern.example/a2' },
  { display_name: 'Pat C.', avatar_url: 'https://lantern.example/a3' },
  { display_name: 'Jacob C.', avatar_url: 'https://lantern.example/a4' },
  { display_name: 'Alex M.', avatar_url: 'https://lantern.example/a5' },
  { display_name: 'Alex M.', avatar_url: 'https://lantern.example/a6' },
];
let builtOk = 0;
let dupChoice = 0;
let missingCorrect = 0;
for (let i = 0; i < 40; i++) {
  const q = buildAvatarMultipleChoiceQuestion(qBank, { random: () => (i % 9) / 10 });
  if (!q.ok) continue;
  builtOk += 1;
  if (new Set(q.choices).size !== 4) dupChoice += 1;
  if (q.choices.filter((c) => c === q.correctIdentity).length !== 1) missingCorrect += 1;
  if (q.targetAvatar.display_name !== q.correctIdentity) missingCorrect += 1;
}
if (builtOk >= 8 && dupChoice === 0 && missingCorrect === 0) ok('builder: repeated generation stays 4 distinct labels + one correct');
else bad('builder loop', { builtOk, dupChoice, missingCorrect });

const clientQ = client.buildMultipleChoiceQuestion(qBank);
if (clientQ.ok && clientQ.choices.length === 4 && clientQ.choices.includes(clientQ.correctIdentity)) {
  ok('client builder: 4 choices with correct label present once');
} else bad('client builder', clientQ);

const short = buildAvatarMultipleChoiceQuestion(qBank.slice(0, 2));
if (!short.ok && short.error === 'insufficient_identities' && short.distinct_identity_count === 2) {
  ok('builder: insufficient bank is safe and reports count');
} else bad('insufficient', short);

if (
  !/at least four approved avatars/.test(gamesHtml) &&
  /available right now/.test(gamesHtml) &&
  gamesHtml.includes('lantern-avatar-activity-bank.js') &&
  gamesHtml.includes('LANTERN_AVATAR_ACTIVITY.buildMultipleChoiceQuestion')
) {
  ok('Avatar Match: obsolete approved-avatar gate removed; shared builder wired');
} else bad('games.html gate');

if (
  gamesHtml.includes("gameName === 'Avatar Match'") &&
  gamesHtml.includes('missionActivity') &&
  gamesHtml.includes('lockAndPaintMcResult') &&
  gamesHtml.includes('sfxCultureCorrect') &&
  gamesHtml.includes('sfxCultureWrong')
) {
  ok('Avatar Match: free mission launch + #277 one-tap/feedback/audio reused');
} else bad('avatar match ux wiring');

if (
  /avatarMatchImgWrap\{[\s\S]*?320px/.test(gamesHtml) &&
  /overflow:\s*visible/.test(gamesHtml) &&
  !/\.choiceBtn:hover\{[^}]*transform:/.test(gamesHtml)
) {
  ok('Avatar Match: large avatar + #277 natural scroll / stable hover');
} else bad('avatar layout');

if (playerCss.includes('avatarMatchImgWrap') && playerCss.includes('320px')) ok('player CSS keeps avatar large in Game Player');
else bad('player avatar css');

if (catalogJs.includes("id: 'avatar-match'") && catalogJs.includes('mission_activity: true') && /nuggetHunt[\s\S]*status: 'playable'/.test(catalogJs) && /lantern-live-trivia[\s\S]*status: 'playable'/.test(catalogJs)) {
  ok('catalog: Avatar Match is a mission activity; Nugget Hunt / Live Trivia left unchanged');
} else bad('catalog flags');

if (gamesPageJs.includes("g.mission_activity") && gamesPageJs.includes("'Mission'")) ok('games cards: Avatar Match shows Mission, not a Nugget charge');
else bad('card meta');

if (!missionsJs.includes('perm_avatar_quiz') && !missionsJs.includes('Avatar Quiz')) ok('future Avatar Quiz Mission is not exposed');
else bad('premature mission');

if (indexJs.includes('loadAvatarActivityBank') && !/WHERE COALESCE\(is_active, 1\) = 1[\s\S]{0,200}games\/characters/.test(indexJs)) {
  ok('API: characters endpoint uses activity bank, not the 4-approved current-profile gate');
} else bad('api wiring');

if (gamesHtml.includes("id: 'nuggetHunt'") || catalogJs.includes("id: 'nuggetHunt'")) ok('Nugget Hunt catalog row not removed');
else bad('nugget hunt missing');

console.log('\nAvatar activity #278:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
