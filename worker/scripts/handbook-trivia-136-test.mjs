/**
 * Prompt #136 — Handbook Trivia 50-question starter bank.
 * Usage: node worker/scripts/handbook-trivia-136-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail || ''); }

const contentJs = fs.readFileSync(path.join(root, 'app/js/lantern-game-content.js'), 'utf8');
const gamesHtml = fs.readFileSync(path.join(root, 'app/games.html'), 'utf8');
const catalogJs = fs.readFileSync(path.join(root, 'app/js/lantern-game-catalog.js'), 'utf8');

const sandbox = { window: {}, Math, console };
sandbox.globalThis = sandbox.window;
vm.runInNewContext(contentJs, sandbox);
const gc = sandbox.window.LANTERN_GAME_CONTENT;
if (!gc) {
  bad('LANTERN_GAME_CONTENT failed to load');
  console.log('\nHandbook Trivia 136 tests:', pass, 'passed,', fail, 'failed');
  process.exit(1);
}

const bank = gc.getHandbookQuestions();
const localHistory = gc.getLocalHistoryQuestions();

if (Array.isArray(bank) && bank.length === 50) ok('1. Handbook Trivia bank contains exactly 50 starter questions');
else bad('1. bank size', bank && bank.length);

const fourChoices = bank.every((q) => Array.isArray(q.options) && q.options.length === 4 && q.options.every((o) => String(o || '').trim() !== ''));
if (fourChoices) ok('2. All 50 have exactly four non-empty answer choices');
else bad('2. four choices');

const oneCorrect = bank.every((q) => {
  const idx = q.correctIndex;
  return Number.isInteger(idx) && idx >= 0 && idx < 4 && q.options[idx];
});
if (oneCorrect) ok('3. All 50 have exactly one valid correct answer');
else bad('3. correct answer');

const hasWhy = bank.every((q) => String(q.explanation || '').trim().length > 0);
if (hasWhy) ok('4. All 50 have non-empty Why/explanation text');
else bad('4. explanations');

const placeholderRe = /(\.\.\.|…|TODO|TBD|placeholder|lorem ipsum)/i;
const noPlaceholders = bank.every((q) => !placeholderRe.test(q.question) && !(q.options || []).some((o) => placeholderRe.test(o)));
if (noPlaceholders) ok('5. No placeholder/ellipsis questions exist');
else bad('5. placeholders');

const questions = bank.map((q) => String(q.question || '').trim());
if (new Set(questions).size === 50) ok('6. No duplicate question text exists');
else bad('6. duplicate questions');

if (bank[0] && bank[0].correctIndex === 1) ok('7. Question 1 correct = B');
else bad('7. Q1 correctIndex', bank[0] && bank[0].correctIndex);

if (bank[11] && bank[11].correctIndex === 0) ok('8. Question 12 correct = A');
else bad('8. Q12 correctIndex', bank[11] && bank[11].correctIndex);

if (bank[27] && bank[27].correctIndex === 1) ok('9. Question 28 correct = B');
else bad('9. Q28 correctIndex', bank[27] && bank[27].correctIndex);

if (bank[42] && bank[42].correctIndex === 2) ok('10. Question 43 correct = C');
else bad('10. Q43 correctIndex', bank[42] && bank[42].correctIndex);

if (bank[49] && bank[49].correctIndex === 0) ok('11. Question 50 correct = A');
else bad('11. Q50 correctIndex', bank[49] && bank[49].correctIndex);

const roundSlice = gamesHtml.includes('shuffleArray(questions).slice(0, 10)') || gamesHtml.includes("shuffleArray(questions).slice(0, 10)");
if (
  gamesHtml.includes('function runTriviaGame') &&
  gamesHtml.includes('.slice(0, 10)') &&
  gamesHtml.includes('LANTERN_GAME_CONTENT.shuffleArray')
) ok('12. Existing round-size/randomization still slices shuffled bank to 10');
else bad('12. round size / shuffle', { roundSlice });

function pickRound(source, randomFn) {
  const prev = Math.random;
  if (randomFn) Math.random = randomFn;
  try {
    return gc.shuffleArray(source).slice(0, 10);
  } finally {
    Math.random = prev;
  }
}

let noRepeats = true;
let usedFullBank = true;
for (let i = 0; i < 40; i++) {
  const round = pickRound(bank);
  const ids = round.map((q) => q.id);
  const texts = round.map((q) => q.question);
  if (round.length !== 10 || new Set(ids).size !== 10 || new Set(texts).size !== 10) noRepeats = false;
  if (!round.every((q) => bank.some((b) => b.id === q.id))) usedFullBank = false;
}
if (noRepeats && usedFullBank) ok('13. No question repeats inside one round; round draws from the 50');
else bad('13. in-round duplicates or bank source');

if (gamesHtml.includes('var score = correctCount * 10')) ok('14. Existing score logic remains correctCount * 10');
else bad('14. score formula');

const catalogSandbox = { window: {}, globalThis: {} };
catalogSandbox.window = catalogSandbox.globalThis = catalogSandbox;
vm.runInNewContext(catalogJs, catalogSandbox);
const handbook = catalogSandbox.LANTERN_GAME_CATALOG.getGameByName('Handbook Trivia');
if (handbook && handbook.play_cost === 1) ok('15. Handbook Trivia play_cost remains 1 Nugget');
else bad('15. play_cost', handbook && handbook.play_cost);
if (gamesHtml.includes("tryPlay('Handbook Trivia'")) ok('15b. Handbook Trivia still uses shared tryPlay paid start');
else bad('15b. tryPlay wiring');

if (
  gamesHtml.includes("postLeaderboardScore(gameName,") &&
  gamesHtml.includes("correctCount + '/' + questions.length + ' · ' + score + ' pts'") &&
  catalogJs.includes("name: 'Handbook Trivia'") &&
  catalogJs.includes('leaderboard: true')
) ok('16. Leaderboard behavior remains unchanged');
else bad('16. leaderboard');

const localFirst = localHistory[0] && localHistory[0].id === 'lh1' && localHistory[0].question === 'What bluff overlooks Trinidad from the north?';
if (Array.isArray(localHistory) && localHistory.length === 50 && localFirst) ok('17. Local History Trivia uses approved Trinidad, Colorado 50');
else bad('17. local history bank', localHistory && localHistory.length);
if (gamesHtml.includes("tryPlay('Lantern Live Trivia'") && gamesHtml.includes("tryPlay('Local History Trivia'")) {
  ok('17b. Other trivia games still use the shared runTriviaGame/tryPlay path');
} else bad('17b. other trivia wiring');

if (bank[0] && bank[0].question === 'You are sick and have to miss school. What should happen?') {
  ok('supplied Q1 wording preserved');
} else bad('Q1 wording');
if (bank[27] && /plagiarizing from AI/.test(bank[27].explanation)) ok('supplied Q28 Why text preserved');
else bad('Q28 explanation');
if (gamesHtml.includes('if (q.explanation)') && gamesHtml.includes("explainDiv.className = 'triviaExplain'")) {
  ok('existing trivia explanation surfacing still used (no new game shell)');
} else bad('explanation UI');

const getterCopy = gc.getHandbookQuestions();
getterCopy.pop();
if (gc.HANDBOOK_TRIVIA.length === 50 && gc.getHandbookQuestions().length === 50) {
  ok('getHandbookQuestions returns a copy (authoritative array not mutated by callers)');
} else bad('getter copy');

console.log('\nHandbook Trivia 136 tests:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
