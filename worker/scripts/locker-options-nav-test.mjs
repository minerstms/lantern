/**
 * Prompt #161/#226 — My Locker ▾ consolidates Overview/Items/Store + edit + install.
 * Usage: node worker/scripts/locker-options-nav-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(msg) {
  pass++;
  console.log('PASS', msg);
}
function bad(msg, detail) {
  fail++;
  console.error('FAIL', msg, detail || '');
}

const lockerHtml = fs.readFileSync(path.join(root, 'app/locker.html'), 'utf8');
const shellJs = fs.readFileSync(path.join(root, 'app/js/lantern-locker-shell.js'), 'utf8');
const surfaceCss = fs.readFileSync(path.join(root, 'app/css/lantern-surface-theme.css'), 'utf8');
const profileApp = fs.readFileSync(path.join(root, 'app/js/lantern-profile-app.js'), 'utf8');

const headerFiles = [
  'app/js/lantern-header-boot.js',
  'app/js/lantern-app-bar.js',
  'app/js/lantern-pilot-auth.js',
].map((rel) => {
  const p = path.join(root, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
});

if (!/id="lockerTabOverview"/.test(lockerHtml) && !/class="lockerTabBtn"/.test(lockerHtml)) {
  ok('large Overview/Items/Store tab buttons removed from locker.html');
} else bad('legacy lockerTabBtn still present');

if (!/id="lockerTabs"/.test(lockerHtml) && !/lockerTabsMountSticky/.test(lockerHtml)) {
  ok('old locker tab row mount removed');
} else bad('locker tab row mount still present');

if (!/lockerEditProfileAccess/.test(lockerHtml)) {
  ok('standalone lower-left Edit Profile access block removed');
} else bad('lockerEditProfileAccess still present');

if (/id="editProfileBtn"/.test(lockerHtml) && /id="editProfileBtn"[^>]*\bhidden\b/.test(lockerHtml)) {
  ok('Edit Profile trigger retained hidden for Profile Studio wiring');
} else bad('hidden editProfileBtn missing');

if (/My Locker <span class="lockerOptionsChevron"/.test(shellJs) && /lockerOptionsTrigger/.test(shellJs) && !/Locker Options/.test(shellJs)) {
  ok('My Locker trigger exists in shell (About header location)');
} else bad('My Locker trigger missing in shell');

if (
  /data-locker-tab="overview"/.test(shellJs) &&
  /data-locker-tab="items"/.test(shellJs) &&
  /data-locker-tab="store"/.test(shellJs)
) {
  ok('dropdown contains Overview, Items, Store');
} else bad('section menu items incomplete');

if (/data-locker-action="edit-profile"/.test(shellJs) && /data-locker-action="edit-about"/.test(shellJs)) {
  ok('distinct Edit Profile + Edit About menu items present');
} else bad('edit actions missing or not distinct');

if (/data-locker-action="install-app"/.test(shellJs) && /Install Lantern App/.test(shellJs) && (shellJs.match(/Install Lantern App/g) || []).length === 1) {
  ok('My Locker menu includes Install Lantern App exactly once');
} else bad('install app locker entry missing or duplicated');

if (!/lockerAccountDevice/.test(lockerHtml) && !/lockerInstallCard/.test(lockerHtml) && !/id="lockerInstallAppLink"/.test(lockerHtml)) {
  ok('large Account/Device install panel is gone from locker.html');
} else bad('duplicate locker install panel still present');

if (/intent=install/.test(shellJs) && /log\.tmslantern\.org\/index\.html\?intent=install/.test(shellJs)) {
  ok('kept install action uses the existing Behavior Logger install URL');
} else bad('install URL missing from My Locker menu');

if (/wireLockerOptions/.test(lockerHtml) && /navigateLockerTab/.test(lockerHtml)) {
  ok('locker.html wires My Locker navigation');
} else bad('locker options wiring missing');

if (/edit-about/.test(lockerHtml) && /openAboutBioEditor/.test(lockerHtml)) {
  ok('Edit About routes through openAboutBioEditor');
} else bad('Edit About wiring');

if (/edit-profile/.test(lockerHtml) && /editProfileBtn/.test(lockerHtml)) {
  ok('Edit Profile menu item clicks existing Profile Studio trigger');
} else bad('Edit Profile menu wiring');

if (/setActiveLockerOption/.test(shellJs) && /aria-current/.test(shellJs)) {
  ok('current Locker section can be marked active');
} else bad('active section marking');

if (/Escape/.test(shellJs) && /aria-expanded/.test(shellJs)) {
  ok('dropdown supports Escape + aria-expanded');
} else bad('keyboard/dropdown a11y');

if (/lockerOptionsMenu/.test(lockerHtml) && /right:\s*0/.test(lockerHtml)) {
  ok('menu aligns right to avoid viewport overflow');
} else bad('menu alignment CSS');

if (/max-width:\s*min\(280px,\s*calc\(100vw - 24px\)\)/.test(lockerHtml)) {
  ok('mobile menu max-width prevents horizontal overflow');
} else bad('mobile overflow guard');

if (/lockerHeaderAboutHd \.lockerOptions/.test(surfaceCss)) {
  ok('My Locker menu styled in About header (former Edit location)');
} else bad('surface theme placement');

if (!headerFiles.join('\n').includes('Locker Options') && !headerFiles.join('\n').includes('lockerAccountDevice')) {
  ok('Locker install/options strings do not leak into global Lantern nav/header sources');
} else bad('Locker Options leaked into global nav');

if (/editProfileOverlay/.test(lockerHtml) && /wireEditProfile/.test(profileApp)) {
  ok('Profile Studio edit path preserved');
} else bad('Profile Studio path');

if (/callUpdateBio/.test(shellJs) && /openAboutBioEditor/.test(shellJs)) {
  ok('About bio editor path preserved via openAboutBioEditor');
} else bad('About bio path');

console.log('\n--- locker-options-nav-test: ' + pass + ' passed, ' + fail + ' failed ---');
process.exit(fail ? 1 : 0);
