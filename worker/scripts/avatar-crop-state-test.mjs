/**
 * Avatar crop image lifecycle tests — Prompt #55
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

if (/avatarCropImageStatus/.test(lockerHtml)) ok('locker.html: separate image status element');
else bad('locker.html missing avatarCropImageStatus');

if (/avatarCropBalanceStatus/.test(lockerHtml)) ok('locker.html: separate balance status element');
else bad('locker.html missing avatarCropBalanceStatus');

if (/avatarCropImageReady/.test(profileJs) && /avatarCropBalanceLoaded/.test(profileJs)) {
  ok('profile-app: independent image and wallet ready flags');
} else bad('profile-app missing independent ready flags');

if (/syncAvatarCropSubmitState/.test(profileJs) && /avatarCropImageReady\s*&&\s*avatarCropBalanceLoaded/.test(profileJs)) {
  ok('profile-app: submit requires image AND wallet ready');
} else bad('profile-app missing combined submit eligibility');

if (/Preparing image/.test(profileJs)) ok('profile-app: image loading status text');
else bad('profile-app missing image loading status');

if (/avatarCropImageLoadToken/.test(profileJs) && /loadToken !== avatarCropImageLoadToken/.test(profileJs)) {
  ok('profile-app: stale FileReader callbacks ignored');
} else bad('profile-app missing load token guard');

if (/refreshAvatarCropAffordability\(String\(adopted\.name\)/.test(profileJs) || /refreshAvatarCropAffordability\(adopted\.name\)/.test(profileJs)) {
  ok('profile-app: wallet refresh uses getAdopted character name');
} else bad('profile-app wallet refresh missing adopted character');

if (!/refreshAvatarCropAffordability\(adopted && adopted\.name\)/.test(profileJs)) {
  ok('profile-app: no undefined adopted reference in crop open');
} else bad('profile-app still uses bare adopted in file handler');

if (/avatarCropPreviewUrl/.test(profileJs)) ok('profile-app: stable preview URL state');
else bad('profile-app missing preview URL state');

if (/avatarCropSelectedFile/.test(profileJs)) ok('profile-app: selected file stored in crop state');
else bad('profile-app missing selected file state');

if (/updateAvatarCropAffordability/.test(profileJs) && !/updateAvatarCropAffordability[\s\S]{0,400}errorEl/.test(profileJs)) {
  ok('profile-app: wallet affordability does not clobber image error element');
} else bad('profile-app wallet update may overwrite image errors');

if (/avatarCropper && avatarCropImageReady/.test(profileJs)) ok('profile-app: zoom/rotate gated on imageReady');
else bad('profile-app crop controls not gated on imageReady');

if (/Could not load image/.test(profileJs) && /No image to crop/.test(profileJs)) {
  ok('profile-app: distinct decode vs missing-image messages');
} else bad('profile-app missing distinct image error messages');

if (/LanternWallet\.fetchBalance/.test(profileJs) && /refreshAvatarCropAffordability/.test(profileJs)) {
  ok('regression: authoritative wallet refresh preserved');
} else bad('regression: wallet authority broken');

console.log('\n--- avatar-crop-state-test: ' + passed + ' passed, ' + failed + ' failed ---');
process.exit(failed > 0 ? 1 : 0);
