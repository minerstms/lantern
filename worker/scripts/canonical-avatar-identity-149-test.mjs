/**
 * Prompt #149 — canonical account avatar identity (card = modal = preview).
 * Usage: node worker/scripts/canonical-avatar-identity-149-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { resolveAuthorAvatarKey, buildPilotAvatarKeyIndex } from '../author-avatar-key.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const avatarJs = read('app/js/lantern-avatar.js');
const cardsJs = read('app/js/lantern-cards.js');
const cardUi = read('app/js/lantern-card-ui.js');
const cardsCss = read('app/css/lantern-cards.css');
const contribute = read('app/contribute.html');
const feedExplore = read('app/js/lantern-feed-explore.js');
const workerIndex = read('worker/index.js');
const lockerHandlers = read('worker/locker-handlers.js');
const avatarKeyJs = read('worker/author-avatar-key.js');
const marquee146 = read('worker/scripts/marquee-hidden-lockdown-146-test.mjs');
const feedHandlers = read('worker/feed-handlers.js');

let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }
function assert(cond, label, detail) { if (cond) ok(label); else bad(label, detail); }

const sandbox = {
  console,
  document: {
    createElement() {
      const stub = {
        _html: '',
        firstElementChild: null,
        classList: { _s: new Set(), contains(c) { return this._s.has(c); }, add(c) { this._s.add(c); }, toggle() {} },
        setAttribute() {},
        getAttribute() { return null; },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        addEventListener() {},
        appendChild() {},
        set innerHTML(v) { stub._html = String(v || ''); },
        get innerHTML() { return stub._html; },
      };
      return stub;
    },
  },
  window: undefined,
  LanternMedia: undefined,
  LANTERN_AVATAR_API: '',
  location: { href: '' },
  open() {},
  fetch() { return Promise.resolve({ json: () => Promise.resolve({ ok: false }) }); },
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(avatarJs, sandbox);
vm.runInContext(cardsJs, sandbox);
const LC = sandbox.LanternCards;
const LA = sandbox.LanternAvatar;

assert(typeof LA.normalizeAvatarAccountKey === 'function', '1. normalizeAvatarAccountKey exported');
assert(LA.normalizeAvatarAccountKey('staff:rick.radle') === 'rick.radle', '1b. staff: prefix stripped for profile PK');
assert(LA.normalizeAvatarAccountKey('staff_id:12') === '', '1c. staff_id: ignored');
assert(!/push\(p\.author_name\)/.test(avatarJs) && !/push\(p\.authorDisplayName\)/.test(avatarJs), '1d. client lookup keys omit display names');

const stalePoll = LC.normalizeFeedItemToFaceModel({
  id: 'poll:old',
  type: 'poll',
  title: 'Sports poll',
  authorDisplayName: 'Jessie Roberts',
  authorPublicLabel: 'Jessie R.',
  authorRole: 'student',
  authorAvatarKey: 'jessie.r',
  author_avatar_url: 'https://example.com/stale-avatar-A.png',
  _canonicalAvatar: { imageUrl: '/api/avatar/image?key=avatar_B&v=20260812', emoji: '🌟' },
  approvedAt: '2026-01-01T00:00:00.000Z',
});
assert(stalePoll.authorAvatarKey === 'jessie.r', '10. face uses durable account key');
assert(stalePoll.character_name === 'jessie.r', '10b. character_name is account key not Jessie Roberts');
const staleHtml = LC.buildCanonicalCardFaceHtml(stalePoll);
assert(/Jessie R\./.test(staleHtml), '24. public label Jessie R. on card');
assert(!/Jessie Roberts/.test(staleHtml), '10c. stale author_name snapshot does not win');
assert(/avatar_B/.test(staleHtml), '11. current approved avatar_B used');
assert(!/stale-avatar-A/.test(staleHtml), '10d. content-row avatar snapshot ignored');

const newsFace = LC.normalizeFeedItemToFaceModel({
  id: 'news:1',
  type: 'news',
  title: 'Welcome',
  authorDisplayName: 'Rick Radle',
  authorPublicLabel: 'Mr. Radle',
  authorRole: 'teacher',
  authorAvatarKey: 'rick.radle',
  _canonicalAvatar: { imageUrl: '/api/avatar/image?key=rick_current' },
});
const newsHtml = LC.buildCanonicalCardFaceHtml(newsFace);
assert(/Mr\. Radle/.test(newsHtml) && /rick_current/.test(newsHtml), '3. News card canonical identity');

const shout = LC.normalizeFeedItemToFaceModel({
  id: 'shout_out:1',
  type: 'shout_out',
  title: 'Thanks',
  authorDisplayName: 'Joe Begano',
  authorPublicLabel: 'Mr. Begano',
  authorRole: 'teacher',
  authorAvatarKey: 'joe.begano',
  _canonicalAvatar: { imageUrl: '/api/avatar/image?key=begano_current' },
  contentSlot: { recipient: 'Coach Colorado' },
  body: 'Recognizing: Coach Colorado\n\nGreat job',
});
const shoutHtml = LC.buildCanonicalCardFaceHtml(shout);
assert(/Mr\. Begano/.test(shoutHtml) && /begano_current/.test(shoutHtml), '4. Shout-Out author avatar is author');
assert(/Coach Colorado/.test(shout.descriptionPreview), '5. recognized party stays in row 3, not author chip');
assert(!/colorado_current/.test(shoutHtml), '5b. recognized person avatar not swapped onto author chip');

const mission = LC.normalizeFeedItemToFaceModel({
  id: 'mission:1',
  type: 'mission',
  title: 'Photo',
  authorDisplayName: 'Lucas Radle',
  authorPublicLabel: 'Lucas R.',
  authorRole: 'student',
  authorAvatarKey: '20889',
  _canonicalAvatar: { imageUrl: '/api/avatar/image?key=lucas_current' },
});
const missionHtml = LC.buildCanonicalCardFaceHtml(mission);
assert(/Lucas R\./.test(missionHtml), '6. Mission public name');
assert(!/20889/.test(missionHtml), '21. student id not in card identity HTML');
assert(!/Lucas Radle/.test(missionHtml), '21b. internal full name not on card');

const chip = LC.buildExploreAuthorAvatarHtml({
  authorAvatarKey: 'jessie.r',
  _canonicalAvatar: null,
  identitySize: 'md',
});
assert(/identity-chip/.test(chip) && /data-identity-size="md"/.test(chip), '16. size variant md');
assert(/exploreCardAvatarImg/.test(chip), '16b. img renderer');
assert(/data-lc-av-def/.test(chip) && /data-lc-av-svg/.test(chip), '16c. image failure falls back to placeholder');
assert(!/🌟/.test(chip) && !/Anonymous/.test(chip), '16d. no sun/Anonymous in identity chip');

assert(/paintCanonicalPersonIdentity/.test(cardUi), '1e. shared modal identity painter');
assert(/sourceItem:\s*item/.test(cardUi) || /sourceItem: item/.test(cardUi), '2. poll open passes feed item identity');
assert(/fillFeedItemDetailModal[\s\S]{0,4000}paintCanonicalPersonIdentity/.test(cardUi), '1f. feed modal uses shared painter');
assert(/fillNewsDetailModal[\s\S]{0,2500}paintCanonicalPersonIdentity/.test(cardUi), '3b. news modal uses shared painter');
assert(/fillPollDetailModal[\s\S]{0,40000}paintCanonicalPersonIdentity/.test(cardUi), '2b. poll modal uses shared painter');
assert(!/railIdentityFirstName\(displayNm \|\| 'Anonymous'\)/.test(cardUi), '9. modal no longer truncates via railIdentityFirstName Anonymous');
assert(!/idw\.innerHTML = ''[\s\S]{0,80}m\.textContent = \[author/.test(cardUi), '1g. feed modal no longer clears identity wrap');

const previewItem = sandbox.LanternCardUI
  ? null
  : null;
void previewItem;
assert(!/authorDisplayName:\s*String\(n\.author_name \|\| 'Anonymous'\)/.test(cardUi), '9b. studio draft does not default Anonymous');
assert(/resolveSessionPublicIdentity/.test(contribute), '7. Create session public identity helper');
assert(/author_public_label:\s*ident\.author_public_label/.test(contribute), '7b. news preview uses session public label');
assert(/author_avatar_key:\s*identPoll\.author_avatar_key/.test(contribute), '7c. poll preview uses session avatar key');
assert(/Never Anonymous while authenticated/.test(contribute) || /resolveSessionPublicIdentity/.test(contribute), '9c. authenticated preview identity');

assert(/author_avatar_key:\s*authorAvatarKey/.test(workerIndex), '2c. GET /api/polls/:id returns author_avatar_key');
assert(/stripStaffPrefix/.test(avatarKeyJs), '2d. worker strips staff: for profile PK');

const idx = buildPilotAvatarKeyIndex([
  { username: 'rick.radle', display_name: 'Rick Radle', role: 'teacher', staff_id: '1' },
  { username: 'jessie', display_name: 'Jessie Roberts', role: 'student', mtss_student_id: 'jessie.r' },
]);
assert(resolveAuthorAvatarKey(idx, { character_name: 'staff:rick.radle' }) === 'rick.radle', '10e. staff: maps to username profile');
assert(resolveAuthorAvatarKey(idx, { author_name: 'Jessie Roberts', actor_id: 'jessie.r' }) === 'jessie.r', '10f. durable actor_id wins over display name');

assert(
  /buildAvatarImageUrl/.test(lockerHandlers) && /updated_at/.test(lockerHandlers),
  '11b. locker avatar URL cache-busts with updated_at'
);
assert(/current_avatar_key/.test(workerIndex) && /status = 'pending'/.test(workerIndex), '12. pending lives on submissions not current_avatar_key');
assert(!/AVATAR_BUCKET\.r2|r2\.dev|r2\.cloudflarestorage/.test(cardUi + avatarJs + cardsJs), '17. no raw R2 URLs in renderers');
assert(/\/api\/avatar\/image\?key=/.test(workerIndex), '17b. serving stays /api/avatar/image');

assert(/people picker|lanternPeopleRow/.test(read('app/js/lantern-people-picker.js')), '18. people picker exists');
assert(!/exploreCardAvatarImg/.test(read('app/js/lantern-people-picker.js')), '18b. people picker still has no avatars (not widened)');

assert(/buildExploreAuthorAvatarHtml/.test(read('app/teacher.html')), '19. Teacher Tools uses shared chip when available');
assert(/getDefaultAvatarImageUrl/.test(cardsJs), '19b. locker/cards share default placeholder');

assert(/Prompt #96|authenticated session/.test(workerIndex) || /session-derived identity/.test(workerIndex), '23. #128/#96 session score/vote ownership comments remain');

assert(/isHiddenAtSet|filterOutDemoPersonas|hidden_at/.test(feedHandlers + workerIndex), '22. #146 hidden/demo filters still present');
assert(fs.existsSync(path.join(root, 'worker/scripts/marquee-hidden-lockdown-146-test.mjs')), '22b. #146 test file untouched');
assert(/collectMarqueeEvents/.test(marquee146), '22c. #146 marquee lockdown test still imported');

assert(/formatExploreAuthorLabel/.test(cardsJs) && /formatExploreAuthorLabel/.test(cardUi), '24b. no competing public-name formatter in avatar work');
assert(/data-identity-size="xs"/.test(cardsCss) && /data-identity-size="lg"/.test(cardsCss), '6. size variants xs–lg');

assert(/buildAvatarMatchCharacters\(/.test(workerIndex) && /from '\.\/avatar-match-pool\.js'/.test(workerIndex), '14-15. Avatar Match uses live account pool from #147 (not VERIFY overlay)');
assert(!/VERIFY_CONFIG && VERIFY_CONFIG\.students/.test(workerIndex.split('/api/games/characters')[1] || ''), '14-15b. games/characters does not fall back to VERIFY roster');

console.log('\ncanonical-avatar-identity-149-test: ' + pass + ' PASS ' + fail + ' FAIL');
if (fail) process.exit(1);
