/**
 * Prompt #166 — SRP Safety Challenge bank parity, coverage, and source manifest.
 * Usage: node worker/scripts/srp-safety-bank-166-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import { HANDBOOK_TRIVIA_BANK, LOCAL_HISTORY_TRIVIA_BANK, SRP_SAFETY_TRIVIA_BANK } from '../educational-trivia-banks.js';
import { getEducationalTriviaBank } from '../educational-trivia-missions.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

const src = fs.readFileSync(path.join(root, 'app/js/lantern-game-content.js'), 'utf8');
const sandbox = { window: {}, Math, console };
sandbox.globalThis = sandbox.window;
vm.runInNewContext(src, sandbox);
const frontend = sandbox.window.LANTERN_GAME_CONTENT;
const client = frontend.getSrpSafetyQuestions();
const worker = SRP_SAFETY_TRIVIA_BANK;
const viaLookup = getEducationalTriviaBank('srp-safety-trivia');

if (client.length === 30) ok('1. client count = 30');
else bad('1. client count = 30', client.length);

if (worker.length === 30) ok('2. Worker count = 30');
else bad('2. Worker count = 30', worker.length);

if (JSON.stringify(client) === JSON.stringify(worker) && JSON.stringify(worker) === JSON.stringify(viaLookup)) {
  ok('3. client/Worker/lookup banks match');
} else bad('3. client/Worker/lookup banks match');

const ids = worker.map((q) => q.id);
if (ids.length === new Set(ids).size && ids.every((id, i) => id === 'srp' + (i + 1))) {
  ok('4. stable unique IDs srp1–srp30');
} else bad('4. stable unique IDs', ids);

const stems = worker.map((q) => q.question);
if (stems.length === new Set(stems).size) ok('5. no duplicate question stems');
else bad('5. duplicate stems');

let fourChoices = true;
let oneCorrect = true;
let hasExplain = true;
let hasSource = true;
worker.forEach((q) => {
  if (!Array.isArray(q.options) || q.options.length !== 4) fourChoices = false;
  if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex > 3) oneCorrect = false;
  if (!q.explanation || !String(q.explanation).trim()) hasExplain = false;
  if (!q.source_section || !String(q.source_section).trim()) hasSource = false;
});
if (fourChoices) ok('6. exactly four choices each');
else bad('6. four choices');
if (oneCorrect) ok('7. exactly one correct index each');
else bad('7. correct index');
if (hasExplain) ok('8. explanation each');
else bad('8. explanation');
if (hasSource) ok('9. source metadata each');
else bad('9. source metadata');

const blob = JSON.stringify(worker);
const hold = worker.filter((q) => /Hold/.test(q.source_section) || /Hold/.test(q.question));
const secure = worker.filter((q) => /Secure/.test(q.source_section) || /Secure/.test(q.question));
const lockdown = worker.filter((q) => /Lockdown/.test(q.source_section) || /Lockdown/.test(q.question));
const evacuate = worker.filter((q) => /Evacuate/.test(q.source_section) || /Evacuate/.test(q.question));
const shelter = worker.filter((q) => /Shelter/.test(q.source_section) || /Shelter/.test(q.question));
if (hold.length && secure.length && lockdown.length && evacuate.length && shelter.length) {
  ok('10. all five SRP actions represented');
} else bad('10. five actions', { hold: hold.length, secure: secure.length, lockdown: lockdown.length, evacuate: evacuate.length, shelter: shelter.length });

if (hold.length >= 5) ok('11. Hold questions present');
else bad('11. Hold', hold.length);
if (secure.length >= 5) ok('12. Secure questions present');
else bad('12. Secure', secure.length);
if (lockdown.length >= 5) ok('13. Lockdown questions present');
else bad('13. Lockdown', lockdown.length);
if (evacuate.length >= 4) ok('14. Evacuate questions present');
else bad('14. Evacuate', evacuate.length);
if (shelter.length >= 4) ok('15. Shelter questions present');
else bad('15. Shelter', shelter.length);

const scenarios = worker.filter((q) => /staff|announce|neighborhood|hallway empty|problem outside|threat inside/i.test(q.question));
if (scenarios.length >= 6) ok('16. scenario questions present');
else bad('16. scenarios', scenarios.length);

if (
  worker.some((q) => /main difference between Secure and Lockdown/i.test(q.question)) &&
  worker.some((q) => /Should students treat it the same as Lockdown/i.test(q.question)) &&
  /danger outside/i.test(blob) &&
  /danger inside/i.test(blob)
) {
  ok('17. Secure/Lockdown distinction tested');
} else bad('17. Secure vs Lockdown');

if (!/improvised weapon|room-clearing|confront an attacker|search for threats|fight the|weapon tactic/i.test(blob)) {
  ok('18. no tactical-combat advice');
} else bad('18. tactical language found');

if (!/TMS|Trinidad Middle|bus barn|reunification site|north parking lot|west lot/i.test(blob)) {
  ok('19/20. no invented local evacuation or reunification site');
} else bad('19/20. local site invented');

if (!/confront a threat|search for or confront/i.test(blob) === false && worker.some((q) => q.id === 'srp18' && q.correctIndex === 3)) {
  ok('21. no student weapon/confrontation instruction (correct answer rejects it)');
} else if (worker.find((q) => q.id === 'srp18').correctIndex === 3) {
  ok('21. no student weapon/confrontation instruction (correct answer rejects it)');
} else bad('21. confrontation');

if (HANDBOOK_TRIVIA_BANK.length === 50 && LOCAL_HISTORY_TRIVIA_BANK.length === 50) {
  ok('43/44. Handbook and Trinidad banks unchanged in length');
} else bad('43/44 handbook/trinidad length');

if (JSON.stringify(frontend.getHandbookQuestions()) === JSON.stringify(HANDBOOK_TRIVIA_BANK)) {
  ok('Handbook client/Worker stringify unchanged');
} else bad('Handbook stringify drifted');

if (JSON.stringify(frontend.getLocalHistoryQuestions()) === JSON.stringify(LOCAL_HISTORY_TRIVIA_BANK)) {
  ok('Trinidad client/Worker stringify unchanged');
} else bad('Trinidad stringify drifted');

console.log('\n--- SRP source/provenance manifest ---');
worker.forEach((q) => {
  const topic = String(q.source_section || '').split('—')[0].trim() || q.category;
  console.log(q.id + '\t' + topic + '\t' + q.source_section);
});

if (!/all of the above|none of the above/i.test(blob)) ok('no all/none of the above');
else bad('all/none of the above');

console.log('\nSRP Safety bank #166:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
