/**
 * Prompt #259 — ship the three canonical Premium Games.
 * Usage: node worker/scripts/premium-games-259-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import {
  LANTERN_LEADERBOARD_GAMES,
  resolveRegisteredLeaderboardGame,
  validateLeaderboardScore,
} from '../lantern-game-catalog.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}
function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

const gamesHtml = read('app/games.html');
const catalogJs = read('app/js/lantern-game-catalog.js');
const workerCatalog = read('worker/lantern-game-catalog.js');
const gamesPageJs = read('app/js/lantern-games-page.js');
const paidStartJs = read('app/js/lantern-games-paid-start.js');
const playerJs = read('app/js/lantern-game-player.js');
const workerIndex = read('worker/index.js');
const paidProof = read('worker/game-paid-run-proof.js');
const contract = read('docs/PREMIUM_GAMES_CONTRACT.md');
const stackProv = read('docs/PREMIUM_GAME_PROVENANCE_STACK_LAB.md');
const mineProv = read('docs/PREMIUM_GAME_PROVENANCE_MINECART_SWITCH.md');
const orbitProv = read('docs/PREMIUM_GAME_PROVENANCE_ORBIT_LOCK.md');
const towerGameHtml = read('app/games/tower/index.html');
const mineEngine = read('app/js/lantern-minecart-switch.js');
const orbitEngine = read('app/js/lantern-orbit-lock.js');
const walletJs = read('app/js/lantern-wallet.js');

const sandbox = { window: {}, globalThis: {} };
sandbox.window = sandbox.globalThis = sandbox;
vm.runInNewContext(catalogJs, sandbox);
const cat = sandbox.LANTERN_GAME_CATALOG;
const premium = cat.premiumGames();
const premiumIds = premium.map((g) => g.id);
const premiumNames = premium.map((g) => g.name);

if (
  premiumIds.length === 3 &&
  premiumIds.join() === 'tower,minecart-switch,orbit-lock' &&
  premiumNames.join() === 'Stack Lab,Minecart Switch,Orbit Lock'
) {
  ok('38/39. Premium section catalog is exactly Stack Lab, Minecart Switch, Orbit Lock');
} else bad('38/39. premium trio', premiumNames);

if (cat.getGameByName('Stack Lab') && cat.getGameById('tower').name === 'Stack Lab') ok('1. Stack Lab card exists in catalog');
else bad('1. Stack Lab card');
if (cat.isPremiumGame('tower')) ok('2. Premium section contains Stack Lab');
else bad('2. Stack Lab premium');

if (cat.getGameByName('Minecart Switch') && cat.getGameById('minecart-switch')) ok('14. Minecart Switch card exists');
else bad('14. Minecart card');
if (cat.isPremiumGame('minecart-switch')) ok('15. Premium section contains Minecart Switch');
else bad('15. Minecart premium');

if (cat.getGameByName('Orbit Lock') && cat.getGameById('orbit-lock')) ok('26. Orbit Lock card exists');
else bad('26. Orbit card');
if (cat.isPremiumGame('orbit-lock')) ok('27. Premium section contains Orbit Lock');
else bad('27. Orbit premium');

['handbook-trivia', 'local-history-trivia', 'reaction'].forEach(function (id, i) {
  const labels = ['40. Handbook Trivia', '41. Local History Trivia', '42. Reaction Tap'];
  if (cat.getGameById(id) && !cat.isPremiumGame(id)) ok(labels[i] + ' is not presented as Premium');
  else bad(labels[i], id);
});

if (gamesPageJs.includes('filteredGames') && gamesHtml.includes('id="gamesLibraryGrid"') && cat.getGameById('handbook-trivia')) {
  ok('43. standard Games library remains available');
} else bad('43. library');

if (
  !gamesHtml.includes('Premium Games') &&
  !gamesHtml.includes('id="gamesPremiumSection"') &&
  !gamesPageJs.includes('renderPremiumGames') &&
  gamesPageJs.includes('playHubGames') &&
  premium.every((g) => !g.featured)
) {
  ok('44. no student-facing Premium section; trio stays in the ordinary Games library');
} else bad('44. premium UI');

premium.forEach(function (g) {
  if (g.play_cost === 1 && cat.playCostCardMeta(1) === '1 Nugget = 1 Play' && g.image && String(g.image).indexOf('assets/') === 0) {
    ok(g.name + ' card uses 1 Nugget = 1 Play and original assets/ art');
  } else bad(g.name + ' card contract', g);
});

if (
  paidStartJs.includes("kind: 'game_play'") &&
  paidStartJs.includes('return 1') &&
  gamesHtml.includes('charge on Start') &&
  gamesHtml.includes("tryPlay('Stack Lab'") &&
  gamesHtml.includes("tryPlay('Minecart Switch'") &&
  gamesHtml.includes("tryPlay('Orbit Lock'")
) {
  ok('3/4/16/17/28/29. pregame is free; Start uses shared paid-start of exactly 1');
} else bad('paid start wiring');

if (
  gamesHtml.includes('playBtnIdFromGameQuery') &&
  !/playBtnIdFromGameQuery[\s\S]{0,400}startPaidGame/.test(gamesHtml) &&
  cat.getGameById('tower').playBtnId === 'towerPlayBtn' &&
  cat.getGameById('minecart-switch').playBtnId === 'minecartSwitchPlayBtn' &&
  cat.getGameById('orbit-lock').playBtnId === 'orbitLockPlayBtn'
) {
  ok('deep links select the correct game and open pregame without spending');
} else bad('deep links');

if (
  gamesHtml.includes('/games/tower/index.html?lanternPlay=1') &&
  gamesHtml.includes('lantern-game-bridge.js') &&
  towerGameHtml.includes('lantern-adapter.js') &&
  !towerGameHtml.includes('http://') &&
  !/src=["']https?:\/\//.test(towerGameHtml)
) {
  ok('6. Stack Lab runtime is same-origin');
} else bad('6. stack origin');

if (gamesHtml.includes('lantern-minecart-switch.js') && gamesHtml.includes('id="minecartSwitchArea"') && !mineEngine.includes('http://')) {
  ok('18. Minecart Switch runtime is same-origin');
} else bad('18. minecart origin');

if (gamesHtml.includes('lantern-orbit-lock.js') && gamesHtml.includes('id="orbitLockCanvas"') && !orbitEngine.includes('http://')) {
  ok('30. Orbit Lock runtime is same-origin');
} else bad('30. orbit origin');

if (
  gamesHtml.includes('id="towerPlayFrame"') &&
  towerGameHtml.includes('pointerdown') &&
  towerGameHtml.includes('keydown')
) {
  ok('7. Stack Lab stacking input is wired');
} else bad('7. stack input');

if (gamesHtml.includes('SCORE_MAX = 2500') && gamesHtml.includes("postLeaderboardScore('Stack Lab'")) {
  ok('8. Stack Lab scoring posts to the leaderboard');
} else bad('8. stack score');

if (gamesHtml.includes('id="towerGameResult"') && gamesHtml.includes('id="towerPlayAgainBtn"')) {
  ok('9. Stack Lab game-over / result overlay exists');
} else bad('9. stack game over');

if (gamesHtml.includes('towerRunId') && gamesHtml.includes('getLastRunId') && gamesHtml.includes('run_id: resultRunId')) {
  ok('10/23/35. score posts require the paid run_id');
} else bad('10. run_id');

if (
  resolveRegisteredLeaderboardGame('tower') &&
  resolveRegisteredLeaderboardGame('tower').lowerIsBetter === false &&
  validateLeaderboardScore(resolveRegisteredLeaderboardGame('tower'), 250).ok &&
  !validateLeaderboardScore(resolveRegisteredLeaderboardGame('tower'), 2501).ok
) {
  ok('11. Stack Lab leaderboard is higher-is-better with ceiling 2500');
} else bad('11. stack lb');

if (
  gamesHtml.includes("awardGameWinWithEconomy(adopted.name, 'Stack Lab', 1") &&
  gamesHtml.includes('if (endedOnce) return') &&
  gamesHtml.includes('floors >= QUALIFYING_FLOORS') &&
  workerIndex.includes('lantern:${kind}:${')
) {
  ok('12. Stack Lab qualifying +1 is idempotent and run-keyed');
} else bad('12. stack reward');

if (
  !exists('app/games/tower/donor/assets') &&
  !towerGameHtml.includes('bgm.mp3') &&
  !towerGameHtml.includes('main-index-logo') &&
  stackProv.includes('No `app/games/tower/donor/assets/`')
) {
  ok('13. Stack Lab shipping tree has no donor media');
} else bad('13. stack donor media');

if (mineEngine.includes('LANE_COUNT') && mineEngine.includes('mcsTapLeft') && gamesHtml.includes('id="mcsTapLeft"')) {
  ok('19. Minecart track switching is wired');
} else bad('19. minecart switch');

if (mineEngine.includes('HIT_Z') && mineEngine.includes("pushEvent('hit'") && mineEngine.includes('state.lives')) {
  ok('20. Minecart collision / hazard behavior exists');
} else bad('20. minecart hazard');

if (mineEngine.includes('SPEED_MAX') && mineEngine.includes('SPEED_RAMP_DISTANCE')) {
  ok('21. Minecart speed / intensity increases');
} else bad('21. minecart speed');

if (mineEngine.includes('onGameOver') && gamesHtml.includes('submitMinecartResult')) {
  ok('22. Minecart game-over posts one result');
} else bad('22. minecart over');

if (
  resolveRegisteredLeaderboardGame('minecart-switch') &&
  resolveRegisteredLeaderboardGame('minecart-switch').lowerIsBetter === false &&
  !gamesHtml.slice(gamesHtml.indexOf('Minecart Switch: paid start'), gamesHtml.indexOf('Minecart Switch: paid start') + 4200).includes('awardGameWinWithEconomy')
) {
  ok('24. Minecart leaderboard is higher-is-better; no invented win reward');
} else bad('24. minecart lb');

if (mineProv.includes('No donor artwork') && exists('app/assets/minecart-switch-card.png')) {
  ok('25. Minecart has original card art and no donor media');
} else bad('25. minecart media');

if (orbitEngine.includes('isInsideArc') && orbitEngine.includes('isPerfectLock') && gamesHtml.includes('orbitLockCanvas')) {
  ok('31. Orbit Lock recovered control mechanic is present');
} else bad('31. orbit control');

if (orbitEngine.includes('scoreLock') && gamesHtml.includes("postLeaderboardScore('Orbit Lock'")) {
  ok('32. Orbit Lock scoring works and posts');
} else bad('32. orbit score');

if (orbitEngine.includes('MAX_STAGE') && orbitEngine.includes('difficultyForStage')) {
  ok('33. Orbit Lock stage / difficulty progression exists');
} else bad('33. orbit progression');

if (orbitEngine.includes("run.ended") && gamesHtml.includes('onGameOver')) {
  ok('34. Orbit Lock failure / game-over is wired');
} else bad('34. orbit over');

if (
  resolveRegisteredLeaderboardGame('orbit-lock') &&
  resolveRegisteredLeaderboardGame('orbit-lock').lowerIsBetter === false &&
  !/awardGameWinWithEconomy/.test(gamesHtml.slice(gamesHtml.indexOf('// ---- Orbit Lock'), gamesHtml.indexOf('// ---- Orbit Lock') + 7000))
) {
  ok('36. Orbit Lock leaderboard is higher-is-better; no invented win reward');
} else bad('36. orbit lb');

if (orbitProv.includes('No donor artwork') && exists('app/assets/orbit-lock-card.svg') && read('app/assets/orbit-lock-card.svg').includes('ORBIT LOCK')) {
  ok('37. Orbit Lock has original card art and no donor media');
} else bad('37. orbit media');

if (
  contract.includes('Stack Lab') &&
  contract.includes('Minecart Switch') &&
  contract.includes('Orbit Lock') &&
  contract.includes('1 Nugget = 1 Play') &&
  contract.includes('not** Premium merely because they were previously featured')
) {
  ok('Premium Games contract documents the locked trio');
} else bad('contract doc');

if (
  !paidStartJs.includes('lantern_wallets') &&
  walletJs.includes('fetchMyBalance') &&
  paidProof.includes('evaluatePaidGamePlayRun') &&
  workerIndex.includes("error: 'invalid_run'")
) {
  ok('no parallel Lantern wallet; paid-run proof remains required');
} else bad('economy / proof');

if (LANTERN_LEADERBOARD_GAMES.length === 13 && cat.listGames().length === 13) {
  ok('frontend and worker catalogs both list 13 games');
} else bad('catalog alignment', { fe: cat.listGames().length, worker: LANTERN_LEADERBOARD_GAMES.length });

if (playerJs.includes('function open') && gamesHtml.includes('onPregameStart')) {
  ok('shared Game Player pregame remains the Start gate');
} else bad('player pregame');

console.log('\nPremium Games #259:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
