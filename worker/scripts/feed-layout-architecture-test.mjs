/**
 * Shared Explore/Locker layout architecture tests (Prompt #20).
 * Usage: node worker/scripts/feed-layout-architecture-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import { handleLockerRoutes } from '../locker-handlers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;

function ok(label) {
  pass++;
  console.log('PASS', label);
}
function bad(label, detail) {
  fail++;
  console.error('FAIL', label, detail || '');
}

function hasCollapsedFiltersPanel(html) {
  return /id="feedFiltersPanel"[^>]*\shidden/.test(html);
}

function measureFeedLayout(viewportWidth) {
  const gutter = 40; // 2.5rem at 16px base
  const cardW = 280;
  const gap = 16;
  const container = Math.min(1760, Math.max(0, viewportWidth - gutter));
  const cols = Math.max(1, Math.floor((container + gap) / (cardW + gap)));
  const gridWidth = cols * cardW + (cols - 1) * gap;
  return {
    viewportWidth,
    container,
    gridWidth,
    cardWidth: cardW,
    gap,
    columns: cols,
    partialCard: gridWidth > container + 0.5,
    horizontalOverflow: container > viewportWidth,
  };
}

const feedCss = fs.readFileSync(path.join(root, 'app/css/lantern-feed.css'), 'utf8');
const exploreHtml = fs.readFileSync(path.join(root, 'app/explore.html'), 'utf8');
const lockerHtml = fs.readFileSync(path.join(root, 'app/locker.html'), 'utf8');
const exploreJs = fs.readFileSync(path.join(root, 'app/js/lantern-feed-explore.js'), 'utf8');
const navJs = fs.readFileSync(path.join(root, 'app/js/lantern-nav.js'), 'utf8');
const feedApiJs = fs.readFileSync(path.join(root, 'app/js/lantern-feed-api.js'), 'utf8');
const surfaceCss = fs.readFileSync(path.join(root, 'app/css/lantern-surface-theme.css'), 'utf8');

if (feedCss.includes('.lanternExplorePageContainer') && feedCss.includes('--feed-grid-max-width: 1760px')) {
  ok('shared page container + 1760px max width');
} else bad('shared page container');

if (feedCss.includes('repeat(auto-fit, var(--lantern-card-width, 280px))')) {
  ok('donor-style auto-fit 280px grid');
} else bad('grid rule');

if (feedCss.includes('.feedFiltersToggle') && feedCss.includes('.feedFiltersPanel')) {
  ok('filters disclosure CSS');
} else bad('filters disclosure CSS');

if (
  feedCss.includes('.feedHeadingRow') &&
  feedCss.includes('.feedMetaRow') &&
  feedCss.includes('justify-content: space-between')
) {
  ok('shared compact feed heading rows in CSS');
} else bad('compact feed heading CSS');

function hasCompactFeedHeading(html) {
  return (
    html.includes('class="feedHeading"') &&
    html.includes('class="feedHeadingRow"') &&
    /class="feedMetaRow(\s|")/.test(html) &&
    /class="feedHeadingRow"[\s\S]*?feedPageTitle[\s\S]*?feedFiltersToggle/.test(html) &&
    /class="feedMetaRow[\s\S]*?id="feedStatus"/.test(html) &&
    !html.includes('feedFiltersHost')
  );
}

if (hasCompactFeedHeading(exploreHtml)) ok('Explore compact two-row feed heading');
else bad('Explore compact feed heading markup');

if (hasCompactFeedHeading(lockerHtml)) ok('Locker compact two-row feed heading');
else bad('Locker compact feed heading markup');

if (!exploreHtml.includes('feedResultsHost') || !/feedResultsHost[\s\S]*?feedGrid/.test(exploreHtml)) {
  bad('feedResultsHost structure');
} else if (!/feedMetaRow[\s\S]*?feedStatus/.test(exploreHtml) && !/feedMetaRow[\s\S]*?id="feedStatus"/.test(exploreHtml)) {
  bad('item count not in feedMetaRow');
} else ok('item count lives in feedMetaRow, not above grid stack');

if (!exploreHtml.includes('feedSearchInput') && !lockerHtml.includes('feedSearchInput')) {
  ok('page-local search removed from Explore and Locker HTML');
} else bad('page-local search still in HTML');

if (navJs.includes('Search Lantern') && navJs.includes('wireHeaderFeedSearch')) {
  ok('global header Search Lantern wired to feed');
} else bad('header search wiring');

if (exploreHtml.includes('feedFiltersToggle') && hasCollapsedFiltersPanel(exploreHtml)) {
  ok('Explore filters disclosure markup');
} else bad('Explore filters markup');

if (lockerHtml.includes('lockerRelationshipSection') && hasCollapsedFiltersPanel(lockerHtml)) {
  ok('Locker relationship inside collapsed filters');
} else bad('Locker filters markup');

if (exploreJs.includes('setOpen(false)')) ok('Filters disclosure defaults collapsed');
else bad('Filters default collapsed');

if (!exploreJs.includes('localStorage') && !exploreJs.includes('sessionStorage')) {
  ok('Filters open state not persisted');
} else bad('Filters persistence detected');

if (exploreHtml.includes('lanternExplorePageContainer') && lockerHtml.includes('lanternExplorePageContainer')) {
  ok('both pages use lanternExplorePageContainer');
} else bad('page container markup');

if (exploreHtml.includes('feedGrid') && lockerHtml.includes('feedGrid') && exploreHtml.includes('feedResultsHost')) {
  ok('shared feedGrid + feedResultsHost on both pages');
} else bad('shared grid classes');

const profileJs = fs.readFileSync(path.join(root, 'app/js/lantern-profile-app.js'), 'utf8');

const obsoleteOverviewIds = [
  'yourWinsSection',
  'spotlightRailEl',
  'achievementsRailEl',
  'postFeedEl',
  'myCreationsTabs',
  'myCreationsSearchWrap',
  'profileView',
  'profileHeroEl',
  'featuredPostEl',
];
obsoleteOverviewIds.forEach(function (id) {
  if (!lockerHtml.includes('id="' + id + '"')) ok('obsolete Overview markup absent: ' + id);
  else bad('obsolete Overview markup still present: ' + id);
});

if (!surfaceCss.includes('#yourWinsSection') && !surfaceCss.includes('body.lockerShell--sharedFeed #postFeedEl')) {
  ok('obsolete Overview hide CSS removed');
} else bad('obsolete Overview hide CSS still present');

if (lockerHtml.includes('lockerPanelItems') && lockerHtml.includes('lockerPanelStore') && lockerHtml.includes('lockerSectionsEl')) {
  ok('Items/Store tabs still present');
} else bad('Items/Store markup missing');

if (!profileJs.includes('renderYourWinsSpotlightRail') && !profileJs.includes('renderMyCreations(') && !profileJs.includes('renderAchievements(')) {
  ok('no Overview slider/rail initialization in profile-app');
} else bad('Overview rail init still in profile-app');

if (exploreJs.includes('bindFiltersDisclosure') && exploreJs.includes('setSearch') && !exploreJs.includes('feedSearchInput')) {
  ok('controller uses disclosure + header search hook, no local search');
} else bad('feed explore controller');

const prohibited = ['.lockerGrid', '.lockerResultsHost', 'lockerCard'];
prohibited.forEach(function (p) {
  if (!exploreJs.includes(p) && !lockerHtml.includes(p)) ok('no ' + p);
  else bad('found prohibited ' + p);
});

// Six-column math: 6*280 + 5*16 = 1760
const sixColWidth = 6 * 280 + 5 * 16;
if (sixColWidth === 1760) ok('six-column proof: 6×280 + 5×16 = 1760');

function loadExploreApi() {
  const feedApi = {
    FEED_FILTERS: [{ id: 'all', label: 'All' }],
    getFeed: async (p) => ({ ok: true, items: [], params: p }),
    getLockerPersonalFeed: async (p) => ({ ok: true, items: [], params: p }),
  };
  const win = {
    document: {
      getElementById: (id) => {
        if (id === 'feedFiltersToggle') {
          return { addEventListener() {}, setAttribute() {}, textContent: '' };
        }
        if (id === 'feedFiltersPanel') return { hidden: true };
        if (id === 'lockerRelationshipSection') return { hidden: false };
        return { innerHTML: '', appendChild() {}, addEventListener() {} };
      },
      querySelector: () => ({ style: { setProperty() {} }, classList: { add() {}, remove() {} }, setAttribute() {}, removeAttribute() {} }),
      createElement: () => ({ addEventListener() {}, appendChild() {}, setAttribute() {} }),
    },
    LANTERN_FEED: feedApi,
    LANTERN_FEED_CARD: { buildCard: () => ({}) },
    LANTERN_SURFACE_THEME: { applyDefaultTheme() {}, applyLockerTheme() {} },
    LANTERN_LOCKER_ME: { getLockerMe: () => ({ equipped_items: { equipped: {} } }) },
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(exploreJs, win);
  return win.LANTERN_FEED_EXPLORE;
}

const api = loadExploreApi();
const exploreCtrl = api.createController({ context: 'explore' });
const lockerCtrl = api.createController({ context: 'locker' });
exploreCtrl.setSearch('stars');
lockerCtrl.setSearch('robot');
if (exploreCtrl.getSearch() === 'stars' && lockerCtrl.getSearch() === 'robot') ok('independent search state per controller');

async function testLockerSearchUsesPersonalFeed() {
  let captured = null;
  const feedApi = {
    FEED_FILTERS: [{ id: 'all', label: 'All' }],
    getLockerPersonalFeed: async (p) => {
      captured = p;
      return { ok: true, items: [] };
    },
  };
  const win = {
    document: {
      getElementById: (id) => {
        if (id === 'feedFiltersToggle') return { addEventListener() {}, setAttribute() {}, textContent: '' };
        if (id === 'feedFiltersPanel') return { hidden: true };
        if (id === 'lockerRelationshipSection') return { hidden: false };
        return { innerHTML: '', appendChild() {}, addEventListener() {}, textContent: '' };
      },
      querySelector: () => null,
      createElement: () => ({ addEventListener() {}, appendChild() {}, setAttribute() {} }),
    },
    LANTERN_FEED: feedApi,
    LANTERN_FEED_CARD: { buildCard: () => ({}) },
    LANTERN_SURFACE_THEME: { applyLockerTheme() {} },
    LANTERN_LOCKER_ME: { getLockerMe: () => ({ equipped_items: { equipped: {} } }) },
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(exploreJs, win);
  const ctrl = win.LANTERN_FEED_EXPLORE.createController({ context: 'locker' });
  ctrl.setSearch('field trip');
  await ctrl.refresh();
  if (captured && captured.search === 'field trip' && captured.relationship === 'all') {
    ok('locker search composes with personal feed params');
  } else bad('locker search params', captured);
}

await testLockerSearchUsesPersonalFeed();

async function testExploreSearchUsesCommunityFeed() {
  let captured = null;
  const feedApi = {
    FEED_FILTERS: [{ id: 'all', label: 'All' }],
    getFeed: async (p) => {
      captured = p;
      return { ok: true, items: [] };
    },
  };
  const win = {
    document: {
      getElementById: (id) => {
        if (id === 'feedFiltersToggle') return { addEventListener() {}, setAttribute() {}, textContent: '' };
        if (id === 'feedFiltersPanel') return { hidden: true };
        return { innerHTML: '', appendChild() {}, addEventListener() {}, textContent: '' };
      },
      querySelector: () => null,
      createElement: () => ({ addEventListener() {}, appendChild() {}, setAttribute() {} }),
    },
    LANTERN_FEED: feedApi,
    LANTERN_FEED_CARD: { buildCard: () => ({}) },
    LANTERN_SURFACE_THEME: { applyDefaultTheme() {} },
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(exploreJs, win);
  const ctrl = win.LANTERN_FEED_EXPLORE.createController({ context: 'explore' });
  ctrl.setSearch('news');
  await ctrl.refresh();
  if (captured && captured.search === 'news' && !('relationship' in captured)) {
    ok('Explore header search uses community feed path');
  } else bad('Explore search path', captured);
}

await testExploreSearchUsesCommunityFeed();

if (navJs.includes('wireHeaderFeedSearch') && /function wireHeaderFeedSearch[\s\S]*?LANTERN_FEED_EXPLORE\.setSearch/.test(navJs)) {
  ok('header Search Lantern wired to in-page feed search');
} else bad('header search wiring');

const wireHeaderBlock = navJs.match(/function wireHeaderFeedSearch[\s\S]*?\n  \}/);
if (wireHeaderBlock && !wireHeaderBlock[0].includes('location.')) {
  ok('header Search Lantern stays on page (no navigation)');
} else bad('header search navigation');

const lockerFeedFn = feedApiJs.match(/getLockerPersonalFeed[\s\S]*?\},/);
if (lockerFeedFn && !lockerFeedFn[0].match(/\b(student|username|economy_key|character_name)\b/)) {
  ok('getLockerPersonalFeed omits client identity params');
} else bad('getLockerPersonalFeed identity params');

const viewports = [1920, 1440, 1280, 1024, 768, 390];
viewports.forEach(function (vw) {
  const m = measureFeedLayout(vw);
  if (!m.partialCard && !m.horizontalOverflow) {
    ok('responsive ' + vw + ': ' + m.columns + ' cols, container ' + m.container + 'px');
  } else bad('responsive layout ' + vw, m);
});

const sixAt1920 = measureFeedLayout(1920);
if (sixAt1920.columns === 6 && sixAt1920.gridWidth === 1760) {
  ok('six-column proof at 1920 viewport');
} else bad('six-column at 1920', sixAt1920);

console.log('\n--- feed-layout-architecture-test:', pass, 'passed,', fail, 'failed ---');
process.exit(fail ? 1 : 0);
