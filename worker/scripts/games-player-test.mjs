/**
 * Shared fullscreen Game Player (Prompt #61).
 * Usage: node worker/scripts/games-player-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

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

const gamesHtml = fs.readFileSync(path.join(root, 'app/games.html'), 'utf8');
const playerJs = fs.readFileSync(path.join(root, 'app/js/lantern-game-player.js'), 'utf8');
const playerCss = fs.readFileSync(path.join(root, 'app/css/lantern-game-player.css'), 'utf8');
const paidStartJs = fs.readFileSync(path.join(root, 'app/js/lantern-games-paid-start.js'), 'utf8');
const catalogJs = fs.readFileSync(path.join(root, 'app/js/lantern-game-catalog.js'), 'utf8');

if (gamesHtml.includes('lantern-game-player.js') && gamesHtml.includes('lantern-game-player.css')) {
  ok('games.html links shared Game Player assets');
} else bad('Game Player asset links');

if (gamesHtml.includes('id="lanternGamePlayerOverlay"') && gamesHtml.includes('id="lanternGamePlayerStage"')) {
  ok('Game Player overlay + stage DOM present');
} else bad('Game Player DOM');

if (gamesHtml.includes('role="dialog"') && gamesHtml.includes('aria-modal="true"')) {
  ok('Game Player has modal accessibility semantics');
} else bad('modal a11y');

const tryPlayBlock = gamesHtml.match(/function tryPlay[\s\S]*?^    \}/m);
if (tryPlayBlock && tryPlayBlock[0].includes('LanternGamesPaidStart.startPaidGame')) {
  ok('tryPlay delegates to startPaidGame');
} else bad('tryPlay paid start');

if (
  tryPlayBlock &&
  tryPlayBlock[0].indexOf('LanternGamePlayer.open') > tryPlayBlock[0].indexOf('startPaidGame')
) {
  ok('player opens inside paid-start success callback (charge before player)');
} else bad('player open order vs charge');

if (
  gamesHtml.includes('failGamePlayerStart') &&
  gamesHtml.includes('LanternGamePlayer.close({ skipExit: true, force: true })')
) {
  ok('init failure closes player gracefully');
} else bad('init failure handling');

if (paidStartJs.includes('spendInFlight') && paidStartJs.includes('isInFlight')) {
  ok('paid-start in-flight guard prevents double charge');
} else bad('double-charge guard');

if (playerCss.includes('position: fixed') && playerCss.includes('inset: 0') && playerCss.includes('100dvh')) {
  ok('player uses fixed fullscreen 100dvh contract');
} else bad('viewport geometry');

if (playerCss.includes('z-index: 10100')) {
  ok('player z-index above header/help overlays');
} else bad('player stacking');

if (playerCss.includes('lantern-game-player-scroll-lock') && playerCss.includes('overflow: hidden')) {
  ok('background scroll lock styles');
} else bad('scroll lock CSS');

if (playerJs.includes('lockScroll') && playerJs.includes('unlockScroll') && playerJs.includes('scrollTo(0, state.scrollY)')) {
  ok('scroll position saved and restored on close');
} else bad('scroll restore');

if (playerJs.includes("e.key === 'Escape'") && playerJs.includes('close()')) {
  ok('Escape closes Game Player on desktop');
} else bad('Escape handler');

if (playerJs.includes('lantern-game-player-active') && playerCss.includes('lanternHelpPanel')) {
  ok('Help panel suppressed while player active');
} else bad('Help suppression');

if (playerJs.includes('reparentToStage') && playerJs.includes('reparentToHost')) {
  ok('single surface reparent (no duplicate DOM)');
} else bad('reparent architecture');

if (!gamesHtml.match(/scrollIntoView\s*\(\s*area|scrollIntoView\s*\(\s*overlay/)) {
  ok('no legacy scrollIntoView game launch');
} else bad('scrollIntoView launch');

if (!gamesHtml.match(/\.open\s*=\s*true|classList\.add\s*\(\s*['"]open['"]\s*\)/)) {
  ok('no legacy .open overlay launch on games page');
} else bad('legacy .open launch');

const gameNames = [
  'Reaction Tap',
  'Nugget Click Rush',
  'Memory Match',
  'Nugget Hunt',
  'Avatar Match',
  'Handbook Trivia',
  'Lantern Live Trivia',
  'Local History Trivia',
];
gameNames.forEach(function (name) {
  const re = new RegExp(
    "tryPlay\\('" + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "'[\\s\\S]*?surface:",
    'm'
  );
  if (re.test(gamesHtml)) ok('shared player wired: ' + name);
  else bad('playerOpts.surface missing for ' + name);
});

if (gamesHtml.includes('id="lanternGamePlayerSurfaceHost"') && gamesHtml.includes('id="gamesArcadeEmbeddedSurfaces"')) {
  ok('arcade surfaces live in hidden surface host not page flow');
} else bad('surface host placement');

if (playerCss.includes('max-width: 100%') && playerCss.includes('box-sizing: border-box')) {
  ok('responsive stage rules for phone overflow');
} else bad('responsive overflow rules');

if (playerCss.includes('safe-area-inset')) {
  ok('safe-area insets on player');
} else bad('safe-area insets');

if (
  !playerJs.includes('history.pushState') &&
  !playerJs.includes('history.replaceState') &&
  !gamesHtml.match(/tryPlay[\s\S]*history\.(push|replace)State/)
) {
  ok('Game Player does not navigate away from /games');
} else bad('history navigation on player');

function loadPlayerModule() {
  const listeners = [];
  const body = {
    classList: { _c: new Set(), add: function (c) { this._c.add(c); }, remove: function (c) { this._c.delete(c); }, contains: function (c) { return this._c.has(c); } },
    style: {},
  };
  const overlay = { hidden: true, setAttribute: function () {}, removeAttribute: function () {} };
  const stage = { appendChild: function () {} };
  const host = { appendChild: function () {} };
  const surface = { parentNode: host, nextSibling: null, classList: { add: function () {}, remove: function () {} }, style: {}, removeAttribute: function () {} };
  const exitBtn = { focus: function () {}, addEventListener: function () {} };
  const sandbox = {
    window: {},
    globalThis: {},
    document: {
      getElementById: function (id) {
        if (id === 'lanternGamePlayerOverlay') return overlay;
        if (id === 'lanternGamePlayerStage') return stage;
        if (id === 'lanternGamePlayerSurfaceHost') return host;
        if (id === 'lanternGamePlayerExit') return exitBtn;
        if (id === 'lanternGamePlayerTitle') return { textContent: '' };
        if (id === 'reactionArea') return surface;
        return null;
      },
      body: body,
      documentElement: { scrollTop: 0 },
      addEventListener: function (ev, fn) { listeners.push({ ev, fn }); },
      removeEventListener: function () {},
      readyState: 'complete',
    },
    scrollY: 120,
    scrollTo: function (_x, y) { sandbox._restoredY = y; },
  };
  sandbox.window = sandbox.globalThis = sandbox;
  vm.runInNewContext(playerJs, sandbox);
  return { sandbox, overlay, surface, listeners };
}

const loaded = loadPlayerModule();
const LP = loaded.sandbox.LanternGamePlayer;
if (LP && LP.open({ surface: 'reactionArea', title: 'Reaction Tap' })) {
  ok('LanternGamePlayer.open mounts surface');
} else bad('LanternGamePlayer.open');

if (loaded.overlay.hidden === false) ok('open reveals overlay');
else bad('overlay hidden state on open');

LP.close();
if (loaded.overlay.hidden === true && loaded.sandbox._restoredY === 120) {
  ok('close hides overlay and restores scrollY');
} else bad('close cleanup', loaded.sandbox._restoredY);

console.log('\nGames player tests:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
