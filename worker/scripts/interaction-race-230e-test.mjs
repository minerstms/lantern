/**
 * Prompt #230E — Sound/mute control must not shift the reaction icon row.
 * Usage: node worker/scripts/interaction-race-230e-test.mjs
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
const audioSrc = fs.readFileSync(path.join(root, 'app/js/lantern-race-audio.js'), 'utf8');
const rxCss = fs.readFileSync(path.join(root, 'app/css/lantern-reactions.css'), 'utf8');
const cardsCss = fs.readFileSync(path.join(root, 'app/css/lantern-cards.css'), 'utf8');

const rxFnMatch = revealSrc.match(/function mountReactionSpatialRace[\s\S]*?\n  function mountResultRace/);
const pollFnMatch = revealSrc.match(/function mountPollMineCartRace[\s\S]*?\n  function mountReactionSpatialRace/);
const rxFn = rxFnMatch ? rxFnMatch[0] : '';
const pollFn = pollFnMatch ? pollFnMatch[0] : '';

assert(!!rxFn && !!pollFn, 'reaction + poll functions present');
assert(/lanternRaceToolbar--rx/.test(rxFn) && /data-rx-sound-float/.test(rxFn), 'reaction mute toolbar is marked floating');
assert(/style\.position = 'absolute'/.test(rxFn) && /style\.top = '0'/.test(rxFn) && /style\.right = '0'/.test(rxFn), 'reaction mute toolbar forced out of flow in JS');
assert(/var startRects = \[\]/.test(rxFn), 'pre-tap icon rects still captured');
const startIdx = rxFn.indexOf('var startRects = []');
const tbIdx = rxFn.indexOf("style.position = 'absolute'");
assert(tbIdx > -1 && startIdx > tbIdx, 'floating toolbar is placed before startRects are captured');
assert(/skipMuteToolbar/.test(rxFn), 'diagnosis hook can mount a race without inserting Sound');
assert(!/insertBefore\(tb, panel\.firstChild\)/.test(rxFn), 'mute toolbar is not inserted above icons in flow');

assert(/function attachRxMuteToolbar/.test(finalRx), 'draft/locked panels attach Sound before tap');
assert(/data-rx-sound-float/.test(finalRx) && /position = 'absolute'/.test(finalRx), 'pre-race Sound is out of flow');

assert(/\.lanternRaceToolbar--rx/.test(rxCss) && /position:\s*absolute/.test(rxCss), 'reaction CSS keeps Sound out of flow');
assert(/padding-right:\s*7\.5rem/.test(rxCss), 'heading leaves upper-right space so Sound does not cover choices');
assert(/min-height:\s*44px/.test(rxCss) && /min-width:\s*44px/.test(rxCss), 'phone tap target on reaction Sound');
assert(/\.lanternFinalRxPanel\s*\{[\s\S]*?position:\s*relative/.test(rxCss), 'reaction panel is the Sound positioning context');
assert(/lanternRaceToolbar--rx/.test(cardsCss), 'shared cards CSS also floats the reaction Sound control');

assert(!/lanternRaceToolbar--rx|skipMuteToolbar|data-rx-sound-float/.test(pollFn), 'poll mine-cart race not edited');
assert(/<div class="lanternRaceToolbar">' \+ muteToolbarHtml\(\)/.test(pollFn), 'poll still builds its own in-race toolbar HTML');
assert(/C_MAJOR_HZ/.test(audioSrc) && /muteControlHtml/.test(audioSrc) && /lantern\.raceSound\.muted/.test(audioSrc), 'C-major audio + mute preference unchanged');
assert(/MAX_MS = 3000/.test(revealSrc) && /maxPct \/ MAX_MS/.test(revealSrc), 'race timing unchanged');

console.log('\n--- interaction-race-230e-test: ' + pass + ' passed, ' + fail + ' failed ---');
process.exit(fail ? 1 : 0);
