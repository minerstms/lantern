/**
 * Prompt #218 — author avatar key = Locker profile key (not display name); LLHC no clip.
 * Usage: node worker/scripts/content-author-avatar-218-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  buildPilotAvatarKeyIndex,
  resolveAuthorAvatarKey,
  attachAuthorAvatarKeys,
} from '../author-avatar-key.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cardsCss = fs.readFileSync(path.join(root, 'app/css/lantern-cards.css'), 'utf8');
const avatarJs = fs.readFileSync(path.join(root, 'app/js/lantern-avatar.js'), 'utf8');
const feedExplore = fs.readFileSync(path.join(root, 'app/js/lantern-feed-explore.js'), 'utf8');
const tickerJs = fs.readFileSync(path.join(root, 'app/js/lantern-ticker.js'), 'utf8');
const cardsJs = fs.readFileSync(path.join(root, 'app/js/lantern-cards.js'), 'utf8');
const newsApproved = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');

let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }
function assert(cond, label, detail) { if (cond) ok(label); else bad(label, detail); }

const idx = buildPilotAvatarKeyIndex([
  { username: 'rick.radle', display_name: 'Rick Radle', role: 'teacher', staff_id: 4 },
  { username: 'admin', display_name: 'Web Admin', role: 'admin', staff_id: 1 },
  { username: '20889', display_name: 'Lucas Radle', role: 'student', mtss_student_id: '20889', student_character_name: '20889' },
]);

assert(
  resolveAuthorAvatarKey(idx, { authorId: 'rick.radle', authorDisplayName: 'Rick Radle' }) === 'rick.radle',
  '1. authorId wins over display name'
);
assert(
  resolveAuthorAvatarKey(idx, { authorDisplayName: 'Rick Radle' }) === 'rick.radle',
  '2. display name maps to username via pilot index (legacy rows)'
);
assert(
  resolveAuthorAvatarKey(idx, { authorDisplayName: 'Web Admin' }) === 'admin',
  '3. admin account distinct from rick.radle'
);
assert(
  resolveAuthorAvatarKey(idx, { authorId: 'rick.radle' }) !==
    resolveAuthorAvatarKey(idx, { authorId: 'admin' }),
  '4. rick.radle and admin stay separate'
);
assert(
  resolveAuthorAvatarKey(idx, { character_name: 'Rick Radle', authorDisplayName: 'Rick Radle' }) === 'rick.radle',
  '5. poll/mission stored display name remaps to Locker key'
);

const items = attachAuthorAvatarKeys(
  [
    { id: 'news:1', authorId: 'rick.radle', authorDisplayName: 'Rick Radle' },
    { id: 'poll:1', authorId: null, authorDisplayName: 'Rick Radle', character_name: 'Rick Radle' },
  ],
  idx
);
assert(items[0].authorAvatarKey === 'rick.radle', '6. feed news gets authorAvatarKey=rick.radle');
assert(items[1].authorAvatarKey === 'rick.radle', '7. feed poll display author remapped');

assert(/authorAvatarKey|author_avatar_key|authorId/.test(avatarJs), '8. client avatar helper prefers durable keys');
assert(/authorAvatarKey \|\| it\.author_avatar_key \|\| it\.authorId/.test(feedExplore), '9. explore sets character_name from durable key');
assert(/author_avatar_key \|\| n\.actor_id/.test(tickerJs), '10. ticker prefers author_avatar_key/actor_id');
assert(/actor_id:/.test(newsApproved) && /author_avatar_key:/.test(newsApproved), '11. /api/news/approved exposes actor_id + author_avatar_key');
assert(/max-height:\s*58%/.test(cardsCss), '12. overlay max-height raised so 28px avatar fits');
assert(/overflow-y:\s*visible/.test(cardsCss) && /min-height:\s*var\(--lantern-content-author-avatar-size/.test(cardsCss), '13. LLHC meta allows full avatar height');
assert(/padding:\s*0\s+14px\s+14px\s+12px/.test(cardsCss), '14. LLHC caption inset left/bottom');
assert(/shoutOutRecognizedPartyLabel/.test(cardsJs), '15. #217 shout recognized-party helper preserved');

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

const face = LC.normalizeFeedItemToFaceModel({
  id: 'news:rick',
  type: 'news',
  title: 'Welcome Coach Colorado!',
  authorDisplayName: 'Rick Radle',
  authorId: 'rick.radle',
  authorAvatarKey: 'rick.radle',
  approvedAt: '2026-08-11T00:00:00.000Z',
});
assert(face.character_name === 'rick.radle', '16. face model avatar key is rick.radle not Rick Radle');
assert(LC.formatCompactAuthor(face.author) === 'Rick R.', '17. compact author label still Rick R.');
assert(face.descriptionPreview !== undefined, '18. face model still builds');

const shout = LC.normalizeFeedItemToFaceModel({
  type: 'shout_out',
  title: 'Thanks',
  authorDisplayName: 'Rick Radle',
  authorId: 'rick.radle',
  body: 'Recognizing: Volleyball Coaches\n\nGo team',
  contentSlot: { recipient: 'Volleyball Coaches' },
  approvedAt: '2026-08-11T00:00:00.000Z',
});
assert(shout.descriptionPreview === 'Volleyball Coaches', '19. #217 shout meta still recognized party only');
assert(!/Recognizing:/.test(LC.buildCanonicalCardFaceHtml(shout)), '20. no Recognizing: prefix regression');

console.log('\ncontent-author-avatar-218-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
