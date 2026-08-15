/**
 * Prompt #211 — System Admin avatar set (0 Nuggets) vs normal user path.
 * Static contract tests (no live DB required).
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

const workerIndex = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
const adminHtml = fs.readFileSync(path.join(root, 'app/admin.html'), 'utf8');
const profileJs = fs.readFileSync(path.join(root, 'app/js/lantern-profile-app.js'), 'utf8');

if (workerIndex.includes("path === '/api/admin/avatar/set'")) {
  ok('worker: POST /api/admin/avatar/set exists');
} else bad('worker missing /api/admin/avatar/set');

if (workerIndex.includes("path === '/api/admin/avatar/status'")) {
  ok('worker: GET /api/admin/avatar/status exists');
} else bad('worker missing /api/admin/avatar/status');

{
  const adminGate = workerIndex.indexOf('async function handleAdminRoutes');
  const avatarSet = workerIndex.indexOf("path === '/api/admin/avatar/set'");
  const roleCheck = workerIndex.indexOf("!== 'admin'", adminGate);
  if (adminGate >= 0 && avatarSet > adminGate && roleCheck > adminGate && roleCheck < avatarSet) {
    ok('worker: admin avatar set is inside handleAdminRoutes after admin role gate');
  } else bad('worker admin avatar set not gated by handleAdminRoutes admin check');
}

if (workerIndex.includes('canManageLanternAvatars(account)') && workerIndex.includes("username") && /canManageLanternAvatars/.test(workerIndex)) {
  ok('worker: admin avatar mutations also require canManageLanternAvatars');
} else bad('worker missing Rick-only avatar manager predicate');

if (
  workerIndex.includes('avatarCharacterNameForPilotAccount') &&
  workerIndex.includes("role === 'student'")
) {
  ok('worker: resolves student vs staff avatar identity from pilot account');
} else bad('worker missing avatarCharacterNameForPilotAccount');

if (
  /status = 'approved'|status', 'approved'|status = \?, approved_at/.test(workerIndex) &&
  workerIndex.includes('Superseded by System Admin avatar assignment')
) {
  ok('worker: admin set writes approved submission and supersedes pendings');
} else bad('worker admin set missing approved/supersede behavior');

{
  const setIdx = workerIndex.indexOf("path === '/api/admin/avatar/set'");
  const nextRoute = workerIndex.indexOf("path === '/api/admin/tms-identity-links'", setIdx);
  const slice = workerIndex.slice(setIdx, nextRoute > setIdx ? nextRoute : setIdx + 8000);
  if (!/economy\/transact|avatar_upload|debit|nugget/i.test(slice) || /nugget_charged:\s*0/.test(slice)) {
    if (!/\/api\/economy\/transact/.test(slice) && !/kind === 'avatar_upload'/.test(slice)) {
      ok('worker: admin avatar set does not call economy/transact or avatar_upload spend');
    } else bad('worker admin avatar set appears to touch economy path', slice.slice(0, 200));
  } else {
    bad('worker admin avatar set economy isolation unclear');
  }
  if (/body\.free|free\s*===\s*true|cost\s*===\s*0|admin\s*===\s*true/.test(slice)) {
    bad('worker admin avatar set must not trust client free/admin/cost flags');
  } else {
    ok('worker: admin avatar set does not trust client free/cost flags');
  }
  if (slice.includes('AVATAR_BUCKET') && slice.includes('image_key')) {
    ok('worker: admin set uses AVATAR_BUCKET + image_key schema');
  } else bad('worker admin set storage/schema mismatch');
}

if (
  workerIndex.includes("kind === 'avatar_upload'") &&
  workerIndex.includes('avatar_upload costs exactly 1 Nugget') &&
  workerIndex.includes('server_delta: -1')
) {
  ok('worker: normal avatar_upload still locked to -1 Nugget');
} else bad('worker normal avatar_upload price lock regresssed');

if (
  profileJs.includes('Ask an administrator') &&
  /openUploadBtn\.hidden = true/.test(profileJs)
) {
  ok('profile-app: self-service upload controls hidden');
} else bad('profile-app self-service upload still wired');

if (adminHtml.includes('adminAvatarOverlay') && adminHtml.includes('Manage Avatar') && adminHtml.includes('/api/admin/avatar/set')) {
  ok('admin.html: Manage Avatar UI wired to privileged set API');
} else bad('admin.html missing Manage Avatar UI');

if (adminHtml.includes('openAdminAvatarPanel') && adminHtml.includes('/api/admin/avatar/status')) {
  ok('admin.html: loads current avatar via admin status');
} else bad('admin.html missing admin avatar status load');

if (!adminHtml.includes('free=true') && !adminHtml.includes('cost: 0') && !adminHtml.includes("'admin': true")) {
  ok('admin.html: does not send client free/cost privilege flags');
} else bad('admin.html may send client privilege flags');

console.log('\n--- admin-avatar-set-test: ' + passed + ' passed, ' + failed + ' failed ---');
process.exit(failed ? 1 : 0);
