/**
 * Prompt #230F — poll Sound/mute control must not shift poll rows.
 * Usage: node worker/scripts/interaction-race-230f-test.mjs
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
const cardUi = fs.readFileSync(path.join(root, 'app/js/lantern-card-ui.js'), 'utf8');
const finalRx = fs.readFileSync(path.join(root, 'app/js/lantern-final-reactions.js'), 'utf8');
const cardsCss = fs.readFileSync(path.join(root, 'app/css/lantern-cards.css'), 'utf8');
const rxCss = fs.readFileSync(path.join(root, 'app/css/lantern-reactions.css'), 'utf8');

const pollFnMatch = revealSrc.match(/function mountPollMineCartRace[\s\S]*?\n  function mountReactionSpatialRace/);
const rxFnMatch = revealSrc.match(/function mountReactionSpatialRace[\s\S]*?\n  function mountResultRace/);
const pollFn = pollFnMatch ? pollFnMatch[0] : '';
const rxFn = rxFnMatch ? rxFnMatch[0] : '';

assert(!!pollFn && !!rxFn, 'poll + reaction race functions present');
assert(/function attachFloatingMuteToolbar/.test(audioSrc), 'shared floating Sound helper exists');
assert(/attachFloatingMuteToolbar: attachFloatingMuteToolbar/.test(audioSrc), 'shared helper is exported');
assert(/style\.position = 'absolute'/.test(audioSrc) && /style\.top = '0'/.test(audioSrc) && /style\.right = '0'/.test(audioSrc), 'shared helper forces out-of-flow styles');

assert(/attachPollFloatingSound/.test(cardUi), 'opened poll attaches Sound before submit');
assert(/attachPollFloatingSound\(modalRoot\)/.test(cardUi), 'poll Sound is attached when the poll body is painted');
const attachIdx = cardUi.indexOf('attachPollFloatingSound(modalRoot)');
const submitIdx = cardUi.indexOf('function submitPollChoice');
assert(attachIdx > -1 && submitIdx > attachIdx, 'poll Sound is attached before the tap handler is wired');

assert(!/<div class="lanternRaceToolbar">' \+ muteToolbarHtml\(\)/.test(pollFn), 'poll race HTML does not start with an in-flow Sound toolbar');
assert(/lanternPollRaceHost/.test(pollFn), 'poll results host is marked for relative positioning');
assert(/attachFloatingMuteToolbar/.test(pollFn), 'poll race reuses the shared floating Sound helper');
assert(/skipMuteToolbar/.test(pollFn), 'poll race can be mounted without inserting Sound');
assert(/lanternRaceToolbar--poll/.test(pollFn), 'poll toolbar is marked --poll, not in-flow');
assert(/lanternCardDetailTitle/.test(pollFn), 'poll Sound prefers the question title host');

assert(/lanternRaceToolbar--float/.test(cardsCss) && /lanternRaceToolbar--poll/.test(cardsCss), 'cards CSS floats the poll Sound control');
assert(/\.lanternCardDetailModal--poll \.lanternCardDetailTitle\{[\s\S]*?position:\s*relative/.test(cardsCss), 'poll title is the Sound positioning context');
assert(/\.lanternCardDetailModal--poll \.lanternCardDetailTitle\{[\s\S]*?padding-right:\s*7\.5rem/.test(cardsCss), 'poll title leaves upper-right space so Sound does not cover answers');
assert(/min-height:\s*44px/.test(cardsCss) && /min-width:\s*44px/.test(cardsCss), 'phone tap target on poll Sound');
assert(/\.lanternPollRaceHost,\s*\.pollResultsWrap\{[\s\S]*?position:\s*relative/.test(cardsCss), 'poll race host does not let Sound take flow height');

assert(/cart\.style\.left = p \+ '%'/.test(pollFn), 'carts still follow the fill leading edge');
assert(/data-race-kind', 'poll-minecart'/.test(pollFn), 'poll race kind unchanged');
assert(/You voted/.test(cardUi), 'poll still shows You voted summary');
assert(!/textContent = 'Lock In'/.test(cardUi) && /submitPollChoice/.test(cardUi), 'poll tap still submits immediately');
assert(!/18 votes|12 reactions|23 responses/.test(pollFn + cardUi), 'percentage-only: no raw counts');

assert(/attachFloatingMuteToolbar/.test(finalRx) && /lanternRaceToolbar--rx/.test(finalRx), 'reaction Sound still uses the shared float helper');
assert(/lanternRaceToolbar--rx/.test(rxFn) && /data-rx-sound-float/.test(rxFn), 'reaction race still marks its Sound float');
assert(/var startRects = \[\]/.test(rxFn), 'reaction pre-tap icon rects still captured');
assert(/layoutHold/.test(rxFn) && /hold - h/.test(rxFn), 'reaction icons still ride hold - h');
assert(/lanternRxRaceStage/.test(rxFn), 'reaction reserved stage unchanged');
assert(/\.lanternRaceToolbar--rx/.test(rxCss) && /position:\s*absolute/.test(rxCss), 'reaction CSS still keeps Sound out of flow');

assert(/C_MAJOR_HZ/.test(audioSrc) && /261\.626/.test(audioSrc) && /lantern\.raceSound\.muted/.test(audioSrc), 'C-major audio + mute preference unchanged');
assert(/MAX_MS = 3000/.test(revealSrc) && /maxPct \/ MAX_MS/.test(revealSrc), 'race timing unchanged');

console.log('\n--- interaction-race-230f-test: ' + pass + ' passed, ' + fail + ' failed ---');
process.exit(fail ? 1 : 0);
