/**
 * Prompt #5/#7 — overlay typography contract (Archivo Narrow superseded Barlow Condensed).
 * Retained filename for continuity with Prompt #5 regressions.
 * Usage: node worker/scripts/card-overlay-barlow-5-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cardsJs = fs.readFileSync(path.join(root, 'app/js/lantern-cards.js'), 'utf8');
const cardsCss = fs.readFileSync(path.join(root, 'app/css/lantern-cards.css'), 'utf8');
const contribute = fs.readFileSync(path.join(root, 'app/contribute.html'), 'utf8');
const feedCard = fs.readFileSync(path.join(root, 'app/js/lantern-feed-card.js'), 'utf8');
const profileApp = fs.existsSync(path.join(root, 'app/js/lantern-profile-app.js'))
  ? fs.readFileSync(path.join(root, 'app/js/lantern-profile-app.js'), 'utf8')
  : '';

let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }
function assert(cond, label, detail) { if (cond) ok(label); else bad(label, detail); }

function cssBlock(selector) {
  const re = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]+)\\}');
  const m = cardsCss.match(re);
  return m ? m[1] : '';
}

assert(
  /@import url\("https:\/\/fonts\.googleapis\.com\/css2\?family=Archivo\+Narrow:wght@600;700&display=swap"\)/.test(cardsCss),
  '1. Archivo Narrow loaded (600+700 only)'
);
assert(
  /--lantern-card-overlay-font:\s*"Archivo Narrow",\s*"Arial Narrow",\s*Arial,\s*sans-serif/.test(cardsCss),
  '2. overlay font token + fallback stack'
);
assert(/--lantern-card-overlay-avatar-size:\s*32px/.test(cardsCss), '3. avatar token ~32px');
assert(!/--lantern-card-overlay-avatar-size:\s*40px/.test(cardsCss), '4. prior 40px avatar removed');
assert(!/--lantern-card-overlay-avatar-size:\s*44px/.test(cardsCss), '5. prior 44px avatar removed');
assert(!/Barlow Condensed|Barlow\+Condensed/.test(cardsCss), '5b. Barlow Condensed removed from overlay');

const title = cssBlock('.lanternCanonicalCardTitle');
const caption = cssBlock('.lanternCanonicalCardCaption');
const meta = (cardsCss.match(/\.lanternCanonicalCardMeta,\s*\n\.lanternCanonicalCardMetaRow\s*\{([^}]+)\}/) || [])[1] || '';
const desc = (cardsCss.match(/\.lanternCanonicalCardDesc,\s*\n\.lanternCanonicalCardDescRow\s*\{([^}]+)\}/) || [])[1] || '';
const overlay = cssBlock('.lanternCanonicalCardOverlay');
const grid = cssBlock('.lanternCanonicalCardMetaGrid');

assert(/font-family:\s*var\(--lantern-card-overlay-font\)/.test(title), '6. Row 1 uses overlay font family');
assert(/font-size:\s*18px/.test(title), '7. Row 1 remains larger (18px)');
assert(/font-weight:\s*700/.test(title), '8. Row 1 weight 700');
assert(/-webkit-line-clamp:\s*1/.test(title) && /line-clamp:\s*1/.test(title), '9. headline clamp preserved');
assert(/line-height:\s*1\.2/.test(title), '10. Row 1 descender-safe line-height');

assert(/font-family:\s*var\(--lantern-card-overlay-font\)/.test(caption), '11. caption inherits overlay font');
assert(/font-family:\s*var\(--lantern-card-overlay-font\)/.test(meta), '12. Row 2 uses same family');
assert(/font-size:\s*13px/.test(meta), '13. Row 2 size 13px');
assert(/font-weight:\s*600/.test(meta), '14. Row 2 weight 600');
assert(/font-family:\s*var\(--lantern-card-overlay-font\)/.test(desc), '15. Row 3 uses same family');
assert(/font-size:\s*13px/.test(desc), '16. Row 3 size 13px (same as Row 2)');
assert(/font-weight:\s*600/.test(desc), '17. Row 3 weight 600');
assert(/line-height:\s*1\.1/.test(meta) && /line-height:\s*1\.1/.test(desc), '18. Rows 2/3 compact line-height');
assert(
  /font-size:\s*13px/.test(meta) && /font-size:\s*13px/.test(desc) && /font-family:\s*var\(--lantern-card-overlay-font\)/.test(meta) && /font-family:\s*var\(--lantern-card-overlay-font\)/.test(desc),
  '18b. Rows 2/3 same family + same size'
);

assert(/max-height:\s*40%/.test(overlay), '19. overlay max-height approaches bottom third');
assert(/justify-content:\s*flex-end/.test(overlay), '20. overlay bottom-anchored');
assert(/title-meta-gap|gap:\s*var\(--lantern-card-overlay-title-meta-gap/.test(caption), '21. caption title-meta gap');
assert(/padding:\s*0\s+10px\s+4px\s+6px/.test(caption), '22. caption padding compressed');
assert(/padding-right:\s*44px/.test(caption), '23. flag clearance preserved');
assert(/row-gap:\s*0/.test(grid), '24. meta grid row-gap 0');
assert(/grid-row:\s*1\s*\/\s*span\s*2/.test(cardsCss), '25. one avatar spans Rows 2+3');

assert(
  /overflow:\s*hidden/.test(meta) && !/^\s*overflow-y:\s*visible/m.test(meta),
  '26. meta uses overflow:hidden (no overflow-x/y mix → no ▲/▼ scroll chrome)'
);
assert(/^\s*overflow:\s*hidden/m.test(caption), '27. caption overflow:hidden (no scroll chrome)');
assert(!/▲|▼/.test(cardsJs), '28. no literal up/down glyphs in card JS');
assert(/lanternCanonicalCardTypeBadge/.test(cardsCss), '29. ULHC type badge CSS preserved');
assert(!/overflow-x:\s*hidden;\s*\n\s*overflow-y:\s*visible/.test(cardsCss.match(/\.lanternCanonicalCardMeta[\s\S]*?\{[^}]+\}/)?.[0] || ''), '30. meta no longer mixes overflow-x/y');

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
  id: 'shout_out:barlow5',
  type: 'shout_out',
  title: 'Thank you, Counselor!',
  body: 'Recognizing: Kristina Vezzani\n\nThank you for everything.',
  authorPublicLabel: 'Mr. Radle',
  authorRole: 'teacher',
  approvedAt: '2026-08-11T00:00:00.000Z',
  contentSlot: { recipient: 'Kristina Vezzani' },
  _canonicalAvatar: { imageUrl: '/api/avatar/image?key=x', emoji: '' },
});
const html = LC.buildCanonicalCardFaceHtml(face);
assert(/lanternCanonicalCardTitle/.test(html), '31. Row 1 present');
assert(/lanternCanonicalCardMetaRow/.test(html), '32. Row 2 present');
assert(/lanternCanonicalCardDescRow/.test(html), '33. Row 3 present');
assert((html.match(/identity-chip/g) || []).length === 1, '34. single avatar element');
assert(/aria-label="Shout-Out"/.test(html), '35. ULHC badge preserved');
assert(!/▲|▼|type="number"/.test(html), '36. face HTML has no spinner/▲▼ controls');
assert(/lanternAuthorOverflow|lanternCardDetail|report|flag/i.test(cardsCss) || /padding-right:\s*44px/.test(caption), '37. LRHC flag clearance kept');

assert(/normalizeFeedItemToFaceModel/.test(feedCard), '38. Explore shares compositor');
assert(/materializeFeedPostCard|LanternCards/.test(contribute), '39. Create shares cards');
assert(!profileApp || /materializeFeedPostCard/.test(profileApp), '40. My Lantern shares cards');
assert(/Archivo Narrow/.test(cardsCss) && !/font-weight:\s*900/.test(title), '41. headline not ultra-wide 900 system weight');

console.log('\ncard-overlay-barlow-5-test: ' + pass + ' PASS ' + fail + ' FAIL');
if (fail) process.exit(1);
