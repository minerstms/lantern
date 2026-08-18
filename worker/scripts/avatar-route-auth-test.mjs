/**
 * Avatar route auth/privacy contract — upload bind, staff-gated moderation, status pending redaction.
 * Static source tests (no live DB / R2).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

let passed = 0;
let failed = 0;

function ok(msg) {
  passed++;
  console.log('PASS', msg);
}
function bad(msg, detail) {
  failed++;
  console.log('FAIL', msg, detail != null ? detail : '');
}

function sliceBetween(src, startNeedle, endNeedle) {
  const start = src.indexOf(startNeedle);
  if (start < 0) return '';
  const from = start;
  const end = src.indexOf(endNeedle, from + startNeedle.length);
  return end > from ? src.slice(from, end) : src.slice(from, from + 6000);
}

const workerIndex = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
const teacherHtml = fs.readFileSync(path.join(root, 'app/teacher.html'), 'utf8');
const adminHtml = fs.readFileSync(path.join(root, 'app/admin.html'), 'utf8');

const avatarFnStart = workerIndex.indexOf('async function handleAvatarRoutes');
const avatarFnEnd = workerIndex.indexOf('function getEconomyTransactSecretFromRequest', avatarFnStart);
const avatarFn = avatarFnStart >= 0 && avatarFnEnd > avatarFnStart
  ? workerIndex.slice(avatarFnStart, avatarFnEnd)
  : '';

if (avatarFn) ok('worker: handleAvatarRoutes located');
else bad('worker missing handleAvatarRoutes');

const uploadSlice = sliceBetween(avatarFn, "path === '/api/avatar/upload'", "path === '/api/avatar/status'");
const statusSlice = sliceBetween(avatarFn, "path === '/api/avatar/status'", "path === '/api/avatar/pending'");
const pendingSlice = sliceBetween(avatarFn, "path === '/api/avatar/pending'", "path === '/api/avatar/approve'");
const approveSlice = sliceBetween(avatarFn, "path === '/api/avatar/approve'", "path === '/api/avatar/reject'");
const rejectSlice = sliceBetween(avatarFn, "path === '/api/avatar/reject'", 'return jsonResponse({ ok: false, error: \'Method or path not allowed\' }');

if (
  uploadSlice.includes('getPilotAccountFromRequest') &&
  uploadSlice.includes("error: 'not_authenticated'") &&
  uploadSlice.includes('pilotAccountRequiresChangePassword') &&
  uploadSlice.includes('avatarCharacterNameForPilotAccount')
) {
  ok('upload: requires session, rejects must_change_password, binds server identity');
} else bad('upload missing session/identity bind');

if (
  /const characterName = \(body\.character_name/.test(uploadSlice) ||
  /characterName = \(body\.character_name/.test(uploadSlice)
) {
  bad('upload still trusts body.character_name for write identity');
} else {
  ok('upload: does not use body.character_name as write identity');
}

if (
  uploadSlice.includes("avatar_self_service_disabled") &&
  uploadSlice.includes("error: 'forbidden'") &&
  !/INSERT INTO lantern_avatar_submissions/.test(uploadSlice)
) {
  ok('upload: self-service closed with forbidden');
} else bad('upload self-service not closed');

if (
  pendingSlice.includes('requireStaffPilotSession') &&
  approveSlice.includes('requireStaffPilotSession') &&
  rejectSlice.includes('requireStaffPilotSession') &&
  pendingSlice.includes('canManageLanternAvatars') &&
  approveSlice.includes('canManageLanternAvatars') &&
  rejectSlice.includes('canManageLanternAvatars')
) {
  ok('pending/approve/reject: requireStaffPilotSession + Rick-only canManageLanternAvatars');
} else bad('legacy moderation routes missing staff/Rick gate');

if (approveSlice.includes('reviewerLabelFromAccount') && rejectSlice.includes('reviewerLabelFromAccount')) {
  ok('approve/reject: reviewer from session via reviewerLabelFromAccount');
} else bad('approve/reject still missing session reviewer');

if (/body\.approved_by/.test(approveSlice) || /body\.rejected_by/.test(rejectSlice)) {
  bad('approve/reject still trust body approved_by/rejected_by');
} else {
  ok('approve/reject: do not trust client reviewer fields');
}

if (
  statusSlice.includes('isTeacherLike') &&
  statusSlice.includes('avatarCharacterNameForPilotAccount') &&
  statusSlice.includes('canSeePending')
) {
  ok('status: pending visibility gated to owner or staff');
} else bad('status missing pending redaction gate');

if (statusSlice.includes('active_image') && statusSlice.includes('getPilotAccountFromRequest')) {
  ok('status: still returns active_image; session used only for pending');
} else bad('status active_image / session check missing');

if (statusSlice.includes('if (canSeePending)') && /includePending:\s*true/.test(statusSlice)) {
  ok('status: pending row loaded only when allowed');
} else bad('status still loads pending unconditionally');

const adminSet = workerIndex.indexOf("path === '/api/admin/avatar/set'");
const adminStatus = workerIndex.indexOf("path === '/api/admin/avatar/status'");
if (adminSet > 0 && adminStatus > 0 && workerIndex.includes("nugget_charged: 0")) {
  ok('admin avatar set/status left in place (0 Nuggets)');
} else bad('admin avatar privileged path missing');

{
  const pendingFn = sliceBetween(teacherHtml, 'function callGetPendingAvatars', 'function callApproveAvatarSubmission');
  const approveBlock = sliceBetween(teacherHtml, 'function callApproveAvatarSubmission', 'function callRejectAvatarSubmission');
  const rejectBlock = sliceBetween(teacherHtml, 'function callRejectAvatarSubmission', 'function callApproveSubmission');
  if (pendingFn.includes("credentials: 'include'")) ok('teacher: pending fetch sends credentials');
  else bad('teacher pending fetch missing credentials');
  if (approveBlock.includes("credentials: 'include'")) ok('teacher: approve fetch sends credentials');
  else bad('teacher approve fetch missing credentials');
  if (rejectBlock.includes("credentials: 'include'")) ok('teacher: reject fetch sends credentials');
  else bad('teacher reject fetch missing credentials');
}

if (adminHtml.includes('/api/admin/avatar/set') && adminHtml.includes('openAdminAvatarPanel')) {
  ok('admin.html Manage Avatar still uses privileged admin set');
} else bad('admin.html Manage Avatar wiring missing');

console.log('\n--- avatar-route-auth-test: ' + passed + ' passed, ' + failed + ' failed ---');
process.exit(failed ? 1 : 0);
