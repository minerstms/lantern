/**
 * Prompt #255 — Capability independence + Teacher Tools Media Library Access + sidebar order.
 * Usage: node worker/scripts/teacher-tools-255-test.mjs
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

const staffNav = fs.readFileSync(path.join(root, 'app/js/lantern-staff-nav.js'), 'utf8');
const contract = fs.readFileSync(path.join(root, 'docs/NAVIGATION_CONTRACT.md'), 'utf8');
const teacherHtml = fs.readFileSync(path.join(root, 'app/teacher.html'), 'utf8');
const sandbox = { window: {}, self: {} };
vm.runInNewContext(staffNav, sandbox);
const LSN = sandbox.window.LanternStaffNav || sandbox.self.LanternStaffNav;

const NAV = ['Lantern', 'Locker', 'Create', 'Media Library', 'Play', 'Missions'];
const STAFF = ['Teacher Tools', 'Behavior Logger'];
function labels(role, caps) {
  return LSN.canonicalVisibleLabels(role, caps, 'lantern');
}

const student = labels('student', null);
const ordinary = labels('teacher', { teacher: true });
const reportOnly = labels('teacher', { teacher: true, report_maker: true });
const behaviorOnly = labels('teacher', { teacher: true, behavior_admin: true });
const systemOnly = labels('teacher', { teacher: true, system_admin: true });
const rick = labels('teacher', { teacher: true, report_maker: true });
const deana = labels('teacher', { teacher: true, report_maker: true, behavior_admin: true });
const webAdmin = labels('admin', { teacher: true, report_maker: true, behavior_admin: true, system_admin: true });

if (![student, ordinary, reportOnly, behaviorOnly, systemOnly, rick, deana, webAdmin].some((l) => l.includes('Teacher Dashboard'))) {
  ok('1. Teacher Dashboard absent everywhere');
} else bad('1. Teacher Dashboard reappeared');
if (ordinary.includes('Teacher Tools')) ok('2. TEACHER gets Teacher Tools');
else bad('2. Teacher Tools missing');
if (ordinary.includes('Behavior Logger')) ok('3. TEACHER gets Behavior Logger');
else bad('3. Behavior Logger missing');

if (reportOnly.includes('Reports') && !reportOnly.includes('Behavior Administration') && !reportOnly.includes('System')) {
  ok('4/10/11. REPORT_MAKER adds Reports only');
} else bad('4. REPORT_MAKER leak', reportOnly);
if (behaviorOnly.includes('Behavior Administration') && !behaviorOnly.includes('Reports') && !behaviorOnly.includes('System')) {
  ok('5/7. BEHAVIOR_ADMIN adds Behavior Administration only');
} else bad('5. BEHAVIOR_ADMIN leak', behaviorOnly);
if (systemOnly.includes('System') && !systemOnly.includes('Reports') && !systemOnly.includes('Behavior Administration')) {
  ok('6/8/9. SYSTEM_ADMIN adds System only');
} else bad('6. SYSTEM_ADMIN leak', systemOnly);

if (JSON.stringify(rick) === JSON.stringify(NAV.concat(STAFF).concat(['Reports']))) ok('12. Rick matrix correct');
else bad('12. Rick', rick);
if (JSON.stringify(deana) === JSON.stringify(NAV.concat(STAFF).concat(['Reports', 'Behavior Administration']))) ok('13. Deana matrix correct');
else bad('13. Deana', deana);
if (JSON.stringify(webAdmin) === JSON.stringify(NAV.concat(STAFF).concat(['Reports', 'Behavior Administration', 'System']))) ok('14. Web Admin matrix correct');
else bad('14. Web Admin', webAdmin);

const sidebar = (teacherHtml.match(/<nav class="teacherSidebarNav"[\s\S]*?<\/nav>/) || [''])[0];
const sideLabels = [...sidebar.matchAll(/teacherSidebarLabel">([^<]+)</g)].map((m) => m[1]);
if (sideLabels.includes('Media Library Access') && sideLabels.filter((l) => l === 'Media Library Access').length === 1) {
  ok('16/19. Media Library Access appears once in Teacher Tools');
} else bad('16/19. Media Library Access', sideLabels);
const mediaHref = (teacherHtml.match(/id="teacherMediaLibraryAccessLink"[^>]*href="([^"]+)"/) || teacherHtml.match(/href="([^"]+)"[^>]*id="teacherMediaLibraryAccessLink"/) || [])[1] || '';
if (mediaHref === 'https://miners-yearbook.pages.dev/staff.html') ok('17. Media Library Access points at staff.html');
else bad('17. Media Library href', mediaHref);
if (mediaHref && !/[?&]/.test(mediaHref) && !/token|secret|student/i.test(mediaHref)) ok('18. Media Library URL has no identity/token/secret');
else bad('18. Media Library URL leakage', mediaHref);
if (sideLabels.indexOf('Repair App') < sideLabels.indexOf('Phone App Download')) ok('20. Repair App is before Phone App Download');
else bad('20. Repair/Phone order', sideLabels);
if (sideLabels[sideLabels.length - 1] === 'Phone App Download') ok('21. Phone App Download is final sidebar item');
else bad('21. last sidebar item', sideLabels[sideLabels.length - 1]);
if (sideLabels.includes('Nuggets')) ok('22. Nuggets remains');
else bad('22. Nuggets missing');
if (sideLabels.includes('Recent Behavior Logs')) ok('23. Recent Behavior Logs remains');
else bad('23. Recent Behavior Logs missing');
if (sideLabels.includes('Review Submissions')) ok('24. Review Submissions remains');
else bad('24. Review Submissions missing');
if (ordinary.includes('Behavior Logger') && !sideLabels.includes('Behavior Logger')) ok('25. Behavior Logger remains separate from Teacher Tools sidebar');
else bad('25. Behavior Logger sidebar/nav');
if (/Capabilities are independent/.test(contract) && /Does not add Reports or System/.test(contract)) {
  ok('contract states capability independence');
} else bad('contract missing independence');
if (!staffNav.includes("label: 'Teacher Dashboard'")) ok('Teacher Dashboard still retired from nav renderer');
else bad('Teacher Dashboard back in nav');

console.log('\nteacher-tools-255-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
