/**
 * Prompt #169 — Explore compact top area (no dead vertical band before card grid).
 * Usage: node worker/scripts/explore-top-compact-test.mjs
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

const exploreHtml = read('app/explore.html');
const feedCss = read('app/css/lantern-feed.css');
const surfaceCss = read('app/css/lantern-surface-theme.css');
const headerCss = read('app/css/lantern-header.css');
const cardsCss = read('app/css/lantern-cards.css');

const heading = (exploreHtml.match(/<header class="feedHeading[\s\S]*?<\/header>/) || [''])[0];

assert(/feedHeading--exploreCompact/.test(heading), '1. Explore uses compact heading class');
assert(!/feedPageSub/.test(exploreHtml), '2. no empty removed-copy / feedPageSub wrapper');
assert(!/One feed — filter and sort/.test(exploreHtml), '2b. helper sentence stays removed');
assert(!/feedMetaRow/.test(heading), '2c. obsolete status-only meta row absent from Explore');
assert(!/min-height:\s*(1[5-9]\d|[2-9]\d{2})px/.test(surfaceCss.match(/\[data-surface-context="explore"\][\s\S]{0,200}/)?.[0] || ''), '1b. no Explore hero/min-height reservation');

assert(/feedHeadingControls/.test(heading), '3. title + Filters occupy compact controls region');
assert(/feedPageTitle[\s\S]*?feedHeadingControls[\s\S]*?feedFiltersToggle[\s\S]*?id="feedStatus"/.test(heading), '3b. Filters + item count stacked under compact controls');
assert(/feedFiltersPanel/.test(heading), '3c. Filters panel retained inside heading');
assert(/feedSortSelect/.test(heading) && /feedRefreshBtn/.test(heading), '3d. sort/Refresh remain inside Filters panel');

assert(/feedResultsHost[\s\S]*?id="feedGrid"/.test(exploreHtml), '4. feed grid follows compact controls host');
assert(/feedHeading--exploreCompact[\s\S]*?margin:\s*0\s+0\s+var\(--lantern-space-sm/.test(feedCss), '4b. title→grid gap uses space-sm (~12px)');
assert(/\[data-surface-context="explore"\][\s\S]*?padding-top:\s*0/.test(surfaceCss), '4c. Explore surface top pad collapsed at source');

assert(/--lantern-card-width:\s*280px/.test(headerCss), '5. card width token unchanged');
assert(/--lantern-card-aspect-ratio:\s*16\s*\/\s*9/.test(headerCss), '5b. card aspect unchanged');
assert(/repeat\(auto-fit,\s*var\(--lantern-card-width,\s*280px\)\)/.test(feedCss), '5c. Explore grid track geometry unchanged');
assert(/aspect-ratio:\s*var\(--lantern-card-aspect-ratio/.test(cardsCss) || /aspect-ratio:\s*16\s*\/\s*9/.test(cardsCss), '5d. card renderer aspect still present');

assert(/id="lanternHeader"/.test(exploreHtml) && /id="lanternTicker"/.test(exploreHtml) && /id="lanternAppBarRoot"/.test(exploreHtml), '6. standard Lantern header unchanged');
assert(!/margin-top:\s*-\d+px/.test(feedCss) && !/margin-top:\s*-\d+px/.test(surfaceCss), '6b. no negative-margin hacks');

assert(/\.feedHeadingRow\s*\{[^}]*flex-wrap:\s*wrap/.test(feedCss), '7. heading row may wrap on narrow viewports');
assert(/\.wrap\.lanternContent\.lanternContent--feedWide\s*\{[^}]*max-width:\s*none/.test(feedCss), '7b. wide shell still prevents forced narrow overflow from page max-width');
assert(/--lantern-page-bg:/.test(headerCss), 'background tokens preserved (canonical page bg)');

console.log('\nexplore-top-compact-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
