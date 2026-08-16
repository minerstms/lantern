/**
 * Prompt #237 — Small Town / Big Pride on the shared Lantern header.
 * Usage: node worker/scripts/header-brand-237-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(msg) { pass++; console.log('PASS', msg); }
function bad(msg, detail) { fail++; console.log('FAIL', msg, detail != null ? detail : ''); }
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

const navJs = read('app/js/lantern-nav.js');
const displayHtml = read('app/display.html');
const headerCss = read('app/css/lantern-header.css');

if (navJs.includes('>Small Town<') && !navJs.includes('Small Town.') && !navJs.includes('Small Town. Big Pride')) {
  ok('1. exact copy Small Town (no punctuation)');
} else bad('1. Small Town copy');

if (navJs.includes('>Big Pride<') && !navJs.includes('Big Pride.')) {
  ok('2. exact copy Big Pride (no punctuation)');
} else bad('2. Big Pride copy');

if (
  navJs.includes('lanternHeaderBrand--town') &&
  navJs.includes('lanternHeaderBrand--pride') &&
  navJs.includes("left:20px") &&
  navJs.includes("right:20px")
) {
  ok('9. matching 20px left/right inset');
} else bad('9. padding');

if (
  navJs.includes('position:absolute') &&
  navJs.includes('lanternAppBarInner{ position:relative; z-index:1;') &&
  navJs.includes('max-width: var(--lantern-page-max-width); margin: 0 auto')
) {
  ok('10. brands are absolute; inner nav stays independently centered');
} else bad('10. centering architecture');

if (navJs.includes('@media (max-width: 1100px){ .lanternHeaderBrand{ display:none; } }')) {
  ok('17. brand text hides at narrow breakpoint (no overflow)');
} else bad('17. responsive hide');

if (navJs.includes('pointer-events:none') && navJs.includes('aria-hidden="true"')) {
  ok('brands are not clickable / not buttons');
} else bad('clickable brands');

const headerPages = [
  ['explore.html', 'Explore'],
  ['locker.html', 'Locker'],
  ['contribute.html', 'Create'],
  ['create.html', 'Create alias'],
  ['games.html', 'Play'],
  ['missions.html', 'Missions'],
  ['teacher.html', 'Teacher Tools'],
  ['admin.html', 'Admin'],
  ['staff.html', 'Staff'],
  ['news.html', 'News'],
  ['grades.html', 'Grades'],
  ['thanks.html', 'Thanks'],
  ['school-survival.html', 'School Survival'],
  ['home.html', 'Home'],
  ['feed-review.html', 'Feed review'],
  ['my-submissions.html', 'My submissions'],
];
let allShared = true;
headerPages.forEach(function (pair) {
  const html = read('app/' + pair[0]);
  if (!/id="lanternAppBarRoot"/.test(html) || !/lantern-nav\.js/.test(html)) {
    allShared = false;
    bad(pair[1] + ' missing shared header mount', pair[0]);
  }
});
if (allShared) ok('3-8. listed Lantern pages mount the shared header (one branding source)');

if (/page-marquee-only/.test(displayHtml) && !/lanternAppBarRoot/.test(displayHtml) && !/lantern-nav\.js/.test(displayHtml)) {
  ok('Display/marquee shell does not mount app-bar branding');
} else bad('display contract');

if (!headerCss.includes('Small Town') && !headerCss.includes('Big Pride')) {
  ok('marquee/header CSS tokens unchanged; slogans are not in the ticker');
} else bad('header css polluted');

if (
  navJs.includes('LanternStaffNav.buildMenuSectionsHtml') &&
  navJs.includes('applyCanonicalLanternMenu') &&
  navJs.includes("applyCanonicalLanternMenu('student'")
) {
  ok('12-14. role-aware nav wiring unchanged');
} else bad('role-aware nav drifted');

const blRepo = path.join(root, '..', 'mtss-behavior-log');
let blTouched = false;
if (fs.existsSync(blRepo)) {
  const blFiles = ['app/index.html', 'index.html', 'public/index.html'];
  blFiles.forEach(function (rel) {
    const p = path.join(blRepo, rel);
    if (fs.existsSync(p) && /Small Town|Big Pride/.test(fs.readFileSync(p, 'utf8'))) blTouched = true;
  });
}
if (!blTouched && navJs.includes('data-lantern-behavior-nav')) {
  ok('15. Behavior Logger left unchanged; only the existing Lantern menu link remains');
} else bad('15. behavior logger');

console.log('\nHeader brand #237:', pass, 'passed,', fail, 'failed');
if (fail) process.exit(1);
