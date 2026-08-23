/**
 * Prompt #256 — static checks for compact Needs Revision UI.
 * Usage: node worker/scripts/compact-needs-revision-256-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

let pass = 0;
let fail = 0;
function ok(msg) {
  pass++;
  console.log('PASS', msg);
}
function bad(msg, detail) {
  fail++;
  console.error('FAIL', msg, detail != null ? detail : '');
}
function assert(cond, msg, detail) {
  if (cond) ok(msg);
  else bad(msg, detail);
}
function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const lockerHtml = read('app/locker.html');
const lockerRev = read('app/js/lantern-locker-revision.js');
const harness = read('app/dev/compact-needs-revision-256-harness.html');

assert(/lockerNeedsRevisionHint/.test(lockerHtml) && /Fix these and send them back/.test(lockerHtml), '1. inbox helper copy');
assert(/grid-template-columns:\s*88px minmax\(140px/.test(lockerHtml), '2. desktop 4-column grid');
assert(/lockerNeedsCardIdentity/.test(lockerRev), '3. identity column in card HTML');
assert(/lockerNeedsCardAside/.test(lockerRev), '4. feedback aside column preserved');
assert(/compactDates/.test(lockerRev) && /Submitted /.test(lockerRev), '5. compact date line');
assert(!/Returned for Revision/.test(lockerRev), '6. redundant status label removed');
assert(/Teacher feedback:/.test(lockerRev) && /Current response:/.test(lockerRev), '7. feedback + response labels');
assert(/lockerNeedsToggleMore/.test(lockerRev) && /aria-expanded/.test(lockerRev), '8. show more toggle a11y');
assert(/Show less/.test(lockerRev), '9. show less toggle text');
assert(/Archive for Later/.test(lockerRev) && /Revise &amp; Resubmit/.test(lockerRev), '10. actions unchanged');
assert(!/lockerNeedsShowMore/.test(lockerRev), '11. old show-more class removed');
assert(fs.existsSync(path.join(root, 'app/dev/compact-needs-revision-256-harness.html')), '12. browser harness exists');
assert(/__LANTERN_256_RUN/.test(harness) && harness.includes('news_submission'), '13. harness fixtures');
assert(!/worker\//.test(lockerRev.replace(/api\/moderation/g, '')), '14. no worker edits in revision client');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
