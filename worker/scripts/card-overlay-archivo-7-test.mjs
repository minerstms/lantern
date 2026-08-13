/**
 * Prompt #7 — Archivo Narrow overlay; avatar ~32/28px; headline/meta structural separation.
 * Usage: node worker/scripts/card-overlay-archivo-7-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cardsJs = fs.readFileSync(path.join(root, 'app/js/lantern-cards.js'), 'utf8');
const cardsCss = fs.readFileSync(path.join(root, 'app/css/lantern-cards.css'), 'utf8');
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

function cssBlock(selector) {
  const re = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]+)\\}');
  const m = cardsCss.match(re);
  return m ? m[1] : '';
}

assert(
  /@import url\("https:\/\/fonts\.googleapis\.com\/css2\?family=Archivo\+Narrow:wght@600;700&display=swap"\)/.test(cardsCss),
  '1. Archivo Narrow loaded (600+700 only)'
);
assert(!/Barlow\+Condensed|Barlow Condensed/.test(cardsCss), '2. Barlow Condensed removed from canonical overlay CSS');
assert(
  /--lantern-card-overlay-font:\s*"Archivo Narrow",\s*"Arial Narrow",\s*Arial,\s*sans-serif/.test(cardsCss),
  '3. overlay font token + fallback stack'
);
assert(/--lantern-card-overlay-avatar-size:\s*32px/.test(cardsCss), '4. desktop avatar ~32px');
assert(!/--lantern-card-overlay-avatar-size:\s*36px/.test(cardsCss), '5. prior 36px desktop avatar removed');
assert(/--lantern-card-overlay-title-meta-gap:\s*3px/.test(cardsCss), '6. title→meta gap token');

const title = cssBlock('.lanternCanonicalCardTitle');
const caption = cssBlock('.lanternCanonicalCardCaption');
const meta = (cardsCss.match(/\.lanternCanonicalCardMeta,\s*\n\.lanternCanonicalCardMetaRow\s*\{([^}]+)\}/) || [])[1] || '';
const desc = (cardsCss.match(/\.lanternCanonicalCardDesc,\s*\n\.lanternCanonicalCardDescRow\s*\{([^}]+)\}/) || [])[1] || '';
const overlay = cssBlock('.lanternCanonicalCardOverlay');
const grid = cssBlock('.lanternCanonicalCardMetaGrid');
const chip = cssBlock('.lanternCanonicalCardMetaGrid > .identity-chip');

assert(/font-family:\s*var\(--lantern-card-overlay-font\)/.test(title), '7. Row 1 uses overlay font');
assert(/font-size:\s*18px/.test(title), '8. Row 1 remains larger (18px)');
assert(/font-weight:\s*700/.test(title), '9. Row 1 weight 700');
assert(/line-height:\s*1\.2/.test(title) && /max-height:\s*1\.2em/.test(title), '10. Row 1 descender-safe line box');
assert(/font-family:\s*var\(--lantern-card-overlay-font\)/.test(meta), '11. Row 2 same family');
assert(/font-size:\s*13px/.test(meta), '12. Row 2 size 13px');
assert(/font-family:\s*var\(--lantern-card-overlay-font\)/.test(desc) && /font-size:\s*13px/.test(desc), '13. Row 3 same family/size');
assert(/gap:\s*var\(--lantern-card-overlay-title-meta-gap/.test(caption), '14. caption uses title-meta gap');
assert(/align-items:\s*start/.test(grid), '15. meta grid align start (no avatar float into title)');
assert(/align-self:\s*start/.test(chip), '16. avatar align-self start under headline');
assert(/overflow:\s*hidden/.test(grid), '17. meta grid clips to its own box');
assert(/flex:\s*0\s+0\s+auto/.test(title), '18. title flex-none (structural separation)');
assert(/max-height:\s*40%/.test(overlay), '19. overlay still near bottom third');
assert(/justify-content:\s*flex-end/.test(overlay), '20. overlay bottom-anchored');
assert(/grid-row:\s*1\s*\/\s*span\s*2/.test(cardsCss), '21. avatar spans Rows 2+3');
assert(/padding-right:\s*44px/.test(caption), '22. flag clearance preserved');
assert(/lanternCanonicalCardTypeBadge/.test(cardsCss), '23. ULHC badge CSS preserved');
assert(!/overflow-x:\s*hidden;\s*\r?\n\s*overflow-y:\s*visible/.test(meta), '24. no spinner overflow mix');

const mobileMq = cardsCss.match(/@media\s*\(\s*max-width:\s*480px\s*\)\s*\{([\s\S]*?)\n\}/);
assert(!!mobileMq, '25. mobile 480px query preserved (#6)');
const mob = mobileMq ? mobileMq[1] : '';
assert(/--lantern-card-overlay-avatar-size:\s*28px/.test(mob), '26. mobile avatar ~28px');
assert(/display:\s*grid\s*!important/.test(mob), '27. mobile MetaGrid forced');
assert(/grid-row:\s*1\s*\/\s*span\s*2/.test(mob), '28. mobile avatar spans 2+3');
assert(/line-height:\s*1\.2/.test(mob), '29. mobile title descender-safe');
assert(/gap:\s*var\(--lantern-card-overlay-title-meta-gap/.test(mob), '30. mobile title-meta gap');

assert(/lantern-cards\.css\?v=/.test(explore), '31. Explore CSS cache-bust');
assert(/lantern-cards\.css\?v=/.test(contribute), '32. Create CSS cache-bust');
assert(/lantern-cards\.css\?v=/.test(locker), '33. My Lantern CSS cache-bust');

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

const descenderTitles = [
  'Dig this - TMS Volleyball is BACK!',
  'Playing Today',
  'Happy Friday',
  'Jumping Jaguars',
];
for (const t of descenderTitles) {
  const face = LC.normalizeFeedItemToFaceModel({
    id: 'news:desc:' + t.slice(0, 8),
    type: 'news',
    title: t,
    body: 'Preview body for overlay geometry.',
    authorPublicLabel: 'Mr. Radle',
    authorRole: 'teacher',
    approvedAt: '2026-08-11T00:00:00.000Z',
    _canonicalAvatar: { imageUrl: '/api/avatar/image?key=x', emoji: '' },
  });
  const html = LC.buildCanonicalCardFaceHtml(face);
  assert(html.indexOf(t) >= 0 || /lanternCanonicalCardTitle/.test(html), '34. headline present: ' + t.slice(0, 20));
  assert(/lanternCanonicalCardMetaGrid/.test(html), '35. MetaGrid below title: ' + t.slice(0, 12));
  assert((html.match(/identity-chip/g) || []).length === 1, '36. one avatar: ' + t.slice(0, 12));
  /* Structural order: title then MetaGrid (avatar cannot precede headline in DOM) */
  assert(
    html.indexOf('lanternCanonicalCardTitle') < html.indexOf('lanternCanonicalCardMetaGrid'),
    '37. DOM order title before meta (no overlap structure): ' + t.slice(0, 12)
  );
}

const shout = LC.normalizeFeedItemToFaceModel({
  id: 'shout_out:a7',
  type: 'shout_out',
  title: 'Thank you, Counselor!',
  body: 'Recognizing: Kristina Vezzani\n\nThank you for everything.',
  authorPublicLabel: 'Mr. Radle',
  authorRole: 'teacher',
  approvedAt: '2026-08-11T00:00:00.000Z',
  contentSlot: { recipient: 'Kristina Vezzani' },
  _canonicalAvatar: { imageUrl: '/api/avatar/image?key=x', emoji: '' },
});
const shoutHtml = LC.buildCanonicalCardFaceHtml(shout);
assert(!/Recognizing:/.test(shoutHtml), '38. Shout-Out Recognizing: absent');
assert(/aria-label="Shout-Out"/.test(shoutHtml), '39. ULHC badge preserved');

const poll = LC.normalizeFeedItemToFaceModel({
  id: 'poll:a7',
  type: 'poll',
  title: 'Would you rather…',
  authorPublicLabel: 'Mr. Radle',
  authorRole: 'teacher',
  approvedAt: '2026-08-11T00:00:00.000Z',
  contentSlot: { choices: ['A', 'B'] },
});
assert(/Tap to vote/.test(LC.buildCanonicalCardFaceHtml(poll)), '40. Poll Tap to vote');

assert(/normalizeFeedItemToFaceModel/.test(feedCard), '41. Explore shared');
assert(/materializeFeedPostCard|LanternCards/.test(contribute), '42. Create shared');
assert(!profileApp || /materializeFeedPostCard/.test(profileApp), '43. My Lantern shared');

console.log('\ncard-overlay-archivo-7-test: ' + pass + ' PASS ' + fail + ' FAIL');
if (fail) process.exit(1);
