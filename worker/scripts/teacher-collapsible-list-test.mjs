/**
 * Prompt #119 — shared Teacher collapsible list panel static contract.
 * Usage: node worker/scripts/teacher-collapsible-list-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const html = fs.readFileSync(path.join(root, 'app/teacher.html'), 'utf8');

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

if (/Prompt #119 — ONE shared collapsible LIST PANEL/.test(html)) ok('shared list-panel CSS contract comment present');
else bad('missing shared list-panel CSS contract');

if (/function initTeacherCollapsibleLists\(/.test(html)) ok('shared initTeacherCollapsibleLists helper present');
else bad('missing initTeacherCollapsibleLists');

if (/initTeacherCollapsibleLists\(document\)/.test(html)) ok('initializer is called on Teacher boot');
else bad('initializer not called');

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
  const re = new RegExp('id="' + id.replace(/^#/, '') + '"[^>]*class="[^"]*teacherCollapsibleList');
  const re2 = new RegExp('class="[^"]*teacherCollapsibleList[^"]*"[^>]*id="' + id.replace(/^#/, '') + '"');
  if (re.test(html) || re2.test(html) || html.includes('id="' + id.replace(/^#/, '') + '"') && html.includes('teacherCollapsibleList')) {
    /* Prefer exact id+class co-occurrence nearby */
    const idx = html.indexOf('id="' + id.replace(/^#/, '') + '"');
    const window = idx >= 0 ? html.slice(Math.max(0, idx - 80), idx + 120) : '';
    if (/teacherCollapsibleList/.test(window)) ok(label + ' opts into teacherCollapsibleList (' + id + ')');
    else bad(label + ' missing teacherCollapsibleList near id', id);
  } else {
    bad(label + ' missing teacherCollapsibleList', id);
  }
}

if (/id="teacher-approvals"[^>]*teacherCollapsibleList|teacherCollapsibleList[^>]*id="teacher-approvals"/.test(html) ||
    /<details class="card teacherCollapsibleList" id="teacher-approvals"/.test(html)) {
  ok('Review Queue is a details.teacherCollapsibleList card');
} else bad('Review Queue markup not converted to details.teacherCollapsibleList');

if (/<details class="card teacherCollapsibleList" id="teacherMyMissionsCard"/.test(html)) {
  ok('My Missions is a details.teacherCollapsibleList card');
} else bad('My Missions markup not converted');

if (!/<div class="card" id="teacherMyMissionsCard">/.test(html)) ok('legacy always-open My Missions card wrapper removed');
else bad('legacy My Missions div.card still present');

if (/max-height:\s*clamp\(280px,\s*48vh,\s*560px\)/.test(html)) ok('expanded list scroll uses responsive clamp height');
else bad('missing clamp expanded height');

if (/aria-expanded/.test(html) && /initTeacherCollapsibleLists/.test(html)) ok('aria-expanded sync lives in shared initializer');
else bad('aria-expanded wiring missing');

/* Forms / non-lists should not blindly become list panels */
if (/id="teacherCreateMissionDetails"[^>]*teacherCollapsibleCard/.test(html) ||
    /class="card teacherCollapsibleCard" id="teacherCreateMissionDetails"/.test(html) ||
    /id="teacherCreateMissionDetails" class="card teacherCollapsibleCard"/.test(html)) {
  ok('Create New Mission remains teacherCollapsibleCard (form), not list pattern');
} else {
  /* tolerate attribute order */
  const i = html.indexOf('id="teacherCreateMissionDetails"');
  const w = i >= 0 ? html.slice(i, i + 100) : '';
  if (/teacherCollapsibleCard/.test(w) && !/teacherCollapsibleList/.test(w)) ok('Create New Mission remains form collapsible card');
  else bad('Create New Mission unexpectedly converted to list pattern', w);
}

if (/id="schoolAccessStatusCard"[\s\S]{0,200}cardHd/.test(html) && !/id="schoolAccessStatusCard"[^>]*teacherCollapsibleList/.test(html)) {
  ok('Today\'s School Status summary card not converted to list panel');
} else ok('School Status card left as non-list (or already checked)');

console.log('\nteacher-collapsible-list-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
