/**
 * Prompt #119 / #122 — shared collapsible list panel static contract (Teacher + shared assets).
 * Usage: node worker/scripts/teacher-collapsible-list-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const html = fs.readFileSync(path.join(root, 'app/teacher.html'), 'utf8');
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

if (/css\/lantern-collapsible-list\.css/.test(html)) ok('teacher.html links shared collapsible-list CSS');
else bad('teacher.html missing shared CSS link');

if (/js\/lantern-collapsible-list\.js/.test(html)) ok('teacher.html loads shared collapsible-list JS');
else bad('teacher.html missing shared JS script');

if (/Prompt #119 \/ #122 — ONE shared collapsible LIST PANEL/.test(sharedCss) ||
    /ONE shared collapsible (LIST|MANAGEMENT) PANEL/.test(sharedCss) ||
    /shared collapsible MANAGEMENT PANEL/.test(sharedCss)) {
  ok('shared management-panel CSS contract present in lantern-collapsible-list.css');
} else bad('missing shared management-panel CSS contract');

if (/function init\(/.test(sharedJs) && /initTeacherCollapsibleLists/.test(sharedJs)) {
  ok('shared initTeacherCollapsibleLists exported from lantern-collapsible-list.js');
} else bad('missing shared initTeacherCollapsibleLists');

if (/initTeacherCollapsibleLists\(document\)/.test(html)) ok('initializer is called on Teacher boot');
else bad('initializer not called');

if (/aria-expanded/.test(sharedJs)) ok('aria-expanded sync lives in shared initializer');
else bad('aria-expanded wiring missing');

if (/max-height:\s*clamp\(280px,\s*48vh,\s*560px\)/.test(sharedCss)) ok('expanded list scroll uses responsive clamp height');
else bad('missing clamp expanded height in shared CSS');

if (/teacherCollapsibleList:not\(\[open\]\)\s*>\s*\*:not\(summary\)/.test(sharedCss)) {
  ok('shared CSS force-hides non-summary children when collapsed');
} else bad('missing Prompt #131 collapsed force-hide CSS');

if (/lantern-collapsible-collapse/.test(sharedJs) && /data-collapsible-editor/.test(sharedJs)) {
  ok('shared JS hides editors and emits collapse event');
} else bad('shared collapse editor cleanup missing');

/* Prompt #143 — primary destination panels may ship with open + data-collapsible-default-open="1". */
const openWithoutDefault = [];
for (const m of html.matchAll(/<details\b[^>]*>/g)) {
  const tag = m[0];
  if (/\bopen\b/.test(tag) && !/data-collapsible-default-open="1"/.test(tag)) openWithoutDefault.push(tag.slice(0, 100));
}
if (openWithoutDefault.length === 0) ok('Teacher details with open always declare data-collapsible-default-open="1"');
else bad('open without data-collapsible-default-open', openWithoutDefault.join(' | '));

const requiredPanels = [
  ['#teacher-approvals', 'Review Submissions'],
  ['#teacherMyMissionsCard', 'My Missions'],
  ['#teacherCreateMissionDetails', 'Create New Mission'],
  ['#teacher-rewards', 'Rewards Panel'],
  ['#teacher-moderation', 'Moderation'],
  ['#teacher-shoutout-card', 'Shout-Out!'],
  ['#individualAccessCard', 'Individual Access'],
  ['#schoolAccessOverrideCard', 'Schoolwide Access'],
  ['#classAccessCard', 'Class Access'],
  ['#classroomDevicesCard', 'Device Enrollment'],
  ['#teacherPersonaCard', 'Act As Teacher'],
  ['#shoutOutListPanel', 'Posted Shout-Outs'],
  ['#moderationLivePanel', 'Moderation live'],
  ['#moderationHiddenPanel', 'Moderation hidden'],
  ['#moderationFlaggedPanel', 'Moderation flagged'],
  ['#accessRequestsPendingPanel', 'Pending Access Requests'],
  ['#accessRequestsActivePanel', 'Active Individual Grants'],
  ['#devicePairingsPendingPanel', 'Pending Device Pairings'],
  ['#deviceGroupsPanel', 'Device Groups'],
  ['#deviceEnrolledPanel', 'Enrolled Devices'],
  ['#teacherRewardHistoryPanel', 'Nugget recent activity'],
  ['#teacherStudentTotalsCard', 'Student Totals'],
];

for (const [id, label] of requiredPanels) {
  const bare = id.replace(/^#/, '');
  const idx = html.indexOf('id="' + bare + '"');
  const window = idx >= 0 ? html.slice(Math.max(0, idx - 80), idx + 120) : '';
  if (/teacherCollapsibleList/.test(window)) ok(label + ' opts into teacherCollapsibleList (' + id + ')');
  else bad(label + ' missing teacherCollapsibleList near id', id);
}

if (/<details class="card teacherCollapsibleList" id="teacher-approvals"/.test(html)) {
  ok('Review Queue is a details.teacherCollapsibleList card');
} else bad('Review Queue markup not converted to details.teacherCollapsibleList');

if (/<details class="card teacherCollapsibleList" id="teacherMyMissionsCard"/.test(html)) {
  ok('My Missions is a details.teacherCollapsibleList card');
} else bad('My Missions markup not converted');

if (!/<div class="card" id="teacherMyMissionsCard">/.test(html)) ok('legacy always-open My Missions card wrapper removed');
else bad('legacy My Missions div.card still present');

/* Prompt #137 — Create Mission + School Access tools use shared disclosure */
if (/id="teacherCreateMissionDetails"[^>]*teacherCollapsibleList/.test(html) ||
    /class="card teacherCollapsibleList" id="teacherCreateMissionDetails"/.test(html) ||
    /id="teacherCreateMissionDetails" class="card teacherCollapsibleList"/.test(html)) {
  ok('Create New Mission uses shared teacherCollapsibleList');
} else bad('Create New Mission not on shared disclosure pattern');

if (/id="schoolAccessStatusCard"[^>]*schoolAccessStatusDashboard/.test(html) ||
    /class="schoolAccessStatusDashboard" id="schoolAccessStatusCard"/.test(html)) {
  ok('Current Access Status is always-open dashboard (not teacherCollapsibleList accordion)');
} else bad('School Status dashboard markup missing');

if (!/id="schoolAccessStatusCard"[^>]*teacherCollapsibleList/.test(html) &&
    !/class="card teacherCollapsibleList" id="schoolAccessStatusCard"/.test(html)) {
  ok('Current Access Status is not a collapsible accordion peer');
} else bad('School Status must not use teacherCollapsibleList');

if (/closeSiblingTopLevelPanels/.test(sharedJs)) {
  ok('shared helper implements one-open-section accordion for top-level peers');
} else bad('accordion helper missing');

if (!/<div class="card" id="teacher-rewards">/.test(html) &&
    !/<div class="card" id="teacher-moderation">/.test(html) &&
    !/<div class="card" id="teacher-shoutout-card">/.test(html)) {
  ok('Rewards / Moderation / Shout-Out no longer permanently expanded div.card');
} else bad('legacy always-open Teacher tool div.card still present');

/* Prompt #133 — compact record disclosures */
if (/lanternMgmtRecord/.test(sharedCss) && /wireRecords/.test(sharedJs)) {
  ok('shared compact record disclosure assets present');
} else bad('missing lanternMgmtRecord / wireRecords');

if (/renderTeacherMissions[\s\S]{0,2500}lanternMgmtRecord/.test(html)) {
  ok('My Missions renderer emits lanternMgmtRecord disclosures');
} else bad('My Missions not using lanternMgmtRecord');

if (/teacherApprovalPendingRow[\s\S]{0,200}approvalQueueTitle[\s\S]{0,80}white-space:\s*nowrap|Prompt #133 — Review Queue compact/.test(html)) {
  ok('Review Queue compact one-line row CSS present');
} else bad('Review Queue compact row CSS missing');

if (/closeOpenRecords/.test(sharedJs) && /one open record|Prefer one open record|lanternMgmtRecord\[open\]/.test(sharedJs)) {
  ok('shared list prefers one open record and closes records on outer collapse');
} else bad('missing one-open-record / closeOpenRecords behavior');

console.log('\nteacher-collapsible-list-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
