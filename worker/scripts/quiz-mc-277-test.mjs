/**
 * Prompt #277 — restore polished shared quiz/trivia MC treatment.
 * Usage: node worker/scripts/quiz-mc-277-test.mjs
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
const playerCss = fs.readFileSync(path.join(root, 'app/css/lantern-game-player.css'), 'utf8');
const workerSrc = fs.readFileSync(path.join(root, 'worker/educational-trivia-missions.js'), 'utf8');
const eduClient = fs.readFileSync(path.join(root, 'app/js/lantern-educational-trivia-missions.js'), 'utf8');

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

const choiceCss = cssBlock(gamesHtml, /\.cultureGameOverlay \.choiceBtn\{/);
const hoverCss = cssBlock(gamesHtml, /\.cultureGameOverlay \.choiceBtn:hover:not\(:disabled\)\{/);
const gameBodyCss = cssBlock(gamesHtml, /\.cultureGameOverlay \.gameBody\{/);
const overlayTopCss = cssBlock(gamesHtml, /\.cultureGameOverlay \.overlayTop\{/);
const playerBodyCss = cssBlock(playerCss, /\.lanternGamePlayerStage \.cultureGameOverlay \.gameBody \{/);
const playerOverlayCss = cssBlock(playerCss, /\.lanternGamePlayerStage \.cultureGameOverlay,\s*\.lanternGamePlayerStage \.nuggetHuntOverlay \{/);
const missionFn = gamesHtml.slice(
  gamesHtml.indexOf('function runEducationalTriviaMission'),
  gamesHtml.indexOf('function playBtnIdForGameName')
);
const triviaFn = gamesHtml.slice(
  gamesHtml.indexOf('function runTriviaGame'),
  gamesHtml.indexOf('function candidateTriviaMission')
);
const paintFn = gamesHtml.slice(
  gamesHtml.indexOf('function markChoiceBtn'),
  gamesHtml.indexOf('function streakBadgeHtml')
);

if (
  gamesHtml.includes("tryPlay('Handbook Trivia'") &&
  gamesHtml.includes("tryPlay('Local History Trivia'") &&
  gamesHtml.includes("tryPlay('SRP Safety Challenge'") &&
  gamesHtml.includes("tryPlay('7 Habits Challenge'") &&
  gamesHtml.includes('runEducationalTriviaMission') &&
  gamesHtml.includes('runTriviaGame')
) {
  ok('shared coverage: Handbook, Local History, SRP Safety, 7 Habits use shared MC shell');
} else bad('shared quiz games not wired through shared MC shell');

if (
  eduClient.includes("game_id: 'handbook-trivia'") &&
  eduClient.includes("game_id: 'local-history-trivia'") &&
  eduClient.includes("game_id: 'srp-safety-trivia'") &&
  eduClient.includes("game_id: 'seven-habits-trivia'")
) {
  ok('shared coverage: all four educational trivia missions use LANTERN_EDU_TRIVIA');
} else bad('educational trivia mission catalog missing a shared game');

if (
  /overflow:\s*visible/.test(gameBodyCss) &&
  !/overflow-x:\s*(auto|scroll)/.test(gameBodyCss) &&
  !/overflow-y:\s*(auto|scroll)/.test(gameBodyCss) &&
  /min-width:\s*0/.test(gameBodyCss) &&
  /max-width:\s*min\(100%,\s*800px\)/.test(gameBodyCss)
) {
  ok('layout: question body is full-width wrap rail, not a nested thumb scroller');
} else bad('layout: gameBody overflow/width', gameBodyCss);

if (
  /overflow:\s*visible/.test(playerBodyCss) &&
  !/overflow-x:\s*(auto|scroll)/.test(playerBodyCss) &&
  !/overflow-y:\s*(auto|scroll)/.test(playerBodyCss)
) {
  ok('layout: Game Player gameBody is not an inner overflow-y:auto rail');
} else bad('layout: player gameBody overflow', playerBodyCss);

if (
  /max-width:\s*min\(100%,\s*800px\)/.test(overlayTopCss) &&
  /max-width:\s*min\(100%,\s*800px\)/.test(playerOverlayCss)
) {
  ok('layout: desktop quiz width restored to a usable 800px rail');
} else bad('layout: overlay width', { overlayTopCss, playerOverlayCss });

if (
  /white-space:\s*normal/.test(choiceCss) &&
  /overflow-wrap:\s*anywhere/.test(choiceCss) &&
  /word-break:\s*break-word/.test(choiceCss) &&
  gamesHtml.includes('class="choiceLabel"')
) {
  ok('layout: long answers wrap vertically');
} else bad('layout: wrap rules missing');

if (
  !/overflow-x:\s*(auto|scroll)/.test(choiceCss) &&
  !/white-space:\s*nowrap/.test(choiceCss)
) {
  ok('layout: no overflow-x auto/scroll thumb rail on answers');
} else bad('layout: answer overflow-x', choiceCss);

if (
  hoverCss &&
  !/transform:/.test(hoverCss) &&
  !/padding:/.test(hoverCss) &&
  !/font-weight:/.test(hoverCss) &&
  !/border:\s*[1-9]/.test(hoverCss) &&
  /border-color:/.test(hoverCss)
) {
  ok('hover: color/background only — no geometry/transform jitter');
} else bad('hover jitter still present', hoverCss);

if (!/\.choiceBtn:hover\{[^}]*transform:/.test(gamesHtml) && !/\.choiceBtn:active\{[^}]*transform:/.test(gamesHtml)) {
  ok('hover: no scale(1.02)/scale(0.98) on choice buttons');
} else bad('hover: scale transform still on choiceBtn');

if (
  paintFn.includes("markChoiceBtn(selectedBtn, isCorrect ? 'correct' : 'wrong')") &&
  paintFn.includes("mark.textContent = kind === 'correct' ? '✓' : '✕'") &&
  paintFn.includes("note.textContent = isCorrect ? 'Correct!' : 'Not quite — the correct answer is shown in green.'") &&
  paintFn.includes("aria-live") &&
  paintFn.includes('choiceDim')
) {
  ok('feedback: shared paint uses color + icon + text + aria-live');
} else bad('feedback paint incomplete', paintFn.slice(0, 400));

if (
  triviaFn.includes('lockAndPaintMcResult') &&
  triviaFn.includes('sfxCultureCorrect') &&
  triviaFn.includes('sfxCultureWrong') &&
  triviaFn.includes("if (answered) return;") &&
  triviaFn.includes('answered = true') &&
  triviaFn.includes('q.explanation ? 2200 : 900')
) {
  ok('paid trivia: one-tap lock, sounds, prior 900/2200ms next-question delay');
} else bad('paid trivia flow');

if (
  missionFn.includes('lockAndPaintMcResult') &&
  missionFn.includes('sfxCultureCorrect') &&
  missionFn.includes('sfxCultureWrong') &&
  missionFn.includes("if (answering) return;") &&
  missionFn.includes('answering = true') &&
  missionFn.includes('res.explanation ? 2200 : 900') &&
  !/data-correct/.test(missionFn) &&
  !/Check Answer|Lock In/.test(missionFn)
) {
  ok('mission trivia: one-tap evaluate/lock, no Check Answer, no data-correct leak');
} else bad('mission trivia flow');

if (
  gamesHtml.includes('function sfxCultureCorrect(){ playGameTone([660, 880]') &&
  gamesHtml.includes("function sfxCultureWrong(){ playGameTone([220]") &&
  gamesHtml.includes('function playGameTone(')
) {
  ok('audio: prior Web Audio chime/error tones restored on shared path');
} else bad('audio helpers missing');

if (
  paintFn.includes('prefersReducedMotion') &&
  gamesHtml.includes('@media (prefers-reduced-motion: reduce)') &&
  gamesHtml.includes('.cultureGameOverlay .choiceBtn.choiceShake') &&
  gamesHtml.includes('.cultureGameOverlay .choiceBtn:focus-visible')
) {
  ok('a11y: reduced-motion + focus-visible + locked aria-disabled');
} else bad('a11y coverage');

if (
  workerSrc.includes('correct_index: Number(item.correctIndex)') &&
  /function publicQuestionFromItem[\s\S]*?return \{[\s\S]*?id: item.id,[\s\S]*?question: item.question,[\s\S]*?options:/.test(workerSrc) &&
  !/function publicQuestionFromItem[\s\S]{0,220}correctIndex/.test(workerSrc)
) {
  ok('mission: answer payload can reveal correct_index after score; public question still has no correctIndex');
} else bad('worker correct_index leak/missing');

if (
  gamesHtml.includes("setScore(n + ' / ' + target + ' correct')") &&
  gamesHtml.includes('Get 10 correct') &&
  workerSrc.includes('EDUCATIONAL_TRIVIA_CORRECT_TARGET')
) {
  ok('progress: existing 10-correct goal and mission complete path remain');
} else bad('10-correct / mission complete path changed');

if (!gamesHtml.includes('creditMissionApprovalReward') && !gamesHtml.includes('approveMissionWithReward')) {
  ok('mission: client does not reimplement reward credit');
} else bad('client reward path changed');

console.log('\nQuiz MC #277:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
