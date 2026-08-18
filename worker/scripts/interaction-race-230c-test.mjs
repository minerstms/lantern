/**
 * Prompt #230C — reaction race reserved stage height (not overlay-over-content).
 * Usage: node worker/scripts/interaction-race-230c-test.mjs
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
const audioSrc = fs.readFileSync(path.join(root, 'app/js/lantern-race-audio.js'), 'utf8');
const rxCss = fs.readFileSync(path.join(root, 'app/css/lantern-reactions.css'), 'utf8');
const cardsCss = fs.readFileSync(path.join(root, 'app/css/lantern-cards.css'), 'utf8');
const harness = fs.readFileSync(path.join(root, 'app/dev/race-harness-230c.html'), 'utf8');

const rxFnMatch = revealSrc.match(/function mountReactionSpatialRace[\s\S]*?\n  function mountResultRace/);
const pollFnMatch = revealSrc.match(/function mountPollMineCartRace[\s\S]*?\n  function mountReactionSpatialRace/);
const rxFn = rxFnMatch ? rxFnMatch[0] : '';
const pollFn = pollFnMatch ? pollFnMatch[0] : '';

assert(!!rxFn, 'reaction spatial race function present');
assert(!!pollFn, 'poll mine-cart function present');

assert(/data-rx-race-stage/.test(rxFn) && /lanternRxRaceStage/.test(rxFn), 'stage node inserted in reaction race only');
assert(/insertBefore\(stage, parentChoices\)/.test(rxFn), 'stage is inserted above the reaction icon row');
assert(/raceStageHeight/.test(rxFn) && /style\.height = next \+ 'px'/.test(rxFn), 'stage height is real layout height');
assert(/applyStageHeight\(0\)/.test(rxFn), 'stage starts at 0 before the race grows');
assert(/lockIconFloor/.test(rxFn) && /startTop/.test(rxFn) && /scrollTop \+= drift/.test(rxFn), 'floor stays at pre-tap Y via scroll compensation');
assert(/ensureScrollRoom/.test(rxFn) && /paddingBottom/.test(rxFn), 'modal can scroll when reserved height exceeds the viewport');
assert(/hold - h/.test(rxFn), 'icons still ride bar tops (translateY hold - h)');
assert(/layoutHold/.test(rxFn) && /captureLayoutHold/.test(rxFn), '#228 pre-tap icon Y hold preserved');
assert(!/min-height:\s*252px/.test(rxCss), 'does not revive the flex-end 252px drop bug');
assert(/MAX_MS = 3000/.test(revealSrc) && /maxPct \/ MAX_MS/.test(revealSrc), 'race timing unchanged');
assert(/C_MAJOR_HZ/.test(audioSrc) && /muteControlHtml/.test(audioSrc), 'C-major audio + mute unchanged');

assert(!/raceStageHeight|lanternRxRaceStage|lockIconFloor|data-rx-race-stage/.test(pollFn), 'poll mine-cart race not edited');
assert(/cart\.style\.left = p \+ '%'/.test(pollFn), 'poll carts still follow fill leading edge');

assert(/\.lanternRxRaceStage/.test(rxCss) && /flex: 0 0 auto/.test(rxCss), 'stage CSS is in-flow layout height');
assert(/#0b1628/.test(rxCss) || /background:\s*#0b1628/.test(rxCss), 'stage background is opaque, not a transparent overlay');
assert(/#3b82f6|#1d4ed8/.test(rxCss), 'bars are solid enough to read on the reserved stage');
assert(/lanternCardDetailOverlay--rx-racing/.test(cardsCss) && /overflow-y:\s*auto/.test(cardsCss), 'opened-post overlay stays vertically scrollable');

assert(/lanternCardDetailOverlay/.test(harness) && /lanternCardDetailVisual/.test(harness) && /lanternCardDetailBody/.test(harness), '230C harness mounts real opened-post chrome');
assert(/Leave a reaction!/.test(harness) && /lanternFinalRxChoice/.test(harness), '230C harness uses production reaction row');
assert(/mountPollMineCartRace/.test(harness), '230C harness regression-tests the poll race');

console.log('\n--- interaction-race-230c-test: ' + pass + ' passed, ' + fail + ' failed ---');
process.exit(fail ? 1 : 0);
