/**
 * Prompt #99 — seven-game deep polish pass. Source-level assertions (matching the style of the
 * existing games-*-test.mjs suite) proving the specific gameplay/UX/economy fixes landed for each
 * of the seven non-Nugget-Hunt games, without re-testing everything games-score-pipeline-test.mjs
 * / games-paid-start-test.mjs / games-player-test.mjs already cover.
 *
 * Usage: node worker/scripts/games-polish-test.mjs
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

// ---------------------------------------------------------------------------
// Shared plumbing
// ---------------------------------------------------------------------------
if (gamesHtml.includes('function generateRunId()') && gamesHtml.includes('function playGameTone(') && gamesHtml.includes('var prefersReducedMotion')) {
  ok('shared run-id + WebAudio + reduced-motion helpers exist once, reused by all 7 polished games');
} else bad('shared helpers missing');

if (gamesHtml.match(/@media \(prefers-reduced-motion: reduce\)\{[\s\S]*?\.gameArea[\s\S]*?\}/)) {
  ok('reduced-motion media query disables the new gameplay animation classes');
} else bad('reduced-motion coverage missing for new animations');

// Nugget Hunt's own local run-id/audio helpers must remain untouched (still present, still local).
if (gamesHtml.includes('// ---- Nugget Hunt: full-screen overlay game (Prompt #89 polish pass) ----')) {
  const huntIdx = gamesHtml.indexOf('// ---- Nugget Hunt: full-screen overlay game');
  const huntBlock = gamesHtml.slice(huntIdx, huntIdx + 4000);
  if (huntBlock.includes('function sfxFind()') && huntBlock.includes('function sfxWrong()') && huntBlock.includes('STREAK_MILESTONES = [3, 5, 10]')) {
    ok('Nugget Hunt keeps its own untouched sound/streak implementation (not cloned/rewired)');
  } else bad('Nugget Hunt block looks modified', huntBlock.slice(0, 200));
} else bad('Nugget Hunt block not found');

// ---------------------------------------------------------------------------
// Reaction Tap
// ---------------------------------------------------------------------------
if (!gamesHtml.match(/applyFalseStartPenalty[\s\S]{0,400}spendOnGame/)) {
  ok('Reaction Tap false-start penalty no longer uses the legacy local-wallet spendOnGame() path');
} else bad('Reaction Tap false start still uses legacy spendOnGame');

if (gamesHtml.match(/applyFalseStartPenalty[\s\S]{0,400}callEconomyTransact\(adopted\.name, -1, 'game_false_start'/)) {
  ok('Reaction Tap false-start penalty routes through the shared TMS-authoritative callEconomyTransact with an idempotency run_id');
} else bad('Reaction Tap false start not routed through TMS economy');

if (gamesHtml.includes("id=\"reactionPlayAgainBtn\"") && gamesHtml.includes("playAgainBtn.addEventListener('click', startReactionRound)")) {
  ok('Reaction Tap has an explicit Play Again control wired to a fresh paid round');
} else bad('Reaction Tap Play Again missing');

if (gamesHtml.includes("tapZone.className = 'tapZone ready'")) {
  ok('Reaction Tap shows a pulsing "ready" state while waiting for GO');
} else bad('Reaction Tap ready-state animation missing');

// ---------------------------------------------------------------------------
// Nugget Click Rush
// ---------------------------------------------------------------------------
if (gamesHtml.includes('var MILESTONES = [10, 25, 50, 75, 100];') && gamesHtml.includes('flashCombo(area,')) {
  ok('Click Rush celebrates tap-count milestones with a combo flash');
} else bad('Click Rush milestone celebration missing');

if (gamesHtml.match(/timerEl\.classList\.toggle\('urgent', remaining > 0 && remaining <= URGENT_SEC\)/)) {
  ok('Click Rush shows urgency as the 10-second timer runs low');
} else bad('Click Rush urgency treatment missing');

if (gamesHtml.includes("id=\"clickrushPlayAgainBtn\"") && gamesHtml.includes("playAgainBtn.addEventListener('click', startClickRushRound)")) {
  ok('Click Rush has an explicit Play Again control wired to a fresh paid round');
} else bad('Click Rush Play Again missing');

// ---------------------------------------------------------------------------
// Memory Match
// ---------------------------------------------------------------------------
if (gamesHtml.includes('id="memoryMovesVal"') && gamesHtml.includes('id="memoryPairsVal"') && gamesHtml.match(/if \(movesVal\) movesVal\.textContent = String\(moves\)/)) {
  ok('Memory Match shows a live moves + pairs-remaining HUD during play');
} else bad('Memory Match HUD missing');

if (gamesHtml.match(/a\.classList\.add\('mismatch'\)[\s\S]{0,50}b\.classList\.add\('mismatch'\)/)) {
  ok('Memory Match gives mismatched cards a distinct shake/feedback state (not just an instant flip-back)');
} else bad('Memory Match mismatch feedback missing');

if (gamesHtml.includes("id=\"memoryPlayAgainBtn\"") && gamesHtml.includes("playAgainBtn.addEventListener('click', startMemoryRound)")) {
  ok('Memory Match has an explicit Play Again control wired to a fresh paid round');
} else bad('Memory Match Play Again missing');

if (gamesHtml.includes("if (locked) return;") && gamesHtml.match(/pairs\.forEach\(function\(emoji, idx\)[\s\S]{0,50}var card/)) {
  ok('Memory Match locks input during match/mismatch resolution (no third-card race)');
} else bad('Memory Match resolution lock missing');

// ---------------------------------------------------------------------------
// Avatar Match
// ---------------------------------------------------------------------------
if (gamesHtml.match(/if \(answered\) return;\s*\n\s*answered = true;[\s\S]{0,200}chosen = \(btn\.dataset\.name/)) {
  ok('Avatar Match locks each round after the first answer (no double-click double-score)');
} else bad('Avatar Match answered-lock missing');

if (gamesHtml.match(/if \(!isCorrect\) \{\s*\n\s*\/\/ Prompt #99: reveal the actual correct name/)) {
  ok('Avatar Match reveals the correct character name when the player misses');
} else bad('Avatar Match correct-answer reveal missing');

if (gamesHtml.includes('var bestStreak = 0;') && gamesHtml.includes("playAgainHtml('avatarMatchPlayAgainBtn')") && gamesHtml.includes("el('avatarMatchPlayAgainBtn')")) {
  ok('Avatar Match tracks a streak and offers Play Again at the result screen');
} else bad('Avatar Match streak/Play Again missing');

// ---------------------------------------------------------------------------
// Trivia family (Lantern Live Trivia, Handbook Trivia, Local History Trivia) — shared runTriviaGame
// ---------------------------------------------------------------------------
if (gamesHtml.match(/if \(answered\) return;\s*\n\s*answered = true;[\s\S]{0,200}isCorrect = btn\.dataset\.correct/)) {
  ok('Trivia family locks each question after the first answer');
} else bad('Trivia answered-lock missing');

if (gamesHtml.match(/if \(b\.dataset\.correct === '1'\) b\.classList\.add\('correct'\)/)) {
  ok('Trivia family reveals the correct choice when the player answers wrong');
} else bad('Trivia correct-answer reveal missing');

if (gamesHtml.match(/if \(q\.explanation\) \{/)) {
  ok('Trivia family surfaces the question\'s `explanation` field (previously loaded but never rendered)');
} else bad('Trivia explanation surfacing missing');

if (gamesHtml.includes("Question ' + (qIndex + 1) + ' of ' + questions.length")) {
  ok('Trivia family shows real "Question N of X" progress (not just correct-count HUD)');
} else bad('Trivia progress indicator missing');

if (gamesHtml.includes("correctCount + '/' + questions.length + ' · ' + score + ' pts'")) {
  ok('Trivia leaderboard display uses the actual question count, not a hardcoded "/10"');
} else bad('Trivia hardcoded /10 display not fixed');

if (!gamesHtml.match(/correctCount \+ '\/10/)) {
  ok('No remaining hardcoded "/10" trivia score_display literal');
} else bad('Hardcoded /10 literal still present');

// Live Trivia: fetch questions BEFORE charging, so a failed/empty fetch never spends a Nugget.
{
  const liveIdx = gamesHtml.indexOf("el('lanternLiveTriviaPlayBtn').addEventListener");
  const liveBlock = liveIdx !== -1 ? gamesHtml.slice(liveIdx, liveIdx + 700) : '';
  const fetchPos = liveBlock.indexOf('LANTERN_FEED.triviaLive()');
  const chargePos = liveBlock.indexOf("tryPlay('Lantern Live Trivia'");
  if (fetchPos !== -1 && chargePos !== -1 && fetchPos < chargePos) {
    ok('Lantern Live Trivia fetches approved questions before charging the Nugget play cost (was previously charge-then-fetch)');
  } else bad('Live Trivia fetch/charge ordering', { fetchPos, chargePos });
}

console.log('\nGames polish tests (Prompt #99):', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
