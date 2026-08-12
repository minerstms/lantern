/**
 * Prompt #223 — Staff public_display_name override + #220 honorific fallback regressions.
 * Usage: node worker/scripts/staff-public-display-223-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import {
  validateStaffPublicDisplayName,
  formatPublicStaffName,
  isSystemWebAdminAccount,
  PUBLIC_DISPLAY_NAME_MAX_LEN,
  resolveAuthorPublicLabel,
  buildStaffPublicNameIndex,
  attachAuthorPublicLabels,
} from '../staff-public-name.js';
import { privacySafeStaffLabel } from '../content-people.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '../..');
let pass = 0;
let fail = 0;
function ok(msg) {
  pass++;
  console.log('OK', msg);
}
function bad(msg, detail) {
  fail++;
  console.error('FAIL', msg, detail != null ? detail : '');
}
function assert(cond, msg, detail) {
  if (cond) ok(msg);
  else bad(msg, detail);
}

const migrate = fs.readFileSync(path.join(root, 'worker/migrations/070_lantern_staff_public_display_name.sql'), 'utf8');
const adminHtml = fs.readFileSync(path.join(root, 'app/admin.html'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
const people = fs.readFileSync(path.join(root, 'worker/content-people.js'), 'utf8');
const cardsJs = fs.readFileSync(path.join(root, 'app/js/lantern-cards.js'), 'utf8');
const avatarKey = fs.readFileSync(path.join(root, 'worker/author-avatar-key.js'), 'utf8');

assert(/ADD COLUMN public_display_name TEXT/.test(migrate), '1. additive public_display_name migration');
assert(PUBLIC_DISPLAY_NAME_MAX_LEN === 80, '2. max length 80');

assert(validateStaffPublicDisplayName('Mr. Tom').value === 'Mr. Tom', '3a. Mr. Tom valid');
assert(validateStaffPublicDisplayName("Mr. O'Brien").ok === true, '3b. apostrophe allowed');
assert(validateStaffPublicDisplayName('Coach K').ok === true, '3c. Coach K allowed');
assert(validateStaffPublicDisplayName('Ms. P.').ok === true, '3d. Ms. P. allowed');
assert(validateStaffPublicDisplayName('').value === null, '3e. blank → null');
assert(validateStaffPublicDisplayName('   ').value === null, '3f. whitespace → null');
assert(validateStaffPublicDisplayName('x'.repeat(81)).ok === false, '3g. too long rejected');
assert(validateStaffPublicDisplayName('Bad\nName').ok === false, '3h. control chars rejected');

const tom = {
  username: 'tom.romero',
  first_name: 'Tom',
  last_name: 'Romero',
  display_name: 'Tom Romero',
  honorific: 'Mr.',
  public_display_name: 'Mr. Tom',
  role: 'teacher',
};
assert(formatPublicStaffName(tom) === 'Mr. Tom', '4a. override exact Mr. Tom');
assert(formatPublicStaffName(tom) !== 'Mr. Mr. Tom', '4b. no double honorific');
assert(privacySafeStaffLabel(tom) === 'Mr. Tom', '4c. people label uses override');

const rick = {
  username: 'rick.radle',
  first_name: 'Rick',
  last_name: 'Radle',
  display_name: 'Rick Radle',
  honorific: 'Mr.',
  public_display_name: null,
  role: 'teacher',
};
assert(formatPublicStaffName(rick) === 'Mr. Radle', '5. blank override → Mr. Radle');

const deana = {
  username: 'deana.pachelli',
  first_name: 'Deana',
  last_name: 'Pachelli',
  display_name: 'Deana Pachelli',
  honorific: 'Ms.',
  public_display_name: '',
  role: 'teacher',
};
assert(formatPublicStaffName(deana) === 'Ms. Pachelli', '6. empty string override → Ms. Pachelli');

const webAdmin = {
  username: 'admin',
  display_name: 'Web Admin',
  first_name: 'Rick',
  last_name: 'Radle',
  honorific: 'Mr.',
  public_display_name: 'Mr. Radle',
  role: 'admin',
};
assert(isSystemWebAdminAccount(webAdmin) === true, '7a. Web Admin detected');
assert(formatPublicStaffName(webAdmin) === 'Web Admin', '7b. override does not replace Web Admin');

const idx = buildStaffPublicNameIndex([tom, rick, deana, webAdmin]);
assert(resolveAuthorPublicLabel(idx, { authorId: 'tom.romero', authorRole: 'teacher' }) === 'Mr. Tom', '8a. feed Tom');
assert(resolveAuthorPublicLabel(idx, { authorId: 'rick.radle', authorRole: 'teacher' }) === 'Mr. Radle', '8b. feed Rick');
assert(resolveAuthorPublicLabel(idx, { actor_id: 'admin', author_type: 'admin' }) === 'Web Admin', '8c. feed admin');

const items = [{ authorId: 'tom.romero', authorRole: 'teacher', authorDisplayName: 'Tom Romero' }];
attachAuthorPublicLabels(items, idx);
assert(items[0].authorPublicLabel === 'Mr. Tom', '9. attach override label');

assert(/public_display_name/.test(people) && /COALESCE\(p\.public_display_name/.test(people), '10. search matches public_display_name');
assert(/first_name/.test(people) && /last_name/.test(people), '11. search still matches canonical names');
assert(/editUserPublicDisplay/.test(adminHtml) && /nu_public_display/.test(adminHtml), '12. Admin create+edit fields');
assert(/If blank, Lantern uses Honorific \+ Last Name/.test(adminHtml), '13. helper text');
assert(/validateStaffPublicDisplayName/.test(worker), '14. Worker validates public_display_name');
assert(/propagatePublicDisplayNameToLinkedAccounts/.test(worker), '15. person-level propagation');
assert(/authorAvatarKey|author_avatar_key|resolveAuthorAvatarKey/.test(avatarKey + cardsJs), '16. avatar still key-based');

const sandbox = {
  console,
  document: {
    createElement() {
      return {
        style: {},
        classList: { add() {} },
        setAttribute() {},
        appendChild() {},
        querySelector() { return null; },
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
assert(LC.formatExploreAuthorLabel({ authorPublicLabel: 'Mr. Tom', authorRole: 'teacher' }) === 'Mr. Tom', '17a. Explore Mr. Tom');
assert(LC.formatExploreAuthorLabel({ authorPublicLabel: 'Mr. Radle' }) === 'Mr. Radle', '17b. Explore Mr. Radle');
assert(LC.formatCompactAuthor('Lucas Radle') === 'Lucas R.', '17c. student First L.');
const face = LC.normalizeFeedItemToFaceModel({
  id: 'news:tom',
  type: 'news',
  title: 'Hello',
  authorDisplayName: 'Tom Romero',
  authorPublicLabel: 'Mr. Tom',
  authorRole: 'teacher',
  authorAvatarKey: 'tom.romero',
  approvedAt: '2026-08-11T00:00:00.000Z',
});
assert(face.authorAvatarKey === 'tom.romero', '18a. avatar key remains username');
assert(face.authorPublicLabel === 'Mr. Tom', '18b. face carries override');
const html = LC.buildCanonicalCardFaceHtml(face);
assert(/Mr\. Tom/.test(html), '18c. card shows Mr. Tom');
assert(!/Tom Romero/.test(html), '18d. card does not show full canonical name');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
