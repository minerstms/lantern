/**
 * Prompt #146/#199 — Canonical STAFF nav contract (labels, order, routes) string-scan guard.
 * Usage: node worker/scripts/staff-nav-labels-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', '..');

let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }
function assert(cond, label, detail) { if (cond) ok(label); else bad(label, detail); }

function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

const EXPECTED = ['Teacher Tools', 'Behavior Logger'];
const EXPECTED_ADMIN = ['Teacher Tools', 'Behavior Logger', 'Admin'];
const EXPECTED_NAV = ['Locker', 'Create', 'Play', 'Missions'];
const staffNav = read('app/js/lantern-staff-nav.js');
const lanternNav = read('app/js/lantern-nav.js');
const teacherHtml = read('app/teacher.html');
const displayHtml = read('app/display.html');

assert(staffNav.includes("label: 'Teacher Tools'"), 'lantern-staff-nav: Teacher Tools label');
assert(staffNav.includes("label: 'Behavior Logger'"), 'lantern-staff-nav: Behavior Logger label');
assert(staffNav.includes("label: 'Admin'"), 'lantern-staff-nav: Admin label (#199)');
assert(staffNav.includes('adminOnly: true'), 'lantern-staff-nav: Admin is adminOnly-gated');
assert(staffNav.includes("label: 'Locker'"), 'lantern-staff-nav: Locker in NAVIGATION');
assert(staffNav.includes('buildMenuSectionsHtml'), 'lantern-staff-nav: full menu sections builder');
assert(!staffNav.includes("label: 'Display Board'"), 'lantern-staff-nav: Display Board label removed');
assert(!staffNav.includes("label: 'Display'"), 'lantern-staff-nav: bare Display label absent');
assert(!/label:\s*'Hallway TV'/.test(staffNav), 'lantern-staff-nav: Hallway TV absent from global STAFF contract');

const navBlock = (staffNav.match(/NAVIGATION_ITEMS\s*=\s*\[[\s\S]*?\];/) || [''])[0];
const navOrder = [...navBlock.matchAll(/label:\s*'([^']+)'/g)].map((m) => m[1]);
assert(JSON.stringify(navOrder) === JSON.stringify(EXPECTED_NAV), 'lantern-staff-nav NAVIGATION label order exact', JSON.stringify(navOrder));

assert(staffNav.includes('PRIVILEGED_NAV_ITEMS'), 'lantern-staff-nav: PRIVILEGED_NAV_ITEMS (#153)');
assert(staffNav.includes("label: 'Reports'"), 'lantern-staff-nav: Reports privileged label');
assert(staffNav.includes("label: 'System'"), 'lantern-staff-nav: System privileged label');
assert(staffNav.includes('buildPrivilegedSectionHtml'), 'lantern-staff-nav: buildPrivilegedSectionHtml');
assert(/\/teacher\.html/.test(staffNav), 'Teacher Tools route includes /teacher.html');
assert(/tms-device-authorize/.test(staffNav) && /log\.tmslantern\.org/.test(staffNav), 'Behavior Logger route uses TMS authorize handoff');
assert(/id === 'admin'[\s\S]*?\/admin/.test(staffNav) || /\/admin'/.test(staffNav), 'Admin href targets /admin');

assert(lanternNav.includes('LanternStaffNav.buildMenuSectionsHtml'), 'lantern-nav.js uses shared full menu builder');
assert(lanternNav.includes('applyStaffNavForRole'), 'lantern-nav.js applies role-gated STAFF after auth (#199)');
assert(lanternNav.includes('--lantern-nav-text-inset'), 'lantern-nav.js shares text-inset alignment variable');
assert(lanternNav.includes('Teacher Tools') && lanternNav.includes('Behavior Logger'), 'lantern-nav fallback uses Teacher Tools + Behavior Logger');
assert(lanternNav.includes('Locker') && lanternNav.includes('Create') && lanternNav.includes('Play') && lanternNav.includes('Missions'), 'lantern-nav fallback includes NAVIGATION destinations');
assert(!lanternNav.includes('Display Board'), 'lantern-nav fallback has no Display Board');
assert(!/>Display</.test(lanternNav), 'lantern-nav has no bare Display STAFF label');
assert(!/Hallway TV/.test(lanternNav), 'lantern-nav has no Hallway TV in global dropdown');
assert(!/data-page="admin"/.test(lanternNav.split('buildLanternNavDropdownHtml')[1]?.slice(0, 1200) || ''), 'lantern-nav static fallback omits Admin (no role yet)');

assert(!/<nav class="teacherPrimaryNav"/.test(teacherHtml), 'teacher.html: giant primary nav markup removed');
assert(!teacherHtml.includes('id="teacherPrimaryNavBehavior"'), 'teacher.html: giant Behavior button removed');
assert(!teacherHtml.includes('id="teacherPrimaryNavTeacher"'), 'teacher.html: giant Teacher button removed');
assert(teacherHtml.includes('lantern-staff-nav.js'), 'teacher.html loads lantern-staff-nav.js');
assert(/teacherSidebarLabel">Hallway TV</.test(teacherHtml), 'Teacher Tools sidebar still exposes Hallway TV');

assert(fs.readFileSync(path.join(root, 'app/js/lantern-pilot-auth.js'), 'utf8').includes("'teacher'") ||
  fs.readFileSync(path.join(root, 'app/js/lantern-pilot-auth.js'), 'utf8').includes('"teacher"'),
  'auth role value teacher unchanged in lantern-pilot-auth.js');

assert(displayHtml.includes('page-marquee-only'), 'display.html keeps marquee-only special header class');
assert(!displayHtml.includes('lantern-staff-nav.js'), 'display.html does not load staff-nav (marquee exception)');
assert(!displayHtml.includes('lantern-nav.js'), 'display.html does not mount full Lantern nav app bar');

/* Runtime contract via vm — Admin visibility matches /admin gate */
const sandbox = { window: {}, self: {} };
vm.runInNewContext(staffNav, sandbox);
const LSN = sandbox.window.LanternStaffNav || sandbox.self.LanternStaffNav;
assert(!!LSN, 'LanternStaffNav exports from lantern-staff-nav.js');
assert(JSON.stringify(LSN.labelsInOrder()) === JSON.stringify(EXPECTED), 'labelsInOrder excludes Admin by default', JSON.stringify(LSN.labelsInOrder()));
assert(JSON.stringify(LSN.staffLabelsInOrder('admin')) === JSON.stringify(EXPECTED_ADMIN), 'admin role STAFF order includes Admin', JSON.stringify(LSN.staffLabelsInOrder('admin')));
assert(JSON.stringify(LSN.staffLabelsInOrder('teacher')) === JSON.stringify(EXPECTED), 'teacher role STAFF omits Admin');
assert(JSON.stringify(LSN.staffLabelsInOrder('student')) === JSON.stringify(EXPECTED), 'student role STAFF omits Admin');
assert(JSON.stringify(LSN.staffLabelsInOrder('')) === JSON.stringify(EXPECTED), 'empty role STAFF omits Admin');

const adminHtml = LSN.buildStaffSectionLinksHtml('admin', 'lantern', 'admin');
assert(/data-page="admin"/.test(adminHtml) && />Admin</.test(adminHtml), 'admin role builds Admin menuitem');
assert(/href="\/admin"/.test(adminHtml), 'Admin menuitem href is /admin');
assert(/Teacher Tools/.test(adminHtml) && /Behavior Logger/.test(adminHtml), 'admin STAFF keeps Teacher Tools + Behavior Logger');

const teacherHtmlNav = LSN.buildStaffSectionLinksHtml('teacher', 'lantern', 'teacher');
assert(!/data-page="admin"/.test(teacherHtmlNav) && !/>Admin</.test(teacherHtmlNav), 'teacher role builds no Admin menuitem');

const defaultMenu = LSN.buildMenuSectionsHtml('explore', 'lantern');
assert(!/data-page="admin"/.test(defaultMenu), 'default buildMenuSectionsHtml omits Admin without role');
assert(!/Hallway TV|Display Board/.test(defaultMenu), 'global menu still omits Hallway TV / Display Board');

const adminMenu = LSN.buildMenuSectionsHtml('admin', 'lantern', null, 'admin');
assert(/data-page="admin"/.test(adminMenu) && /href="\/admin"/.test(adminMenu), 'admin menu includes /admin link');
assert(/is-active" data-page="admin"/.test(adminMenu) || /data-page="admin"[^>]*is-active/.test(adminMenu) || /class="lanternAppBarDropdownLink is-active" data-page="admin"/.test(adminMenu), 'Admin active on admin page');

console.log('\nstaff-nav-labels-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
