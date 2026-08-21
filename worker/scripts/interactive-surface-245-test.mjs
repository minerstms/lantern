/**
 * Prompt #245 — Universal interactive surface / natural-scroll contract.
 * Usage: node worker/scripts/interactive-surface-245-test.mjs
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
  console.error('FAIL', label, detail != null ? detail : '');
}
function assert(cond, label, detail) {
  if (cond) ok(label);
  else bad(label, detail);
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function cssBlock(src, startRe) {
  const m = src.match(startRe);
  if (!m) return '';
  const from = src.indexOf(m[0]);
  const open = src.indexOf('{', from);
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(from, i + 1);
    }
  }
  return src.slice(from, from + 800);
}

const surfaceCss = read('app/css/lantern-interactive-surface.css');
const surfaceJs = read('app/js/lantern-interactive-surface.js');
const gamesHtml = read('app/games.html');
const playerCss = read('app/css/lantern-game-player.css');
const playerJs = read('app/js/lantern-game-player.js');
const gamesPageJs = read('app/js/lantern-games-page.js');
const gamesPageCss = read('app/css/lantern-games-page.css');
const missionsHtml = read('app/missions.html');
const missionsCss = read('app/css/lantern-missions-page.css');

const avatarMatchBlock = gamesHtml.slice(
  gamesHtml.indexOf('function openAvatarMatch'),
  gamesHtml.indexOf('function runTriviaGame')
);
const showQuestionBlock = gamesHtml.slice(
  gamesHtml.indexOf('function showQuestion'),
  gamesHtml.indexOf('function showAvatarMatchResult')
);
const resultBlock = gamesHtml.slice(
  gamesHtml.indexOf('function showAvatarMatchResult'),
  gamesHtml.indexOf('function runTriviaGame')
);
const isAvatarOverlay = cssBlock(gamesHtml, /\.cultureGameOverlay\.is-avatar-match\{/);
const isAvatarBody = cssBlock(gamesHtml, /\.cultureGameOverlay\.is-avatar-match \.gameBody\{/);
const isAvatarChoices = cssBlock(gamesHtml, /\.cultureGameOverlay\.is-avatar-match \.avatarMatchChoices\{/);
const surfaceOwner = cssBlock(surfaceCss, /\.lanternInteractiveSurface \{/);
const surfaceContent = cssBlock(surfaceCss, /\.lanternInteractiveSurfaceContent \{/);
const webkitBar = cssBlock(surfaceCss, /\.lanternInteractiveSurface::-webkit-scrollbar \{/);

assert(
  /overflow-y:\s*auto/.test(surfaceOwner) &&
    /scrollbar-width:\s*none/.test(surfaceOwner) &&
    !/overflow:\s*hidden/.test(surfaceOwner) &&
    /100dvh/.test(surfaceCss) &&
    /100svh/.test(surfaceCss),
  '1. shared surface is one usable vertical scroll owner (dvh/svh, not overflow:hidden)'
);

assert(
  /overflow:\s*visible/.test(isAvatarBody) &&
    /overflow:\s*visible/.test(isAvatarChoices) &&
    !/overflow:\s*hidden/.test(isAvatarOverlay) &&
    !/100dvh/.test(isAvatarOverlay) &&
    /overflow:\s*visible/.test(cssBlock(playerCss, /\.lanternGamePlayerStage \.cultureGameOverlay\.lanternInteractiveSurface/)),
  '2. no Avatar Match ancestor clips the answer area at zoom'
);

assert(
  showQuestionBlock.includes('avatarMatchChoices') &&
    showQuestionBlock.includes('class="choiceBtn"') &&
    showQuestionBlock.includes('options.forEach') &&
    /if \(options\.length < 4\)/.test(gamesHtml) &&
    !/display:\s*none/.test(isAvatarChoices) &&
    !/height:\s*0/.test(isAvatarChoices),
  '3. all 4 answer buttons remain in reachable document flow'
);

assert(
  resultBlock.includes('avatarMatchResultShell') &&
    resultBlock.includes('avatarMatchViewLbBtn') &&
    resultBlock.includes('avatarMatchPlayAgainBtn') &&
    /overflow:\s*visible/.test(isAvatarBody),
  '4. result screen remains in the same reachable flow'
);

assert(
  gamesHtml.includes('id="gamesLbModal"') &&
    gamesHtml.includes('gamesLbModal lanternInteractiveSurface') &&
    gamesHtml.includes('openAvatarMatchLeaderboard') &&
    resultBlock.includes('openAvatarMatchLeaderboard') &&
    /overflow:\s*visible/.test(cssBlock(gamesPageCss, /\.gamesLbModalPanel\.lanternInteractiveSurfaceContent/)),
  '5. leaderboard modal remains reachable via the universal overlay'
);

assert(
  surfaceJs.includes('function lockPage') &&
    surfaceJs.includes('function unlockPage') &&
    surfaceJs.includes("classList.remove(LOCK_CLASS)") &&
    /scrollTo\(0,\s*scrollY\)/.test(surfaceJs) &&
    playerJs.includes('LanternInteractiveSurface.lockPage') &&
    playerJs.includes('LanternInteractiveSurface.unlockPage') &&
    missionsHtml.includes('LanternInteractiveSurface.unlockPage') &&
    gamesPageJs.includes('closeFullLeaderboard') &&
    gamesPageJs.includes('LanternInteractiveSurface.unlockPage'),
  '6. body scroll lock restores on close (counted lock, paired unlock)'
);

assert(
  missionsHtml.includes('id="missionSubmitBtn"') &&
    missionsHtml.includes('missionDetailOverlay lanternInteractiveSurface') &&
    missionsHtml.includes('missionDetailPanel lanternInteractiveSurfaceContent') &&
    /max-height:\s*none/.test(cssBlock(missionsCss, /\.missionDetailPanel\.lanternInteractiveSurfaceContent/)) &&
    /overflow:\s*visible/.test(cssBlock(missionsCss, /\.missionDetailPanel\.lanternInteractiveSurfaceContent/)),
  '7. mission submit stays in long-content overlay flow'
);

assert(
  /scrollbar-width:\s*none/.test(surfaceOwner) &&
    /display:\s*none/.test(webkitBar) &&
    /overflow-y:\s*auto/.test(surfaceOwner) &&
    /overflow:\s*auto/.test(cssBlock(playerCss, /\.lanternGamePlayerStage \{/)) &&
    /scrollbar-width:\s*none/.test(cssBlock(playerCss, /\.lanternGamePlayerStage \{/)),
  '8. scrollbar chrome hidden without disabling overflow-y scroll'
);

assert(
  !/scrollTop\s*=/.test(surfaceJs) &&
    !/scrollIntoView/.test(surfaceJs) &&
    !/requestAnimationFrame/.test(surfaceJs) &&
    !/scrollTop\s*=/.test(avatarMatchBlock) &&
    !/scrollIntoView/.test(avatarMatchBlock) &&
    !/requestAnimationFrame/.test(avatarMatchBlock),
  '9. no recurring scrollTop / scrollIntoView writes on the surface or Avatar Match'
);

assert(
  /overflow:\s*visible/.test(surfaceContent) &&
    gamesHtml.includes('gameBody lanternInteractiveSurfaceContent') &&
    /overflow:\s*visible/.test(cssBlock(playerCss, /\.lanternGamePlayerStage \.cultureGameOverlay,/)) &&
    !/overflow-y:\s*auto/.test(isAvatarChoices) &&
    !/overflow-y:\s*auto/.test(isAvatarBody),
  '10. no nested vertical-scroll trap on Avatar Match / culture game body'
);

assert(
  gamesHtml.includes('lantern-interactive-surface.css') &&
    gamesHtml.includes('lantern-interactive-surface.js') &&
    missionsHtml.includes('lantern-interactive-surface.css') &&
    missionsHtml.includes('lantern-interactive-surface.js'),
  'pages load the shared surface contract'
);

assert(
  gamesHtml.includes('lanternGamePlayerPregame lanternInteractiveSurface') &&
    gamesHtml.includes('lanternGamePlayerStage lanternInteractiveSurface'),
  'Game Player pregame + stage inherit the surface so future mounted games scroll safely'
);

assert(
  missionsHtml.includes('fightSongChallengeOverlay') &&
    missionsHtml.includes('missionDetailOverlay lanternInteractiveSurface') &&
    /max-height:\s*min\(92vh,\s*92dvh\)/.test(missionsCss),
  'mission + fight-song overlays use the surface; fallback panel max-height string preserved'
);

const sandbox = {
  window: {},
  document: {
    body: {
      classList: {
        _c: new Set(),
        add: function (c) { this._c.add(c); },
        remove: function (c) { this._c.delete(c); },
        contains: function (c) { return this._c.has(c); },
      },
      style: {},
    },
    documentElement: { scrollTop: 40 },
  },
  scrollY: 40,
  scrollTo: function (x, y) { sandbox._scrolled = [x, y]; },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(surfaceJs, sandbox);
const api = sandbox.LanternInteractiveSurface;
api.lockPage();
api.lockPage();
assert(
  sandbox.document.body.classList.contains('lantern-interactive-surface-page-lock') &&
    sandbox.document.body.style.top === '-40px' &&
    api.isLocked(),
  'lock is counted and captures page scroll once'
);
api.unlockPage();
assert(api.isLocked() && sandbox._scrolled == null, 'nested unlock keeps the page lock');
api.unlockPage();
assert(
  !api.isLocked() &&
    !sandbox.document.body.classList.contains('lantern-interactive-surface-page-lock') &&
    sandbox.document.body.style.top === '' &&
    sandbox._scrolled &&
    sandbox._scrolled[1] === 40,
  'final unlock restores page scroll'
);

console.log('\ninteractive-surface-245-test: ' + pass + ' PASS ' + fail + ' FAIL');
if (fail) process.exit(1);
