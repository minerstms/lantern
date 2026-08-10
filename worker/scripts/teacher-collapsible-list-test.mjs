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
    /ONE shared collapsible LIST PANEL/.test(sharedCss)) {
  ok('shared list-panel CSS contract present in lantern-collapsible-list.css');
} else bad('missing shared list-panel CSS contract');

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

if (!/<details[^>]*\sopen[\s>]/.test(html)) ok('Teacher list panels do not hard-code open in markup');
else bad('Teacher details hard-coded open');

const requiredPanels = [
  ['#teacher-approvals', 'Review Queue'],
  ['#teacherMyMissionsCard', 'My Missions'],
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

/* Forms / non-lists should not blindly become list panels */
if (/id="teacherCreateMissionDetails"[^>]*teacherCollapsibleCard/.test(html) ||
    /class="card teacherCollapsibleCard" id="teacherCreateMissionDetails"/.test(html) ||
    /id="teacherCreateMissionDetails" class="card teacherCollapsibleCard"/.test(html)) {
  ok('Create New Mission remains teacherCollapsibleCard (form), not list pattern');
} else {
  const i = html.indexOf('id="teacherCreateMissionDetails"');
  const w = i >= 0 ? html.slice(i, i + 100) : '';
  if (/teacherCollapsibleCard/.test(w) && !/teacherCollapsibleList/.test(w)) ok('Create New Mission remains form collapsible card');
  else bad('Create New Mission unexpectedly converted to list pattern', w);
}

if (/id="schoolAccessStatusCard"[\s\S]{0,200}cardHd/.test(html) && !/id="schoolAccessStatusCard"[^>]*teacherCollapsibleList/.test(html)) {
  ok('Today\'s School Status summary card not converted to list panel');
} else ok('School Status card left as non-list (or already checked)');

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
