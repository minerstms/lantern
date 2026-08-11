/**
 * Prompt #143 / #171 — Teacher sidebar default-open states + Missions order + School Access order.
 * Static contract against app/teacher.html (no browser).
 * Usage: node worker/scripts/teacher-sidebar-defaults-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const html = fs.readFileSync(path.join(root, 'app/teacher.html'), 'utf8');

let pass = 0;
let fail = 0;
function ok(msg) { pass++; console.log('PASS', msg); }
function bad(msg, d) { fail++; console.error('FAIL', msg, d || ''); }

function openingTagForId(id) {
  const m = html.match(new RegExp('<details\\b[^>]{0,200}\\bid="' + id + '"[^>]*>', 'i'));
  if (m) return m[0];
  const idx = html.indexOf('id="' + id + '"');
  if (idx < 0) return '';
  const start = html.lastIndexOf('<', idx);
  const end = html.indexOf('>', idx);
  return start >= 0 && end > start ? html.slice(start, end + 1) : '';
}

// Missions order: My Missions before Create New Mission
const myIdx = html.indexOf('id="teacherMyMissionsCard"');
const createIdx = html.indexOf('id="teacherCreateMissionDetails"');
if (myIdx > 0 && createIdx > myIdx) ok('Missions order: My Missions first, Create New Mission second');
else bad('Missions order wrong', { myIdx, createIdx });

const myTag = openingTagForId('teacherMyMissionsCard');
if (/\bopen\b/.test(myTag) && /data-collapsible-default-open="1"/.test(myTag)) {
  ok('My Missions defaults open (open / data-collapsible-default-open)');
} else bad('My Missions missing default-open markup', myTag);

const createTag = openingTagForId('teacherCreateMissionDetails');
if (createTag && !/\bopen\b/.test(createTag) && !/data-collapsible-default-open="1"/.test(createTag)) {
  ok('Create New Mission defaults closed (no open attr)');
} else bad('Create New Mission should not have open by default', createTag);

if (/'other-tools'\s*:\s*'overview'|"other-tools"\s*:\s*"overview"|other-tools:\s*'overview'/.test(html)) ok('stale #other-tools aliases to overview');
else bad('other-tools→overview alias missing');

// Prompt #171 — School Access order + always-open status dashboard
const statusIdx = html.indexOf('id="schoolAccessStatusCard"');
const individualIdx = html.indexOf('id="individualAccessCard"');
const classIdx = html.indexOf('id="classAccessCard"');
const overrideIdx = html.indexOf('id="schoolAccessOverrideCard"');
const devicesIdx = html.indexOf('id="classroomDevicesCard"');
if (statusIdx > 0 && statusIdx < individualIdx && individualIdx < classIdx && classIdx < overrideIdx && overrideIdx < devicesIdx) {
  ok('School Access order: Status → Individual → Class → Schoolwide → Device Enrollment');
} else bad('School Access order wrong', { statusIdx, individualIdx, classIdx, overrideIdx, devicesIdx });

const statusTag = openingTagForId('schoolAccessStatusCard');
if (/<section\b/.test(statusTag) && /schoolAccessStatusDashboard/.test(statusTag) && !/teacherCollapsibleList/.test(statusTag)) {
  ok('Current Access Status is always-open section dashboard (not accordion details)');
} else bad('School Status must be section.schoolAccessStatusDashboard', statusTag);

if (/Current Access Status/.test(html)) ok('Current Access Status label present');
else bad('Current Access Status label missing');

if (/Individual Access/.test(html) && /id="individualAccessCard"/.test(html)) ok('Individual Access panel present');
else bad('Individual Access panel missing');

if (/Schoolwide Access/.test(html)) ok('Schoolwide Access label present');
else bad('Schoolwide Access label missing');

if (/Device Enrollment/.test(html) && /id="classroomDevicesCard"/.test(html)) ok('Device Enrollment label present');
else bad('Device Enrollment label missing');

for (const id of ['individualAccessCard', 'classAccessCard', 'schoolAccessOverrideCard', 'classroomDevicesCard']) {
  const tag = openingTagForId(id);
  if (/\bopen\b/.test(tag) || /data-collapsible-default-open="1"/.test(tag)) {
    bad(id + ' should default closed', tag);
  } else ok(id + ' defaults closed');
}

if (/schoolAccessAdminOnly/.test(html) && /id="schoolAccessOverrideCard"/.test(html) && /id="classAccessSimDetails"/.test(html)) {
  ok('Schoolwide + simulation marked schoolAccessAdminOnly');
} else bad('admin-only School Access markers missing');

if (/teacherSidebarItem--divider/.test(html) && /Hallway TV/.test(html)) {
  ok('Intentional Hallway TV sidebar divider class preserved');
} else bad('Hallway TV divider missing');

// Primary panels default open
for (const [id, label] of [
  ['teacher-approvals', 'Review Queue'],
  ['teacher-shoutout-card', 'Shout-Out!'],
  ['teacher-moderation', 'Moderation'],
  ['teacher-rewards', 'Nuggets Rewards Panel'],
]) {
  const tag = openingTagForId(id);
  if (/\bopen\b/.test(tag) && /data-collapsible-default-open="1"/.test(tag)) {
    ok(label + ' primary panel defaults open');
  } else bad(label + ' missing default-open', tag);
}

if (/applyWorkspaceDefaultOpen/.test(html)) ok('activateWorkspace applies destination default-open via applyWorkspaceDefaultOpen');
else bad('applyWorkspaceDefaultOpen missing');

if (/other:\s*'overview'/.test(html) || /other:\s*"overview"/.test(html)) {
  ok('stale #other aliases to overview');
} else bad('other→overview alias missing');

if (!/data-workspace-link="other"/.test(html)) ok('Other Tools absent from sidebar');
else bad('Other Tools still in sidebar');

if (/id="teacher-utilities"/.test(html) && /data-workspace="other"/.test(html)) {
  ok('Other Tools implementation retained (archived from nav only)');
} else bad('Other Tools DOM should be preserved');

if (/Hallway TV/.test(html) && /href="display\.html"/.test(html)) ok('Hallway TV remains separate display.html link');
else bad('Hallway TV link missing');

const hallwayIdx = html.indexOf('Hallway TV');
const phoneIdx = html.indexOf('Phone App Download');
if (phoneIdx > hallwayIdx && hallwayIdx > 0) ok('Phone App Download appears after Hallway TV (bottom of sidebar)');
else bad('Phone App Download placement', { hallwayIdx, phoneIdx });

if (/id="teacherPhoneAppDownloadLink"/.test(html) && /intent=install/.test(html) && /tmsnuggets\.pages\.dev/.test(html)) {
  ok('Phone App Download routes to existing TMS PWA install intent');
} else bad('Phone App Download route/intent missing');

const staffNavPath = path.join(root, 'app/js/lantern-staff-nav.js');
const staffNav = fs.readFileSync(staffNavPath, 'utf8');
if (!/Phone App Download/.test(staffNav)) ok('Phone App Download absent from global LanternStaffNav');
else bad('Phone App Download must not be in global dropdown');

// Prompt #174 — opaque mobile Teacher sidebar + no translucent bleed fill
const sidebarCssMatch = html.match(/\.teacherSidebar\{[\s\S]*?box-shadow:[^}]+\}/);
const sidebarCss = sidebarCssMatch ? sidebarCssMatch[0] : '';
if (/background:\s*var\(--panel\)/.test(sidebarCss) && /background-color:\s*var\(--panel\)/.test(sidebarCss)) {
  ok('17. Teacher sidebar uses opaque --panel background');
} else bad('Teacher sidebar must use opaque --panel', sidebarCss.slice(0, 200));
if (!/rgba\(255,255,255,\s*\.0[25]\)/.test(sidebarCss)) {
  ok('17b. Teacher sidebar no longer uses translucent white gradient');
} else bad('Teacher sidebar still translucent', sidebarCss.slice(0, 200));
if (/@media \(max-width: 900px\)[\s\S]*\.teacherSidebar\{[\s\S]*z-index:\s*5000/.test(html)) {
  ok('17c. mobile sidebar z-index remains below header (5000)');
} else bad('mobile sidebar z-index contract broken');

if (/lanternMgmtRecord/.test(html) || /wireRecords/.test(html) || /LanternCollapsibleList/.test(html)) {
  ok('record-level disclosure system still referenced');
} else bad('record disclosure system missing');

console.log('\nteacher-sidebar-defaults-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
