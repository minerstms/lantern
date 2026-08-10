/**
 * Prompt #145 — Canonical STAFF nav contract (labels, order, routes) string-scan guard.
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

const EXPECTED = ['Teacher Tools', 'Behavior Logger', 'Display Board'];
const staffNav = read('app/js/lantern-staff-nav.js');
const lanternNav = read('app/js/lantern-nav.js');
const teacherHtml = read('app/teacher.html');
const displayHtml = read('app/display.html');

assert(staffNav.includes("label: 'Teacher Tools'"), 'lantern-staff-nav: Teacher Tools label');
assert(staffNav.includes("label: 'Behavior Logger'"), 'lantern-staff-nav: Behavior Logger label');
assert(staffNav.includes("label: 'Display Board'"), 'lantern-staff-nav: Display Board label');

const labelOrder = [...staffNav.matchAll(/label:\s*'([^']+)'/g)].map((m) => m[1]);
assert(JSON.stringify(labelOrder) === JSON.stringify(EXPECTED), 'lantern-staff-nav label order exact', JSON.stringify(labelOrder));

assert(/\/teacher\.html/.test(staffNav), 'Teacher Tools route includes /teacher.html');
assert(/tms-device-authorize/.test(staffNav) && /tmsnuggets\.pages\.dev/.test(staffNav), 'Behavior Logger route uses TMS authorize handoff');
assert(/display\.html/.test(staffNav), 'Display Board route includes display.html');

assert(lanternNav.includes('LanternStaffNav.buildStaffSectionLinksHtml'), 'lantern-nav.js uses shared LanternStaffNav builder');
assert(lanternNav.includes('Teacher Tools') && lanternNav.includes('Behavior Logger') && lanternNav.includes('Display Board'), 'lantern-nav fallback also uses new labels');
assert(!/>Teacher<\/a>/.test(lanternNav) || lanternNav.includes('Teacher Tools'), 'lantern-nav does not keep bare Teacher STAFF label without Teacher Tools');

assert(!/<nav class="teacherPrimaryNav"/.test(teacherHtml), 'teacher.html: giant primary nav markup removed');
assert(!teacherHtml.includes('id="teacherPrimaryNavBehavior"'), 'teacher.html: giant Behavior button removed');
assert(!teacherHtml.includes('id="teacherPrimaryNavTeacher"'), 'teacher.html: giant Teacher button removed');
assert(teacherHtml.includes('lantern-staff-nav.js'), 'teacher.html loads lantern-staff-nav.js');

assert(fs.readFileSync(path.join(root, 'app/js/lantern-pilot-auth.js'), 'utf8').includes("'teacher'") ||
  fs.readFileSync(path.join(root, 'app/js/lantern-pilot-auth.js'), 'utf8').includes('"teacher"'),
  'auth role value teacher unchanged in lantern-pilot-auth.js');

assert(displayHtml.includes('page-marquee-only'), 'display.html keeps marquee-only special header class');
assert(!displayHtml.includes('lantern-staff-nav.js'), 'display.html does not load staff-nav (marquee exception)');
assert(!displayHtml.includes('lantern-nav.js'), 'display.html does not mount full Lantern nav app bar');

console.log('\nstaff-nav-labels-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
