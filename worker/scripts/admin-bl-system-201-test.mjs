/**
 * Prompt #201 — Lantern Admin Device Access + System Administration + tms-ops route.
 * Usage: node worker/scripts/admin-bl-system-201-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const adminHtml = fs.readFileSync(path.join(root, 'app/admin.html'), 'utf8');
const blJs = fs.readFileSync(path.join(root, 'app/js/lantern-admin-bl-system.js'), 'utf8');
const staffNav = fs.readFileSync(path.join(root, 'app/js/lantern-staff-nav.js'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');

let pass = 0;
let fail = 0;
function assert(cond, msg) {
  if (cond) {
    pass++;
    console.log('PASS', msg);
  } else {
    fail++;
    console.error('FAIL', msg);
  }
}

assert(adminHtml.includes('id="adminStaffCard"'), 'Staff canonical card present');
assert(adminHtml.includes('id="lanternDeviceAccessPanel"'), 'Device Access nested under Staff');
assert(adminHtml.includes('>Device Access<') || adminHtml.includes('Device Access</div>'), 'Device Access label');
assert(adminHtml.includes('id="adminSystemAdministrationCard"'), 'System Administration card');
assert(adminHtml.includes('id="lanternBlGroupsPanel"'), 'Groups sub-collapsible');
assert(adminHtml.includes('id="lanternBlBulkPanel"'), 'Bulk Tools sub-collapsible');
assert(adminHtml.includes('id="lanternBlRolloverPanel"'), 'Rollover sub-collapsible');
assert(adminHtml.includes('lantern-admin-bl-system.js'), 'loads bl-system module');
assert(blJs.includes("/api/admin/tms-ops"), 'client posts tms-ops');
assert(blJs.includes("listDeviceRequests"), 'device list action');
assert(blJs.includes("approveDevice"), 'approve device');
assert(blJs.includes("revokeDevice"), 'revoke device');
assert(worker.includes("path === '/api/admin/tms-ops'"), 'worker tms-ops route');
assert(staffNav.includes("LANTERN_ORIGIN + '/admin#system'") || staffNav.includes("/admin#system"), 'System href Lantern Admin');
assert(adminHtml.includes('id="adminStudentsCard"'), 'Students preserved');
assert(!adminHtml.includes('Add teacher'), 'no Add teacher on Lantern Admin');

console.log('\nadmin-bl-system-201-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
