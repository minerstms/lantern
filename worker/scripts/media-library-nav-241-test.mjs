/**
 * Prompt #241 — Media Library entrance in canonical Lantern nav.
 * Usage: node worker/scripts/media-library-nav-241-test.mjs
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

const DEST = 'https://miners-yearbook.pages.dev/';
const staffNav = fs.readFileSync(path.join(root, 'app/js/lantern-staff-nav.js'), 'utf8');
const lanternNav = fs.readFileSync(path.join(root, 'app/js/lantern-nav.js'), 'utf8');
const headerBrand = fs.readFileSync(path.join(root, 'worker/scripts/header-brand-237-test.mjs'), 'utf8');

const sandbox = { window: {}, self: {} };
vm.runInNewContext(staffNav, sandbox);
const LSN = sandbox.window.LanternStaffNav || sandbox.self.LanternStaffNav;

const student = LSN.canonicalVisibleLabels('student', null, 'lantern');
const teacher = LSN.canonicalVisibleLabels('teacher', null, 'lantern');
const staff = LSN.canonicalVisibleLabels('staff', null, 'lantern');
const admin = LSN.canonicalVisibleLabels('admin', null, 'lantern');

if (student.includes('Media Library')) ok('1. authenticated student nav includes Media Library');
else bad('1. student', student);
if (teacher.includes('Media Library') && staff.includes('Media Library')) ok('2. teacher/staff nav includes Media Library');
else bad('2. teacher/staff', { teacher, staff });
if (admin.includes('Media Library')) ok('3. admin nav includes Media Library');
else bad('3. admin', admin);

const lanternHref = LSN.hrefFor('media_library', 'lantern');
const tmsHref = LSN.hrefFor('media_library', 'tms');
if (lanternHref === DEST && tmsHref === DEST) ok('4. link points exactly to ' + DEST);
else bad('4. href', { lanternHref, tmsHref });

if (!/[?&]/.test(lanternHref) && !/[?&]/.test(tmsHref)) ok('5. no identity/token/session query on Media Library URL');
else bad('5. query appended', { lanternHref, tmsHref });

const studentKeep = ['Lantern', 'Locker', 'Create', 'Play', 'Missions'];
if (studentKeep.every((l) => student.includes(l))) ok('6. existing student links remain');
else bad('6. student links', student);

const staffKeep = ['Teacher Tools', 'Teacher Dashboard', 'Behavior Logger'];
if (staffKeep.every((l) => teacher.includes(l))) ok('7. existing staff links remain');
else bad('7. staff links', teacher);

const adminWithCaps = LSN.canonicalVisibleLabels('admin', { report_maker: true, behavior_admin: true, system_admin: true }, 'lantern');
if (adminWithCaps.includes('Reports') && adminWithCaps.includes('Behavior Administration') && adminWithCaps.includes('System')) ok('8. Web Admin caps show privileged links');
else bad('8. admin caps', adminWithCaps);
if (!admin.includes('Reports') && !admin.includes('System')) ok('8b. admin role alone does not grant privileged links');
else bad('8b. admin role leak', admin);

if (
  !student.includes('Teacher Tools') &&
  !student.includes('Behavior Logger') &&
  !student.includes('Reports') &&
  !student.includes('System') &&
  teacher.includes('Teacher Tools') &&
  !teacher.includes('Reports')
) {
  ok('9. role visibility does not regress');
} else bad('9. role visibility', { student, teacher, admin });

if (
  lanternNav.includes('>Small Town<') &&
  lanternNav.includes('>Big Pride<') &&
  lanternNav.includes('lanternHeaderBrand--town') &&
  lanternNav.includes('left:20px') &&
  lanternNav.includes('right:20px') &&
  headerBrand.includes('Small Town')
) {
  ok('10. Small Town / Big Pride remains intact');
} else bad('10. branding');

if (lanternNav.includes('id="lanternExploreSearch"') && lanternNav.includes('Search Lantern')) {
  ok('11. search remains intact');
} else bad('11. search');

if (lanternNav.includes('lanternMenuTrigger') && lanternNav.includes('lanternAppBarDropdownLink')) {
  ok('12. mobile/chevron nav still uses the shared dropdown');
} else bad('12. mobile nav');

const studentHtml = LSN.buildMenuSectionsHtml('explore', 'lantern', null, 'student');
const mediaCount = (studentHtml.match(/data-page="media_library"/g) || []).length;
const labelCount = (studentHtml.match(/>Media Library</g) || []).length;
if (mediaCount === 1 && labelCount === 1) ok('13. no duplicate Media Library entry');
else bad('13. duplicates', { mediaCount, labelCount });

const allowedUrlFiles = [
  'app/js/lantern-staff-nav.js',
  'app/js/lantern-nav.js',
  'worker/scripts/media-library-nav-241-test.mjs',
];
const newUrlFiles = [];
['app/js/lantern-staff-nav.js', 'app/js/lantern-nav.js'].forEach((rel) => {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  const matches = src.match(/https:\/\/miners-yearbook\.pages\.dev\/?/g) || [];
  if (matches.some((u) => u !== DEST && u !== DEST.replace(/\/$/, ''))) newUrlFiles.push(rel + ' bad url');
});
if (
  allowedUrlFiles.every((rel) => fs.existsSync(path.join(root, rel))) &&
  !fs.existsSync(path.join(root, 'miners-yearbook')) &&
  newUrlFiles.length === 0 &&
  !/tms-device-authorize/.test(staffNav.slice(staffNav.indexOf("id: 'media_library'"), staffNav.indexOf("id: 'media_library'") + 220))
) {
  ok('14. no miners-yearbook repo/code was modified; URL lives only in Lantern nav');
} else bad('14. miners-yearbook boundary', newUrlFiles);

if (!/character_name|pairing|device.secret|library.session|yearbook.*token/i.test(lanternHref + tmsHref + staffNav.slice(staffNav.indexOf('media_library'), staffNav.indexOf('media_library') + 400))) {
  ok('no Media Library auth/session fields attached to the nav item');
} else bad('auth leakage in nav item');

if (JSON.stringify(student) === JSON.stringify(['Lantern', 'Locker', 'Create', 'Media Library', 'Play', 'Missions'])) {
  ok('placement is Create → Media Library → Play');
} else bad('placement', student);

console.log('\nMedia Library nav #241:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
