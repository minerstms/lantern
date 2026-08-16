/**
 * Prompt #146/#163 — Canonical Lantern ▼ contract (labels, order, role gates).
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

const EXPECTED_STAFF = ['Teacher Tools', 'Behavior Logger'];
const EXPECTED_NAV = ['Lantern', 'Locker', 'Create', 'Media Library', 'Play', 'Missions'];
const staffNav = read('app/js/lantern-staff-nav.js');
const lanternNav = read('app/js/lantern-nav.js');
const teacherHtml = read('app/teacher.html');
const displayHtml = read('app/display.html');

assert(staffNav.includes("label: 'Teacher Tools'"), 'lantern-staff-nav: Teacher Tools label');
assert(staffNav.includes("label: 'Behavior Logger'"), 'lantern-staff-nav: Behavior Logger label');
assert(!/label:\s*'Admin'/.test(staffNav), 'lantern-staff-nav: Admin is not a STAFF item (#163)');
assert(staffNav.includes("label: 'Locker'"), 'lantern-staff-nav: Locker in NAVIGATION');
assert(staffNav.includes('buildMenuSectionsHtml'), 'lantern-staff-nav: full menu sections builder');
assert(!staffNav.includes("label: 'Display Board'"), 'lantern-staff-nav: Display Board label removed');
assert(!staffNav.includes("label: 'Display'"), 'lantern-staff-nav: bare Display label absent');
assert(!/label:\s*'Hallway TV'/.test(staffNav), 'lantern-staff-nav: Hallway TV absent from global STAFF contract');
assert(!/label:\s*'Store'/.test(staffNav), 'lantern-staff-nav: Store absent');

const navBlock = (staffNav.match(/NAVIGATION_ITEMS\s*=\s*\[[\s\S]*?\];/) || [''])[0];
const navOrder = [...navBlock.matchAll(/label:\s*'([^']+)'/g)].map((m) => m[1]);
assert(JSON.stringify(navOrder) === JSON.stringify(EXPECTED_NAV), 'lantern-staff-nav NAVIGATION label order exact', JSON.stringify(navOrder));

const staffBlock = (staffNav.match(/STAFF_NAV_ITEMS\s*=\s*\[[\s\S]*?\];/) || [''])[0];
const staffOrder = [...staffBlock.matchAll(/label:\s*'([^']+)'/g)].map((m) => m[1]);
assert(JSON.stringify(staffOrder) === JSON.stringify(EXPECTED_STAFF), 'STAFF label order exact', JSON.stringify(staffOrder));

assert(staffNav.includes('PRIVILEGED_NAV_ITEMS'), 'lantern-staff-nav: PRIVILEGED_NAV_ITEMS');
assert(staffNav.includes("label: 'Reports'"), 'lantern-staff-nav: Reports privileged label');
assert(staffNav.includes("label: 'System'"), 'lantern-staff-nav: System privileged label');
assert(staffNav.includes('buildPrivilegedSectionHtml'), 'lantern-staff-nav: buildPrivilegedSectionHtml');
assert(/\/teacher\.html/.test(staffNav), 'Teacher Tools route includes /teacher.html');
assert(/tms-device-authorize/.test(staffNav) && /log\.tmslantern\.org/.test(staffNav), 'Behavior Logger route uses TMS authorize handoff');
assert(staffNav.includes('/admin#system'), 'System href targets /admin#system');
assert(/caps\.report_maker/.test(staffNav) && !/caps\.report_maker \|\| caps\.behavior_admin/.test(staffNav), 'Reports gated by REPORT_MAKER only');
assert(!staffNav.includes("label: 'Teacher Dashboard'"), 'lantern-staff-nav: Teacher Dashboard retired from STAFF');
assert(staffNav.includes("label: 'Behavior Administration'"), 'lantern-staff-nav: Behavior Administration privileged label');
assert(!/normalizeRole\(role\) === 'admin'\) return true/.test(staffNav), 'privileged nav has no role===admin shortcut');

assert(lanternNav.includes('LanternStaffNav.buildMenuSectionsHtml'), 'lantern-nav.js uses shared full menu builder');
assert(lanternNav.includes('applyCanonicalLanternMenu'), 'lantern-nav.js applies canonical role+cap menu after auth (#163)');
assert(lanternNav.includes('--lantern-nav-text-inset'), 'lantern-nav.js shares text-inset alignment variable');
assert(staffNav.includes("label: 'Lantern'"), 'lantern-staff-nav: Lantern first NAVIGATION label (#202)');
assert(staffNav.includes("path: '/explore.html'"), 'lantern-staff-nav: Lantern/Explore path');
assert(lanternNav.includes('href="explore.html"') && lanternNav.includes('id="lanternHomeLink"'), 'lantern-nav home link is explore.html');
assert(lanternNav.includes('Locker') && lanternNav.includes('Create') && lanternNav.includes('Media Library') && lanternNav.includes('Play') && lanternNav.includes('Missions'), 'lantern-nav fallback includes NAVIGATION destinations');
assert(!lanternNav.includes('Display Board'), 'lantern-nav fallback has no Display Board');
assert(!/>Display</.test(lanternNav), 'lantern-nav has no bare Display STAFF label');
assert(!/Hallway TV/.test(lanternNav), 'lantern-nav has no Hallway TV in global dropdown');
assert(!/Teacher Tools/.test(lanternNav.split('buildLanternNavDropdownHtml')[1]?.slice(0, 1600) || ''), 'lantern-nav static fallback omits STAFF (fail closed)');

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

const sandbox = { window: {}, self: {} };
vm.runInNewContext(staffNav, sandbox);
const LSN = sandbox.window.LanternStaffNav || sandbox.self.LanternStaffNav;
assert(!!LSN, 'LanternStaffNav exports from lantern-staff-nav.js');
assert(JSON.stringify(LSN.labelsInOrder()) === JSON.stringify(EXPECTED_STAFF), 'labelsInOrder is Teacher Tools + Behavior Logger', JSON.stringify(LSN.labelsInOrder()));
assert(JSON.stringify(LSN.staffLabelsInOrder('admin')) === JSON.stringify(EXPECTED_STAFF), 'admin role STAFF has no Admin item', JSON.stringify(LSN.staffLabelsInOrder('admin')));
assert(JSON.stringify(LSN.staffLabelsInOrder('teacher')) === JSON.stringify(EXPECTED_STAFF), 'teacher role STAFF is Teacher Tools + Behavior Logger');
assert(JSON.stringify(LSN.staffLabelsInOrder('student')) === JSON.stringify(EXPECTED_STAFF), 'staff item list itself is role-agnostic');

const defaultMenu = LSN.buildMenuSectionsHtml('explore', 'lantern');
assert(!/STAFF/.test(defaultMenu), 'default buildMenuSectionsHtml omits STAFF without role');
assert(!/Reports|System/.test(defaultMenu), 'default menu omits Reports/System without caps');
assert(!/Hallway TV|Display Board/.test(defaultMenu), 'global menu still omits Hallway TV / Display Board');

const studentMenu = LSN.buildMenuSectionsHtml('explore', 'lantern', null, 'student');
assert(!/STAFF|Teacher Tools|Behavior Logger|Reports|System/.test(studentMenu), 'student menu is core navigation only');
assert(/Media Library/.test(studentMenu), 'student menu includes Media Library');

const teacherMenu = LSN.buildMenuSectionsHtml('explore', 'lantern', null, 'teacher');
assert(/STAFF/.test(teacherMenu) && /Teacher Tools/.test(teacherMenu) && /Behavior Logger/.test(teacherMenu) && !/Teacher Dashboard/.test(teacherMenu), 'teacher menu includes STAFF links and no Teacher Dashboard');
assert(!/Reports/.test(teacherMenu) && !/>System</.test(teacherMenu), 'teacher without caps has no Reports/System');

const reportingMenu = LSN.buildMenuSectionsHtml('explore', 'lantern', { report_maker: true }, 'teacher');
assert(/ADMIN \/ TOOLS/.test(reportingMenu) && /Reports/.test(reportingMenu), 'REPORT_MAKER shows Reports');
assert(!/>System</.test(reportingMenu), 'REPORT_MAKER alone does not show System');

const adminRoleOnly = LSN.buildMenuSectionsHtml('admin', 'lantern', null, 'admin');
assert(!/Reports/.test(adminRoleOnly) && !/data-page="system"/.test(adminRoleOnly), 'Lantern admin role alone does not grant Reports/System');
const adminMenu = LSN.buildMenuSectionsHtml('admin', 'lantern', { report_maker: true, behavior_admin: true, system_admin: true }, 'admin');
assert(/Reports/.test(adminMenu) && /Behavior Administration/.test(adminMenu) && /data-page="system"/.test(adminMenu), 'Web Admin caps show Reports + Behavior Administration + System');
assert(/href="\/admin#system"/.test(adminMenu), 'System menuitem href is /admin#system');

console.log('\nstaff-nav-labels-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
