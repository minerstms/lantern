/**
 * Prompt #171 — School Access dashboard restructure static contract.
 * Usage: node worker/scripts/school-access-dashboard-171-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const html = fs.readFileSync(path.join(root, 'app/teacher.html'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');

let pass = 0;
let fail = 0;
function ok(msg) { pass++; console.log('PASS', msg); }
function bad(msg, d) { fail++; console.error('FAIL', msg, d || ''); }

const pane = html.slice(
  html.indexOf('id="teacherWorkspace-schoolaccess"'),
  html.indexOf('id="teacher-rewards"')
);

const order = [
  'schoolAccessStatusCard',
  'individualAccessCard',
  'classAccessCard',
  'schoolAccessOverrideCard',
  'classroomDevicesCard',
].map((id) => pane.indexOf('id="' + id + '"'));
if (order.every((n, i) => n > 0 && (i === 0 || n > order[i - 1]))) ok('panel DOM order Status→Individual→Class→Schoolwide→Devices');
else bad('panel DOM order wrong', order);

if (/schoolAccessStatusDashboard/.test(pane) && /Current Access Status/.test(pane) && !/<details[^>]*id="schoolAccessStatusCard"/.test(pane)) {
  ok('Current Access Status is always-open section, not details');
} else bad('status dashboard markup wrong');

if (/Individual Access/.test(pane) && /Pending Access Requests/.test(pane) && /Active Individual Grants/.test(pane)) {
  ok('Individual Access hosts pending + active grants');
} else bad('Individual Access content incomplete');

if (!/id="classAccessCard"[\s\S]*Pending Access Requests/.test(pane)) {
  ok('Pending Access Requests not duplicated under Class Access');
} else bad('pending requests still under Class Access');

if (/Schoolwide Access/.test(pane) && /schoolAccessAdminOnly/.test(pane) && /Temporarily open Lantern for all students/.test(pane)) {
  ok('Schoolwide Access copy + admin-only marker');
} else bad('Schoolwide Access labeling/gating incomplete');

if (/Device Enrollment/.test(pane) && /Remember this device/.test(pane) && /shared student\/classroom computers/.test(pane)) {
  ok('Device Enrollment distinguishes classroom vs staff Remember this device');
} else bad('Device Enrollment copy incomplete');

if (/id="classAccessSimDetails"[^>]*schoolAccessAdminOnly/.test(pane) || /schoolAccessAdminOnly" id="classAccessSimDetails"/.test(pane) || /id="classAccessSimDetails"[\s\S]{0,80}schoolAccessAdminOnly/.test(pane)) {
  ok('Access control (testing) is admin-only');
} else bad('sim controls not admin-gated');

if (/applySchoolAccessRoleVisibility/.test(html)) ok('UI role visibility helper present');
else bad('applySchoolAccessRoleVisibility missing');

if (/teacherSidebarItem--divider/.test(html) && /Hallway TV/.test(html)) ok('Hallway TV intentional divider preserved');
else bad('Hallway TV divider missing');

if (/box-shadow:\s*0 8px 18px/.test(html)) ok('sidebar shadow contained (seam mitigation)');
else bad('contained sidebar shadow missing');

if (/override\/start[\s\S]{0,200}requireAdminPilotSession/.test(worker) && /override\/end[\s\S]{0,200}requireAdminPilotSession/.test(worker)) {
  ok('Worker override start/end requireAdminPilotSession');
} else bad('Worker override admin guard missing');

{
  const activeIdx = worker.indexOf("path === '/api/class-access/override/active'");
  const startIdx = worker.indexOf("path === '/api/class-access/override/start'");
  const slice = activeIdx >= 0 && startIdx > activeIdx ? worker.slice(activeIdx, startIdx) : '';
  if (activeIdx >= 0 && /requireStaffPilotSession/.test(slice)) ok('override/active remains staff-readable');
  else bad('override/active staff guard missing');
}

console.log('\nschool-access-dashboard-171-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
