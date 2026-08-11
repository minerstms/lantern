/**
 * Prompt #187 — Explore chrome: remove body title/count; Filters in header right of Search.
 * Usage: node worker/scripts/explore-header-filters-187-test.mjs
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
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }
function assert(cond, label, detail) { if (cond) ok(label); else bad(label, detail); }

const exploreHtml = read('app/explore.html');
const lockerHtml = read('app/locker.html');
const missionsHtml = read('app/missions.html');
const navJs = read('app/js/lantern-nav.js');
const feedCss = read('app/css/lantern-feed.css');
const feedExploreJs = read('app/js/lantern-feed-explore.js');
const headerCss = read('app/css/lantern-header.css');

const exploreHeading = (exploreHtml.match(/<header class="feedHeading[\s\S]*?<\/header>/) || [''])[0];

assert(/feedHeading--exploreHeaderFilters/.test(exploreHeading), '1. Explore uses header-filters heading class');
assert(!/<h1 class="feedPageTitle">Lantern<\/h1>/.test(exploreHtml), '2. body Lantern title removed');
assert(!/feedPageTitle/.test(exploreHeading), '3. no feedPageTitle in Explore heading');
assert(!/id="feedStatus"/.test(exploreHtml), '4. Explore visible item-count host removed');
assert(!/feedHeadingControls/.test(exploreHeading), '5. body Filters controls stack removed');
assert(!/<button[^>]*id="feedFiltersToggle"/.test(exploreHtml), '6. body Filters button absent from explore.html');
assert(/id="feedFiltersPanel"/.test(exploreHeading), '7. Filters panel retained in body for disclosure');
assert(/feedSortSelect/.test(exploreHeading) && /feedRefreshBtn/.test(exploreHeading), '8. sort/Refresh remain in panel');

assert(/current === 'explore'[\s\S]{0,200}feedFiltersToggle/.test(navJs), '9. nav mounts Filters only on Explore');
assert(/lanternAppBarSearchFilters/.test(navJs), '10. Search + Filters cluster present');
assert(/lanternAppBarFiltersBtn/.test(navJs), '11. compact header Filters class');
assert(/background:\s*transparent[\s\S]{0,80}lanternAppBarFiltersBtn|lanternAppBarFiltersBtn\{[^}]*background:\s*transparent/.test(navJs), '12. Filters is text action (no large button shell)');
assert(/Filters ▸/.test(navJs), '13. Filters uses existing chevron glyph');
assert(/lanternExploreSearch/.test(navJs), '14. Search preserved');
assert(/applySignedInHeaderIdentity/.test(navJs), '15. username preserved');
assert(!/lanternExploreAvatarBtn/.test(navJs), '16. #185 avatar still absent');
assert(!/lanternHelpSlot/.test(navJs), '17. #185 Help Mode still absent');

assert(/feedHeading--exploreHeaderFilters[\s\S]{0,80}margin:\s*0/.test(feedCss), '18. Explore heading margin collapsed when closed');
assert(!/margin-top:\s*-\d+px/.test(feedCss), '19. no negative-margin hack');
assert(/--lantern-card-width:\s*280px/.test(headerCss), '20. card width unchanged');

assert(/context === 'locker'[\s\S]{0,120}item'/.test(feedExploreJs) || /context === 'locker'[\s\S]{0,200}items\.length/.test(feedExploreJs), '21. item count text only for Locker');
assert(/bindFiltersDisclosure/.test(feedExploreJs) && /feedFiltersToggle/.test(feedExploreJs), '22. same Filters disclosure wiring');

assert(/id="feedFiltersToggle"/.test(lockerHtml), '23. Locker still has its own Filters (not Explore header)');
assert(!/lanternAppBarSearchFilters/.test(missionsHtml), '24. Missions HTML does not hardcode Explore Filters cluster');
assert(/My Lantern/.test(lockerHtml), '25. Locker My Lantern title preserved');

console.log('\nexplore-header-filters-187-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
