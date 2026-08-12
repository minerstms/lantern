/**
 * Prompt #217 — content author avatars (ticker + LLHC) + Shout-Out recognized-party compact meta.
 * Usage: node worker/scripts/content-author-avatar-217-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cardsJs = fs.readFileSync(path.join(root, 'app/js/lantern-cards.js'), 'utf8');
const cardsCss = fs.readFileSync(path.join(root, 'app/css/lantern-cards.css'), 'utf8');
const tickerJs = fs.readFileSync(path.join(root, 'app/js/lantern-ticker.js'), 'utf8');
const tickerCss = fs.readFileSync(path.join(root, 'app/css/lantern-ticker.css'), 'utf8');

let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }
function assert(cond, label, detail) { if (cond) ok(label); else bad(label, detail); }

assert(/--lantern-content-author-avatar-size:\s*28px/.test(cardsCss), '1. shared author avatar token 28px');
assert(/var\(--lantern-content-author-avatar-size/.test(tickerCss), '2. ticker avatar uses shared size token');
assert(/var\(--lantern-content-author-avatar-size/.test(cardsCss), '3. LLHC avatar uses shared size token');
assert(!/\.lanternCanonicalCardMeta\s+\.exploreCardAvatarImg[\s\S]{0,80}15px/.test(cardsCss), '4. LLHC no longer stuck at 15px');
assert(/padding:\s*0\s+14px\s+12px\s+14px/.test(cardsCss), '5. LLHC caption inset from edges');

assert(/avatarEmoji[\s\S]{0,200}🌟/.test(tickerJs) && /lanternTickerItemAvatar--emoji/.test(tickerJs), '6. ticker always renders second avatar slot with fallback');

const sandbox = {
  console,
  document: {
    createElement() {
      return {
        _html: '',
        firstElementChild: null,
        classList: { _s: new Set(), contains() { return false; }, add() {} },
        setAttribute() {},
        getAttribute() { return null; },
        querySelector() { return null; },
        set innerHTML(v) { this._html = String(v || ''); },
        get innerHTML() { return this._html; },
      };
    },
  },
  window: undefined,
  LanternMedia: undefined,
  LANTERN_AVATAR_API: '',
  location: { href: '' },
  open() {},
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(cardsJs, sandbox);
const LC = sandbox.LanternCards;

assert(typeof LC.shoutOutRecognizedPartyLabel === 'function', '7. shoutOutRecognizedPartyLabel exported');

assert(
  LC.shoutOutRecognizedPartyLabel({ contentSlot: { recipient: 'Rick Radle' } }) === 'Rick Radle',
  '8. slot recipient wins'
);
assert(
  LC.shoutOutRecognizedPartyLabel({ body: 'Recognizing: Volleyball Coaches\n\nNice work' }) === 'Volleyball Coaches',
  '9. Recognizing: stripped for free text'
);
assert(
  LC.shoutOutRecognizedPartyLabel({ body: 'For Lucas', contentSlot: {} }) === 'Lucas',
  '10. For-prefix teacher shout body'
);
assert(LC.shoutOutRecognizedPartyLabel({ body: 'Just thanks', summary: 'Just thanks' }) === '', '11. missing recognition → empty');

const person = LC.normalizeFeedItemToFaceModel({
  type: 'shout_out',
  title: 'Shout',
  authorDisplayName: 'Rick Radle',
  body: 'Recognizing: Rick Radle\n\nYou rock',
  summary: 'Recognizing: Rick Radle\n\nYou rock',
  contentSlot: { recipient: 'Rick Radle' },
  approvedAt: '2026-08-11T00:00:00.000Z',
});
assert(person.descriptionPreview === 'Rick Radle', '12. face model recognized party only');
const personHtml = LC.buildCanonicalCardFaceHtml(person);
assert(/Rick R\./.test(personHtml), '13. author compact preserved');
assert(/lanternCanonicalCardDesc[^>]*>Rick Radle</.test(personHtml), '14. recognized party in desc slot');
assert(!/Recognizing:/.test(personHtml), '15. no Recognizing: in compact HTML');

const withAvatar = LC.buildCanonicalCardFaceHtml({
  exploreOverlay: true,
  title: 'Hello',
  author: 'Zane Morris',
  character_name: 'Zane Morris',
  dateMeta: '8/11/26',
  descriptionPreview: 'Coast news',
  _canonicalAvatar: { imageUrl: 'https://example.com/a.png', emoji: '🌟' },
});
assert(/identity-chip/.test(withAvatar) && /exploreCardAvatarImg/.test(withAvatar), '16. LLHC renders author avatar chip');
assert(/example\.com\/a\.png/.test(withAvatar), '17. LLHC uses author canonical image URL');

console.log('\ncontent-author-avatar-217-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
