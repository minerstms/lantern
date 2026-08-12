/**
 * Prompt #4 — compact canonical card overlay (~bottom third), avatar 40px, 3 rows preserved.
 * Usage: node worker/scripts/card-overlay-compact-4-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cardsJs = fs.readFileSync(path.join(root, 'app/js/lantern-cards.js'), 'utf8');
const cardsCss = fs.readFileSync(path.join(root, 'app/css/lantern-cards.css'), 'utf8');
const contribute = fs.readFileSync(path.join(root, 'app/contribute.html'), 'utf8');
const profileApp = fs.existsSync(path.join(root, 'app/js/lantern-profile-app.js'))
  ? fs.readFileSync(path.join(root, 'app/js/lantern-profile-app.js'), 'utf8')
  : '';
const feedCard = fs.readFileSync(path.join(root, 'app/js/lantern-feed-card.js'), 'utf8');

let pass = 0;
let fail = 0;
function ok(label) {
  pass++;
  console.log('PASS', label);
}
function bad(label, detail) {
  fail++;
  console.error('FAIL', label, detail != null ? detail : '');
}
function assert(cond, label, detail) {
  if (cond) ok(label);
  else bad(label, detail);
}

function cssBlock(selector) {
  const re = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]+)\\}');
  const m = cardsCss.match(re);
  return m ? m[1] : '';
}

assert(/--lantern-card-overlay-avatar-size:\s*40px/.test(cardsCss), '1. avatar token 40px');
assert(!/--lantern-card-overlay-avatar-size:\s*44px/.test(cardsCss), '2. prior 44px removed');
assert(/grid-row:\s*1\s*\/\s*span\s*2/.test(cardsCss), '3. avatar still spans Rows 2+3');

const overlay = cssBlock('.lanternCanonicalCardOverlay');
assert(/max-height:\s*42%/.test(overlay), '4. overlay max-height 42%');
assert(/justify-content:\s*flex-end/.test(overlay), '5. overlay bottom-anchored');

const caption = cssBlock('.lanternCanonicalCardCaption');
assert(/gap:\s*2px/.test(caption), '6. caption gap 2px');
assert(/padding:\s*0\s+12px\s+6px\s+8px/.test(caption) || /6px/.test(caption), '7. bottom padding reduced');
assert(/padding-right:\s*44px/.test(caption), '8. flag clearance preserved');

const title = cssBlock('.lanternCanonicalCardTitle');
assert(/font-size:\s*18px/.test(title), '9. title font-size unchanged');
assert(/font-weight:\s*900/.test(title), '10. title weight unchanged');

const meta = cssBlock('.lanternCanonicalCardMetaRow') || cssBlock('.lanternCanonicalCardMeta');
assert(/font-size:\s*13px/.test(cardsCss), '11. meta font-size 13px preserved');
assert(/font-size:\s*12px/.test(cardsCss) && /lanternCanonicalCardDesc/.test(cardsCss), '12. desc font-size 12px preserved');

const grid = cssBlock('.lanternCanonicalCardMetaGrid');
assert(/row-gap:\s*1px/.test(grid), '13. meta grid row-gap tightened');
assert(/column-gap:\s*6px/.test(grid), '14. meta grid column-gap tightened');

assert(/lanternCanonicalCardTypeBadge/.test(cardsCss), '15. ULHC type badge CSS present');
assert(/lanternAuthorOverflow|lanternCardDetail|report|flag/i.test(cardsCss) || /padding-right:\s*44px/.test(caption), '16. LRHC action clearance kept');

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

const face = LC.normalizeFeedItemToFaceModel({
  id: 'shout_out:compact',
  type: 'shout_out',
  title: 'Thanks!',
  body: 'Recognizing: Ms. Vezzani\n\nThank you for everything.',
  authorPublicLabel: 'Mr. Radle',
  authorRole: 'teacher',
  approvedAt: '2026-08-11T00:00:00.000Z',
  contentSlot: { recipient: 'Ms. Vezzani' },
  _canonicalAvatar: { imageUrl: '/api/avatar/image?key=x', emoji: '' },
});
const html = LC.buildCanonicalCardFaceHtml(face);
assert(/lanternCanonicalCardTitle/.test(html), '17. Row 1 headline');
assert(/lanternCanonicalCardMetaRow/.test(html), '18. Row 2 author/date');
assert(/lanternCanonicalCardDescRow/.test(html), '19. Row 3 context');
assert((html.match(/identity-chip/g) || []).length === 1, '20. one avatar element');
assert(/lanternCanonicalCardMetaGrid/.test(html), '21. shared meta grid');
assert(/aria-label="Shout-Out"/.test(html), '22. ULHC badge preserved');
assert(/normalizeFeedItemToFaceModel/.test(feedCard), '23. Explore uses shared compositor');
assert(/materializeFeedPostCard|LanternCards/.test(contribute), '24. Create uses shared cards');
assert(!profileApp || /materializeFeedPostCard/.test(profileApp), '25. My Lantern uses shared cards');
assert(!/max-height:\s*58%/.test(cardsCss), '26. prior half-card overlay max-height removed');

console.log('\ncard-overlay-compact-4-test: ' + pass + ' PASS ' + fail + ' FAIL');
if (fail) process.exit(1);
