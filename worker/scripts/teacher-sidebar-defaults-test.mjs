/**
 * Prompt #143 — Teacher sidebar default-open states + Missions order + Other Tools archive.
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

// School Access order + defaults
const statusIdx = html.indexOf('id="schoolAccessStatusCard"');
const overrideIdx = html.indexOf('id="schoolAccessOverrideCard"');
const classIdx = html.indexOf('id="classAccessCard"');
const devicesIdx = html.indexOf('id="classroomDevicesCard"');
if (statusIdx < overrideIdx && overrideIdx < classIdx && classIdx < devicesIdx) {
  ok('School Access order: Status → Open Temporarily → Class Access → Classroom Devices');
} else bad('School Access order wrong');

const statusTag = openingTagForId('schoolAccessStatusCard');
if (/\bopen\b/.test(statusTag) && /data-collapsible-default-open="1"/.test(statusTag)) {
  ok("Today's School Status defaults open");
} else bad('School Status missing default-open', statusTag);

for (const id of ['schoolAccessOverrideCard', 'classAccessCard', 'classroomDevicesCard']) {
  const tag = openingTagForId(id);
  if (/\bopen\b/.test(tag) || /data-collapsible-default-open="1"/.test(tag)) {
    bad(id + ' should default closed', tag);
  } else ok(id + ' defaults closed');
}

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

if (/lanternMgmtRecord/.test(html) || /wireRecords/.test(html) || /LanternCollapsibleList/.test(html)) {
  ok('record-level disclosure system still referenced');
} else bad('record disclosure system missing');

console.log('\nteacher-sidebar-defaults-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
