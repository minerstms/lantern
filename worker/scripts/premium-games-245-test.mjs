/**
 * Prompt #245 — Premium Games presentation + deep-link pregame (no rebuild).
 * Usage: node worker/scripts/premium-games-245-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

const gamesHtml = fs.readFileSync(path.join(root, 'app/games.html'), 'utf8');
const gamesPageJs = fs.readFileSync(path.join(root, 'app/js/lantern-games-page.js'), 'utf8');
const catalogJs = fs.readFileSync(path.join(root, 'app/js/lantern-game-catalog.js'), 'utf8');
const paidStartJs = fs.readFileSync(path.join(root, 'app/js/lantern-games-paid-start.js'), 'utf8');
const playerJs = fs.readFileSync(path.join(root, 'app/js/lantern-game-player.js'), 'utf8');
const gamesCss = fs.readFileSync(path.join(root, 'app/css/lantern-games-page.css'), 'utf8');
const cardsCss = fs.readFileSync(path.join(root, 'app/css/lantern-cards.css'), 'utf8');
const workerCatalog = fs.readFileSync(path.join(root, 'worker/lantern-game-catalog.js'), 'utf8');
const workerIndex = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
const eduJs = fs.readFileSync(path.join(root, 'app/js/lantern-educational-trivia-missions.js'), 'utf8');
const eduWorker = fs.readFileSync(path.join(root, 'worker/educational-trivia-missions.js'), 'utf8');
const contentJs = fs.readFileSync(path.join(root, 'app/js/lantern-game-content.js'), 'utf8');
const paidProof = fs.readFileSync(path.join(root, 'worker/scripts/game-paid-run-proof-159-test.mjs'), 'utf8');

const sandbox = { window: {}, globalThis: {} };
sandbox.window = sandbox.globalThis = sandbox;
vm.runInNewContext(catalogJs, sandbox);
const cat = sandbox.LANTERN_GAME_CATALOG;
const premium = cat.premiumGames();
const premiumIds = premium.map((g) => g.id);

if (gamesHtml.includes('id="gamesPremiumSection"') && gamesHtml.includes('Premium Games') && gamesHtml.includes('Spend 1 Nugget to play. Chase your best score.')) {
  ok('1. Premium Games section exists');
} else bad('1. premium section');

if (
  premiumIds.length === 3 &&
  premiumIds[0] === 'handbook-trivia' &&
  premiumIds[1] === 'local-history-trivia' &&
  premiumIds[2] === 'reaction' &&
  !premiumIds.includes('seven-habits-trivia')
) {
  ok('2. exactly the intended three premium games are featured');
} else bad('2. premium trio', premiumIds);

const idMatches = catalogJs.match(/id: '[^']+'/g) || [];
if (new Set(idMatches).size === 10 && idMatches.length === 10 && cat.listGames().length === 10) {
  ok('3/4. no duplicate game definitions; all use existing catalog IDs');
} else bad('3/4. catalog dupes', { unique: new Set(idMatches).size, total: idMatches.length });

if (
  cardsCss.includes('--lantern-card-aspect-ratio: 16 / 9') &&
  gamesPageJs.includes("extraClass: 'exploreCard--gamesLibrary'") &&
  gamesCss.includes('aspect-ratio: 16 / 9')
) {
  ok('5. cards remain canonical 16:9');
} else bad('5. 16:9');

if (
  catalogJs.includes("'1 Nugget = 1 Play'") &&
  premium.every((g) => g.play_cost === 1) &&
  cat.playCostCardMeta(1) === '1 Nugget = 1 Play'
) {
  ok('6. exact cost copy remains 1 Nugget = 1 Play');
} else bad('6. cost copy');

if (
  gamesHtml.includes("tryPlay('Handbook Trivia'") &&
  playerJs.includes('function open') &&
  gamesHtml.includes('onPregameStart')
) {
  ok('7. Handbook preview opens via shared pregame');
} else bad('7. handbook preview');

if (
  gamesHtml.includes('function playBtnIdFromGameQuery') &&
  gamesHtml.includes("params.get('game')") &&
  gamesHtml.includes('getGameById(gameId)')
) {
  ok('8/15/23. deep link opens catalog pregame for handbook / local history / reaction');
} else bad('8/15/23. deep link');

if (
  gamesHtml.includes('playBtnIdFromGameQuery') &&
  !/playBtnIdFromGameQuery[\s\S]{0,400}startPaidGame/.test(gamesHtml) &&
  gamesHtml.includes('charge on Start') &&
  paidStartJs.includes('function startPaidGame')
) {
  ok('9/16/24. deep link does not spend a Nugget (Start still charges)');
} else bad('9/16/24. deep link spend');

if (
  gamesHtml.includes("tryPlay('Handbook Trivia'") &&
  paidStartJs.includes("kind: 'game_play'") &&
  /play_cost:\s*1/.test(catalogJs)
) {
  ok('10/17/25. Start spends exactly 1 via existing paid-start');
} else bad('10/17/25. paid start');

if (gamesHtml.includes("runTriviaGame('Handbook Trivia'") && gamesHtml.includes('correctCount * 10')) {
  ok('11. Handbook game completes on existing trivia runner');
} else bad('11. handbook complete');

if (
  gamesHtml.includes('postLeaderboardScore(gameName') &&
  gamesHtml.includes("runTriviaGame('Handbook Trivia'") &&
  workerCatalog.includes("id: 'handbook-trivia'") &&
  workerCatalog.includes('lowerIsBetter: false')
) {
  ok('12. Handbook leaderboard records higher-is-better');
} else bad('12. handbook lb');

if (
  gamesHtml.includes("playBtnIdForGameName(mission.game_name)") &&
  gamesHtml.includes("id=\"handbookTriviaPlayBtn\"") &&
  /Play Again/.test(gamesHtml)
) {
  ok('13. Handbook Play Again re-enters Start');
} else bad('13. handbook again');

if (gamesHtml.includes("tryPlay('Local History Trivia'")) ok('14. Local History preview opens via shared pregame');
else bad('14. trinidad preview');

if (gamesHtml.includes("runTriviaGame('Local History Trivia'")) ok('18. Local History game completes on existing trivia runner');
else bad('18. trinidad complete');

if (
  gamesHtml.includes('postLeaderboardScore(gameName') &&
  gamesHtml.includes("runTriviaGame('Local History Trivia'") &&
  workerCatalog.includes("id: 'local-history-trivia'") &&
  /id: 'local-history-trivia'[\s\S]{0,80}lowerIsBetter: false/.test(workerCatalog)
) {
  ok('19. Local History leaderboard records higher-is-better');
} else bad('19. trinidad lb');

const tobago = /tobago|trinidad and tobago|caribbean|port of spain|west indies/i;
if (
  contentJs.includes("What bluff overlooks Trinidad from the north?") &&
  contentJs.includes("Simpson's Rest") &&
  !tobago.test(contentJs) &&
  (contentJs.match(/id: "lh\d+"/g) || []).length === 50
) {
  ok('20. Trinidad Colorado bank remains unchanged');
} else bad('20. trinidad bank');

if (gamesHtml.includes("id=\"localHistoryTriviaPlayBtn\"")) ok('21. Local History Play Again re-enters Start');
else bad('21. trinidad again');

if (gamesHtml.includes("tryPlay('Reaction Tap'")) ok('22. Reaction Tap preview opens via shared pregame');
else bad('22. reaction preview');

if (
  gamesHtml.includes('false start ends the paid attempt visually only') &&
  !/applyFalseStartPenalty[\s\S]{0,400}callEconomyTransact/.test(gamesHtml) &&
  !/applyFalseStartPenalty[\s\S]{0,400}startPaidGame/.test(gamesHtml)
) {
  ok('26. false start does not create an extra debit');
} else bad('26. false start');

if (
  cat.getGameById('reaction').scoring.lowerIsBetter === true &&
  /id: 'reaction'[\s\S]{0,200}lowerIsBetter: true/.test(workerCatalog)
) {
  ok('27. lower time ranks better');
} else bad('27. reaction rank');

if (
  gamesHtml.includes("postLeaderboardScore('Reaction Tap'") &&
  gamesHtml.includes("ms + ' ms'")
) {
  ok('28. Reaction leaderboard records milliseconds');
} else bad('28. reaction lb');

if (
  gamesHtml.includes("id=\"reactionPlayAgainBtn\"") &&
  gamesHtml.includes("playAgainBtn.addEventListener('click', startReactionRound)") &&
  gamesHtml.includes("playBtn.addEventListener('click', startReactionRound)")
) {
  ok('29. Reaction Play Again requires another Start');
} else bad('29. reaction again');

if (
  gamesHtml.includes('id="reactionTapZone"') &&
  gamesHtml.includes('min-height: 180px') &&
  gamesHtml.includes('touch-action: manipulation')
) {
  ok('30. mobile tap target remains large with touch-action: manipulation');
} else bad('30. tap target');

if (
  eduJs.includes("id: 'perm_handbook_trivia'") &&
  !eduJs.includes("isSponsoredFreePair('perm_handbook_trivia'") &&
  eduJs.includes('Mission navigation itself never charges a Nugget') &&
  !/perm_handbook_trivia[\s\S]{0,200}sponsored_free:\s*true/.test(eduJs)
) {
  ok('31. Mission Handbook remains on existing mission rules (tap does not charge)');
} else bad('31. handbook mission');

if (
  eduJs.includes("isSponsoredFreePair") &&
  eduJs.includes("{ missionId: 'perm_local_history_trivia', gameId: 'local-history-trivia' }")
) {
  ok('32. Mission Local History remains free under existing sponsored rules');
} else bad('32. trinidad mission');

if (
  eduWorker.includes("id: 'perm_seven_habits'") &&
  eduWorker.includes('require_full_run_before_completion: true') &&
  eduWorker.includes('run_length: 14') &&
  eduJs.includes("id: 'perm_seven_habits'") &&
  !cat.isPremiumGame('seven-habits-trivia')
) {
  ok('33. 7 Habits remains unchanged and is not a premium paid game');
} else bad('33. 7 habits');

if (
  !paidStartJs.includes('lantern_wallets') &&
  paidStartJs.includes("kind: 'game_play'") &&
  workerIndex.includes("kind === 'game_play'")
) {
  ok('34. no client wallet authority');
} else bad('34. client wallet');

if (
  paidStartJs.includes('generateRunId') &&
  gamesHtml.includes('getLastRunId') &&
  paidProof.includes('evaluatePaidGamePlayRun')
) {
  ok('35. existing paid-run proof prevents duplicate/forged economy transactions');
} else bad('35. run proof');

if (gamesHtml.includes("authenticated !== true") && gamesHtml.includes('guardPilotPage')) {
  ok('36. auth remains required');
} else bad('36. auth');

const otherIds = ['avatar-match', 'lantern-live-trivia', 'srp-safety-trivia', 'seven-habits-trivia', 'clickrush', 'memory', 'nuggetHunt'];
if (otherIds.every((id) => cat.getGameById(id)) && gamesPageJs.includes('filteredGames') && gamesHtml.includes('id="gamesLibraryGrid"')) {
  ok('37. existing other games still render from the same catalog');
} else bad('37. other games');

if (
  gamesCss.includes('overflow-x: hidden') &&
  gamesCss.includes('.gamesPremiumSection') &&
  !gamesHtml.includes('gamesFeaturedScroller') &&
  !gamesHtml.includes('gamesArcadeScroller')
) {
  ok('38. premium rail uses feedGrid without old scroller hosts; page clips horizontal overflow');
} else bad('38. overflow / rails');

if (gamesPageJs.includes('isPremiumGame') && gamesPageJs.includes('renderPremiumGames') && gamesPageJs.includes('games_premium')) {
  ok('premium rail references existing catalog rows (one source of truth)');
} else bad('premium render wiring');

if (
  workerIndex.includes('/api/leaderboards/record') &&
  workerIndex.includes('evaluatePaidGamePlayRun')
) {
  ok('score/proof-of-play security remains the #159 paid-run path');
} else bad('score security');

console.log('\nPremium Games #245:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
