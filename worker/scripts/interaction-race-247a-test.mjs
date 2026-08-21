/**
 * Prompt #247A — icons stay on a stable row; result stage consumes real flow height.
 * Usage: node worker/scripts/interaction-race-247a-test.mjs
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
const cardUi = fs.readFileSync(path.join(root, 'app/js/lantern-card-ui.js'), 'utf8');
const explore = fs.readFileSync(path.join(root, 'app/explore.html'), 'utf8');
const surfaceCss = fs.readFileSync(path.join(root, 'app/css/lantern-interactive-surface.css'), 'utf8');

const rxFnMatch = revealSrc.match(/function mountReactionSpatialRace[\s\S]*?\n  function mountResultRace/);
const pollFnMatch = revealSrc.match(/function mountPollMineCartRace[\s\S]*?\n  function mountReactionSpatialRace/);
const rxFn = rxFnMatch ? rxFnMatch[0] : '';
const pollFn = pollFnMatch ? pollFnMatch[0] : '';

assert(!!rxFn && !!pollFn, 'reaction + poll functions present');
assert(!/hold - h/.test(rxFn) && !/layoutHold/.test(rxFn) && !/captureLayoutHold/.test(rxFn), 'no icon ride leftover');
assert(!/btn\.style\.transform = 'translateY/.test(rxFn), 'icons are not translated with bar height');
assert(/bar\.style\.height = h \+ 'px'/.test(rxFn), 'bars still grow by height');
assert(/parentChoices\.nextSibling/.test(rxFn), 'result stage is placed after the icon row');
assert(/insertBefore\(unwrapBtn, wrapLane\)/.test(rxFn), 'icons are lifted out of leftover icon+bar lanes');
assert(/stage\.appendChild\(lane\)/.test(rxFn) || /lane\.parentNode !== stage/.test(rxFn), 'result lanes are children of the stage');
assert(!/scrollTop\s*=/.test(rxFn) && !/scrollTop\s*\+=/.test(rxFn), 'no race-loop scrollTop writes');
assert(!/\.scrollTo\s*\(/.test(rxFn) && !/scrollIntoView/.test(rxFn), 'race loop does not call scrollTo/scrollIntoView');
assert(!/position:\s*fixed/.test(rxFn), 'race JS does not pin a fixed container');
assert(!/style\.top = /.test(rxFn.replace(/existingTb\.style\.top/g, '')), 'race does not set top on following content');

const stageBlock = rxCss.match(/\.lanternRxRaceStage\{[^}]+\}/);
const barBlock = rxCss.match(/\.lanternRxRaceBar\{[^}]+\}/);
const choicesBlock = rxCss.match(/\.lanternFinalRxChoices \{[^}]+\}/);
assert(!!stageBlock && /display:\s*grid/.test(stageBlock[0]), 'result stage is a grid in normal flow');
assert(!!stageBlock && /height:\s*auto/.test(stageBlock[0]) && /overflow:\s*visible/.test(stageBlock[0]), 'stage height comes from its children');
assert(!!barBlock && /position:\s*relative/.test(barBlock[0]) && !/position:\s*absolute/.test(barBlock[0]), 'bars are in-flow');
assert(!!choicesBlock && /align-items:\s*start/.test(choicesBlock[0]), 'icon row baseline is the grid start');
assert(/align-self:\s*start/.test(rxCss), 'icons do not vertically center when a parent grows');
assert(/lanternReactionBar\.lanternRxChoices--racing\{[\s\S]*?align-items:\s*flex-start/.test(rxCss), 'news reaction bar keeps icons at the top');
assert(!/position:\s*fixed/.test(rxCss), 'reaction CSS does not use position:fixed');

assert(/data-rx-race-stage/.test(finalRx) && /lanternFinalRxChoice/.test(finalRx), 'production draft markup keeps icons and an empty result stage');
assert(!/<div class="lanternRxLane">/.test(finalRx), 'production markup does not nest bars under icons');
assert(/fillFeedItemDetailModal/.test(cardUi) && /lanternCardDetailReactions/.test(cardUi), 'Explore still mounts reactions in the opened-post overlay');
assert(/lanternCardDetailBody[\s\S]*lanternCardDetailReactions/.test(cardUi), 'canonical overlay keeps body then reactions');
assert(/overflow-y:\s*auto/.test(cardsCss) && /lanternInteractiveSurface/.test(surfaceCss), 'PR #38 overlay/surface scroll model remains');
assert(/rxlayout247a/.test(explore), 'Explore cache-busts #247A assets');
assert(/cart\.style\.left = p \+ '%'/.test(pollFn), 'poll carts still follow fill leading edge');
assert(!/applyStageHeight|lanternRxRaceStage|unwrapBtn/.test(pollFn), 'poll race was not given reaction layout logic');

console.log('\n--- interaction-race-247a-test: ' + pass + ' PASS ' + fail + ' FAIL ---');
process.exit(fail ? 1 : 0);
