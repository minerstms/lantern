/**
 * Prompt #122 — Admin shared collapsible list panel static contract.
 * Usage: node worker/scripts/admin-collapsible-list-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const html = fs.readFileSync(path.join(root, 'app/admin.html'), 'utf8');
const sharedCss = fs.readFileSync(path.join(root, 'app/css/lantern-collapsible-list.css'), 'utf8');
const sharedJs = fs.readFileSync(path.join(root, 'app/js/lantern-collapsible-list.js'), 'utf8');

let pass = 0;
let fail = 0;
function ok(msg) {
  pass++;
  console.log('PASS ' + msg);
}
function bad(msg, detail) {
  fail++;
  console.log('FAIL ' + msg + (detail ? ' — ' + detail : ''));
}

if (/css\/lantern-collapsible-list\.css/.test(html)) ok('admin.html links shared collapsible-list CSS');
else bad('admin.html missing shared CSS link');

if (/js\/lantern-collapsible-list\.js/.test(html)) ok('admin.html loads shared collapsible-list JS');
else bad('admin.html missing shared JS script');

if (/initTeacherCollapsibleLists\(document\)/.test(html)) ok('Admin boots shared list initializer');
else bad('Admin missing initTeacherCollapsibleLists(document)');

if (/LanternCollapsibleList/.test(sharedJs) && /teacherCollapsibleList/.test(sharedCss)) {
  ok('Admin reuses Teacher-named shared list pattern assets');
} else bad('shared assets incomplete');

const requiredPanels = [
  ['adminStudentsCard', 'Students'],
  ['adminStaffCard', 'Staff & Admin'],
  ['tmsStaffLinksCard', 'TMS Staff Links'],
  ['adminPendingApprovalsCard', 'Pending approvals'],
  ['adminFeedLivePanel', 'Feed live'],
  ['adminFeedHiddenPanel', 'Feed hidden'],
];

for (const [id, label] of requiredPanels) {
  const idx = html.indexOf('id="' + id + '"');
  const window = idx >= 0 ? html.slice(Math.max(0, idx - 80), idx + 140) : '';
  if (/teacherCollapsibleList/.test(window)) ok(label + ' opts into teacherCollapsibleList (#' + id + ')');
  else bad(label + ' missing teacherCollapsibleList near id', id);
}

if (!/id="adminAccountsCard"/.test(html)) ok('generic Accounts panel retired');
else bad('generic Accounts panel still present');

if (/<details class="card teacherCollapsibleList" id="adminStaffCard"/.test(html)) {
  ok('Staff & Admin is details.teacherCollapsibleList');
} else bad('Staff & Admin not converted to details.teacherCollapsibleList');

if (/id="adminStaffCountPill"/.test(html)) ok('Staff & Admin count pill present');
else bad('Staff & Admin count pill missing');

if (/teacherCollapsibleListScroll[\s\S]{0,80}id="usersTable"|id="usersTable"[\s\S]{0,40}<\/table>[\s\S]{0,20}<\/div>/.test(html) ||
    /class="teacherCollapsibleListScroll"[\s\S]{0,200}usersTable/.test(html)) {
  ok('Staff table sits inside teacherCollapsibleListScroll');
} else bad('Staff table not wrapped in scroll container');

if (/id="editUserPanel"/.test(html) && /id="tempPwPanel"/.test(html) && /id="addUserForm"/.test(html)) {
  ok('Edit / Set temp password / Add staff markup preserved');
} else bad('Account action panels or add-staff form missing');

if (/\/api\/admin\/users\/reset-password/.test(html) && /\/api\/admin\/users/.test(html)) {
  ok('Account API endpoints untouched in Admin script');
} else bad('Account API wiring missing');

/* Non-list forms must remain permanently open cards */
if (/id="walletAdjustmentCard"[\s\S]{0,120}cardHd/.test(html) &&
    !/id="walletAdjustmentCard"[^>]*teacherCollapsibleList/.test(html)) {
  ok('Wallet Adjustment left as form card (not list panel)');
} else bad('Wallet Adjustment unexpectedly list-converted');

if (/id="marqueeSpeedCard"[\s\S]{0,120}cardHd/.test(html) &&
    !/id="marqueeSpeedCard"[^>]*teacherCollapsibleList/.test(html)) {
  ok('Marquee speed left as form card (not list panel)');
} else bad('Marquee speed unexpectedly list-converted');

if (/id="adminStudentsCard"/.test(html) && /id="adminStudentsCountPill"/.test(html)) {
  ok('Students roster panel + count pill present');
} else bad('Students roster panel missing');

if (/\/api\/admin\/tms-roster/.test(html) && /studentsRosterFilter/.test(html) && /Link Existing Account/.test(html)) {
  ok('Students roster API + filter + link action wired');
} else bad('Students roster client wiring incomplete');

if (/id="studentsAddOpenBtn"/.test(html) && /Create student/.test(html)) {
  ok('Add Student action exposed in Students panel');
} else bad('Add Student action missing');

if (/isStaffRole|filteredStaffList|Archive Lantern Login/.test(html)) {
  ok('Staff-only filter + student archive actions present');
} else bad('Staff filter / student archive wiring missing');

if (!/<div class="card">\s*<div class="cardHd">Accounts<\/div>/.test(html)) {
  ok('legacy permanently expanded Accounts card wrapper removed');
} else bad('legacy Accounts div.card still present');

console.log('\nadmin-collapsible-list-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
