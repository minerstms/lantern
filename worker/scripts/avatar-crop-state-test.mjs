/**
 * Avatar crop image lifecycle tests — Prompt #55 / #234
 * Student Locker no longer owns a crop/upload flow. Admin keeps the shared cropper.
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

const lockerHtml = fs.readFileSync(path.join(root, 'app/locker.html'), 'utf8');
const profileJs = fs.readFileSync(path.join(root, 'app/js/lantern-profile-app.js'), 'utf8');
const adminHtml = fs.readFileSync(path.join(root, 'app/admin.html'), 'utf8');

if (!/avatarCropImageStatus/.test(lockerHtml) && !/avatarCropBalanceStatus/.test(lockerHtml) && !/id="avatarCropOverlay"/.test(lockerHtml)) {
  ok('locker.html: student crop overlay and status controls removed');
} else bad('locker.html still has student crop overlay');

if (!/avatarCropImageReady/.test(profileJs) && !/syncAvatarCropSubmitState/.test(profileJs) && !/openLockerAvatarCropper/.test(profileJs)) {
  ok('profile-app: student crop submit lifecycle removed');
} else bad('profile-app still has student crop lifecycle');

if (profileJs.includes("error: 'student_avatar_upload_disabled'")) {
  ok('profile-app: leftover upload helper refuses student self-upload');
} else bad('profile-app missing student upload refusal');

if (/callGetBalance\(\)/.test(profileJs)) {
  ok('profile-app: session wallet refresh remains for non-upload locker use');
} else bad('profile-app wallet refresh missing session scope');

if (adminHtml.includes('id="avatarCropOverlay"') && adminHtml.includes('lantern-avatar-cropper.js')) {
  ok('admin.html: Web Admin cropper overlay preserved');
} else bad('admin.html lost shared cropper');

console.log('\n--- avatar-crop-state-test: ' + passed + ' passed, ' + failed + ' failed ---');
process.exit(failed > 0 ? 1 : 0);
