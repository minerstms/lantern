/**
 * Prompt #212 — Admin Manage Avatar + shared Locker cropper contract tests.
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

const adminHtml = fs.readFileSync(path.join(root, 'app/admin.html'), 'utf8');
const lockerHtml = fs.readFileSync(path.join(root, 'app/locker.html'), 'utf8');
const profileJs = fs.readFileSync(path.join(root, 'app/js/lantern-profile-app.js'), 'utf8');
const cropperJs = fs.readFileSync(path.join(root, 'app/js/lantern-avatar-cropper.js'), 'utf8');
const adminSetTest = fs.readFileSync(path.join(root, 'worker/scripts/admin-avatar-set-test.mjs'), 'utf8');

if (adminHtml.includes('Manage Avatar') && /openAdminAvatarPanel\(/.test(adminHtml)) {
  ok('admin.html: Manage Avatar button + openAdminAvatarPanel');
} else bad('admin.html missing Manage Avatar wiring');

if (adminHtml.includes('id="adminAvatarOverlay"') && adminHtml.includes('adminAvatarOverlay') && /classList\.add\('show'\)/.test(adminHtml)) {
  ok('admin.html: Manage Avatar opens fixed overlay (not destroyed by Staff re-render)');
} else bad('admin.html missing fixed adminAvatarOverlay open path');

const overlayIdx = adminHtml.indexOf('id="adminAvatarOverlay"');
const staffMountIdx = adminHtml.indexOf('id="staffPowerListMount"');
const staffRenderClosesBeforeRebuild = /function renderStaffTable\(\)\s*\{[\s\S]*?closeAdminAvatarPanel\(\);[\s\S]*?(?:ui\.setItems|setItems\()/.test(adminHtml);
if (
  overlayIdx !== -1 &&
  staffMountIdx !== -1 &&
  overlayIdx < staffMountIdx &&
  staffRenderClosesBeforeRebuild
) {
  ok('admin.html: Staff re-render closes page-level Manage Avatar before list rebuild');
} else bad('admin.html Staff re-render may still destroy avatar UI');

if (adminHtml.includes('id="avatarCropOverlay"') && adminHtml.includes('lantern-avatar-cropper.js') && adminHtml.includes('cropper.min.js')) {
  ok('admin.html: loads exact Locker cropper DOM + Cropper.js + shared helper');
} else bad('admin.html missing shared cropper assets');

if (adminHtml.includes('openAdminAvatarCropper') && adminHtml.includes('/api/admin/avatar/set') && adminHtml.includes('Assign Avatar (0 Nuggets)')) {
  ok('admin.html: crop confirm posts privileged admin avatar set (0 Nuggets)');
} else bad('admin.html missing admin crop→API path');

if (!adminHtml.includes('free=true') && !adminHtml.includes("cost: 0")) {
  ok('admin.html: no client free/cost privilege flags');
} else bad('admin.html client privilege flags');

if (lockerHtml.includes('lantern-avatar-cropper.js') && lockerHtml.includes('id="avatarCropOverlay"')) {
  ok('locker.html: loads shared cropper helper with same overlay ids');
} else bad('locker.html missing shared cropper load');

if (
  cropperJs.includes('aspectRatio: 1') &&
  cropperJs.includes('autoCropArea: 0.9') &&
  cropperJs.includes('OUTPUT_WIDTH = 384') &&
  cropperJs.includes("OUTPUT_MIME = 'image/jpeg'") &&
  cropperJs.includes('OUTPUT_QUALITY = 0.85') &&
  cropperJs.includes('zoom(0.15)') &&
  cropperJs.includes('rotate(90)')
) {
  ok('shared cropper: exact Locker aspect/zoom/rotate/output encoding');
} else bad('shared cropper options drifted from Locker');

if (profileJs.includes('LanternAvatarCropper') && profileJs.includes('openLockerAvatarCropper') && profileJs.includes("callSubmitAvatarUpload")) {
  ok('profile-app: Locker self-service uses shared cropper + existing upload/economy path');
} else bad('profile-app not using shared cropper');

if (profileJs.includes('avatar_upload') && /AVATAR_UPLOAD_COST/.test(profileJs)) {
  ok('profile-app: normal Nugget avatar cost preserved');
} else bad('profile-app economy regression');

if (/new window\.Cropper|new Cropper\(/.test(profileJs) === false) {
  ok('profile-app: no second inline Cropper construction');
} else bad('profile-app still constructs Cropper inline');

const staffUsesUsername = adminHtml.includes('openAdminAvatarPanel(u.username');
const studentUsesResolvedLanternUsername = adminHtml.includes('openAdminAvatarPanel(student.lantern_username');
const linkedAvatarGate = /lantern_account === 'Linked' && s\.lantern_username[\s\S]{0,250}manage-avatar/.test(adminHtml);
const linkedArchivedAvatarGate = /lantern_account === 'Linked Archived' && s\.lantern_username[\s\S]{0,250}manage-avatar/.test(adminHtml);
const missingUsernameBlocked = /if \(action === 'manage-avatar'\)[\s\S]{0,220}if \(!student\.lantern_username\)/.test(adminHtml);
if (
  staffUsesUsername &&
  studentUsesResolvedLanternUsername &&
  linkedAvatarGate &&
  linkedArchivedAvatarGate &&
  missingUsernameBlocked
) {
  ok('admin.html: Staff uses username; Students use lantern_username target');
} else bad('admin.html target identity wiring incomplete');

console.log('\n--- admin-avatar-cropper-test: ' + passed + ' passed, ' + failed + ' failed ---');
process.exit(failed ? 1 : 0);
