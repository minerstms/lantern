/**
 * Prompt #225 — percentage-only race reveal timing and poll/reaction copy.
 * Usage: node worker/scripts/result-reveal-225-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

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

const src = fs.readFileSync(path.join(root, 'app/js/lantern-result-reveal.js'), 'utf8');
const cardUi = fs.readFileSync(path.join(root, 'app/js/lantern-card-ui.js'), 'utf8');
const finalRx = fs.readFileSync(path.join(root, 'app/js/lantern-final-reactions.js'), 'utf8');
const rx = fs.readFileSync(path.join(root, 'app/js/lantern-reactions.js'), 'utf8');
const explore = fs.readFileSync(path.join(root, 'app/explore.html'), 'utf8');

const sandbox = {
  window: {},
  self: {},
  matchMedia: () => ({ matches: false }),
  requestAnimationFrame: () => 0,
};
sandbox.window = sandbox;
sandbox.self = sandbox;
vm.runInNewContext(src, sandbox);
const api = sandbox.LANTERN_RESULT_REVEAL;

if (api && api.MAX_MS === 3000) ok('largest bar target is 3000ms');
else bad('MAX_MS', api && api.MAX_MS);

if (api && api.durationForPct(21, 94) < api.durationForPct(38, 94)) ok('21% finishes before 38%');
else bad('shorter bar should finish first');

if (api && api.durationForPct(38, 94) < api.durationForPct(72, 94)) ok('38% finishes before 72%');
else bad('mid bar ordering');

if (api && api.durationForPct(94, 94) === 3000) ok('largest percentage uses full 3s');
else bad('largest duration', api && api.durationForPct(94, 94));

if (api && api.durationForPct(100, 100) === 3000) ok('100% does not exceed 3s');
else bad('100% duration cap');

if (api && api.clampPct(-4) === 0 && api.clampPct(140) === 100) ok('percentage clamp');
else bad('clampPct');

if (/You voted/.test(cardUi) && !/total vote/.test(cardUi)) ok('poll summary has no raw vote totals');
else bad('poll totals still present');

if (/mountResultRace/.test(cardUi) && /revealPollResults/.test(cardUi)) ok('polls use shared race');
else bad('poll race wiring');

if (/mountResultRace/.test(finalRx) && /Your choice/.test(finalRx)) ok('final reactions use shared race + your choice');
else bad('final reaction race');

if (/animateFills/.test(rx) && /is-mine/.test(rx)) ok('explore reactions race percentages and keep is-mine');
else bad('explore reaction race');

if (/lantern-result-reveal\.js/.test(explore)) ok('explore.html loads shared reveal');
else bad('explore script include');

if (!/18 votes|12 reactions|23 responses/.test(cardUi + finalRx + rx)) ok('no popularity-count copy in result UIs');
else bad('raw count copy remains');

console.log('\n--- result-reveal-225-test: ' + pass + ' passed, ' + fail + ' failed ---');
process.exit(fail ? 1 : 0);
