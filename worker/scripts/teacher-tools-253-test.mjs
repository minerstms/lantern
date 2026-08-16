/**
 * Prompt #253 — Teacher Dashboard retired; Teacher Tools is the staff workspace.
 * Usage: node worker/scripts/teacher-tools-253-test.mjs
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
const toolsJs = fs.readFileSync(path.join(root, 'app/js/lantern-teacher-behavior-tools.js'), 'utf8');
const rewardJs = fs.readFileSync(path.join(root, 'app/js/lantern-teacher-reward-redeem.js'), 'utf8');
const workerJs = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');

const sandbox = { window: {}, self: {} };
vm.runInNewContext(staffNav, sandbox);
const LSN = sandbox.window.LanternStaffNav || sandbox.self.LanternStaffNav;

const NAV = ['Lantern', 'Locker', 'Create', 'Media Library', 'Play', 'Missions'];
const STAFF = ['Teacher Tools', 'Behavior Logger'];
const personas = {
  student: LSN.canonicalVisibleLabels('student', null, 'lantern'),
  ordinary: LSN.canonicalVisibleLabels('teacher', { teacher: true }, 'lantern'),
  rick: LSN.canonicalVisibleLabels('teacher', { teacher: true, report_maker: true }, 'lantern'),
  deana: LSN.canonicalVisibleLabels('teacher', { teacher: true, report_maker: true, behavior_admin: true }, 'lantern'),
  webAdmin: LSN.canonicalVisibleLabels('admin', { teacher: true, report_maker: true, behavior_admin: true, system_admin: true }, 'lantern'),
};

if (!personas.student.includes('Teacher Dashboard')) ok('1. Teacher Dashboard absent from student nav');
else bad('1. student still has Teacher Dashboard', personas.student);
if (!personas.ordinary.includes('Teacher Dashboard')) ok('2. Teacher Dashboard absent from ordinary teacher nav');
else bad('2. ordinary still has Teacher Dashboard', personas.ordinary);
if (!personas.rick.includes('Teacher Dashboard')) ok('3. Teacher Dashboard absent from Rick nav');
else bad('3. Rick still has Teacher Dashboard', personas.rick);
if (!personas.deana.includes('Teacher Dashboard')) ok('4. Teacher Dashboard absent from Deana nav');
else bad('4. Deana still has Teacher Dashboard', personas.deana);
if (!personas.webAdmin.includes('Teacher Dashboard')) ok('5. Teacher Dashboard absent from Web Admin nav');
else bad('5. Web Admin still has Teacher Dashboard', personas.webAdmin);

if (STAFF.every((l) => personas.ordinary.includes(l))) ok('6/7. Teacher Tools and Behavior Logger present for TEACHER');
else bad('6/7. STAFF missing', personas.ordinary);
if (personas.rick.includes('Reports') && !personas.ordinary.includes('Reports')) ok('8. Reports follows REPORT_MAKER');
else bad('8. Reports gate', { rick: personas.rick, ordinary: personas.ordinary });
if (personas.deana.includes('Behavior Administration') && !personas.rick.includes('Behavior Administration')) ok('9. Behavior Administration follows BEHAVIOR_ADMIN');
else bad('9. Behavior Administration gate');
if (personas.webAdmin.includes('System') && !personas.deana.includes('System')) ok('10. System follows SYSTEM_ADMIN');
else bad('10. System gate');

if (/Pending Nuggets/.test(teacherHtml) && /id="teacherPendingNuggetsCard"/.test(teacherHtml)) ok('11. Pending Nuggets accessible in Teacher Tools');
else bad('11. Pending Nuggets missing');
if (/Nugget Ledger/.test(teacherHtml) && /teacherRewardManualSalePanel/.test(teacherHtml)) ok('12. Nugget Ledger accessible in Teacher Tools');
else bad('12. Nugget Ledger missing');
if (/Student Totals/.test(teacherHtml) && /id="teacherNuggetStudentTotalsCard"/.test(teacherHtml)) ok('13. Student Totals accessible in Teacher Tools');
else bad('13. Student Totals missing');
if (/Recent Behavior Logs/.test(teacherHtml) && /id="teacherRecentLogsCard"/.test(teacherHtml) && /My Recent Logs/.test(teacherHtml)) {
  ok('14. Recent Behavior Logs accessible in Teacher Tools');
} else bad('14. Recent Behavior Logs missing');
if (/data-behavior-filter/.test(teacherHtml) && /All Students/.test(teacherHtml) && /By category/.test(teacherHtml) && /By group/.test(teacherHtml)) {
  ok('15. student filtering remains usable');
} else bad('15. student filter missing');

if (!/nugget_delta\s*=/.test(toolsJs) && !/performNuggetLedger/.test(toolsJs) && /assign-pending/.test(toolsJs) && /dashboard/.test(toolsJs)) {
  ok('16. no new Nugget math in Teacher Tools behavior module');
} else bad('16. unexpected nugget math');
if (/postTmsNuggets\('ledger'/.test(rewardJs) && !/postTmsNuggets\('ledger'/.test(toolsJs)) {
  ok('17. no duplicate ledger — existing reward-redeem remains the ledger client');
} else bad('17. duplicate ledger client');
if (!/appendLog/.test(toolsJs) && !/updateLog/.test(toolsJs) && !/deleteLog/.test(toolsJs) && /Read-only history/.test(teacherHtml)) {
  ok('18. no duplicate logging write path in Teacher Tools');
} else bad('18. logging write path leaked into Teacher Tools');

if (!staffNav.includes("label: 'Teacher Dashboard'") && !/data-page="teacher-dashboard"/.test(staffNav)) {
  ok('21. no canonical nav links to Teacher Dashboard / TMS /teacher.html');
} else bad('21. Teacher Dashboard still in nav renderer');
if (/Teacher Tools is the canonical staff utility workspace/.test(contract) && /There is no separate canonical Teacher Dashboard product/.test(contract)) {
  ok('23. Teacher Tools is documented as canonical');
} else bad('23. contract missing one-workspace rule');

if (/\/api\/tms-nuggets\/dashboard/.test(workerJs) && /assign-pending/.test(workerJs)) {
  ok('Lantern Worker exposes dashboard + assign-pending pass-through');
} else bad('Lantern Worker missing dashboard routes');
if (!/Lantern Teacher Workspace/.test(teacherHtml) && !/Open Lantern Teacher/.test(teacherHtml)) {
  ok('Lantern Teacher Workspace card was not reproduced');
} else bad('redundant Lantern Teacher Workspace card present');

const sidebar = (teacherHtml.match(/<nav class="teacherSidebarNav"[\s\S]*?<\/nav>/) || teacherHtml.match(/teacherSidebarNav[\s\S]*?<\/nav>/) || [''])[0];
const labels = [...sidebar.matchAll(/teacherSidebarLabel">([^<]+)</g)].map((m) => m[1]);
const expectedSidebar = ['Nuggets', 'Overview', 'Recent Behavior Logs', 'Review Submissions', 'Lantern Access', 'Moderation', 'Hallway TV', 'Media Library Access', 'Repair App', 'Phone App Download'];
if (JSON.stringify(labels) === JSON.stringify(expectedSidebar)) ok('Teacher Tools sidebar order exact');
else bad('Teacher Tools sidebar', labels);

console.log('\nteacher-tools-253-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
