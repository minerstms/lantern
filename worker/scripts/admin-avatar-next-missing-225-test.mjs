/**
 * Prompt #225 — Next Missing Avatar only after student Activate, not staged save.
 * Usage: node worker/scripts/admin-avatar-next-missing-225-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let passed = 0;
let failed = 0;
function ok(msg) { passed++; console.log('PASS', msg); }
function bad(msg, detail) { failed++; console.log('FAIL', msg, detail != null ? detail : ''); }

const adminHtml = fs.readFileSync(path.join(root, 'app/admin.html'), 'utf8');

const successStart = adminHtml.indexOf('onConfirmSuccess: function(res)');
const successSrc = successStart >= 0 ? adminHtml.slice(successStart, successStart + 1600) : '';
const activateSrc = adminHtml.includes("'/api/admin/avatar/activate'")
  ? adminHtml.slice(adminHtml.indexOf("'/api/admin/avatar/activate'"), adminHtml.indexOf("'/api/admin/avatar/activate'") + 1800)
  : '';

const stagedGuard = successSrc.match(/if \(adminAvatarContext\.fromStudents && res && res\.staged\) \{[\s\S]*?return;[\s\S]*?\}/);
if (
  stagedGuard &&
  stagedGuard[0].includes('hideAdminAvatarNextMissing()') &&
  !stagedGuard[0].includes('syncAdminAvatarNextMissing') &&
  successSrc.includes('hideAdminAvatarNextMissing()')
) {
  ok('1. student staged save does NOT expose usable Next Missing Avatar');
} else bad('1. staged save still offers Next', successSrc.slice(0, 500));

if (
  activateSrc.includes('applyAdminAvatarStatus') &&
  activateSrc.includes('refreshRosterAvatarRow') &&
  activateSrc.includes('syncAdminAvatarNextMissing') &&
  adminHtml.includes('id="adminAvatarActivateBtn"') &&
  adminHtml.includes('Approve & Use')
) {
  ok('2. student Activate success DOES expose Next Missing Avatar when eligible');
} else bad('2. activate next missing');

if (
  activateSrc.includes('refreshRosterAvatarRow(username, true)') &&
  adminHtml.includes('function markRosterHasAvatar') &&
  /function markRosterHasAvatar[\s\S]*s\.has_avatar = 1/.test(adminHtml)
) {
  ok('3. activating student updates Has Avatar state');
} else bad('3. has avatar on activate');

if (
  adminHtml.includes('function refreshRosterAvatarRow') &&
  /function refreshRosterAvatarRow[\s\S]*window\.scrollTo/.test(adminHtml) &&
  adminHtml.includes('filteredStudentsRoster') &&
  !successSrc.includes('loadStudentsRoster()') &&
  !activateSrc.includes('loadStudentsRoster()')
) {
  ok('4. current search/filter/scroll context remains intact');
} else bad('4. roster context');

if (
  adminHtml.includes('openAdminAvatarPanel(u.username, label)') &&
  !adminHtml.includes('openAdminAvatarPanel(u.username, label, { fromStudents: true })') &&
  /function syncAdminAvatarNextMissing[\s\S]*if \(!adminAvatarContext\.fromStudents\)[\s\S]*hideAdminAvatarNextMissing/.test(adminHtml) &&
  adminHtml.includes('Staff assignment costs 0 Nuggets')
) {
  ok('5. staff immediate assignment does not use the student Next Missing path');
} else bad('5. staff behavior');

if (
  adminHtml.includes('value="no_avatar"') &&
  adminHtml.includes("filter === 'no_avatar'") &&
  adminHtml.includes('No Avatar') &&
  /if \(adminAvatarContext\.fromStudents && res && res\.staged\)[\s\S]*hideAdminAvatarNextMissing\(\)/.test(successSrc) &&
  !successSrc.includes('refreshRosterAvatarRow(user, true)') ||
  (successSrc.includes('!(res && res.staged)') && successSrc.includes('refreshRosterAvatarRow'))
) {
  ok('6. No Avatar filter remains correct; staged students stay missing until Activate');
} else bad('6. no avatar filter');

if (adminHtml.includes('id="adminAvatarActivateBtn"') && adminHtml.includes('applyAdminAvatarStatus')) {
  ok('Activate action remains available after staged save');
} else bad('activate button');

console.log('\nAdmin Next Missing #225:', passed, 'passed,', failed, 'failed');
if (failed) process.exit(1);
