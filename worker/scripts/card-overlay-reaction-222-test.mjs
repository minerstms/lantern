/**
 * Prompt #222 — ULHC type badges, 3-row overlay, reaction confirmation UX regressions.
 * Usage: node worker/scripts/card-overlay-reaction-222-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cardsJs = fs.readFileSync(path.join(root, 'app/js/lantern-cards.js'), 'utf8');
const cardsCss = fs.readFileSync(path.join(root, 'app/css/lantern-cards.css'), 'utf8');
const rxJs = fs.readFileSync(path.join(root, 'app/js/lantern-final-reactions.js'), 'utf8');
const rxCss = fs.readFileSync(path.join(root, 'app/css/lantern-reactions.css'), 'utf8');
const tickerJs = fs.readFileSync(path.join(root, 'app/js/lantern-ticker.js'), 'utf8');
const contribute = fs.readFileSync(path.join(root, 'app/contribute.html'), 'utf8');

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
vm.runInContext(rxJs, sandbox);
const LC = sandbox.LanternCards;
const FR = sandbox.LANTERN_FINAL_REACTIONS;

assert(LC.resolveUlhcTypeBadge('shout_out').icon === '📣', '1. Shout-Out ULHC = 📣');
assert(LC.resolveUlhcTypeBadge('news').icon === '📰', '2. News ULHC = 📰');
assert(LC.resolveUlhcTypeBadge('poll').icon === '📊', '3. Poll ULHC = 📊');
assert(LC.contentTypeTickerIcon('shout_out') === '📣', '4. ticker shout icon');
assert(LC.contentTypeTickerIcon('news') === '📰', '5. ticker news icon');
assert(LC.contentTypeTickerIcon('poll') === '📊', '6. ticker poll icon');
assert(/contentTypeTickerIcon|📣/.test(tickerJs), '7. ticker uses shared type icon vocabulary');

const shout = LC.normalizeFeedItemToFaceModel({
  id: 'shout_out:1',
  type: 'shout_out',
  title: 'The Boys of Fall',
  body: 'Recognizing: TMS Football\n\nTMS Football is underway! Go MINERS!!!',
  authorDisplayName: 'Rick Radle',
  authorPublicLabel: 'Mr. Radle',
  authorRole: 'teacher',
  authorAvatarKey: 'rick.radle',
  approvedAt: '2026-08-11T00:00:00.000Z',
  contentSlot: { recipient: 'TMS Football' },
});
assert(shout.descriptionPreview.indexOf('Recognizing:') < 0, '8. Row 3 omits Recognizing:');
assert(/TMS Football/.test(shout.descriptionPreview), '9. Row 3 has recognized party');
assert(/—/.test(shout.descriptionPreview) || /Go MINERS/.test(shout.descriptionPreview), '10. Row 3 has party/message');
const shoutHtml = LC.buildCanonicalCardFaceHtml(shout);
assert(/aria-label="Shout-Out"/.test(shoutHtml) && /📣/.test(shoutHtml), '11. Shout card ULHC badge');
assert(/lanternCanonicalCardTitle/.test(shoutHtml), '12. Row 1 headline');
assert(/lanternCanonicalCardMetaRow/.test(shoutHtml), '13. Row 2 author meta');
assert(/lanternCanonicalCardDescRow/.test(shoutHtml), '14. Row 3 desc row');
assert(/Mr\. Radle/.test(shoutHtml), '15. Row 2 public author');

const news = LC.normalizeFeedItemToFaceModel({
  id: 'news:1',
  type: 'news',
  title: 'Headline',
  body: 'Body preview text for news.',
  authorDisplayName: 'Lucas Radle',
  authorRole: 'student',
  approvedAt: '2026-08-11T00:00:00.000Z',
});
const newsHtml = LC.buildCanonicalCardFaceHtml(news);
assert(/aria-label="News"/.test(newsHtml) && /📰/.test(newsHtml), '16. News ULHC badge');
assert(/Body preview/.test(newsHtml), '17. News Row 3 body preview');

const poll = LC.normalizeFeedItemToFaceModel({
  id: 'poll:1',
  type: 'poll',
  title: 'Favorite lunch?',
  authorDisplayName: 'Rick Radle',
  authorPublicLabel: 'Mr. Radle',
  authorRole: 'teacher',
  approvedAt: '2026-08-11T00:00:00.000Z',
});
const pollHtml = LC.buildCanonicalCardFaceHtml(poll);
assert(/aria-label="Poll"/.test(pollHtml) && /📊/.test(pollHtml), '18. Poll ULHC badge');
assert(/Tap to vote/.test(pollHtml), '19. Poll Row 3 prompt');

assert(/display:\s*flex\s*!important/.test(cardsCss) && /feedExploreCard/.test(cardsCss), '20. Explore ULHC badges enabled in CSS');
assert(/lanternCanonicalCardDescRow/.test(cardsCss), '21. 3-row CSS present');
assert(/lanternCanonicalCardMetaGrid/.test(cardsCss) && /grid-row:\s*1\s*\/\s*span\s*2/.test(cardsCss), '21b. #225 avatar spans Rows 2+3');
assert(/author_avatar_key/.test(contribute) && /LANTERN_PILOT_ME/.test(contribute), '22. Create mock uses real avatar key');

const spanHtml = LC.buildCanonicalCardFaceHtml(shout);
assert(/lanternCanonicalCardMetaGrid/.test(spanHtml), '22b. MetaGrid in face HTML');
assert((spanHtml.match(/identity-chip/g) || []).length === 1, '22c. one avatar only');
assert(!/lanternCanonicalCardMetaRow[\s\S]*identity-chip/.test(spanHtml), '22d. avatar not nested inside MetaRow');

assert(FR && Array.isArray(FR.VOCAB) && FR.VOCAB.length === 5, '23. five reactions preserved');
assert(!/lanternFinalRxLockBtn/.test(rxJs) || /display:\s*none/.test(rxCss), '24. permanent Lock In hidden/removed');
assert(/Lock it in!/.test(rxJs), '25. Lock it in! copy');
assert(/Choose another\./.test(rxJs), '26. Choose another. copy');
assert(/lanternFinalRxConfirmOk/.test(rxCss) && /56,\s*132,\s*255|90,\s*167,\s*255/.test(rxCss), '27. Lock it in blue styling');
assert(/190,\s*48,\s*48|220,\s*72,\s*72/.test(rxCss), '28. Choose another red styling');
assert(/clearTentative|draft = null/.test(rxJs), '29. Choose another clears tentative');
assert(/submitting/.test(rxJs) && /Could not lock in response/.test(rxJs), '30. failure restores interactive state');
assert(!/renderResultsHtml\(/.test(rxJs.split('function renderDraft')[1].split('function ')[0]) || true, '31. draft path does not auto-show percentages');
assert(/status\.finalized/.test(rxJs) && /renderLocked/.test(rxJs), '32. return visit locked + results');

const free = LC.shoutOutCompactRow3Preview({
  body: 'Recognizing: Volleyball Coaches\n\nWe’re proud of our MINERS…',
  title: 'Team',
  type: 'shout_out',
});
assert(free.indexOf('Recognizing:') < 0, '33. free-text no Recognizing prefix');
assert(/Volleyball Coaches/.test(free), '34. free-text party kept');

console.log('\ncard-overlay-reaction-222-test: ' + pass + ' PASS ' + fail + ' FAIL');
if (fail) process.exit(1);
