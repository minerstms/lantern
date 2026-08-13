/**
 * Prompt #122 — Tower donor lab: unlinked page, iframe/bridge contract, auth boundary,
 * score adapter, no donor identity, no donor-controlled Nugget amount.
 *
 * Usage: node worker/scripts/tower-lab-bridge-test.mjs
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

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

const labHtml = read('app/game-lab/tower.html');
const gameHtml = read('app/games/tower/index.html');
const adapterJs = read('app/games/tower/lantern-adapter.js');
const bridgeJs = read('app/js/lantern-game-bridge.js');
const catalogJs = read('app/js/lantern-game-catalog.js');
const navJs = read('app/js/lantern-nav.js');
const staffNavJs = read('app/js/lantern-staff-nav.js');
const gamesHtml = read('app/games.html');
const exploreHtml = read('app/explore.html');
const missionsHtml = read('app/missions.html');
const createHtml = read('app/contribute.html');
const teacherHtml = read('app/teacher.html');
const pilotAuthJs = read('app/js/lantern-pilot-auth.js');
const notices = read('app/games/tower/NOTICES.md');
const license = read('app/games/tower/LICENSE');
const donorLicense = read('app/games/tower/donor/LICENSE');

// ---------------------------------------------------------------------------
// Unlinked lab page
// ---------------------------------------------------------------------------
if (exists('app/game-lab/tower.html')) ok('lab page exists at /game-lab/tower.html');
else bad('lab page missing');

if (labHtml.includes('guardPilotPage({ mode: \'general\' }')) ok('lab page uses existing guardPilotPage auth');
else bad('lab page missing guardPilotPage');

if (labHtml.includes('lantern-pilot-auth-pending')) ok('lab page follows pending-auth shell');
else bad('lab pending-auth class missing');

if (labHtml.includes('id="towerGameFrame"') && labHtml.includes('src="/games/tower/index.html"')) {
  ok('lab page iframes same-origin /games/tower/index.html');
} else bad('lab iframe src');

if (!labHtml.includes('iamkun.github.io') && !gameHtml.includes('iamkun.github.io')) {
  ok('lab/game do not iframe or load the external donor website');
} else bad('external donor host referenced');

const navSurfaces = [
  ['games.html', gamesHtml],
  ['explore.html', exploreHtml],
  ['missions.html', missionsHtml],
  ['contribute.html', createHtml],
  ['teacher.html', teacherHtml],
  ['lantern-nav.js', navJs],
  ['lantern-staff-nav.js', staffNavJs],
];
navSurfaces.forEach(function (pair) {
  if (!pair[1].includes('game-lab/tower')) ok(pair[0] + ' does not link the Tower lab');
  else bad(pair[0] + ' links unlinked lab', 'game-lab/tower');
});

if (pilotAuthJs.includes("'/game-lab/tower': '/game-lab/tower.html'")) {
  ok('pilot-auth maps /game-lab/tower to .html');
} else bad('pilot-auth lab path map');

if (labHtml.includes('--fsBase: 22px') && labHtml.includes('font-size: 32px')) {
  ok('lab page uses 22–36px type scale');
} else bad('lab font size');

if (labHtml.includes('flex-direction: column') && labHtml.includes('width: 100%')) {
  ok('lab page is single-column / full-width');
} else bad('lab layout');

// ---------------------------------------------------------------------------
// Self-hosted donor + license
// ---------------------------------------------------------------------------
if (exists('app/games/tower/donor/dist/main.js') && exists('app/games/tower/donor/assets/block.png')) {
  ok('donor bundle and artwork are vendored locally');
} else bad('donor runtime files missing');

if (license.includes('Copyright (c) 2018 BMQB, Inc') && donorLicense.includes('MIT License')) {
  ok('MIT copyright/license files preserved');
} else bad('license files');

if (notices.includes('wenxue') && notices.includes('not incorporated')) {
  ok('NOTICES documents excluded wenxue font');
} else bad('font exclusion notice');

['wenxue.eot', 'wenxue.woff', 'wenxue.ttf', 'wenxue.svg'].forEach(function (f) {
  if (!exists('app/games/tower/donor/assets/' + f)) ok('excluded font not vendored: ' + f);
  else bad('unclear-license font was incorporated', f);
});

if (!gameHtml.includes('googletagmanager') && !read('app/games/tower/donor/index.html').includes('googletagmanager')) {
  ok('Google Analytics not loaded from vendored game');
} else bad('GA still present');

if (gameHtml.includes('<base href="./donor/">') && gameHtml.includes('src="./dist/main.js"')) {
  ok('hosted game loads self-hosted donor dist via local base href');
} else bad('hosted game script paths');

if (gameHtml.includes('/games/tower/lantern-adapter.js')) ok('hosted game loads lantern-adapter');
else bad('adapter script missing from game html');

if (adapterJs.includes('stripForbidden') && !adapterJs.match(/payload\.nuggets\s*=/) && !gameHtml.includes('nuggets:')) {
  ok('donor adapter does not assign Nugget amounts onto emitted payloads');
} else bad('adapter mentions nugget amounts as emit fields');

// ---------------------------------------------------------------------------
// Catalog / Play page unchanged
// ---------------------------------------------------------------------------
const sandbox = { window: {}, globalThis: {} };
sandbox.window = sandbox.globalThis = sandbox;
vm.runInNewContext(catalogJs, sandbox);
const games = sandbox.LANTERN_GAME_CATALOG.listGames();
if (games.length === 8) ok('Play catalog still has exactly 8 production games');
else bad('catalog count changed', games.length);

if (!sandbox.LANTERN_GAME_CATALOG.getGameById('tower') && !sandbox.LANTERN_GAME_CATALOG.getGameByName('Tower')) {
  ok('Tower is not registered in the production catalog');
} else bad('Tower leaked into LANTERN_GAME_CATALOG');

if (gamesHtml.includes('<title>Play | Lantern</title>')) ok('/play (games.html) was not replaced');
else bad('games.html title missing');

// ---------------------------------------------------------------------------
// Bridge contract (vm)
// ---------------------------------------------------------------------------
const fetchCalls = [];
const bridgeSandbox = {
  window: {},
  globalThis: {},
  fetch: function (url, init) {
    fetchCalls.push({ url: url, init: init });
    return Promise.resolve({
      ok: true,
      status: 200,
      json: function () {
        return Promise.resolve({ ok: true, id: 'lb_test' });
      },
    });
  },
};
bridgeSandbox.window = bridgeSandbox.globalThis = bridgeSandbox;
vm.runInNewContext(bridgeJs, bridgeSandbox);
const bridge = bridgeSandbox.LanternGameBridge;

if (bridge.MESSAGE_TYPE === 'lantern-game' && bridge.ALLOWED_EVENTS.gameStarted && bridge.ALLOWED_EVENTS.gameEnded) {
  ok('bridge exposes gameStarted/scoreChanged/gameEnded contract');
} else bad('bridge event contract');

const dirty = bridge.sanitizeIncoming({
  source: 'lantern-donor-adapter',
  type: 'lantern-game',
  event: 'gameEnded',
  payload: {
    score: 150,
    floors: 6,
    username: 'hacker',
    character_name: 'spoofed_student',
    nuggets: 999,
    reward: 50,
    delta: 50,
  },
});
if (
  dirty &&
  dirty.event === 'gameEnded' &&
  dirty.payload.score === 150 &&
  dirty.payload.username == null &&
  dirty.payload.character_name == null &&
  dirty.payload.nuggets == null &&
  dirty.strippedForbiddenKeys.indexOf('username') !== -1 &&
  dirty.strippedForbiddenKeys.indexOf('nuggets') !== -1
) {
  ok('bridge strips donor identity and Nugget fields from incoming events');
} else bad('sanitizeIncoming did not strip forbidden fields', dirty);

if (!bridge.sanitizeIncoming({ source: 'evil', type: 'lantern-game', event: 'gameEnded', payload: { score: 1 } })) {
  ok('bridge ignores messages from unknown sources');
} else bad('unknown source accepted');

if (bridge.NUGGET_WRITES_ENABLED === false) ok('Nugget writes are disabled on the bridge');
else bad('NUGGET_WRITES_ENABLED should be false');

bridgeSandbox.LanternAuth = {
  adoptedFromPilotMe: function () {
    return { name: 'session_student', display_name: 'Session Student' };
  },
};

const reward = await bridge.maybeGrantQualifyingReward({ nuggets: 999, character_name: 'donor_user' });
if (reward.skipped === true && reward.reason === 'nugget_writes_disabled' && reward.ignoredDonorFields.indexOf('nuggets') !== -1) {
  ok('qualifying-reward helper stays disabled and ignores donor Nugget amount');
} else bad('maybeGrantQualifyingReward', reward);

const posted = await bridge.submitLeaderboardScore({
  gameId: 'tower',
  gameName: 'Tower',
  score: 150,
  floors: 6,
  username: 'DONOR_USER',
  character_name: 'DONOR_USER',
  nuggets: 999,
});
if (
  posted.ok &&
  posted.submitted.character_name === 'session_student' &&
  posted.submitted.game_name === 'Tower' &&
  posted.submitted.score === 150 &&
  posted.ignoredDonorFields.indexOf('character_name') !== -1 &&
  posted.ignoredDonorFields.indexOf('nuggets') !== -1 &&
  fetchCalls.length === 1 &&
  String(fetchCalls[0].url).indexOf('/api/leaderboards/record') !== -1 &&
  fetchCalls[0].init.credentials === 'include'
) {
  ok('score adapter posts session identity + Lantern game name to existing leaderboard API');
} else bad('submitLeaderboardScore', posted);

const fetchCountAfterRealSubmit = fetchCalls.length;
const previewed = await bridge.recordGameOutcome({
  previewMode: true,
  gameId: 'tower',
  gameName: 'Tower',
  score: 150,
  floors: 6,
  username: 'DONOR_USER',
  character_name: 'DONOR_USER',
  nuggets: 999,
  reward: 50,
});
if (
  previewed.ok &&
  previewed.skipped === true &&
  previewed.reason === 'preview_mode' &&
  previewed.leaderboardPosted === false &&
  previewed.economyPosted === false &&
  previewed.missionWritten === false &&
  previewed.ignoredDonorFields.indexOf('character_name') !== -1 &&
  previewed.ignoredDonorFields.indexOf('nuggets') !== -1 &&
  fetchCalls.length === fetchCountAfterRealSubmit
) {
  ok('previewMode recordGameOutcome performs no leaderboard/economy/mission fetch');
} else bad('previewMode recordGameOutcome', previewed);

const previewSubmit = await bridge.submitLeaderboardScore({
  previewMode: true,
  gameName: 'Tower',
  score: 10,
  nuggets: 999,
});
if (
  previewSubmit.skipped === true &&
  previewSubmit.leaderboardPosted === false &&
  fetchCalls.length === fetchCountAfterRealSubmit
) {
  ok('previewMode submitLeaderboardScore does not POST');
} else bad('previewMode submitLeaderboardScore', previewSubmit);

const previewReward = await bridge.maybeGrantQualifyingReward({
  previewMode: true,
  nuggets: 999,
  character_name: 'donor_user',
});
if (
  previewReward.skipped === true &&
  previewReward.economyPosted === false &&
  previewReward.missionWritten === false &&
  fetchCalls.length === fetchCountAfterRealSubmit
) {
  ok('previewMode maybeGrantQualifyingReward performs no economy POST');
} else bad('previewMode maybeGrantQualifyingReward', previewReward);

const noId = await (function () {
  bridgeSandbox.LanternAuth = { adoptedFromPilotMe: function () { return null; } };
  return bridge.submitLeaderboardScore({ gameName: 'Tower', score: 10, character_name: 'DONOR_USER' });
})();
if (noId.ok === false && noId.error === 'no_session_identity') {
  ok('score adapter refuses to submit without Lantern session identity');
} else bad('no-session submit', noId);

// ---------------------------------------------------------------------------
// Adapter contract (vm)
// ---------------------------------------------------------------------------
const postedMessages = [];
const adapterParent = {
  postMessage: function (msg, origin) {
    postedMessages.push({ msg: msg, origin: origin });
  },
};
const adapterSandbox = {
  location: { origin: 'https://tmslantern.org' },
  parent: adapterParent,
};
adapterSandbox.window = adapterSandbox;
adapterSandbox.globalThis = adapterSandbox;
vm.runInNewContext(adapterJs, adapterSandbox);
const adapter = adapterSandbox.LanternDonorAdapter;
const wrapped = adapter.wrapOptions({
  setGameScore: function () {},
  setGameSuccess: function () {},
  setGameFailed: function () {},
});
adapter.notifyGameStarted();
wrapped.setGameScore(75);
wrapped.setGameSuccess(3);
wrapped.setGameFailed(3);
const events = postedMessages.map(function (m) { return m.msg.event; });
if (
  events.indexOf('gameStarted') !== -1 &&
  events.indexOf('scoreChanged') !== -1 &&
  events.indexOf('gameEnded') !== -1 &&
  postedMessages.every(function (m) {
    return m.msg.source === 'lantern-donor-adapter' &&
      m.msg.payload.username == null &&
      m.msg.payload.nuggets == null &&
      m.origin === 'https://tmslantern.org';
  })
) {
  ok('adapter emits start/score/end to parent origin without identity or Nuggets');
} else bad('adapter emit contract', events);

const stripped = adapter.stripForbidden({
  score: 10,
  username: 'x',
  character_name: 'y',
  nuggets: 5,
});
if (stripped.score === 10 && stripped.username == null && stripped.nuggets == null) {
  ok('adapter stripForbidden drops identity and Nugget keys');
} else bad('adapter stripForbidden', stripped);

// ---------------------------------------------------------------------------
// Lab wiring — hardcoded preview mode, diagnostics, no server writes
// ---------------------------------------------------------------------------
if (labHtml.includes("var TOWER_LAB_PREVIEW_MODE = true")) {
  ok('lab hardcodes preview mode true');
} else bad('lab preview flag');

if (!labHtml.match(/TOWER_LAB_PREVIEW_MODE\s*=\s*[^\n]*location/) && !labHtml.match(/previewMode[^\n]*URLSearchParams/) && !labHtml.match(/searchParams[^\n]*preview/)) {
  ok('lab preview mode is not a query-string switch');
} else bad('insecure preview query switch');

if (labHtml.includes('recordGameOutcome') && labHtml.includes('previewMode: TOWER_LAB_PREVIEW_MODE')) {
  ok('lab routes results through recordGameOutcome with hardcoded previewMode');
} else bad('lab recordGameOutcome wiring');

if (!labHtml.includes('submitLeaderboardScore(') && !labHtml.includes('/api/leaderboards/record')) {
  ok('lab page does not call leaderboard POST directly');
} else bad('lab still posts leaderboard');

if (!labHtml.includes('/api/economy/transact') && !labHtml.includes('startPaidGame') && !labHtml.includes('postEconomyTransact') && !labHtml.includes('awardGameWin')) {
  ok('lab page performs no economy POST');
} else bad('lab economy write');

if (!labHtml.includes('completeFirstGame') && !labHtml.includes('awardGameWinWithEconomy')) {
  ok('lab page performs no mission/first-game write');
} else bad('lab mission write');

if (labHtml.includes("username: 'DONOR_MUST_BE_IGNORED'") && labHtml.includes('nuggets: 999')) {
  ok('lab still passes spoofed donor identity/Nuggets so the bridge can discard them');
} else bad('lab spoof-ignore wiring');

if (
  labHtml.includes('id="towerLabPlayer"') &&
  labHtml.includes('id="towerLabGame"') &&
  labHtml.includes('id="towerLabBridge"') &&
  labHtml.includes('id="towerLabState"') &&
  labHtml.includes('id="towerLabScore"') &&
  labHtml.includes('id="towerLabFinal"') &&
  labHtml.includes('id="towerLabFloors"') &&
  labHtml.includes('id="towerLabEvent"') &&
  labHtml.includes('PREVIEW MODE — RESULTS NOT SAVED')
) {
  ok('lab diagnostic panel has identity, game, bridge, state, scores, floors, event, preview flag');
} else bad('lab diagnostic fields');

if (labHtml.includes("setText('towerLabEvent', 'gameStarted')") && labHtml.includes("setText('towerLabEvent', 'scoreChanged')") && labHtml.includes("setText('towerLabEvent', 'gameEnded')")) {
  ok('diagnostic UI updates for gameStarted, scoreChanged, and gameEnded');
} else bad('diagnostic event updates');

if (labHtml.includes("setText('towerLabState', 'Ready')") && labHtml.includes("setText('towerLabState', 'Playing'") && labHtml.includes("setText('towerLabState', 'Ended')")) {
  ok('diagnostic game state cycles Ready / Playing / Ended');
} else bad('diagnostic game state');

if (labHtml.includes('studentFriendlyDisplayNameFromAdopted') && !labHtml.includes('mtss_student_id') && !labHtml.includes('PILOT_SESSION')) {
  ok('lab shows display identity without private IDs or session secrets');
} else bad('lab identity display');

if (labHtml.includes('src="/games/tower/index.html"') && labHtml.includes('id="towerGameFrame"')) {
  ok('Tower lab loads same-origin iframe');
} else bad('lab iframe load');

if (bridgeJs.includes('function submitLeaderboardScore') && bridgeJs.includes('/api/leaderboards/record') && bridgeJs.includes('function recordGameOutcome')) {
  ok('reusable leaderboard integration remains on the bridge');
} else bad('bridge leaderboard helpers removed');

if (bridgeJs.includes('kind game_play') && bridgeJs.includes('kind game_win')) {
  ok('bridge documents existing TMS game_play / game_win integration points');
} else bad('nugget integration comments');

if (gameHtml.includes('overflow:hidden') && labHtml.includes('overflow-x: hidden') && labHtml.includes('min(100%, 420px)') && labHtml.includes('margin: 0 auto')) {
  ok('lab iframe is centered with overflow clipping prevented');
} else bad('iframe layout');

if (gameHtml.includes("game.playBgm()") && !gameHtml.match(/game\.load\(function \(\) \{[\s\S]{0,80}playBgm/)) {
  ok('BGM waits for the Start click (no load-time autoplay)');
} else bad('audio autoplay');

console.log('\nTower lab bridge tests:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
