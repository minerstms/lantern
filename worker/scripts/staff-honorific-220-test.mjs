/**
 * Prompt #220 — Staff honorific validation + public name formatting.
 * Usage: node worker/scripts/staff-honorific-220-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import {
  STAFF_HONORIFICS,
  validateStaffHonorific,
  formatPublicStaffName,
  isSystemWebAdminAccount,
  staffNeedsHonorific,
  resolveAuthorPublicLabel,
  buildStaffPublicNameIndex,
  attachAuthorPublicLabels,
} from '../staff-public-name.js';
import { privacySafeStaffLabel, privacySafeStudentLabel, disambiguateStaffSearchLabels } from '../content-people.js';

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

const migrate = fs.readFileSync(path.join(root, 'worker/migrations/069_lantern_staff_honorific.sql'), 'utf8');
const adminHtml = fs.readFileSync(path.join(root, 'app/admin.html'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
const cardsJs = fs.readFileSync(path.join(root, 'app/js/lantern-cards.js'), 'utf8');
const thankYou = fs.readFileSync(path.join(root, 'worker/thank-you-mission.js'), 'utf8');

assert(/ADD COLUMN honorific TEXT/.test(migrate), '1. additive honorific migration');
assert(STAFF_HONORIFICS.join(',') === 'Mr.,Miss,Ms.,Mrs.', '2. allowed honorifics exact');

assert(validateStaffHonorific('Mr.', { required: true }).ok === true, '3a. Mr. accepted');
assert(validateStaffHonorific('Miss', { required: true }).value === 'Miss', '3b. Miss accepted');
assert(validateStaffHonorific('Ms.', { required: true }).ok === true, '3c. Ms. accepted');
assert(validateStaffHonorific('Mrs.', { required: true }).ok === true, '3d. Mrs. accepted');
assert(validateStaffHonorific('Dr.', { required: true }).ok === false, '3e. Dr. rejected');
assert(validateStaffHonorific('Coach', { required: false }).ok === false, '3f. Coach rejected');
assert(validateStaffHonorific('', { required: false }).value === null, '3g. empty optional → null');
assert(validateStaffHonorific('', { required: true }).error === 'honorific_required', '3h. empty required fails');
assert(validateStaffHonorific('  Ms.  ', { required: true }).value === 'Ms.', '3i. trim');

const rick = {
  username: 'rick.radle',
  first_name: 'Rick',
  last_name: 'Radle',
  display_name: 'Rick Radle',
  honorific: 'Mr.',
  role: 'teacher',
};
assert(formatPublicStaffName(rick) === 'Mr. Radle', '4a. Rick → Mr. Radle');
assert(privacySafeStaffLabel(rick) === 'Mr. Radle', '4b. people picker uses public staff format');

const deana = {
  username: 'deana.pachelli',
  first_name: 'Deana',
  last_name: 'Pachelli',
  display_name: 'Deana Pachelli',
  honorific: 'Ms.',
  role: 'teacher',
};
assert(formatPublicStaffName(deana) === 'Ms. Pachelli', '5. Deana → Ms. Pachelli');

const missing = {
  username: 'jane.doe',
  first_name: 'Jane',
  last_name: 'Doe',
  display_name: 'Jane Doe',
  honorific: null,
  role: 'teacher',
};
assert(formatPublicStaffName(missing) === 'Jane Doe', '6a. missing honorific → full name fallback');
assert(staffNeedsHonorific(missing) === true, '6b. Needs Title for missing');
assert(!String(formatPublicStaffName(missing)).includes('undefined'), '6c. no undefined');
assert(!String(formatPublicStaffName(missing)).includes('null'), '6d. no null');

const webAdmin = {
  username: 'admin',
  display_name: 'Web Admin',
  first_name: 'Rick',
  last_name: 'Radle',
  honorific: 'Mr.',
  role: 'admin',
};
assert(isSystemWebAdminAccount(webAdmin) === true, '7a. Web Admin account detected');
assert(formatPublicStaffName(webAdmin) === 'Web Admin', '7b. system account stays Web Admin');
assert(staffNeedsHonorific(webAdmin) === false, '7c. Web Admin does not Needs Title');

assert(privacySafeStudentLabel({ display_name: 'Lucas R.', identity_display: 'Lucas R.' }) === 'Lucas R.', '8. student label unchanged');

const idx = buildStaffPublicNameIndex([rick, deana, webAdmin, missing]);
assert(resolveAuthorPublicLabel(idx, { authorId: 'rick.radle', authorRole: 'teacher' }) === 'Mr. Radle', '9a. feed author Rick');
assert(resolveAuthorPublicLabel(idx, { actor_id: 'deana.pachelli', author_type: 'teacher' }) === 'Ms. Pachelli', '9b. feed author Deana');
assert(resolveAuthorPublicLabel(idx, { actor_id: 'admin', author_type: 'admin' }) === 'Web Admin', '9c. feed author admin');
assert(resolveAuthorPublicLabel(idx, { authorId: 'jane.doe', authorRole: 'teacher' }) === 'Jane Doe', '9d. missing honorific fallback');
assert(resolveAuthorPublicLabel(idx, { authorRole: 'student', authorDisplayName: 'Lucas Radle' }) === '', '9e. student → client compact');

const items = [
  { authorId: 'rick.radle', authorRole: 'teacher', authorDisplayName: 'Rick Radle' },
  { authorId: 'someone', authorRole: 'student', authorDisplayName: 'Lucas Radle' },
];
attachAuthorPublicLabels(items, idx);
assert(items[0].authorPublicLabel === 'Mr. Radle', '10a. attach staff public label');
assert(items[1].authorPublicLabel == null, '10b. student no public staff label');

const dup = disambiguateStaffSearchLabels([
  { label: 'Ms. Wilson', role: 'teacher' },
  { label: 'Ms. Wilson', role: 'admin' },
  { label: 'Mr. Radle', role: 'teacher' },
]);
assert(dup[0].label === 'Ms. Wilson · Teacher', '11a. duplicate surname disambiguation');
assert(dup[1].label === 'Ms. Wilson · Admin', '11b. duplicate admin role');
assert(dup[2].label === 'Mr. Radle', '11c. unique label unchanged');

assert(/editUserHonorific/.test(adminHtml) && /nu_honorific/.test(adminHtml), '12. Admin create+edit honorific dropdowns');
assert(/Needs Title/.test(adminHtml) && /Honorific not set/.test(adminHtml), '13. Needs Title / Honorific not set UX');
assert(/validateStaffHonorific\(body\.honorific,\s*\{\s*required:\s*true\s*\}\)/.test(worker), '14. Worker create requires honorific');
assert(/propagateHonorificToLinkedAccounts/.test(worker), '15. person-level honorific propagate');
assert(/author_public_label/.test(worker) || /authorPublicLabel/.test(fs.readFileSync(path.join(root, 'worker/feed-handlers.js'), 'utf8')), '16. feed/news public label');
assert(/formatExploreAuthorLabel/.test(cardsJs), '17. client explore author formatter');
assert(/primary_honorific|honorific/.test(thankYou), '18. Thank-a-Teacher uses honorific');

// Client formatter via vm (same pattern as explore-card-overlay-test)
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
assert(LC && typeof LC.formatExploreAuthorLabel === 'function', '19. formatExploreAuthorLabel exported');
assert(LC.formatExploreAuthorLabel({ authorPublicLabel: 'Mr. Radle' }) === 'Mr. Radle', '20a. staff public label passthrough');
assert(LC.formatExploreAuthorLabel({ author: 'Rick Radle', authorRole: 'teacher' }) === 'Rick Radle', '20b. staff missing title keeps full name');
assert(LC.formatCompactAuthor('Lucas Radle') === 'Lucas R.', '20c. student compact First L.');
assert(LC.formatExploreAuthorLabel({ author: 'Lucas Radle', authorRole: 'student' }) === 'Lucas R.', '20d. student explore uses First L.');

const staffFace = LC.normalizeFeedItemToFaceModel({
  id: 'news:staff',
  type: 'news',
  title: 'Hello',
  authorDisplayName: 'Rick Radle',
  authorPublicLabel: 'Mr. Radle',
  authorRole: 'teacher',
  approvedAt: '2026-08-11T00:00:00.000Z',
});
const staffHtml = LC.buildCanonicalCardFaceHtml(staffFace);
assert(/Mr\. Radle/.test(staffHtml), '21a. Explore card shows Mr. Radle');
assert(!/Rick R\./.test(staffHtml), '21b. Explore card does not compact staff to Rick R.');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
