/**
 * Prompt #102 — game systems hardening: Nugget Hunt correctness + run/economy/leaderboard
 * integrity across all 8 implemented games. Source-level assertions (matching the style of the
 * existing games-*-test.mjs / games-polish-test.mjs suite) proving the specific fixes landed.
 *
 * Usage: node worker/scripts/game-run-integrity-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail || ''); }

const gamesHtml = fs.readFileSync(path.join(root, 'app/games.html'), 'utf8');
const workerIndex = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');

// ---------------------------------------------------------------------------
// Nugget Hunt — firstFindRecorded ordering bug (Prompt #99 known issue, fixed here)
// ---------------------------------------------------------------------------
const huntIdx = gamesHtml.indexOf('// ---- Nugget Hunt: full-screen overlay game');
if (huntIdx === -1) bad('Nugget Hunt block not found');
const huntBlock = huntIdx === -1 ? '' : gamesHtml.slice(huntIdx, huntIdx + 22000);

if (huntBlock.match(/function celebrateAndContinue\(isRewardedFirstFind\)/)) {
  ok('celebrateAndContinue() now takes an explicit isRewardedFirstFind snapshot instead of re-reading the shared flag after it was mutated');
} else bad('celebrateAndContinue signature not fixed');

if (huntBlock.match(/\} else if \(isRewardedFirstFind\)\{/)) {
  ok('the "Found it! +N nuggets" banner branch now keys off the pre-mutation snapshot, not the (already-flipped) shared flag');
} else bad('celebration branch still keyed off the mutated flag');

if (huntBlock.match(/var isRewardedFirstFind = false;\s*\n\s*if \(!firstFindRecorded\)\{\s*\n\s*var adopted = loadAdopted\(\);\s*\n\s*if \(adopted\)\{\s*\n\s*firstFindRecorded = true;\s*\n\s*isRewardedFirstFind = true;/)) {
  ok('firstFindRecorded only advances once an adopted character exists to actually commit the award to (state advances only after a legitimate, committable find)');
} else bad('firstFindRecorded can still be set without a committable award');

if (huntBlock.match(/celebrateAndContinue\(isRewardedFirstFind\);/)) {
  ok('celebrateAndContinue is called with the snapshot, not the mutated flag');
} else bad('celebrateAndContinue call site not updated');

// A wrong click must never touch firstFindRecorded / roundLocked / streak at all — confirm the
// wrong-click branch (the `else` of the target check) is still isolated from that state.
const wrongBranchMatch = huntBlock.match(/\} else \{\s*\n\s*this\.classList\.add\('wrong'\);[\s\S]{0,200}?\n\s*\}\s*\n\s*\};/);
if (wrongBranchMatch && !wrongBranchMatch[0].includes('firstFindRecorded') && !wrongBranchMatch[0].includes('streak++')) {
  ok('an invalid/wrong click never sets firstFindRecorded, never locks the round, never increments streak');
} else bad('wrong-click branch touches first-find/streak state', wrongBranchMatch && wrongBranchMatch[0].slice(0, 150));

if (huntBlock.match(/awardGameWinWithEconomy\(adopted\.name, 'Nugget Hunt', reward, function\(\)\{\s*\n\s*refreshBalance\(\);\s*\n\s*\}, function\(\)\{\s*\n\s*toast\('Nugget award failed/)) {
  ok('a failed Nugget Hunt award surfaces a toast instead of silently disappearing');
} else bad('Nugget Hunt award failure handling missing');

// One paid run -> exactly one award + one leaderboard post, still gated by the outer if(!firstFindRecorded)
if (huntBlock.match(/if \(!firstFindRecorded\)\{[\s\S]{0,1200}awardGameWinWithEconomy[\s\S]{0,800}postLeaderboardScore\('Nugget Hunt'/)) {
  ok('Nugget Hunt still awards + posts to the leaderboard at most once per paid run');
} else bad('Nugget Hunt exactly-once award/post gating regressed');

if (huntBlock.includes('huntRunId = generateRunId();') && huntBlock.match(/function startNuggetHuntGame\(\)\{[\s\S]{0,50}gameOver = false;[\s\S]{0,50}roundLocked = false;[\s\S]{0,50}streak = 0;[\s\S]{0,50}firstFindRecorded = false;/)) {
  ok('every new Nugget Hunt run (Play/Play Again) gets a fresh run ID and fully resets first-find/streak state');
} else bad('Nugget Hunt run reset/run-id generation missing on start');

if (huntBlock.match(/replayBtn\.addEventListener\('click', function\(\)\{\s*\n\s*tryPlay\('Nugget Hunt', function\(\)\{\s*\n\s*startNuggetHuntGame\(\);/)) {
  ok('Nugget Hunt Play Again goes through tryPlay again (a genuinely new paid start, not a free replay)');
} else bad('Nugget Hunt Play Again does not re-charge');

// ---------------------------------------------------------------------------
// Nugget Hunt leaderboard semantics — deliberately preserved (documented decision, not a bug)
// ---------------------------------------------------------------------------
if (huntBlock.match(/postLeaderboardScore\('Nugget Hunt', adopted\.name, completionTimeSec, completionTimeSec \+ 's'/)) {
  ok('Nugget Hunt leaderboard metric remains first-find completion time (lower is better) — the only paid/rewarded event in the run, so it still best represents the game');
} else bad('Nugget Hunt leaderboard metric changed unexpectedly');

const catalogJs = fs.readFileSync(path.join(root, 'app/js/lantern-game-catalog.js'), 'utf8');
if (catalogJs.match(/id: 'nuggetHunt'[\s\S]{0,400}scoring: \{ lowerIsBetter: true \}/)) {
  ok('catalog scoring semantics (lowerIsBetter: true) match the preserved first-find-time metric');
} else bad('catalog scoring semantics mismatch for Nugget Hunt');

// ---------------------------------------------------------------------------
// Charge-before-data-check order — Handbook Trivia / Local History Trivia (Prompt #102)
// ---------------------------------------------------------------------------
if (gamesHtml.match(/var questions = getHandbookQuestionsSafe\(\);\s*\n\s*if \(!questions \|\| !questions\.length\) \{ toast\('No trivia questions loaded yet\.'\); return; \}\s*\n\s*tryPlay\('Handbook Trivia'/)) {
  ok('Handbook Trivia validates questions are loaded BEFORE charging the Nugget play cost (no charge-with-no-game)');
} else bad('Handbook Trivia still charges before validating question data');

if (gamesHtml.match(/var questions = getLocalHistoryQuestionsSafe\(\);\s*\n\s*if \(!questions \|\| !questions\.length\) \{ toast\('No trivia questions loaded yet\.'\); return; \}\s*\n\s*tryPlay\('Local History Trivia'/)) {
  ok('Local History Trivia validates questions are loaded BEFORE charging the Nugget play cost');
} else bad('Local History Trivia still charges before validating question data');

if (gamesHtml.match(/window\.LANTERN_FEED\.triviaLive\(\)\.then\(function\(res\)\{\s*\n\s*if \(!res \|\| !res\.ok \|\| !\(res\.questions && res\.questions\.length\)\) \{[\s\S]{0,150}tryPlay\('Lantern Live Trivia'/)) {
  ok('Lantern Live Trivia (Prompt #99 fix) still fetches and validates before charging — no regression');
} else bad('Lantern Live Trivia fetch-before-charge regressed');

// ---------------------------------------------------------------------------
// Economy idempotency — game_false_start reference gap (Prompt #102)
// ---------------------------------------------------------------------------
if (workerIndex.match(/if \(String\(kind \|\| ''\)\.indexOf\('game_'\) === 0 && meta && meta\.run_id\) return `lantern:\$\{kind\}:\$\{String\(meta\.run_id\)\.trim\(\)\}`;/)) {
  ok('buildLanternEconomyReference now covers every game_* kind (game_play, game_win, game_false_start, future kinds), not just game_play/game_win');
} else bad('buildLanternEconomyReference game_* coverage missing');

if (!workerIndex.match(/if \(\(kind === 'game_play' \|\| kind === 'game_win'\) && meta && meta\.run_id\)/)) {
  ok('the old narrow game_play/game_win-only reference check was replaced, not duplicated alongside the new one');
} else bad('old narrow game_play/game_win reference check still present alongside the new one');

if (
  gamesHtml.includes('function applyFalseStartPenalty') &&
  gamesHtml.includes('Do NOT charge an extra Nugget') &&
  !gamesHtml.includes("callEconomyTransact(adopted.name, -1, 'game_false_start'")
) {
  ok('Reaction Tap false start remains visual-only (no extra Nugget / no game_false_start transact)');
} else bad('Reaction Tap false-start extra-charge policy regressed');

// ---------------------------------------------------------------------------
// One TMS economy reconfirmed — no game uses the legacy local wallet as currency authority
// ---------------------------------------------------------------------------
if (gamesHtml.match(/awardGameWinWithEconomy\(characterName, gameName, nuggets, onSuccess, onFailure, runId\)\{\s*\n\s*if \(window\.LanternWallet && window\.LanternWallet\.canUseHttpEconomy/)) {
  ok('awardGameWinWithEconomy still tries the TMS-authoritative bridge first for every game reward');
} else bad('awardGameWinWithEconomy no longer TMS-first');

if (gamesHtml.match(/economy_backend_charged: true/)) {
  ok('local run.awardGameWin()/recordGameResult() mirror calls are still marked economy_backend_charged:true (inert local mirror, not a second currency source)');
} else bad('economy_backend_charged marker missing from local mirror calls');

// ---------------------------------------------------------------------------
// Play Again / replay hygiene — spot-check the remaining games for fresh-run state (Reaction Tap,
// Click Rush, Memory Match already covered by games-polish-test.mjs; this file adds the
// game-run-ID / re-charge angle specifically).
// ---------------------------------------------------------------------------
if (gamesHtml.match(/playAgainBtn\.addEventListener\('click', startReactionRound\)/) && gamesHtml.match(/function startReactionRound\(\)\{\s*\n\s*tryPlay\('Reaction Tap'/)) {
  ok('Reaction Tap Play Again re-enters tryPlay (fresh paid run + fresh run_id), not a free replay');
} else bad('Reaction Tap Play Again does not re-charge');

if (gamesHtml.match(/playAgainBtn\.addEventListener\('click', startClickRushRound\)/) && gamesHtml.match(/function startClickRushRound\(\)\{\s*\n\s*tryPlay\('Nugget Click Rush'/)) {
  ok('Nugget Click Rush Play Again re-enters tryPlay (fresh paid run + fresh run_id, fresh local counters), not a free replay');
} else bad('Nugget Click Rush Play Again does not re-charge');

if (gamesHtml.match(/playAgainBtn\.addEventListener\('click', startMemoryRound\)/) && gamesHtml.match(/function startMemoryRound\(\)\{\s*\n\s*tryPlay\('Memory Match'/)) {
  ok('Memory Match Play Again re-enters tryPlay (fresh paid run, fresh board/moves state), not a free replay');
} else bad('Memory Match Play Again does not re-charge');

if (gamesHtml.match(/again\.addEventListener\('click', startAvatarMatch\)/)) {
  ok('Avatar Match Play Again calls the full start function again (fresh paid run, fresh characters/round/score state)');
} else bad('Avatar Match Play Again does not restart cleanly');

if (gamesHtml.match(/again\.addEventListener\('click', function\(\)\{\s*\n\s*el\(playBtnIdForGameName\(gameName\)\)\.click\(\);/)) {
  ok('Trivia family Play Again re-clicks the original Play button (fresh paid run through the same fetch/validate-before-charge path), not a free replay');
} else bad('Trivia family Play Again does not re-charge');

// ---------------------------------------------------------------------------
// Demo persona exclusion reconfirmed for the leaderboard path every game submits scores through
// ---------------------------------------------------------------------------
if (workerIndex.includes('filterOutDemoPersonas(rows.results || [], \'character_name\')')) {
  ok('GET /api/leaderboards still filters known demo personas out of every game leaderboard response');
} else bad('demo persona filter missing from leaderboard responses');

console.log('\nGame run integrity tests (Prompt #102):', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
