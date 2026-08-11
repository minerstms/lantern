/**
 * Prompt #146 — Canonical STAFF nav contract (labels, order, routes) string-scan guard.
 * Usage: node worker/scripts/staff-nav-labels-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', '..');

let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }
function assert(cond, label, detail) { if (cond) ok(label); else bad(label, detail); }

function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

const EXPECTED = ['Teacher Tools', 'Behavior Logger'];
const EXPECTED_NAV = ['Locker', 'Create', 'Play', 'Missions'];
const staffNav = read('app/js/lantern-staff-nav.js');
const lanternNav = read('app/js/lantern-nav.js');
const teacherHtml = read('app/teacher.html');
const displayHtml = read('app/display.html');

assert(staffNav.includes("label: 'Teacher Tools'"), 'lantern-staff-nav: Teacher Tools label');
assert(staffNav.includes("label: 'Behavior Logger'"), 'lantern-staff-nav: Behavior Logger label');
assert(staffNav.includes("label: 'Locker'"), 'lantern-staff-nav: Locker in NAVIGATION');
assert(staffNav.includes('buildMenuSectionsHtml'), 'lantern-staff-nav: full menu sections builder');
assert(!staffNav.includes("label: 'Display Board'"), 'lantern-staff-nav: Display Board label removed');
assert(!staffNav.includes("label: 'Display'"), 'lantern-staff-nav: bare Display label absent');
assert(!/label:\s*'Hallway TV'/.test(staffNav), 'lantern-staff-nav: Hallway TV absent from global STAFF contract');

const staffBlock = (staffNav.match(/STAFF_NAV_ITEMS\s*=\s*\[[\s\S]*?\];/) || [''])[0];
const labelOrder = [...staffBlock.matchAll(/label:\s*'([^']+)'/g)].map((m) => m[1]);
assert(JSON.stringify(labelOrder) === JSON.stringify(EXPECTED), 'lantern-staff-nav STAFF label order exact', JSON.stringify(labelOrder));
const navBlock = (staffNav.match(/NAVIGATION_ITEMS\s*=\s*\[[\s\S]*?\];/) || [''])[0];
const navOrder = [...navBlock.matchAll(/label:\s*'([^']+)'/g)].map((m) => m[1]);
assert(JSON.stringify(navOrder) === JSON.stringify(EXPECTED_NAV), 'lantern-staff-nav NAVIGATION label order exact', JSON.stringify(navOrder));

assert(staffNav.includes('PRIVILEGED_NAV_ITEMS'), 'lantern-staff-nav: PRIVILEGED_NAV_ITEMS (#153)');
assert(staffNav.includes("label: 'Reports'"), 'lantern-staff-nav: Reports privileged label');
assert(staffNav.includes("label: 'System'"), 'lantern-staff-nav: System privileged label');
assert(staffNav.includes('buildPrivilegedSectionHtml'), 'lantern-staff-nav: buildPrivilegedSectionHtml');
assert(/\/teacher\.html/.test(staffNav), 'Teacher Tools route includes /teacher.html');
assert(/tms-device-authorize/.test(staffNav) && /tmsnuggets\.pages\.dev/.test(staffNav), 'Behavior Logger route uses TMS authorize handoff');

assert(lanternNav.includes('LanternStaffNav.buildMenuSectionsHtml'), 'lantern-nav.js uses shared full menu builder');
assert(lanternNav.includes('--lantern-nav-text-inset'), 'lantern-nav.js shares text-inset alignment variable');
assert(lanternNav.includes('Teacher Tools') && lanternNav.includes('Behavior Logger'), 'lantern-nav fallback uses Teacher Tools + Behavior Logger');
assert(lanternNav.includes('Locker') && lanternNav.includes('Create') && lanternNav.includes('Play') && lanternNav.includes('Missions'), 'lantern-nav fallback includes NAVIGATION destinations');
assert(!lanternNav.includes('Display Board'), 'lantern-nav fallback has no Display Board');
assert(!/>Display</.test(lanternNav), 'lantern-nav has no bare Display STAFF label');
assert(!/Hallway TV/.test(lanternNav), 'lantern-nav has no Hallway TV in global dropdown');

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

console.log('\nstaff-nav-labels-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
