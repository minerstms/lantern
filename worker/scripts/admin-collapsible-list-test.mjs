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
  ['adminStaffCard', 'Staff'],
  ['tmsStaffLinksCard', 'TMS Staff Links'],
  ['walletAdjustmentCard', 'Nugget Adjustment'],
  ['staffStarterNuggetsCard', 'Staff Starter Nuggets'],
  ['feedModerationCard', 'Feed visibility'],
  ['marqueeSpeedCard', 'Marquee speed'],
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
  ok('Staff is details.teacherCollapsibleList');
} else bad('Staff not converted to details.teacherCollapsibleList');

if (/id="adminStaffCountPill"/.test(html)) ok('Staff count pill present');
else bad('Staff count pill missing');

if (/teacherCollapsibleListScroll[\s\S]{0,200}id="usersBody"|id="usersBody"[\s\S]{0,80}lanternMgmtRecordList/.test(html) ||
    /class="teacherCollapsibleListScroll"[\s\S]{0,400}usersBody/.test(html)) {
  ok('Staff table sits inside teacherCollapsibleListScroll');
} else bad('Staff table not wrapped in scroll container');

if (/id="editUserPanel"/.test(html) && /id="tempPwPanel"/.test(html) && /id="addUserForm"/.test(html) && /id="nu_first"/.test(html) && /id="nu_last"/.test(html)) {
  ok('Edit / Set temp password / Add staff markup preserved');
} else bad('Account action panels or add-staff form missing');

if (/\/api\/admin\/users\/reset-password/.test(html) && /\/api\/admin\/users/.test(html)) {
  ok('Account API endpoints untouched in Admin script');
} else bad('Account API wiring missing');

/* Prompt #197 — canonical Staff label; TMS Staff Links superseded (hidden, APIs kept) */
if (/>\s*Staff\s*</.test(html) && !/Staff &amp; Admin/.test(html)) ok('Staff label is canonical (not Staff & Admin)');
else bad('Staff label not renamed to Staff');

if (/data-canonical-superseded="staff"/.test(html) && /id="tmsStaffLinksCard"[^>]*(hidden|display:\s*none)/.test(html.replace(/\s+/g, ' '))) {
  ok('standalone TMS Staff Links superseded/hidden from normal Admin layout');
} else bad('TMS Staff Links not marked superseded/hidden');

if (/Behavior Logger Link/.test(html) && /Link Behavior Logger identity|Make Primary/.test(html) && /staffNeedsAttention/.test(html)) {
  ok('Staff inline Behavior Logger link + Needs Attention present');
} else bad('Staff Behavior Logger integration incomplete');

if (/Create Lantern Login/.test(html) && /Missing Student ID/.test(html) && /studentsRosterFilter[\s\S]{0,400}value="active" selected/.test(html)) {
  ok('Students canonical status + Create Lantern Login + Active default filter');
} else bad('Students canonical UX incomplete');

if (/\/api\/admin\/tms-staff/.test(html) && /loadTmsStaffDirectory/.test(html)) {
  ok('TMS staff directory API wired for link select');
} else bad('TMS staff directory wiring missing');

/* Prompt #137 — former always-open form cards now use shared disclosure, collapsed by default */
const defaultCollapsedIds = [
  'walletAdjustmentCard',
  'staffStarterNuggetsCard',
  'feedModerationCard',
  'marqueeSpeedCard',
  'adminPendingApprovalsCard',
];
for (const id of defaultCollapsedIds) {
  const re = new RegExp('<details[^>]*id="' + id + '"[^>]*>');
  const m = html.match(re);
  if (m && /teacherCollapsibleList/.test(m[0]) && !/\sopen[\s>]/.test(m[0])) {
    ok(id + ' defaults collapsed (details.teacherCollapsibleList, no open attr)');
  } else bad(id + ' not default-collapsed shared disclosure', m && m[0]);
}

if (/id="adminFeedSummaryPill"/.test(html) && /id="marqueeSpeedSummaryPill"/.test(html)) {
  ok('Feed / Marquee collapsed headers expose summary pills');
} else bad('summary pills missing on Feed/Marquee');

if (/closeSiblingTopLevelPanels/.test(sharedJs)) {
  ok('shared helper implements one-open-section accordion for top-level peers');
} else bad('accordion helper missing');

if (/MANAGEMENT PANEL|form\/settings\/tool cards/.test(sharedCss) || /form\/settings\/tool/.test(sharedJs)) {
  ok('shared pattern generalized beyond list-only');
} else bad('shared docs still list-only');

/* Ensure no leftover always-open Admin management div.card tool sections */
if (!/<div class="card" id="walletAdjustmentCard">/.test(html) &&
    !/<div class="card" id="feedModerationCard">/.test(html) &&
    !/<div class="card" id="marqueeSpeedCard">/.test(html)) {
  ok('Wallet / Feed / Marquee no longer permanently expanded div.card');
} else bad('legacy always-open tool div.card still present');

if (/id="adminStudentsCard"/.test(html) && /id="adminStudentsCountPill"/.test(html)) {
  ok('Students roster panel + count pill present');
} else bad('Students roster panel missing');

if (/\/api\/admin\/tms-roster/.test(html) && /studentsRosterFilter/.test(html) && /Link Existing Account/.test(html)) {
  ok('Students roster API + filter + link action wired');
} else bad('Students roster client wiring incomplete');

if (/id="studentsAddOpenBtn"/.test(html) && /Create student/.test(html)) {
  ok('Add Student action exposed in Students panel');
} else bad('Add Student action missing');

if (/id="studentsAddGrade"/.test(html) && /option value="6" selected/.test(html) && /id="studentsEditGrade"/.test(html)) {
  ok('Add Student defaults Grade to 6th; Edit Student includes Grade');
} else bad('Grade UI missing or default not 6th');

if (/\/api\/admin\/tms-roster\/update/.test(html) && /Save Changes/.test(html) && /studentsEditFirst/.test(html) && /studentsEditLast/.test(html)) {
  ok('Edit Student identity panel wires update API + First/Last/Grade');
} else bad('Edit Student update wiring missing');

if (/studentsRosterGradeFilter/.test(html)) {
  ok('Students grade filter present');
} else bad('grade filter wiring missing');

if (/isStaffRole|filteredStaffList|Archive Login/.test(html)) {
  ok('Staff-only filter + student archive actions present');
} else bad('Staff filter / student archive wiring missing');

if (!/<div class="card">\s*<div class="cardHd">Accounts<\/div>/.test(html)) {
  ok('legacy permanently expanded Accounts card wrapper removed');
} else bad('legacy Accounts div.card still present');

const sharedCssAdmin = sharedCss;
const sharedJsAdmin = sharedJs;

if (/teacherCollapsibleList:not\(\[open\]\)\s*>\s*\*:not\(summary\)/.test(sharedCssAdmin)) {
  ok('Admin uses shared collapsed force-hide CSS');
} else bad('Admin missing shared collapsed force-hide');

if (/lantern-collapsible-collapse/.test(html) && /closeAllFloatingEditors|data-admin-floating-editor/.test(html)) {
  ok('Admin closes floating editors when list panels collapse');
} else bad('Admin missing collapse→editor cleanup wiring');

if (!/<details[^>]*\sopen[\s>]/.test(html)) ok('Admin list panels do not hard-code open');
else bad('Admin details hard-coded open');

if (/id="adminStudentsCard"/.test(html) && /id="adminStaffCard"/.test(html)) {
  ok('adminStudentsCard + adminStaffCard are details panels (collapsed by default without open attr)');
} else bad('Students/Staff panel ids missing');

if (!/id="adminAccountsCard"/.test(html)) ok('mixed Accounts absent after #130 retirement');
else bad('mixed Accounts still present');

if (/id="editUserPanel"[^>]*hidden|id="editUserPanel"[\s\S]{0,80}hidden/.test(html) &&
    /id="tempPwPanel"[^>]*hidden|id="tempPwPanel"[\s\S]{0,80}hidden/.test(html)) {
  ok('Edit/temp panels start hidden (no reserved editor space)');
} else bad('Edit/temp panels not hidden by default');

/* Prompt #133 — compact record disclosures */
if (/lanternMgmtRecord/.test(sharedCss) && /wireRecords/.test(sharedJs)) {
  ok('shared compact record disclosure CSS + wireRecords API present');
} else bad('missing shared lanternMgmtRecord / wireRecords');

if (/lanternMgmtRecord:not\(\[open\]\)\s*>\s*\*:not\(summary\)/.test(sharedCss)) {
  ok('collapsed records force-hide non-summary children');
} else bad('missing collapsed-record force-hide CSS');

if (/renderStaffTable[\s\S]{0,2500}lanternMgmtRecord/.test(html) && /renderStudentsRosterTable[\s\S]{0,2500}lanternMgmtRecord/.test(html)) {
  ok('Staff + Students renderers emit lanternMgmtRecord disclosures');
} else bad('Staff/Students not using lanternMgmtRecord');

if (!/Teacher and admin Lantern accounts only|schema migration required before Staff/.test(html)) {
  ok('Staff instructional / Staff ID migration prose removed from Admin UI');
} else bad('Staff instructional prose still present');

if (!/id="usersTable"/.test(html) && !/id="studentsRosterTable"/.test(html)) {
  ok('legacy permanently-actioned staff/student tables removed');
} else bad('legacy usersTable/studentsRosterTable still present');

if (/closeOpenRecords/.test(sharedJs) && /lantern-mgmt-record-collapse/.test(sharedJs)) {
  ok('outer panel collapse closes open records; record collapse event exists');
} else bad('missing closeOpenRecords / record-collapse wiring');

console.log('\nadmin-collapsible-list-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
