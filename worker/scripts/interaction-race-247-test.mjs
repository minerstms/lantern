/**
 * Prompt #247 / #255 — reaction icons stay put; bars grow upward inside a reserved stage.
 * Usage: node worker/scripts/interaction-race-247-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(msg) {
  pass++;
  console.log('PASS', msg);
}
function bad(msg, detail) {
  fail++;
  console.error('FAIL', msg, detail || '');
}
function assert(cond, msg, detail) {
  if (cond) ok(msg);
  else bad(msg, detail);
}

const revealSrc = fs.readFileSync(path.join(root, 'app/js/lantern-result-reveal.js'), 'utf8');
const finalRx = fs.readFileSync(path.join(root, 'app/js/lantern-final-reactions.js'), 'utf8');
const rxCss = fs.readFileSync(path.join(root, 'app/css/lantern-reactions.css'), 'utf8');
const cardsCss = fs.readFileSync(path.join(root, 'app/css/lantern-cards.css'), 'utf8');
const surfaceJs = fs.readFileSync(path.join(root, 'app/js/lantern-interactive-surface.js'), 'utf8');

const rxFnMatch = revealSrc.match(/function mountReactionSpatialRace[\s\S]*?\n  function mountResultRace/);
const pollFnMatch = revealSrc.match(/function mountPollMineCartRace[\s\S]*?\n  function mountReactionSpatialRace/);
const rxFn = rxFnMatch ? rxFnMatch[0] : '';
const pollFn = pollFnMatch ? pollFnMatch[0] : '';

assert(!!rxFn && !!pollFn, 'reaction + poll functions present');

assert(!/hold - h/.test(rxFn), 'reaction race no longer uses hold - h');
assert(!/captureLayoutHold/.test(rxFn) && !/layoutHold/.test(rxFn), 'icon layoutHold ride removed');
assert(!/btn\.style\.transform = 'translateY/.test(rxFn), 'icons are not translated with bar height');
assert(/bar\.style\.height = h \+ 'px'/.test(rxFn), 'bars still grow by height');
assert(/insertBefore\(stage, parentChoices\)/.test(rxFn), 'reserved stage sits above the icon row');
assert(!/parentChoices\.nextSibling/.test(rxFn), 'stage is not placed after the icon row');
assert(/stage\.appendChild\(lane\)/.test(rxFn) || /lane\.parentNode !== stage/.test(rxFn), 'result lanes live in the stage, not under the icons');
assert(/insertBefore\(unwrapBtn, wrapLane\)/.test(rxFn), 'leftover icon+bar lanes are unwrapped so icons stay in the row');
assert(!/scrollTop\s*=/.test(rxFn) && !/scrollTop\s*\+=/.test(rxFn), 'no race-loop scrollTop writes');
assert(!/\.scrollTo\s*\(/.test(rxFn) && !/scrollIntoView/.test(rxFn), 'race loop does not call scrollTo/scrollIntoView');
assert(!/position:\s*fixed/.test(rxFn), 'race JS does not pin a fixed container');

const laneBlock = /\.lanternRxLane\{/.test(rxCss) && /height:\s*100%/.test(rxCss);
const barBlock = rxCss.match(/\.lanternRxRaceBar\{[^}]+\}/);
const choicesBlock = rxCss.match(/\.lanternFinalRxChoices \{[^}]+\}/);
const stageBlock = rxCss.match(/\.lanternRxRaceStage\{[^}]+\}/);
assert(laneBlock, 'result lanes stack from the reserved-stage baseline');
assert(!!choicesBlock && /align-items:\s*start/.test(choicesBlock[0]), 'icon row stays the shared baseline');
assert(!!barBlock && /position:\s*absolute/.test(barBlock[0]) && /bottom:\s*0/.test(barBlock[0]), 'bars grow upward from the icon baseline');
assert(/lanternRxRaceStage--reserved/.test(rxCss) && /--lantern-rx-race-max:\s*330px/.test(rxCss), 'result stage reserves a fixed race field');
assert(!!stageBlock && /height:\s*0/.test(stageBlock[0]), 'idle stage does not reserve a blank hole');
assert(!/position:\s*fixed/.test(rxCss), 'reaction CSS does not use position:fixed');
assert(/align-self:\s*start/.test(rxCss), 'reaction icons do not self-center as a row grows');

assert(/lanternRxRaceStage[\s\S]+lanternFinalRxChoice/.test(finalRx), 'draft/locked markup is empty result stage above the icon row');
assert(!/<div class="lanternRxLane">/.test(finalRx), 'icons are not pre-wrapped with bars in the same cell');

assert(/cart\.style\.left = p \+ '%'/.test(pollFn), 'poll carts still follow fill leading edge');
assert(!/applyStageHeight|lanternRxRaceStage|hold - h/.test(pollFn), 'poll race was not given reaction layout logic');
assert(/overflow-y:\s*auto/.test(cardsCss) && /lanternCardDetailOverlay--rx-racing/.test(cardsCss), 'opened-post overlay stays the vertical scroll owner');
assert(/lanternInteractiveSurface/.test(surfaceJs), 'universal surface helper remains present');

console.log('\n--- interaction-race-247-test: ' + pass + ' PASS ' + fail + ' FAIL ---');
process.exit(fail ? 1 : 0);
