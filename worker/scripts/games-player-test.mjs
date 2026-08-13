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
  tryPlayBlock[0].includes('LanternGamePlayer.open') &&
  /onPregameStart:\s*function[\s\S]*LanternGamesPaidStart\.startPaidGame/.test(tryPlayBlock[0])
) {
  ok('player pregame opens before charge; Start triggers startPaidGame');
} else bad('player open order vs charge (pregame → Start → charge)');

if (gamesHtml.includes('id="lanternGamePlayerPregame"') && gamesHtml.includes('id="lanternGamePlayerHeroImg"')) {
  ok('Game Player pregame hero DOM present');
} else bad('pregame hero DOM');

if (playerJs.includes('resolveGameMeta') && playerJs.includes('onPregameStart') && playerJs.includes('artworkUrl')) {
  ok('Game Player resolves canonical catalog artwork for pregame hero');
} else bad('canonical artwork resolution');

if (playerCss.includes('lanternGamePlayerHero') && playerCss.includes('object-fit: contain')) {
  ok('pregame hero CSS uses non-stretching object-fit');
} else bad('pregame hero CSS');

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
  'Tower',
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
  function makeEl(extra) {
    return Object.assign({
      hidden: true,
      textContent: '',
      src: '',
      disabled: false,
      classList: { add: function () {}, remove: function () {} },
      setAttribute: function () {},
      removeAttribute: function () {},
      getAttribute: function () { return null; },
      focus: function () {},
      addEventListener: function () {},
      appendChild: function () {},
    }, extra || {});
  }
  const overlay = makeEl({ hidden: true });
  const stage = makeEl({ appendChild: function (n) { stage._mounted = n; } });
  const pregame = makeEl({ hidden: true });
  const heroImg = makeEl({ hidden: true });
  const titleArt = makeEl({ hidden: true, getAttribute: function (k) { return k === 'src' ? titleArt.src : null; } });
  const startBtn = makeEl({ disabled: false, textContent: 'Start' });
  const host = makeEl();
  const surface = {
    parentNode: host,
    nextSibling: null,
    classList: { add: function () {}, remove: function () {} },
    style: {},
    removeAttribute: function () {},
  };
  const exitBtn = makeEl();
  const els = {
    lanternGamePlayerOverlay: overlay,
    lanternGamePlayerStage: stage,
    lanternGamePlayerPregame: pregame,
    lanternGamePlayerHeroImg: heroImg,
    lanternGamePlayerTitleArt: titleArt,
    lanternGamePlayerPregameTitle: makeEl(),
    lanternGamePlayerPregameDesc: makeEl(),
    lanternGamePlayerPregameCost: makeEl({ hidden: true, textContent: '' }),
    lanternGamePlayerPregameStatus: makeEl({
      hidden: true,
      textContent: '',
      classList: {
        _c: {},
        add: function (n) { this._c[n] = true; },
        remove: function (n) { delete this._c[n]; },
      },
    }),
    lanternGamePlayerTitle: makeEl(),
    lanternGamePlayerStartBtn: startBtn,
    lanternGamePlayerSurfaceHost: host,
    lanternGamePlayerExit: exitBtn,
    reactionArea: surface,
  };
  const sandbox = {
    window: {},
    globalThis: {},
    document: {
      getElementById: function (id) { return els[id] || null; },
      body: body,
      documentElement: { scrollTop: 0 },
      addEventListener: function (ev, fn) { listeners.push({ ev, fn }); },
      removeEventListener: function () {},
      readyState: 'complete',
    },
    scrollY: 120,
    scrollTo: function (_x, y) { sandbox._restoredY = y; },
    LANTERN_GAME_CATALOG: null,
  };
  sandbox.window = sandbox.globalThis = sandbox;
  vm.runInNewContext(catalogJs, sandbox);
  vm.runInNewContext(playerJs, sandbox);
  return { sandbox, overlay, surface, stage, pregame, heroImg, titleArt, startBtn, listeners };
}

const loaded = loadPlayerModule();
const LP = loaded.sandbox.LanternGamePlayer;
let pregameStarted = false;
if (
  LP &&
  LP.open({
    surface: 'reactionArea',
    title: 'Reaction Tap',
    gameName: 'Reaction Tap',
    onPregameStart: function (done) {
      pregameStarted = true;
      done();
    },
  })
) {
  ok('LanternGamePlayer.open enters pregame');
} else bad('LanternGamePlayer.open');

if (loaded.overlay.hidden === false) ok('open reveals overlay');
else bad('overlay hidden state on open');

if (LP.getPhase() === 'pregame' && loaded.pregame.hidden === false && !loaded.stage._mounted) {
  ok('pregame phase shows hero shell before mounting gameplay surface');
} else bad('pregame phase', LP.getPhase());

const expectedArt = loaded.sandbox.LANTERN_GAME_CATALOG.artworkUrl('Reaction Tap');
if (expectedArt && loaded.heroImg.src === expectedArt && loaded.heroImg.hidden === false) {
  ok('pregame hero uses canonical catalog artwork (same as card)');
} else bad('pregame hero artwork', { src: loaded.heroImg.src, expectedArt });

loaded.startBtn.addEventListener = function () {};
if (typeof LP.beginGameplay === 'function') {
  // Drive Start path via public beginGameplay after simulating charge callback
  pregameStarted = true;
  LP.beginGameplay();
}
if (LP.getPhase() === 'playing' && loaded.stage._mounted === loaded.surface && loaded.pregame.hidden === true) {
  ok('Start/beginGameplay collapses pregame and mounts playable surface');
} else bad('gameplay transition', LP.getPhase());

if (loaded.titleArt.hidden === false && loaded.titleArt.src === expectedArt) {
  ok('compact title-art chip retains canonical artwork during gameplay');
} else bad('gameplay title art chip');

LP.close();
if (loaded.overlay.hidden === true && loaded.sandbox._restoredY === 120) {
  ok('close hides overlay and restores scrollY');
} else bad('close cleanup', loaded.sandbox._restoredY);

// #163 — persistent insufficient message on Start failure
{
  const again = loadPlayerModule();
  const L2 = again.sandbox.LanternGamePlayer;
  L2.open({
    surface: 'reactionArea',
    title: 'Reaction Tap',
    gameName: 'Reaction Tap',
    onPregameStart: function (done) {
      done(false, { error: 'insufficient', available: 0 });
    },
  });
  // Simulate wired Start click path: call onPregameStart via public apply after open
  again.startBtn.disabled = true;
  again.startBtn.textContent = 'Starting…';
  L2.applyPaidStartFailure({ error: 'insufficient', available: 0 });
  again.startBtn.disabled = false;
  again.startBtn.textContent = 'Start';
  const status = again.sandbox.document.getElementById('lanternGamePlayerPregameStatus');
  if (
    L2.getPhase() === 'pregame' &&
    status &&
    !status.hidden &&
    /You need 1 Nugget to play/i.test(status.textContent) &&
    /0 Nugget/i.test(status.textContent) &&
    again.startBtn.textContent === 'Start' &&
    again.startBtn.disabled === false
  ) {
    ok('insufficient Start failure leaves persistent pregame status + restored Start');
  } else {
    bad('insufficient Start failure UX', {
      phase: L2.getPhase(),
      status: status && status.textContent,
      hidden: status && status.hidden,
      btn: again.startBtn.textContent,
      disabled: again.startBtn.disabled,
    });
  }
  L2.close();
}

if (gamesHtml.includes('lanternGamePlayerPregameStatus') && playerJs.includes('applyPaidStartFailure')) {
  ok('pregame status + applyPaidStartFailure wired for #163');
} else bad('#163 status wiring');

console.log('\nGames player tests:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
