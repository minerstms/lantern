/**
 * Prompt #251 — Canonical navigation contract matrix + cross-surface parity.
 * Usage: node worker/scripts/navigation-contract-251-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

const NAV = ['Lantern', 'Locker', 'Create', 'Media Library', 'Play', 'Missions'];
const STAFF = ['Teacher Tools', 'Behavior Logger'];
const FORBIDDEN_LABELS = ['Teacher', 'Admin', 'Behavior Admin', 'Dashboard', 'System Admin'];

const MATRIX = {
  student: { role: 'student', caps: null, labels: NAV.slice() },
  ordinary: { role: 'teacher', caps: { teacher: true }, labels: NAV.concat(STAFF) },
  rick: { role: 'teacher', caps: { teacher: true, report_maker: true }, labels: NAV.concat(STAFF).concat(['Reports']) },
  deana: {
    role: 'teacher',
    caps: { teacher: true, report_maker: true, behavior_admin: true },
    labels: NAV.concat(STAFF).concat(['Reports', 'Behavior Administration']),
  },
  webAdmin: {
    role: 'admin',
    caps: { teacher: true, report_maker: true, behavior_admin: true, system_admin: true },
    labels: NAV.concat(STAFF).concat(['Reports', 'Behavior Administration', 'System']),
  },
};

const staffNav = fs.readFileSync(path.join(root, 'app/js/lantern-staff-nav.js'), 'utf8');
const contract = fs.readFileSync(path.join(root, 'docs/NAVIGATION_CONTRACT.md'), 'utf8');
const sandbox = { window: {}, self: {} };
vm.runInNewContext(staffNav, sandbox);
const LSN = sandbox.window.LanternStaffNav || sandbox.self.LanternStaffNav;

function assertExact(persona, actual) {
  const expected = MATRIX[persona].labels;
  if (JSON.stringify(actual) === JSON.stringify(expected)) ok(persona + ' exact nav labels');
  else bad(persona + ' exact nav labels', { expected, actual });
}

assertExact('student', LSN.canonicalVisibleLabels(MATRIX.student.role, MATRIX.student.caps, 'lantern'));
assertExact('ordinary', LSN.canonicalVisibleLabels(MATRIX.ordinary.role, MATRIX.ordinary.caps, 'lantern'));
assertExact('rick', LSN.canonicalVisibleLabels(MATRIX.rick.role, MATRIX.rick.caps, 'lantern'));
assertExact('deana', LSN.canonicalVisibleLabels(MATRIX.deana.role, MATRIX.deana.caps, 'lantern'));
assertExact('webAdmin', LSN.canonicalVisibleLabels(MATRIX.webAdmin.role, MATRIX.webAdmin.caps, 'lantern'));

const rick = LSN.canonicalVisibleLabels(MATRIX.rick.role, MATRIX.rick.caps, 'lantern');
if (rick.includes('Reports') && !rick.includes('Behavior Administration') && !rick.includes('System')) {
  ok('Rick sees Reports but not Behavior Administration or System');
} else bad('Rick privileged leak', rick);

const deana = LSN.canonicalVisibleLabels(MATRIX.deana.role, MATRIX.deana.caps, 'lantern');
if (deana.includes('Reports') && deana.includes('Behavior Administration') && !deana.includes('System')) {
  ok('Deana sees Reports + Behavior Administration but not System');
} else bad('Deana privileged leak', deana);

const ordinary = LSN.canonicalVisibleLabels(MATRIX.ordinary.role, MATRIX.ordinary.caps, 'lantern');
if (!ordinary.includes('Reports') && !ordinary.includes('Behavior Administration') && !ordinary.includes('System')) {
  ok('ordinary teacher avoids Reports, Behavior Administration, and System');
} else bad('ordinary privileged leak', ordinary);

const studentLabels = LSN.canonicalVisibleLabels(MATRIX.student.role, MATRIX.student.caps, 'lantern');
if (![studentLabels, ordinary, rick, deana, LSN.canonicalVisibleLabels(MATRIX.webAdmin.role, MATRIX.webAdmin.caps, 'lantern')].some((labels) => labels.includes('Teacher Dashboard'))) {
  ok('Teacher Dashboard is absent from student, ordinary teacher, Rick, Deana, and Web Admin nav');
} else bad('Teacher Dashboard reappeared in canonical nav');
if (ordinary.includes('Teacher Tools') && ordinary.includes('Behavior Logger')) {
  ok('ordinary teacher has Teacher Tools and Behavior Logger');
} else bad('STAFF destinations missing', ordinary);

if (NAV.every((l) => LSN.canonicalVisibleLabels('student', null, 'lantern').includes(l))) {
  ok('Media Library preserved in canonical student navigation');
} else bad('Media Library missing');

if (LSN.hrefFor('media_library', 'lantern') === 'https://miners-yearbook.pages.dev/'
  && LSN.hrefFor('media_library', 'tms') === 'https://miners-yearbook.pages.dev/'
  && !/[?&]/.test(LSN.hrefFor('media_library', 'lantern'))) {
  ok('Media Library destination has no identity tokens');
} else bad('Media Library href', LSN.hrefFor('media_library', 'lantern'));

if (!staffNav.includes("label: 'Teacher Dashboard'") && !staffNav.includes("id: 'teacherDashboard'")) {
  ok('canonical renderer has no Teacher Dashboard item');
} else bad('Teacher Dashboard item still in lantern-staff-nav.js');
if (LSN.hrefFor('teacher', 'lantern') === '/teacher.html') {
  ok('Teacher Tools points at Lantern /teacher.html');
} else bad('Teacher Tools href', LSN.hrefFor('teacher', 'lantern'));

if (LSN.hrefFor('behaviorAdmin', 'lantern').includes('admin.html#behavior')) {
  ok('Behavior Administration destination is admin.html#behavior');
} else bad('Behavior Administration href', LSN.hrefFor('behaviorAdmin', 'lantern'));

const adminRoleOnly = LSN.canonicalVisibleLabels('admin', null, 'lantern');
if (!adminRoleOnly.includes('Reports') && !adminRoleOnly.includes('System') && !adminRoleOnly.includes('Behavior Administration')) {
  ok('Lantern admin role alone does not grant privileged links');
} else bad('admin role leak', adminRoleOnly);

const sysOnly = LSN.canonicalVisibleLabels('teacher', { system_admin: true }, 'lantern');
if (sysOnly.includes('System') && !sysOnly.includes('Reports') && !sysOnly.includes('Behavior Administration')) {
  ok('SYSTEM_ADMIN does not imply REPORT_MAKER or BEHAVIOR_ADMIN');
} else bad('SYSTEM_ADMIN implication', sysOnly);

const behaviorOnly = LSN.canonicalVisibleLabels('teacher', { teacher: true, behavior_admin: true }, 'lantern');
if (behaviorOnly.includes('Behavior Administration') && !behaviorOnly.includes('Reports') && !behaviorOnly.includes('System')) {
  ok('BEHAVIOR_ADMIN-only does not get Reports or System');
} else bad('BEHAVIOR_ADMIN implication', behaviorOnly);

const reportOnly = LSN.canonicalVisibleLabels('teacher', { teacher: true, report_maker: true }, 'lantern');
if (reportOnly.includes('Reports') && !reportOnly.includes('Behavior Administration') && !reportOnly.includes('System')) {
  ok('REPORT_MAKER-only does not get Behavior Administration or System');
} else bad('REPORT_MAKER implication', reportOnly);

if (FORBIDDEN_LABELS.every((l) => !staffNav.includes("label: '" + l + "'"))) {
  ok('canonical renderer does not invent alternate labels');
} else bad('alternate labels present');

if (contract.includes('There is no separate canonical Teacher Dashboard product') && contract.includes('Media Library') && contract.includes('Behavior Administration') && contract.includes('Teacher Tools is the canonical staff utility workspace')) {
  ok('written contract retires Teacher Dashboard and keeps Media Library + Behavior Administration');
} else bad('contract incomplete');

const tmsRick = LSN.canonicalVisibleLabels(MATRIX.rick.role, MATRIX.rick.caps, 'tms');
if (JSON.stringify(tmsRick) === JSON.stringify(rick)) {
  ok('same capability set yields the same conceptual labels on lantern and tms ctx');
} else bad('cross-ctx drift', { lantern: rick, tms: tmsRick });

console.log('\nnavigation-contract-251-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
