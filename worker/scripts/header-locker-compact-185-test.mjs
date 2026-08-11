/**
 * Prompt #185 — compact Locker “My Lantern” row + remove header avatar / Help Mode.
 * Usage: node worker/scripts/header-locker-compact-185-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', '..');
function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

let pass = 0;
let fail = 0;
function ok(label) {
  pass++;
  console.log('PASS', label);
}
function bad(label, detail) {
  fail++;
  console.error('FAIL', label, detail != null ? detail : '');
}
function assert(cond, label, detail) {
  if (cond) ok(label);
  else bad(label, detail);
}

const lockerHtml = read('app/locker.html');
const feedCss = read('app/css/lantern-feed.css');
const navJs = read('app/js/lantern-nav.js');
const helpJs = read('app/js/lantern-help.js');
const exploreHtml = read('app/explore.html');
const displayHtml = read('app/display.html');
const feedExploreJs = read('app/js/lantern-feed-explore.js');

const lockerHeading = (lockerHtml.match(/<header class="feedHeading[\s\S]*?<\/header>/) || [''])[0];

assert(/feedHeading--lockerCompact/.test(lockerHeading), 'Locker uses compact My Lantern heading');
assert(!/Your relationship with Lantern content/.test(lockerHtml), 'Helper copy removed from Locker');
assert(!/feedPageSub/.test(lockerHeading), 'No feedPageSub in Locker heading');
assert(!/feedMetaRow/.test(lockerHeading), 'No separate meta row under My Lantern');
assert(
  /feedPageTitle[\s\S]*?My Lantern[\s\S]*?feedHeadingControls--inline[\s\S]*?id="feedStatus"[\s\S]*?feedFiltersToggle/.test(
    lockerHeading
  ),
  'One row: My Lantern + live count + Filters'
);
assert(/feedFiltersPanel/.test(lockerHeading), 'Filters panel retained');
assert(/feedHeadingControls--inline/.test(feedCss), 'Inline controls CSS present');
assert(/feedHeading--lockerCompact/.test(feedCss), 'Locker compact CSS present');
assert(
  /context === 'locker'[\s\S]{0,200}status\.textContent = state\.items\.length \+ ' item'/.test(feedExploreJs),
  'Live item count singular/plural still driven by feed explore (Locker only)'
);

assert(!/lanternHelpSlot/.test(navJs), 'Canonical nav no longer mounts Help Mode slot');
assert(!/lanternExploreAvatarBtn/.test(navJs), 'Canonical nav no longer mounts avatar button');
assert(!/lanternAppBarAvatarWrap/.test(navJs), 'Avatar wrap styles removed from nav');
assert(!/lanternExploreAvatarDropdown/.test(navJs), 'Avatar dropdown removed from nav');
assert(/lanternMenuTrigger/.test(navJs) && /lanternAppBarHomeLink/.test(navJs), 'Lantern dropdown preserved');
assert(/lanternAppBarContext/.test(navJs) && /applySignedInHeaderIdentity/.test(navJs), 'Signed-in username preserved');
assert(/lanternExploreSearch/.test(navJs) && /wireHeaderFeedSearch/.test(navJs), 'Search preserved');
assert(/lanternExploreBell/.test(navJs), 'Needs Attention bell retained');
assert(/lanternNavLogoutBtn/.test(navJs), 'Log out remains in Lantern dropdown');

assert(
  /Prompt #185[\s\S]*lanternHelpSlot[\s\S]*return;/.test(helpJs) ||
    /no longer a standard header control[\s\S]*lanternHelpSlot/.test(helpJs),
  'Help Mode skips mounting when no header slot'
);
assert(!/else document\.body\.appendChild\(toggleWrap\)/.test(helpJs), 'Help Mode no longer floats toggle on body without slot');
assert(/global\.LANTERN_HELP/.test(helpJs), 'Help infrastructure API retained');

assert(/lantern-nav\.js/.test(exploreHtml) && /lanternAppBarRoot/.test(exploreHtml), 'Explore still uses shared header');
assert(/page-marquee-only/.test(displayHtml) || /marquee/.test(displayHtml), 'Display keeps special header path');
assert(/page-marquee-only/.test(navJs), 'Nav still skips page-marquee-only (Display)');

console.log('\nheader-locker-compact-185-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
