/**
 * Prompt #262F — Restricted Access allowlist row state.
 * Usage: node worker/scripts/restricted-mode-262f-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const adminHtml = fs.readFileSync(path.join(root, 'app/admin.html'), 'utf8');
const harnessHtml = fs.readFileSync(path.join(root, 'app/dev/restricted-mode-262f-harness.html'), 'utf8');
const restrictedJs = fs.readFileSync(path.join(root, 'app/js/lantern-restricted-mode.js'), 'utf8');
const settingsJs = fs.readFileSync(path.join(root, 'worker/lantern-settings.js'), 'utf8');
const modeJs = fs.readFileSync(path.join(root, 'worker/restricted-mode.js'), 'utf8');

let pass = 0;
let fail = 0;
function ok(m) { pass++; console.log('PASS', m); }
function bad(m, d) { fail++; console.error('FAIL', m, d != null ? d : ''); }
function assert(c, m, d) { if (c) ok(m); else bad(m, d); }

assert(/id="restrictedAccessCard"/.test(adminHtml), 'Restricted Access card remains');
assert(/id="restrictedAccessWebAdminRow"/.test(adminHtml), 'Web Admin protected row exists');
assert(/ALWAYS ALLOWED/.test(adminHtml) && /Protected/.test(adminHtml), 'Web Admin copy preserved');
assert(!/data-restricted-remove/.test(adminHtml), 'Web Admin/selected list has no extra Remove renderer');
assert(!/id="restrictedAccessAllowedList"/.test(adminHtml), 'second selected-users list removed');
assert(/function renderRestrictedAccountRow/.test(adminHtml), 'one canonical row renderer');
assert(/function dedupeRestrictedAccounts/.test(adminHtml), 'search results are deduped');
assert(/allowed \? 'Allowed' : 'Not allowed'/.test(adminHtml), 'Not allowed is status copy');
assert(/allowed \? 'Remove' : 'Allow'/.test(adminHtml), 'Allow and Remove are actions');
assert(!/allow_during_restricted \? 'Not allowed'/.test(adminHtml), 'Not allowed is not a button label');
assert(/id="restrictedAccessResults"/.test(adminHtml), 'one results collection');
assert(/data-restricted-kind="all"/.test(adminHtml) && /data-restricted-kind="allowed"/.test(adminHtml), 'All/Staff/Students/Allowed filters remain');
assert(/Allowed during Restricted Mode\./.test(adminHtml) && /Removed from Restricted allowlist\./.test(adminHtml), 'success copy preserved');
assert(/requireAdminPilotSession/.test(settingsJs) && /isCanonicalWebAdminAccount/.test(settingsJs), 'authorization helpers unchanged');
assert(/CANONICAL_WEB_ADMIN_USERNAME = 'admin'/.test(modeJs), 'break-glass username unchanged');
assert(/RESTRICTED_MODE_DEFAULT = false/.test(modeJs), 'default OFF unchanged');
assert(/temporarily unavailable/.test(restrictedJs), 'locked student copy unchanged');
assert(/Deana Pachelli/.test(harnessHtml) && /data-restricted-status/.test(harnessHtml), '262F harness has Deana row status');

function dedupeRestrictedAccounts(rows) {
  const seen = {};
  const out = [];
  (rows || []).forEach((a) => {
    const key = String(a && a.username ? a.username : '').trim().toLowerCase();
    if (!key || seen[key]) return;
    seen[key] = true;
    out.push(a);
  });
  return out;
}

const duped = dedupeRestrictedAccounts([
  { username: 'deana.pachelli', display_name: 'Deana Pachelli', kind: 'staff', allow_during_restricted: false },
  { username: 'Deana.Pachelli', display_name: 'Deana Pachelli', kind: 'staff', allow_during_restricted: true },
]);
assert(duped.length === 1 && duped[0].username === 'deana.pachelli', 'one account one row after username dedupe');

console.log('\nrestricted-mode-262f-test:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
