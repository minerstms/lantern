/**
 * Prompt #225 — canonical card avatar spans Rows 2+3 in the three-row overlay.
 * Usage: node worker/scripts/card-overlay-avatar-span-225-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cardsJs = fs.readFileSync(path.join(root, 'app/js/lantern-cards.js'), 'utf8');
const cardsCss = fs.readFileSync(path.join(root, 'app/css/lantern-cards.css'), 'utf8');
const contribute = fs.readFileSync(path.join(root, 'app/contribute.html'), 'utf8');
const myLantern = fs.existsSync(path.join(root, 'app/js/lantern-profile-app.js'))
  ? fs.readFileSync(path.join(root, 'app/js/lantern-profile-app.js'), 'utf8')
  : '';
const feedExplore = '';

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
vm.runInContext(cardsJs, sandbox);
const LC = sandbox.LanternCards;

assert(/--lantern-card-overlay-avatar-size:\s*36px/.test(cardsCss), '1. overlay avatar token ~36px (Prompt #5 compact)');
assert(/lanternCanonicalCardMetaGrid/.test(cardsCss), '2. meta grid CSS present');
assert(/grid-row:\s*1\s*\/\s*span\s*2/.test(cardsCss), '3. avatar spans rows 2+3');
assert(/padding-right:\s*44px/.test(cardsCss), '4. flag clearance padding preserved');
assert(/max-height:\s*38%/.test(cardsCss), '4b. overlay max-height ~bottom third');
assert(/gap:\s*1px/.test(cardsCss.match(/\.lanternCanonicalCardCaption\s*\{[^}]+\}/)?.[0] || ''), '4c. caption gap tightened');
assert(!/--lantern-card-overlay-avatar-size:\s*44px/.test(cardsCss), '4d. prior 44px avatar size removed');
assert(/font-size:\s*18px/.test(cardsCss.match(/\.lanternCanonicalCardTitle\s*\{[^}]+\}/)?.[0] || ''), '4e. title font size preserved');
assert(/font-size:\s*13px/.test(cardsCss.match(/\.lanternCanonicalCardMeta,\s*\n\.lanternCanonicalCardMetaRow\s*\{[^}]+\}/)?.[0] || cardsCss), '4f. meta font size preserved');
assert(/font-size:\s*13px/.test(cardsCss.match(/\.lanternCanonicalCardDesc,\s*\n\.lanternCanonicalCardDescRow\s*\{[^}]+\}/)?.[0] || cardsCss), '4g. desc font size matches meta (13px)');
assert(/Barlow Condensed/.test(cardsCss), '4h. Barlow Condensed on overlay');

const shout = LC.normalizeFeedItemToFaceModel({
  id: 'shout_out:1',
  type: 'shout_out',
  title: 'Thank you, Counselor!',
  body: 'Recognizing: Ms. Vezzani\n\nThank you for everything you do for our students.',
  authorDisplayName: 'Rick Radle',
  authorPublicLabel: 'Mr. Radle',
  authorRole: 'teacher',
  authorAvatarKey: 'rick.radle',
  approvedAt: '2026-08-11T00:00:00.000Z',
  contentSlot: { recipient: 'Ms. Vezzani' },
  _canonicalAvatar: { imageUrl: '/api/avatar/image?key=avatars%2Fav-rick.png&v=1', emoji: '' },
});
const shoutHtml = LC.buildCanonicalCardFaceHtml(shout);
assert(/lanternCanonicalCardTitle/.test(shoutHtml) && /Thank you, Counselor!/.test(shoutHtml), '5. Row 1 headline');
assert(/lanternCanonicalCardMetaGrid/.test(shoutHtml), '6. MetaGrid wraps Rows 2+3');
assert((shoutHtml.match(/identity-chip/g) || []).length === 1, '7. avatar appears only once');
assert(/identity-chip[\s\S]*lanternCanonicalCardMetaRow[\s\S]*lanternCanonicalCardDescRow/.test(shoutHtml)
  || /identity-chip[\s\S]*lanternCanonicalCardMetaRow/.test(shoutHtml), '8. avatar precedes meta/desc in grid');
assert(/Mr\. Radle/.test(shoutHtml) && /8\/1[01]\/26/.test(shoutHtml), '9. Row 2 author + date');
assert(shoutHtml.indexOf('Recognizing:') < 0, '10. Shout-Out omits Recognizing:');
assert(/Ms\. Vezzani/.test(shoutHtml) && /Thank you for everything/.test(shoutHtml), '11. Row 3 party + message');
assert(/\/api\/avatar\/image\?key=/.test(shoutHtml), '12. real canonical avatar preserved');
assert(/aria-label="Shout-Out"/.test(shoutHtml) && /📣/.test(shoutHtml), '13. ULHC type badge preserved');

const news = LC.normalizeFeedItemToFaceModel({
  id: 'news:1',
  type: 'news',
  title: 'Welcome Coach Colorado!',
  body: "Welcome to Trinidad, Coach! We're excited to have you.",
  authorDisplayName: 'Rick Radle',
  authorPublicLabel: 'Mr. Radle',
  authorRole: 'teacher',
  authorAvatarKey: 'rick.radle',
  approvedAt: '2026-08-11T00:00:00.000Z',
});
const newsHtml = LC.buildCanonicalCardFaceHtml(news);
assert(/Welcome Coach Colorado!/.test(newsHtml), '14. News headline Row 1');
assert(/Welcome to Trinidad/.test(newsHtml), '15. News body preview Row 3');
assert(/aria-label="News"/.test(newsHtml), '16. News badge');

const poll = LC.normalizeFeedItemToFaceModel({
  id: 'poll:1',
  type: 'poll',
  title: 'Would you rather be able to…',
  authorDisplayName: 'Rick Radle',
  authorPublicLabel: 'Mr. Radle',
  authorRole: 'teacher',
  approvedAt: '2026-08-11T00:00:00.000Z',
  contentSlot: { choices: ['Pause time', 'Rewind time', 'Fast-forward time'] },
});
const pollHtml = LC.buildCanonicalCardFaceHtml(poll);
assert(/Tap to vote/.test(pollHtml), '17. Poll Row 3 context');
assert(!/Pause time/.test(pollHtml), '18. Poll choices not flattened into Row 3');
assert(/aria-label="Poll"/.test(pollHtml) && /📊/.test(pollHtml), '19. Poll badge');

assert(/exploreOverlay:\s*true/.test(cardsJs), '20. shared face models use exploreOverlay');
assert(/getAdoptedAccountKey/.test(contribute) && /attachCanonicalAvatarsToItems/.test(contribute), '21. Create mock uses canonical avatar attach');
assert(/normalizeFeedItemToFaceModel|buildCanonicalCardFaceHtml|LanternCards|materializeFeedPostCard/.test(contribute), '22. Create preview uses shared card renderer');
assert(!myLantern || /lantern-cards\.js|LanternCards/.test(myLantern), '23. My Lantern loads shared cards');
const feedCard = fs.readFileSync(path.join(root, 'app/js/lantern-feed-card.js'), 'utf8');
const profileApp = fs.existsSync(path.join(root, 'app/js/lantern-profile-app.js'))
  ? fs.readFileSync(path.join(root, 'app/js/lantern-profile-app.js'), 'utf8')
  : '';
assert(/normalizeFeedItemToFaceModel/.test(feedCard) && /feedExploreCard/.test(feedCard), '24. Explore feed card uses shared compositor');
assert(!profileApp || /materializeFeedPostCard/.test(profileApp), '24b. My Lantern/profile rails use shared cards');
assert(/--lantern-content-author-avatar-size:\s*28px/.test(cardsCss), '25. ticker chip size token preserved');

console.log('\ncard-overlay-avatar-span-225-test: ' + pass + ' PASS ' + fail + ' FAIL');
if (fail) process.exit(1);
