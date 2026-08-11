/**
 * Prompt #195 — Teacher Tools chrome: no identity banner; Review Submissions; Lantern Access.
 * Usage: node worker/scripts/teacher-chrome-195-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'app/teacher.html'), 'utf8');
const help = fs.readFileSync(path.join(root, 'app/js/lantern-help.js'), 'utf8');

let pass = 0;
let fail = 0;
function ok(m) { pass++; console.log('OK', m); }
function bad(m, d) { fail++; console.error('FAIL', m, d || ''); }
function assert(c, m) { if (c) ok(m); else bad(m); }

assert(!/class="teacherIdentityRow"/.test(html), '1. teacherIdentityRow markup absent');
assert(!/teacherIdentityTitle|teacherIdentitySub|teacherSessionHint/.test(html), '2. identity CSS/ids absent');
assert(!/>\s*TMS Lantern\s*</.test(html), '3. visible TMS Lantern chrome absent');
assert(!/Signed in as /.test(html), '4. Signed in as chrome absent');
assert(/teacherSidebarLabel">Review Submissions</.test(html), '5. sidebar Review Submissions');
assert(/teacherSidebarLabel">Lantern Access</.test(html), '6. sidebar Lantern Access');
assert(/review:\s*'Review Submissions'/.test(html), '7. workspace title Review Submissions');
assert(/schoolaccess:\s*'Lantern Access'/.test(html), '8. workspace title Lantern Access');
assert(/<div class="h">Review Submissions<\/div>/.test(html), '9. panel heading Review Submissions');
assert(/Open a submission before approving/.test(html), '10. Open a submission copy');
assert(!/Review Queue/.test(html.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), '11. Review Queue absent from non-comment UI/script strings');
// Allow "Schoolwide Access" and comments; forbid feature label "School Access" in sidebar/titles
assert(!/teacherSidebarLabel">School Access</.test(html), '12. sidebar School Access gone');
assert(!/schoolaccess:\s*'School Access'/.test(html), '13. workspace title School Access gone');
assert(/Schoolwide Access/.test(html), '14. Schoolwide Access preserved');
assert(/id="teacherAppShell"/.test(html), '15. teacher shell present');
assert(/id="lanternAppBarRoot"/.test(html), '16. global header root present');
assert(/Review Submissions/.test(help) && /Lantern Access/.test(help), '17. help copy updated');
assert(!/Review Queue/.test(help) && !/School Access:/.test(help), '18. help no old feature names');

/* Prompt #198 — empty #teacherPageTop must not be a .teacherAppShell CSS Grid child */
assert(/id="teacherPageTop"/.test(html), '19. #teacherPageTop anchor still present for Back-to-top');
assert(
  /id="teacherPageTop"[\s\S]{0,400}?id="teacherAppShell"/.test(html) &&
    !/<div[^>]*id="teacherAppShell"[^>]*>[\s\S]{0,200}?id="teacherPageTop"/.test(html),
  '20. #teacherPageTop precedes teacherAppShell and is not nested inside it'
);
assert(/\.teacherAppShell\{[\s\S]*?grid-template-columns:\s*240px\s+minmax\(0,\s*1fr\)/.test(html), '21. desktop shell remains 240px + 1fr grid');
assert(!/transform:\s*scale\(|\bzoom\s*:/.test(html), '22. no scale/zoom layout hacks');

console.log('\nteacher-chrome-195-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
