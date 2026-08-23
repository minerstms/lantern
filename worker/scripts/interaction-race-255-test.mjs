/**
 * Prompt #255 — reaction race grows upward from a reserved stage above icons.
 * Usage: node worker/scripts/interaction-race-255-test.mjs
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
const explore = fs.readFileSync(path.join(root, 'app/explore.html'), 'utf8');
const rxFnMatch = revealSrc.match(/function mountReactionSpatialRace[\s\S]*?\n  function mountResultRace/);
const pollFnMatch = revealSrc.match(/function mountPollMineCartRace[\s\S]*?\n  function mountReactionSpatialRace/);
const rxFn = rxFnMatch ? rxFnMatch[0] : '';
const pollFn = pollFnMatch ? pollFnMatch[0] : '';

assert(!!rxFn && !!pollFn, 'reaction + poll functions present');
assert(/MAX_BAR_PX = 330/.test(revealSrc), 'desktop 100% field is 330px (~2x prior 168)');
assert(/--lantern-rx-race-max:\s*250px/.test(rxCss), 'phone 100% field is 250px');
assert(/--lantern-rx-race-max:\s*230px/.test(rxCss), 'narrow phone field is 230px');
assert(/insertBefore\(stage, parentChoices\)/.test(rxFn), 'stage is inserted above icons');
assert(/lanternRxRaceStage--reserved/.test(rxFn), 'reserved class applied once before animation');
assert(!/applyStageHeight/.test(rxFn) && !/syncRaceStage/.test(rxFn), 'no incremental stage growth');
assert(!/ensureScrollRoom/.test(rxFn) && !/paddingBottom/.test(rxFn), 'no padding push during the race');
assert(!/scrollIntoView/.test(rxFn) && !/\.scrollTo\s*\(/.test(rxFn) && !/scrollTop\s*=/.test(rxFn), 'race loop does not own scroll');
assert(!/position:\s*fixed/.test(rxFn) && !/position:\s*fixed/.test(rxCss), 'no viewport-fixed race overlay');
assert(/bar\.style\.height = h \+ 'px'/.test(rxFn), 'bars still grow by linear height');
assert(/clampPct\(grownPct\) \/ 100\) \* reservedMaxPx/.test(rxFn.replace(/\s+/g, ' ')), 'percentage mapping is linear against reserved max');
assert(!/btn\.style\.transform = 'translateY/.test(rxFn), 'icons are not translated');
assert(/position:\s*absolute/.test(rxCss) && /bottom:\s*0/.test(rxCss), 'bars grow up from the baseline');
assert(/lanternRxRaceStage\{[\s\S]*?height:\s*0/.test(rxCss), 'idle stage is collapsed');
assert(/lanternRxRaceStage[\s\S]+lanternFinalRxChoice/.test(finalRx), 'production markup is stage then icons');
assert(/pctEl\.parentNode !== bar/.test(rxFn), 'percent label rides the top of its bar');
assert(/rxrace255/.test(explore), 'Explore cache-busts #255 assets');
assert(!/lanternRxRaceStage|applyStageHeight|raceMaxBarPx/.test(pollFn), 'poll mine-cart race unchanged');
assert(/MAX_MS = 3000/.test(revealSrc), 'race timing unchanged');
assert(/--lantern-rx-race-max/.test(revealSrc), 'bar max reads the reserved CSS race field');
const harness255 = fs.readFileSync(path.join(root, 'app/dev/race-harness-255.html'), 'utf8');
assert(/__LANTERN_RACE_255/.test(harness255) && /mountReactionSpatialRace/.test(harness255), '255 harness mounts the production race');
assert(/BELOW-RACE ANCHOR/.test(harness255), '255 harness measures a stable below-content anchor');

console.log('\n--- interaction-race-255-test: ' + pass + ' PASS ' + fail + ' FAIL ---');
process.exit(fail ? 1 : 0);
