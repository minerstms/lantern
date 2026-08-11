/**
 * Prompt #153 — Help Mode terminology + privileged nav contract (Lantern side).
 * Usage: node worker/scripts/help-mode-audit-test.mjs
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

const helpJs = read('app/js/lantern-help.js');
const staffNav = read('app/js/lantern-staff-nav.js');
const teacherHtml = read('app/teacher.html');
const exploreHtml = read('app/explore.html');

assert(helpJs.includes('Teacher Tools'), 'Help uses Teacher Tools');
assert(helpJs.includes('Behavior Logger'), 'Help mentions Behavior Logger');
assert(helpJs.includes('teacher_hallway_tv'), 'Hallway TV help key present');
assert(helpJs.includes('not in the global Lantern'), 'Display/Hallway TV not framed as global nav');
assert(!/Staff PW|Staff password/i.test(helpJs), 'No Staff PW in Help Mode');
assert(!/device-pairing/i.test(helpJs), 'No device-pairing ceremony in Help Mode');
assert(!/Store tab/i.test(helpJs), 'No Store tab instruction');
assert(!/Teacher → Rewards Panel/.test(helpJs), 'Old Teacher → Rewards Panel path removed');
assert(helpJs.includes('behavior_logger'), 'Behavior Logger help keys present for shared HELP_TEXTS');
assert(exploreHtml.includes('lantern-help.js'), 'Explore still loads Help Mode script (infra retained)');
assert(
  /no longer a standard header control|Mount the toggle only when an explicit #lanternHelpSlot/.test(helpJs),
  'Help Mode header control retired unless explicit slot exists'
);
assert(exploreHtml.includes('data-help="explore"'), 'Explore has contextual help surface');
assert(teacherHtml.includes('data-help="teacher_nuggets"'), 'Teacher Tools Nuggets help');
assert(teacherHtml.includes('data-help="teacher_review"'), 'Teacher Tools Review Queue help');
assert(teacherHtml.includes('data-help="teacher_shoutout"'), 'Teacher Tools Shout-Out help');
assert(teacherHtml.includes('data-help="teacher_hallway_tv"'), 'Teacher Tools Hallway TV help');
assert(staffNav.includes('PRIVILEGED_NAV_ITEMS'), 'Privileged nav items in Lantern staff-nav');
assert(staffNav.includes('buildPrivilegedSectionHtml'), 'buildPrivilegedSectionHtml exported');
assert(!staffNav.includes("label: 'Display Board'"), 'Display Board still excluded from global STAFF');

const sandbox = { window: {}, self: {} };
vm.runInNewContext(staffNav, sandbox);
const LSN = sandbox.window.LanternStaffNav || sandbox.self.LanternStaffNav;
assert(LSN.buildPrivilegedSectionHtml('explore', 'lantern', null) === '', 'Lantern Explore without caps: no Reports/System');
assert(LSN.buildMenuSectionsHtml('explore', 'lantern').indexOf('Reports') < 0, 'Default Explore menu omits Reports');

console.log('\nhelp-mode-audit-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
