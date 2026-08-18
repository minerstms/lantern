/**
 * Prompt #230D — actual Explore opened-post race matches accepted #230C layout.
 * Usage: node worker/scripts/interaction-race-230d-test.mjs
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
const cardsCss = fs.readFileSync(path.join(root, 'app/css/lantern-cards.css'), 'utf8');
const harnessC = fs.readFileSync(path.join(root, 'app/dev/race-harness-230c.html'), 'utf8');
const harnessD = fs.readFileSync(path.join(root, 'app/dev/race-harness-230d.html'), 'utf8');
const cardUi = fs.readFileSync(path.join(root, 'app/js/lantern-card-ui.js'), 'utf8');
const hidden = fs.readFileSync(path.join(root, 'worker/hidden-nugget.js'), 'utf8');
const audioSrc = fs.readFileSync(path.join(root, 'app/js/lantern-race-audio.js'), 'utf8');

const rxFnMatch = revealSrc.match(/function mountReactionSpatialRace[\s\S]*?\n  function mountResultRace/);
const pollFnMatch = revealSrc.match(/function mountPollMineCartRace[\s\S]*?\n  function mountReactionSpatialRace/);
const rxFn = rxFnMatch ? rxFnMatch[0] : '';
const pollFn = pollFnMatch ? pollFnMatch[0] : '';

assert(!!rxFn && !!pollFn, 'reaction + poll race functions present');
assert(/flexGrow = '0'/.test(rxFn) && /height = 'auto'/.test(rxFn), 'racing modal is forced to natural height');
assert(/overflowY = 'auto'/.test(rxFn), 'Explore overlay stays the vertical scroller while racing');
assert(/overlayPadBase/.test(rxFn) && /paddingBottom = overlayPadBase/.test(rxFn), 'scroll room is added on the overlay, not swallowed by a 100% modal');
assert(/leftover/.test(rxFn) && /scrollTop \+= leftover/.test(rxFn), 'icon floor retries leftover drift after overlay scroll');
assert(/raceStageHeight/.test(rxFn) && /lockIconFloor/.test(rxFn) && /hold - h/.test(rxFn), '#230C reserved stage + floor lock + ride-up kept');

assert(
  /#lanternCardDetailOverlay\.lanternCardDetailOverlay--rx-racing \.lanternCardDetailModal/.test(cardsCss) &&
    /flex: 0 0 auto/.test(cardsCss) &&
    /height: auto/.test(cardsCss),
  'racing CSS forces Explore modal to grow with reserved stage height'
);
assert(
  /#lanternCardDetailOverlay\.lanternCardDetailOverlay--rx-racing\.lanternSurfaceShell/.test(cardsCss),
  'racing CSS targets the production fixed overlay shell'
);

assert(/LanternCardUI\.openFeedItem/.test(harnessD), '230D harness opens via production card UI');
assert(/position:fixed/.test(harnessD) && /inset:0/.test(harnessD), '230D harness documents the production overlay contract');
assert(!/#lanternCardDetailOverlay\.harnessOverlay/.test(harnessD), '230D does not reuse the relative 78vh #230C overlay cheat');
assert(/id="lanternCardDetailOverlay"/.test(harnessC), '#230C harness kept for comparison');

assert(/openFeedItem: openFeedItem/.test(cardUi), 'production Explore still opens through openFeedItem');
assert(!/raceStageHeight|lanternRxRaceStage|lockIconFloor/.test(pollFn), 'poll mine-cart race untouched');
assert(/C_MAJOR_HZ/.test(audioSrc) && /muteControlHtml/.test(audioSrc), 'audio unchanged');
assert(/assignHiddenNugget|hidden_nugget/.test(hidden), 'Hidden Nugget module file not part of this diff');

console.log('\n--- interaction-race-230d-test: ' + pass + ' passed, ' + fail + ' failed ---');
process.exit(fail ? 1 : 0);
