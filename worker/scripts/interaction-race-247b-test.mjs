/**
 * Prompt #247B — real Explore reaction path: icons stay above a separate in-flow result well.
 * Usage: node worker/scripts/interaction-race-247b-test.mjs
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
const cardUi = fs.readFileSync(path.join(root, 'app/js/lantern-card-ui.js'), 'utf8');
const explore = fs.readFileSync(path.join(root, 'app/explore.html'), 'utf8');

const rxFnMatch = revealSrc.match(/function mountReactionSpatialRace[\s\S]*?\n  function mountResultRace/);
const pollFnMatch = revealSrc.match(/function mountPollMineCartRace[\s\S]*?\n  function mountReactionSpatialRace/);
const rxFn = rxFnMatch ? rxFnMatch[0] : '';
const pollFn = pollFnMatch ? pollFnMatch[0] : '';
const stageBlock = rxCss.match(/\.lanternRxRaceStage\{[^}]+\}/);
const choicesBlock = rxCss.match(/\.lanternFinalRxChoices \{[^}]+\}/);

assert(!!rxFn && !!pollFn, 'reaction + poll functions present');
assert(!/getComputedStyle\(parentChoices\)\.gridTemplateColumns/.test(rxFn), 'stage columns are not copied from computed pixels');
assert(/repeat\(' \+ String\(buttons\.length/.test(rxFn) || /repeat\(' \+ String\(buttons.length/.test(rxFn), 'stage uses the same 1fr template as the icon row');
assert(/var host = panel;/.test(finalRx) && /lanternRevealResultsWrap/.test(finalRx), 'Reveal/Replay sits on the panel below the result stage');
assert(/insertBefore\(wrap, arena\.nextSibling\)/.test(finalRx), 'Reveal is ordered after the growing stage, not inside the icon row');
assert(!!stageBlock && /border-top:\s*1px solid/.test(stageBlock[0]), 'result well is visually separated from the icon row');
assert(!!stageBlock && /padding:\s*12px 0 0/.test(stageBlock[0]), 'result well starts below the icon row');
assert(!!choicesBlock && /margin-bottom:\s*0/.test(choicesBlock[0]), 'icon row does not share a collapsing margin with the bars');
assert(/fillFeedItemDetailModal/.test(cardUi) && /mountFinalReactionPanel/.test(cardUi), 'Explore still uses the finalized reaction panel');
assert(/rxlayout247b/.test(explore), 'Explore cache-busts #247B assets');
assert(/cart\.style\.left = p \+ '%'/.test(pollFn), 'poll carts unchanged');
assert(!/border-top:\s*1px solid/.test(pollFn), 'poll race CSS/JS not given the reaction well');

console.log('\n--- interaction-race-247b-test: ' + pass + ' PASS ' + fail + ' FAIL ---');
process.exit(fail ? 1 : 0);
