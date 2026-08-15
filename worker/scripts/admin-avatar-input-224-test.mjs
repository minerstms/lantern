/**
 * Prompt #224 — Admin Manage Avatar drag/drop/paste + Monday workflow.
 * Usage: node worker/scripts/admin-avatar-input-224-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { canManageLanternAvatars } from '../avatar-media-gate.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let passed = 0;
let failed = 0;
function ok(msg) { passed++; console.log('PASS', msg); }
function bad(msg, detail) { failed++; console.log('FAIL', msg, detail != null ? detail : ''); }

const adminHtml = fs.readFileSync(path.join(root, 'app/admin.html'), 'utf8');
const lockerHtml = fs.readFileSync(path.join(root, 'app/locker.html'), 'utf8');
const teacherHtml = fs.readFileSync(path.join(root, 'app/teacher.html'), 'utf8');
const profileJs = fs.readFileSync(path.join(root, 'app/js/lantern-profile-app.js'), 'utf8');
const cropperJs = fs.readFileSync(path.join(root, 'app/js/lantern-avatar-cropper.js'), 'utf8');
const gateSrc = fs.readFileSync(path.join(root, 'worker/avatar-media-gate.js'), 'utf8');
const workerIndex = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');

if (canManageLanternAvatars({ username: 'admin', role: 'admin', is_active: 1 })) {
  ok('14. privileged admin may still manage avatar');
} else bad('14. admin');
if (!canManageLanternAvatars({ username: 'rick.radle', role: 'teacher', is_active: 1 })) {
  ok('15. rick.radle remains forbidden');
} else bad('15. rick.radle');
if (!canManageLanternAvatars({ username: 'ms.carter', role: 'teacher', is_active: 1 })) {
  ok('16. teacher remains forbidden');
} else bad('16. teacher');
if (!canManageLanternAvatars({ username: '20889', role: 'student', is_active: 1 })) {
  ok('17. student remains forbidden');
} else bad('17. student');
if (!canManageLanternAvatars({ username: 'rradle', role: 'admin', is_active: 1 })) {
  ok('18. other admin-role account remains forbidden');
} else bad('18. other admin');

if (
  gateSrc.includes("!== 'admin'") &&
  workerIndex.includes('canManageLanternAvatars') &&
  !/function canManageLanternAvatars[\s\S]*display_name/.test(gateSrc)
) {
  ok('authorization still locked to username === admin');
} else bad('auth predicate drifted');

if (!lockerHtml.includes('openAvatarUploadBtn') && lockerHtml.includes('Ask in person')) {
  ok('19. no student self-service UI returns');
} else bad('19. locker self-service');
if (
  /data-kind-filter="avatar" hidden/.test(teacherHtml) &&
  /openUploadBtn\.hidden = true/.test(profileJs) &&
  profileJs.includes('Ask an administrator')
) {
  ok('20. no staff/locker self-service UI returns');
} else bad('20. staff/self-service');

if (
  adminHtml.includes('id="adminAvatarFile"') &&
  adminHtml.includes('id="adminAvatarChooseBtn"') &&
  adminHtml.includes('Choose File') &&
  adminHtml.includes('acceptAdminAvatarFile')
) {
  ok('21. file picker still works');
} else bad('21. file picker');

if (
  adminHtml.includes('id="adminAvatarDrop"') &&
  adminHtml.includes("addEventListener('drop'") &&
  adminHtml.includes('is-dragover') &&
  adminHtml.includes('openAdminAvatarCropper') &&
  adminHtml.includes('acceptAdminAvatarFile')
) {
  ok('22. drag/drop feeds existing cropper');
} else bad('22. drag/drop');

if (
  adminHtml.includes("addEventListener('paste'") &&
  adminHtml.includes('clipboardData') &&
  adminHtml.includes("classList.contains('show')") &&
  adminHtml.includes('avatarCropOverlay')
) {
  ok('23. clipboard image paste feeds existing cropper when modal is active');
} else bad('23. paste');

if (
  adminHtml.includes('Please drop or paste an image file.') &&
  adminHtml.includes('Drop one image at a time.') &&
  adminHtml.includes('firstImageFromDataTransfer')
) {
  ok('24. non-image paste/drop rejected safely');
} else bad('24. reject non-image');

if (
  cropperJs.includes('MAX_FILE_BYTES = 3 * 1024 * 1024') &&
  cropperJs.includes("OUTPUT_MIME = 'image/jpeg'") &&
  cropperJs.includes('OUTPUT_WIDTH = 384') &&
  adminHtml.includes('CropperApi.validateFile') &&
  adminHtml.includes('openAdminAvatarCropper')
) {
  ok('25. existing size/type validation and cropper preserved');
} else bad('25. validation/crop');

if (
  adminHtml.includes('fromStudents: true') &&
  workerIndex.includes("source: 'roster'") &&
  workerIndex.includes('resolveAdminAvatarTarget')
) {
  ok('26. no-login active roster student still works (#223)');
} else bad('26. #223 path');

if (
  adminHtml.includes('openAdminAvatarPanel(u.username, label)') &&
  adminHtml.includes('Staff assignment costs 0 Nuggets')
) {
  ok('27. staff avatar management still works');
} else bad('27. staff manager');

if (
  adminHtml.includes('value="no_avatar"') &&
  adminHtml.includes('No Avatar') &&
  adminHtml.includes("filter === 'no_avatar'")
) {
  ok('28. No Avatar filter still works');
} else bad('28. no avatar filter');

if (
  adminHtml.includes('refreshRosterAvatarRow') &&
  adminHtml.includes('window.scrollTo') &&
  adminHtml.includes('markRosterHasAvatar')
) {
  ok('29. successful save refreshes status without losing roster context');
} else bad('29. roster refresh');

if (
  adminHtml.includes('id="adminAvatarNextMissingBtn"') &&
  adminHtml.includes('Next Missing Avatar') &&
  adminHtml.includes('findNextMissingAvatarStudent') &&
  adminHtml.includes('syncAdminAvatarNextMissing')
) {
  ok('30. Next Missing Avatar implemented');
} else bad('30. next missing');

if (!adminHtml.includes('/api/avatar/upload') && adminHtml.includes('/api/admin/avatar/set')) {
  ok('admin still uses privileged set, not self-service upload');
} else bad('upload endpoint');

console.log('\nAdmin avatar input #224:', passed, 'passed,', failed, 'failed');
if (failed) process.exit(1);
