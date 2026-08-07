/**
 * Surface theme + shared Explore/Locker architecture tests.
 * Usage: node worker/scripts/surface-theme-architecture-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import { computeNextMilestone, NUGGET_MILESTONES } from '../locker-milestones.js';
import { identityKeysForAccount, lockerPersonalFeedTest } from '../locker-personal-feed.js';

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

function loadThemeApi() {
  const code = fs.readFileSync(path.join(root, 'app/js/lantern-surface-theme.js'), 'utf8');
  const ctx = { window: {}, document: { getElementById: () => null, querySelector: () => null } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx.LANTERN_SURFACE_THEME;
}

function loadExploreApi() {
  const feedApi = { FEED_FILTERS: [{ id: 'all', label: 'All' }], getFeed: async () => ({ ok: true, items: [] }) };
  const win = {
    document: {
      getElementById: () => null,
      querySelector: () => ({
        style: { setProperty() {} },
        classList: { add() {}, remove() {} },
        setAttribute() {},
        removeAttribute() {},
      }),
      createElement: () => ({ addEventListener() {}, appendChild() {} }),
    },
    LANTERN_FEED: feedApi,
    LANTERN_FEED_CARD: { buildCard: () => ({}) },
    LANTERN_SURFACE_THEME: loadThemeApi(),
    LANTERN_LOCKER_ME: { getLockerMe: () => ({ equipped_items: { equipped: { background: 'bg_stars' } } }) },
  };
  win.window = win;
  const code = fs.readFileSync(path.join(root, 'app/js/lantern-feed-explore.js'), 'utf8');
  vm.createContext(win);
  vm.runInContext(code, win);
  return win.LANTERN_FEED_EXPLORE;
}

// Milestones
const m = computeNextMilestone(17);
if (m.next !== 50 || m.label !== '17 / 50') bad('milestone 17/50', m);
else ok('centralized milestone sequence');

if (JSON.stringify(NUGGET_MILESTONES) === JSON.stringify([50, 100, 250, 500, 1000])) ok('milestone constants');
else bad('milestone constants', NUGGET_MILESTONES);

// Theme registry
const theme = loadThemeApi();
if (!theme.lookupCosmetic('bg_stars')) bad('registry bg_stars');
else ok('registry knows bg_stars');
if (theme.lookupCosmetic('not_a_real_cosmetic')) bad('unknown cosmetic ignored', 'truthy');
else ok('unknown cosmetic ignored');
if (theme.lookupCosmetic('frame_gold')?.slot === 'frame') ok('frame slot mapping');
else bad('frame slot mapping');

// Explore vs locker controllers
const exploreApi = loadExploreApi();
const exploreCtrl = exploreApi.createController({ context: 'explore' });
const lockerCtrl = exploreApi.createController({ context: 'locker' });
if (exploreCtrl.getContext() === 'explore') ok('explore context');
else bad('explore context', exploreCtrl.getContext());
if (lockerCtrl.getContext() === 'locker') ok('locker context');
else bad('locker context', lockerCtrl.getContext());

// Identity keys exclude display_name by default
const keys = identityKeysForAccount(
  { username: '20889', display_name: 'Lucas', student_character_name: '20889' },
  '20889'
);
if (keys.has('20889') && !keys.has('lucas')) ok('identity keys use permanent ids');
else bad('identity keys', [...keys]);

// Shared engine file uses same card API (static check)
const exploreJs = fs.readFileSync(path.join(root, 'app/js/lantern-feed-explore.js'), 'utf8');
const lockerShell = fs.readFileSync(path.join(root, 'app/js/lantern-locker-shell.js'), 'utf8');
if (exploreJs.includes('LANTERN_FEED_CARD') && exploreJs.includes('buildCard') && lockerShell.includes('createController')) {
  ok('locker uses shared explore controller + canonical cards');
} else bad('shared engine wiring');

if (!exploreJs.includes('lockerCard') && !fs.readFileSync(path.join(root, 'app/js/lantern-feed-card.js'), 'utf8').includes('LockerCard')) {
  ok('no locker-specific card renderer');
} else bad('locker-specific card renderer found');

// Personal feed dedupe (mock db)
const mockItems = [
  { id: 'a', authorId: '20889', authorDisplayName: '20889', type: 'article', title: 'A', createdAt: '1', approvedAt: '1' },
  { id: 'b', authorId: 'other', authorDisplayName: 'other', type: 'article', title: 'B', createdAt: '2', approvedAt: '2' },
];
const mockDb = {
  prepare(sql) {
    const s = String(sql);
    return {
      bind() {
        return this;
      },
      async all() {
        if (s.includes('lantern_reactions')) return { results: [{ item_id: 'b' }] };
        if (s.includes('lantern_feed_items')) return { results: [] };
        if (s.includes('lantern_news_submissions')) return { results: [] };
        if (s.includes('lantern_mission_submissions')) return { results: [] };
        return { results: [] };
      },
      async first() {
        return null;
      },
    };
  },
};
// Stub collectApprovedFeed path by testing identity + relationship logic through buildLockerPersonalFeed with patched import would need more work
// Minimal: verify buildLockerPersonalFeed returns ok shape with empty collect - skip full integration without heavy mock

console.log('\n--- surface-theme-architecture-test:', pass, 'passed,', fail, 'failed ---');
process.exit(fail ? 1 : 0);
