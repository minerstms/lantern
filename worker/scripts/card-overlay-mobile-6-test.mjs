/**
 * Prompt #6 — mobile canonical card overlay keeps 3-row MetaGrid + real avatar.
 * Usage: node worker/scripts/card-overlay-mobile-6-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cardsJs = fs.readFileSync(path.join(root, 'app/js/lantern-cards.js'), 'utf8');
const cardsCss = fs.readFileSync(path.join(root, 'app/css/lantern-cards.css'), 'utf8');
const headers = fs.readFileSync(path.join(root, 'app/_headers'), 'utf8');
const explore = fs.readFileSync(path.join(root, 'app/explore.html'), 'utf8');
const contribute = fs.readFileSync(path.join(root, 'app/contribute.html'), 'utf8');
const locker = fs.readFileSync(path.join(root, 'app/locker.html'), 'utf8');
const feedCard = fs.readFileSync(path.join(root, 'app/js/lantern-feed-card.js'), 'utf8');
const profileApp = fs.existsSync(path.join(root, 'app/js/lantern-profile-app.js'))
  ? fs.readFileSync(path.join(root, 'app/js/lantern-profile-app.js'), 'utf8')
  : '';

let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }
function assert(cond, label, detail) { if (cond) ok(label); else bad(label, detail); }

/* Desktop baseline (outside mobile media query) */
assert(/--lantern-card-overlay-avatar-size:\s*32px/.test(cardsCss), '1. desktop avatar token remains 32px');
assert(/max-height:\s*40%/.test(cardsCss), '2. desktop overlay max-height ~bottom third');
assert(/Archivo Narrow/.test(cardsCss), '3. Archivo Narrow preserved');
assert(/grid-row:\s*1\s*\/\s*span\s*2/.test(cardsCss), '4. avatar span Rows 2+3 preserved');
assert(!/overflow-x:\s*hidden;\s*\r?\n\s*overflow-y:\s*visible/.test(
  (cardsCss.match(/\.lanternCanonicalCardMeta,\s*\n\.lanternCanonicalCardMetaRow\s*\{[^}]+\}/) || [''])[0]
), '5. no #5 overflow-x/y mix regression');

const mobileMq = cardsCss.match(/@media\s*\(\s*max-width:\s*480px\s*\)\s*\{([\s\S]*?)\n\}/);
assert(!!mobileMq, '6. mobile max-width 480px media query present');
const mob = mobileMq ? mobileMq[1] : '';
assert(/--lantern-card-overlay-avatar-size:\s*28px/.test(mob), '7. mobile avatar ~28px');
assert(/max-height:\s*50%/.test(mob), '8. mobile overlay room increased (prevent Row 3 clip)');
assert(/display:\s*grid\s*!important/.test(mob), '9. mobile MetaGrid forced to grid');
assert(/grid-row:\s*1\s*\/\s*span\s*2/.test(mob), '10. mobile avatar spans Rows 2+3');
assert(/lanternCanonicalCardMetaRow/.test(mob) && /grid-row:\s*1/.test(mob), '11. mobile Row 2 grid placement');
assert(/lanternCanonicalCardDescRow/.test(mob) && /grid-row:\s*2/.test(mob), '12. mobile Row 3 grid placement');
assert(/display:\s*block\s*!important/.test(mob), '13. mobile DescRow stays block (no merge)');
assert(/text-size-adjust:\s*100%/.test(mob), '14. mobile text-size-adjust locks inflation');
assert(/font-family:\s*var\(--lantern-card-overlay-font\)/.test(mob), '15. mobile keeps overlay font token');
assert(/padding-right:\s*44px/.test(mob), '16. mobile flag clearance preserved');

assert(/\/css\/\*/.test(headers) && /Cache-Control:\s*no-cache/.test(headers), '17. CSS revalidate in _headers');
assert(/lantern-cards\.css\?v=20260812-cardoverlay7/.test(explore), '18. Explore cache-busts card CSS');
assert(/lantern-cards\.css\?v=20260812-cardoverlay7/.test(contribute), '19. Create cache-busts card CSS');
assert(/lantern-cards\.css\?v=20260812-cardoverlay7/.test(locker), '20. My Lantern cache-busts card CSS');

const sandbox = {
  console,
  document: {
    createElement() {
      const stub = {
        _html: '',
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

const shout = LC.normalizeFeedItemToFaceModel({
  id: 'shout_out:m6',
  type: 'shout_out',
  title: 'The Boys of Fall',
  body: 'Recognizing: TMS Football\n\nTMS Football is underway!',
  authorPublicLabel: 'Rick R.',
  authorRole: 'student',
  approvedAt: '2026-08-11T00:00:00.000Z',
  contentSlot: { recipient: 'TMS Football' },
  _canonicalAvatar: { imageUrl: '/api/avatar/image?key=x', emoji: '' },
});
const shoutHtml = LC.buildCanonicalCardFaceHtml(shout);
assert(/lanternCanonicalCardTitle/.test(shoutHtml) && /The Boys of Fall/.test(shoutHtml), '21. Row 1 headline');
assert(/lanternCanonicalCardMetaRow/.test(shoutHtml) && /Rick R\./.test(shoutHtml), '22. Row 2 author');
assert(/lanternCanonicalCardDescRow/.test(shoutHtml), '23. Row 3 context element');
assert((shoutHtml.match(/identity-chip/g) || []).length === 1, '24. avatar exactly once');
assert(/lanternCanonicalCardMetaGrid/.test(shoutHtml), '25. MetaGrid wraps Rows 2+3');
assert(!/Recognizing:/.test(shoutHtml), '26. Shout-Out Recognizing: absent');
assert(/TMS Football/.test(shoutHtml), '27. Shout-Out party/context present');

const poll = LC.normalizeFeedItemToFaceModel({
  id: 'poll:m6',
  type: 'poll',
  title: 'fdas',
  authorPublicLabel: 'Rick R.',
  authorRole: 'student',
  approvedAt: '2026-08-11T00:00:00.000Z',
  contentSlot: { choices: ['A', 'B'] },
  _canonicalAvatar: { imageUrl: '/api/avatar/image?key=y', emoji: '' },
});
const pollHtml = LC.buildCanonicalCardFaceHtml(poll);
assert(/Tap to vote/.test(pollHtml), '28. Poll Tap to vote');
assert(!/▲|▼|type="number"/.test(pollHtml), '29. no spinner controls in face HTML');

assert(/normalizeFeedItemToFaceModel/.test(feedCard), '30. Explore shared compositor');
assert(/materializeFeedPostCard|LanternCards/.test(contribute), '31. Create shared cards');
assert(!profileApp || /materializeFeedPostCard/.test(profileApp), '32. My Lantern shared cards');

/* Breakpoint coverage markers for 320–412 (all under 480px query) */
assert(/max-width:\s*480px/.test(cardsCss), '33. 320–412px covered by 480px breakpoint');

console.log('\ncard-overlay-mobile-6-test: ' + pass + ' PASS ' + fail + ' FAIL');
if (fail) process.exit(1);
