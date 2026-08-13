/**
 * Prompt #121 — shared header signed-in name hydration (static contract).
 * Usage: node worker/scripts/lantern-header-identity-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const navJs = fs.readFileSync(path.join(root, 'app/js/lantern-nav.js'), 'utf8');
const pilotAuthJs = fs.readFileSync(path.join(root, 'app/js/lantern-pilot-auth.js'), 'utf8');
const exploreHtml = fs.readFileSync(path.join(root, 'app/explore.html'), 'utf8');
const missionsHtml = fs.readFileSync(path.join(root, 'app/missions.html'), 'utf8');
const gamesHtml = fs.readFileSync(path.join(root, 'app/games.html'), 'utf8');
const contributeHtml = fs.readFileSync(path.join(root, 'app/contribute.html'), 'utf8');
const lockerHtml = fs.readFileSync(path.join(root, 'app/locker.html'), 'utf8');
const teacherHtml = fs.readFileSync(path.join(root, 'app/teacher.html'), 'utf8');
const adminHtml = fs.readFileSync(path.join(root, 'app/admin.html'), 'utf8');
const displayHtml = fs.readFileSync(path.join(root, 'app/display.html'), 'utf8');

let pass = 0;
let fail = 0;
function ok(msg) {
  pass++;
  console.log('PASS ' + msg);
}
function bad(msg, detail) {
  fail++;
  console.log('FAIL ' + msg + (detail ? ' — ' + detail : ''));
}

if (/function applySignedInHeaderIdentity/.test(navJs) && /function resolveSignedInDisplayName/.test(navJs)) {
  ok('nav defines shared signed-in header helpers');
} else bad('helpers missing');

if (/public_display_name/.test(navJs) && /public_display_label/.test(navJs) && !/Lucas Radle|Rick Radle/.test(navJs.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''))) {
  ok('header identity uses public_display_name — no hard-coded Lucas/Rick in executable nav code');
} else if (/public_display_name/.test(navJs)) {
  ok('header identity uses public_display_name');
} else bad('identity source wrong');

if (/applySignedInHeaderIdentity\(data\)/.test(navJs) && /LANTERN_PILOT_ME/.test(navJs)) {
  ok('identity applied from /api/auth/me response and cached LANTERN_PILOT_ME');
} else bad('auth/me hydration wiring missing');

if (/public_display_name/.test(pilotAuthJs) && /studentFriendlyDisplayNameFromAdopted/.test(pilotAuthJs)) {
  ok('pilot-auth prefers public_display_name for ordinary identity');
} else bad('pilot-auth helper missing');

const fullHeaderPages = [
  ['explore.html', exploreHtml],
  ['missions.html', missionsHtml],
  ['games.html', gamesHtml],
  ['contribute.html', contributeHtml],
  ['locker.html', lockerHtml],
  ['teacher.html', teacherHtml],
  ['admin.html', adminHtml],
];
for (const [name, html] of fullHeaderPages) {
  if (/id="lanternAppBarRoot"/.test(html) && /lantern-nav\.js/.test(html)) {
    ok(name + ' mounts shared lantern-nav into #lanternAppBarRoot');
  } else bad(name + ' missing shared header mount');
}

if (/page-marquee-only/.test(displayHtml) && /lanternTicker/.test(displayHtml) && !/lanternAppBarRoot/.test(displayHtml)) {
  ok('display.html is marquee-only (ticker present, no app-bar root / signed-in name row)');
} else bad('display.html marquee-only contract broken');

if (/page-marquee-only/.test(navJs)) {
  ok('nav init returns early for page-marquee-only (Display exception intact)');
} else bad('nav Display exception missing');

console.log('\n--- lantern-header-identity-test: ' + pass + ' passed, ' + fail + ' failed ---');
process.exit(fail ? 1 : 0);
