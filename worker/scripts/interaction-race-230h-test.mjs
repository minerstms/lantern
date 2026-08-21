/**
 * Prompt #230H — reaction race must not own overlay scroll; no light stage; no heading divider.
 * Usage: node worker/scripts/interaction-race-230h-test.mjs
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
const finalRx = fs.readFileSync(path.join(root, 'app/js/lantern-final-reactions.js'), 'utf8');
const cardUi = fs.readFileSync(path.join(root, 'app/js/lantern-card-ui.js'), 'utf8');
const rxCss = fs.readFileSync(path.join(root, 'app/css/lantern-reactions.css'), 'utf8');
const cardsCss = fs.readFileSync(path.join(root, 'app/css/lantern-cards.css'), 'utf8');
const explore = fs.readFileSync(path.join(root, 'app/explore.html'), 'utf8');

const rxFnMatch = revealSrc.match(/function mountReactionSpatialRace[\s\S]*?\n  function mountResultRace/);
const pollFnMatch = revealSrc.match(/function mountPollMineCartRace[\s\S]*?\n  function mountReactionSpatialRace/);
const rxFn = rxFnMatch ? rxFnMatch[0] : '';
const pollFn = pollFnMatch ? pollFnMatch[0] : '';

assert(!!rxFn && !!pollFn, 'reaction + poll functions present');

assert(!/function lockIconFloor/.test(rxFn), 'lockIconFloor race-loop owner removed');
assert(!/scrollTop\s*\+=/.test(rxFn), 'no animation-loop scrollTop +=');
assert(!/scrollTop\s*=/.test(rxFn), 'no animation-loop scrollTop assignment');
assert(!/\.scrollTo\s*\(/.test(rxFn) && !/scrollIntoView/.test(rxFn), 'race does not call scrollTo/scrollIntoView');
assert(/ensureScrollRoom/.test(rxFn) && /paddingBottom/.test(rxFn), 'tall races may add bottom padding without moving scrollTop');
assert(/applyStageHeight/.test(rxFn) && /syncRaceStage/.test(rxFn), 'in-flow stage height still reserved as bars grow');

assert(!/hold - h/.test(rxFn) && !/layoutHold/.test(rxFn) && !/captureLayoutHold/.test(rxFn), 'icons stay put; no hold - h ride');
assert(/bar\.style\.height = h \+ 'px'/.test(rxFn) && !/btn\.style\.transform = 'translateY/.test(rxFn), 'bars grow by measured height; icons are not translated');
assert(/parentChoices\.nextSibling/.test(rxFn), 'growth is allocated after the tapped icon row');
assert(!/min-height:\s*252px/.test(rxCss), 'does not revive the 252px icon-drop baseline');

assert(/lanternRaceToolbar--rx/.test(rxFn) && /data-rx-sound-float/.test(rxFn), 'Sound still marked floating');
assert(/style\.position = 'absolute'/.test(rxFn) && /style\.top = '0'/.test(rxFn) && /style\.right = '0'/.test(rxFn), 'Sound stays out of document flow');
assert(/\.lanternRaceToolbar--rx/.test(rxCss) && /position:\s*absolute/.test(rxCss), 'Sound CSS still 0px layout shift');
assert(/attachRxMuteToolbar/.test(finalRx) || /attachFloatingMuteToolbar/.test(finalRx), 'pre-submit Sound control kept');

const stageBlock = rxCss.match(/\.lanternRxRaceStage\{[^}]+\}/);
assert(!!stageBlock, 'race stage CSS rule present');
assert(stageBlock && /background:\s*transparent/.test(stageBlock[0]), 'race stage uses transparent background');
assert(!/#0b1628/.test(rxCss), 'removed light-stage #0b1628 slab');
assert(stageBlock && !/border-radius:\s*10px/.test(stageBlock[0]), 'stage is not a rounded background box');
assert(/#3b82f6|#1d4ed8/.test(rxCss), 'bars remain visible on the panel');

const panelBlock = rxCss.match(/\.lanternFinalRxPanel\s*\{[^}]+\}/);
assert(!!panelBlock, 'reaction panel rule present');
assert(panelBlock && /border-top:\s*none/.test(panelBlock[0]), 'divider above Leave a reaction! removed');
assert(panelBlock && !/border-top:\s*1px/.test(panelBlock[0]), 'panel rule does not replace the divider');
assert(/Leave a reaction!/.test(finalRx) && /lanternFinalRxHeading/.test(finalRx), 'heading preserved');
assert(panelBlock && /padding-top:\s*4px/.test(panelBlock[0]), 'heading keeps tight panel padding after the line is gone');
const overlayRx = cardsCss.match(/\.lanternCardDetailOverlay \.lanternCardDetailReactions\{[^}]+\}/);
assert(!!overlayRx, 'opened-post reaction panel rule present');
assert(
  overlayRx && overlayRx[0].lastIndexOf('border-top:') > overlayRx[0].lastIndexOf('border:'),
  'opened-post reaction top border stays removed after the border shorthand'
);
assert(/rxlayout247/.test(explore), 'Explore cache-busts cards + reaction CSS for #247');

assert(/cart\.style\.left = p \+ '%'/.test(pollFn), 'poll carts still follow fill leading edge');
assert(/data-race-kind', 'poll-minecart'/.test(pollFn), 'poll race kind unchanged');
assert(!/lockIconFloor|lanternRxRaceStage|applyStageHeight/.test(pollFn), 'poll race not given reaction scroll/stage logic');
assert(/reuseRows/.test(pollFn) && /existingPollLanes/.test(pollFn), 'poll in-place rows unchanged');
assert(!/textContent = 'Lock In'/.test(cardUi) && /submitPollChoice/.test(cardUi), 'poll tap still submits immediately');

assert(/C_MAJOR_HZ/.test(audioSrc) && /261\.626/.test(audioSrc) && /523\.251/.test(audioSrc), 'C-major audio unchanged');
assert(/lantern\.raceSound\.muted/.test(audioSrc) && /muteControlHtml/.test(audioSrc), 'mute preference + control unchanged');
assert(/MAX_MS = 3000/.test(revealSrc) && /maxPct \/ MAX_MS/.test(revealSrc), 'race timing unchanged');
assert(/overflow-y:\s*auto/.test(cardsCss) && /lanternCardDetailOverlay--rx-racing/.test(cardsCss), 'opened-post overlay stays scrollable during race');

console.log('\n--- interaction-race-230h-test: ' + pass + ' passed, ' + fail + ' failed ---');
process.exit(fail ? 1 : 0);
