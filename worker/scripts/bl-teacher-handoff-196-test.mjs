/**
 * Prompt #196 — Behavior Logger → Teacher Tools SSO must not fall back to Locker/root.
 * Static source + sanitize contract checks (no live deploy required).
 *
 * Usage: node worker/scripts/bl-teacher-handoff-196-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', '..');
let pass = 0;
let fail = 0;
function ok(m) {
  pass++;
  console.log('  OK  ' + m);
}
function bad(m, extra) {
  fail++;
  console.log('  FAIL  ' + m + (extra != null ? ' :: ' + JSON.stringify(extra) : ''));
}
function assert(cond, m, extra) {
  if (cond) ok(m);
  else bad(m, extra);
}

const workerSrc = fs.readFileSync(path.join(root, 'worker', 'index.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'app', 'index.html'), 'utf8');
const proxySrc = fs.readFileSync(path.join(root, 'app', 'functions', 'api', '[[path]].js'), 'utf8');
const staffNav = fs.readFileSync(path.join(root, 'app', 'js', 'lantern-staff-nav.js'), 'utf8');

assert(/DEFAULT_TARGET = '\/teacher'/.test(workerSrc), '1. exchange default Location is /teacher');
assert(/sanitizeTmsExchangeReturnTarget/.test(workerSrc), '2. sanitizeTmsExchangeReturnTarget present');
assert(/tmslantern\.org/.test(workerSrc) && /sanitizeTmsExchangeReturnTarget[\s\S]{0,800}tmslantern\.org/.test(workerSrc), '3. sanitize accepts canonical tmslantern.org absolutes');
assert(/lanternReturn !== '\/'/.test(workerSrc), '4. device-authorize rejects lantern_return=/');
assert(/rewriteLocationForFirstParty/.test(proxySrc), '5. Pages /api proxy rewrites upstream Location to first-party');
assert(!/return=%2F/.test(indexHtml), '6. root index no longer forces login return=/');
assert(/defaultRoleHomePath|roleHome/.test(indexHtml), '7. root index routes authenticated users by role');
assert(/fetchMe/.test(indexHtml), '8. root index checks session before sign-in interstitial');
assert(/LANTERN_ORIGIN \+ '\/teacher'/.test(staffNav), '9. Lantern staff-nav Teacher Tools TMS href is /teacher');
assert(!/TMS Lantern — Locker/.test(indexHtml), '10. root interstitial title is no longer Locker');
const wranglerToml = fs.readFileSync(path.join(root, 'worker', 'wrangler.toml'), 'utf8');
assert(/tmslantern\.org\/api\/\*/.test(wranglerToml), '11. Worker zone route tmslantern.org/api/* present');
assert(fs.existsSync(path.join(root, 'app', '_routes.json')), '12. Pages _routes.json includes /api/*');

console.log('\nbl-teacher-handoff-196-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
