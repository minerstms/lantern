/**
 * Prompt #255A — compact-to-reserved reaction entry stays visually anchored.
 * Usage: node worker/scripts/interaction-race-255a-test.mjs
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
const harness = fs.readFileSync(path.join(root, 'app/dev/race-harness-255a.html'), 'utf8');
const rxFnMatch = revealSrc.match(/function mountReactionSpatialRace[\s\S]*?\n  function mountResultRace/);
const pollFnMatch = revealSrc.match(/function mountPollMineCartRace[\s\S]*?\n  function mountReactionSpatialRace/);
const helperMatch = revealSrc.match(/function raceScrollOwner[\s\S]*?\n  function mountPollMineCartRace/);
const rxFn = rxFnMatch ? rxFnMatch[0] : '';
const pollFn = pollFnMatch ? pollFnMatch[0] : '';
const helper = helperMatch ? helperMatch[0] : '';

assert(!!rxFn && !!helper, 'entry helper + reaction race present');
assert(/MAX_BAR_PX = 330/.test(revealSrc), 'desktop 330px race field preserved');
assert(/ENTRY_MS = 220/.test(revealSrc), 'entry duration is 220ms');
assert(/function raceScrollOwner/.test(helper) && /lanternCardDetailOverlay/.test(helper), 'uses the overlay/surface scroll owner');
assert(/scroller\.scrollTop = v/.test(helper), 'entry helper writes scrollTop');
assert(!/scrollTop\s*=/.test(rxFn) && !/scrollIntoView/.test(rxFn), 'bar-race function still does not own scroll');
assert(/data-rx-entry', 'opening'/.test(rxFn) && /startBarRace/.test(rxFn), 'race starts only after entry callback');
assert(/openReservedRaceStage\(stage/.test(rxFn) && /startBarRace\(\)/.test(rxFn) && /animateRace\(/.test(rxFn), 'bars do not start before the reserved field opens');
assert(/lanternRxRaceStage\{[\s\S]*?height:\s*0/.test(rxCss), 'compact stage begins at 0');
assert(/lanternRxRaceStage--reserved\{[\s\S]*?--lantern-rx-race-max:\s*330px|--lantern-rx-race-max:\s*330px[\s\S]*?lanternRxRaceStage--reserved/.test(rxCss), 'reserved field still uses 330px desktop max');
assert(!/\.lanternRxRaceLive \.lanternRxRaceStage\{[\s\S]*?height:\s*calc/.test(rxCss), 'live class no longer snaps reserved height');
assert(!/ensureRaceAreaVisibleOnce/.test(finalRx), 'Reveal Results no longer jump-scrolls before entry');
assert(/function ensureRaceAreaVisibleOnce/.test(revealSrc) && /scrollIntoView/.test(revealSrc), 'poll Reveal still uses the existing one-shot helper');
assert(!/lanternRxRaceStage|openReservedRaceStage|ENTRY_MS/.test(pollFn), 'poll mine-cart race unchanged');
assert(/__LANTERN_RACE_255A/.test(harness) && /runEntry/.test(harness), '255A harness measures the entry transition');
assert(/finalizeReaction/.test(finalRx) && /isReplay/.test(finalRx), 'replay/first-submit contract remains');

console.log('\n--- interaction-race-255a-test: ' + pass + ' PASS ' + fail + ' FAIL ---');
process.exit(fail ? 1 : 0);
