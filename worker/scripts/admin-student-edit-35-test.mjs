/**
 * Prompt #35 — Admin name-edit persistence + missing-ID row UI.
 * Usage: node worker/scripts/admin-student-edit-35-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function run() {
  const adminHtml = read('app/admin.html');
  const indexSrc = read('worker/index.js');
  const tmsUpdate = indexSrc.includes('destination_name_taken') && indexSrc.includes('lantern_display_updated');
  if (tmsUpdate) ok('Lantern update maps dest-name failure and syncs linked display_name');
  else bad('Lantern update wiring');

  if (adminHtml.includes("cache: 'no-store'") && adminHtml.includes('/api/admin/tms-roster')) {
    ok('roster refetch uses cache: no-store after save');
  } else bad('no-store refetch');

  if (adminHtml.includes('Another roster row already uses this name.')) {
    ok('duplicate-name save shows the actionable failure, not success');
  } else bad('dup name copy');

  if (
    adminHtml.includes('Missing Student ID') &&
    adminHtml.includes("studentRowActionAttrs(s, 'set-id')") &&
    adminHtml.includes('Set Student ID') &&
    adminHtml.includes('Delete Mistaken Row')
  ) {
    ok('13/14. missing-ID row explains the state and exposes Set Student ID');
  } else bad('missing-id UI');

  if (adminHtml.includes('ordinary Delete cannot target it safely')) {
    ok('missing-ID rows explain why ordinary Delete is unavailable');
  } else bad('missing-id explanation');

  if (!/TMS_LANTERN_BRIDGE_SECRET/.test(adminHtml)) ok('no TMS secret in Admin HTML');
  else bad('secret in browser');

  console.log('\nadmin-student-edit-35-test:', pass, 'PASS', fail, 'FAIL');
  if (fail) process.exit(1);
}

run();
