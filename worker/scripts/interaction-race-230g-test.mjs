/**
 * Prompt #230G — poll option rows must become race lanes in place.
 * Usage: node worker/scripts/interaction-race-230g-test.mjs
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
const cardUi = fs.readFileSync(path.join(root, 'app/js/lantern-card-ui.js'), 'utf8');
const audioSrc = fs.readFileSync(path.join(root, 'app/js/lantern-race-audio.js'), 'utf8');
const cardsCss = fs.readFileSync(path.join(root, 'app/css/lantern-cards.css'), 'utf8');
const rxCss = fs.readFileSync(path.join(root, 'app/css/lantern-reactions.css'), 'utf8');
const harness = fs.readFileSync(path.join(root, 'app/dev/race-harness-230g.html'), 'utf8');

const pollFnMatch = revealSrc.match(/function mountPollMineCartRace[\s\S]*?\n  function mountReactionSpatialRace/);
const rxFnMatch = revealSrc.match(/function mountReactionSpatialRace[\s\S]*?\n  function mountResultRace/);
const pollFn = pollFnMatch ? pollFnMatch[0] : '';
const rxFn = rxFnMatch ? rxFnMatch[0] : '';

assert(!!pollFn && !!rxFn, 'poll + reaction functions present');
assert(/function preparePollChoiceLanes/.test(revealSrc), 'shared builder paints option rows before tap');
assert(/preparePollChoiceLanes: preparePollChoiceLanes/.test(revealSrc), 'builder is exported');
assert(/data-poll-choice-index/.test(revealSrc) && /pollChoiceRow/.test(revealSrc), 'option rows are lane nodes from the start');
assert(/reuseRows/.test(pollFn) && /existingPollLanes/.test(pollFn), 'race prefers existing option-row nodes');
assert(!/summaryHtml/.test(pollFn), 'in-place race does not insert a You voted title above rows');

assert(/paintChoiceLanes/.test(cardUi), 'opened poll paints lane-ready option rows');
assert(!/c2\.innerHTML = ''/.test(cardUi), 'submit does not wipe the option list');
assert(!/r2\.style\.display = 'block'/.test(cardUi), 'submit does not reveal a separate results chart');
assert(/reuseRows:\s*true/.test(cardUi), 'submit races the existing option-row host');
assert(/announcePollVoted/.test(cardUi) && /visuallyHidden/.test(cardUi), 'You voted is announced off-flow');

assert(/\.pollChoiceGroup\.lanternPollRace\{[\s\S]*?gap:\s*10px/.test(cardsCss), 'pre-tap and race share the same row gap');
assert(/\.pollChoiceGroup \.lanternPollRaceTrack\{[\s\S]*?position:\s*absolute/.test(cardsCss), 'tracks overlay inside the original row');
assert(/min-width:\s*8\.5rem/.test(cardsCss), 'Your choice + percent slot is reserved before tap');
assert(/\.pollChoiceGroup \.pollYourChoiceMark\{[\s\S]*?visibility:\s*hidden/.test(cardsCss), 'Your choice is reserved hidden, not inserted later');
assert(/\.lanternPollRaceLane\.pollChoiceRow\.lanternPollRaceLane--yours\{[\s\S]*?outline:\s*none/.test(cardsCss), 'selected state does not add outline offset padding');
assert(/\.lanternPollRaceLane\.pollChoiceRow\{[\s\S]*?padding:\s*0/.test(cardsCss), 'racing a row does not add in-flow padding');

assert(/cart\.style\.left = p \+ '%'/.test(pollFn), 'carts still follow the fill leading edge');
assert(/data-race-kind', 'poll-minecart'/.test(pollFn), 'poll race kind unchanged');
assert(/submitPollChoice/.test(cardUi) && !/textContent = 'Lock In'/.test(cardUi), 'tap still submits immediately');
assert(!/18 votes|12 reactions|23 responses/.test(pollFn + cardUi), 'percentage-only: no raw counts');

assert(/layoutHold/.test(rxFn) && /hold - h/.test(rxFn) && /lanternRxRaceStage/.test(rxFn), 'reaction race geometry unchanged');
assert(/attachFloatingMuteToolbar/.test(audioSrc) && /lanternRaceToolbar--poll/.test(cardsCss), 'floating Sound control kept');
assert(/C_MAJOR_HZ/.test(audioSrc) && /MAX_MS = 3000/.test(revealSrc), 'audio + timing unchanged');
assert(/\.lanternRaceToolbar--rx/.test(rxCss), 'reaction Sound CSS unchanged');

assert(/fillPollDetailModal/.test(harness) && /ensureOverlay/.test(harness), '230G harness uses production LanternCardUI opened poll');
assert(/getBoundingClientRect/.test(harness) && /preTapTop === firstRaceFrameTop/.test(harness), '230G harness measures real option-row geometry');

console.log('\n--- interaction-race-230g-test: ' + pass + ' passed, ' + fail + ' failed ---');
process.exit(fail ? 1 : 0);
