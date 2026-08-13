/**
 * Prompt #153 — Trinidad, Colorado history bank parity + geography safety.
 * Usage: node worker/scripts/trinidad-history-bank-153-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import { HANDBOOK_TRIVIA_BANK, LOCAL_HISTORY_TRIVIA_BANK } from '../educational-trivia-banks.js';
import { pickNextQuestion } from '../educational-trivia-missions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '../..');
let pass = 0;
let fail = 0;
function ok(msg) { pass++; console.log('OK', msg); }
function bad(msg, detail) { fail++; console.error('FAIL', msg, detail != null ? detail : ''); }
function assert(cond, msg, detail) {
  if (cond) ok(msg);
  else bad(msg, detail);
}

const contentJs = fs.readFileSync(path.join(root, 'app/js/lantern-game-content.js'), 'utf8');
const sandbox = { window: {}, Math, console };
sandbox.globalThis = sandbox.window;
vm.runInNewContext(contentJs, sandbox);
const frontend = sandbox.window.LANTERN_GAME_CONTENT;
const client = frontend.getLocalHistoryQuestions();
const worker = LOCAL_HISTORY_TRIVIA_BANK;

assert(client.length === 50, '1. Trinidad client bank = 50', client.length);
assert(worker.length === 50, '2. Trinidad Worker bank = 50', worker.length);

function norm(q) {
  return {
    id: String(q.id || ''),
    question: String(q.question || ''),
    options: (q.options || []).map((o) => String(o)),
    correctIndex: Number(q.correctIndex),
    explanation: String(q.explanation || ''),
  };
}
const clientN = client.map(norm);
const workerN = worker.map(norm);
assert(JSON.stringify(clientN) === JSON.stringify(workerN), '3. exact bank parity (id/question/choices/correct/explanation)');

const ids = client.map((q) => q.id);
assert(new Set(ids).size === 50, '8. no duplicate IDs');
assert(ids.every((id, i) => id === 'lh' + (i + 1)), 'stable IDs lh1–lh50');

const questions = client.map((q) => String(q.question || '').trim());
assert(new Set(questions).size === 50, '7. no duplicate questions');

assert(client.every((q) => Array.isArray(q.options) && q.options.length === 4), '4. four choices each');
assert(client.every((q) => Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex < 4), '5. one correct answer each');
assert(client.every((q) => String(q.explanation || '').trim().length > 0), '6. explanation each');

const blob = JSON.stringify(client) + JSON.stringify(worker);
assert(!/tobago/i.test(blob), '9. no Tobago');
assert(!/caribbean/i.test(blob), '10. no Caribbean');
assert(!/port of spain/i.test(blob), '11. no Port of Spain');
assert(!/west indies/i.test(blob), '12. no West Indies');
assert(!/trinidad and tobago/i.test(blob), 'no Trinidad and Tobago');

const filler = [
  'Why is community pride important at school?',
  'What can we do to show school pride?',
  'What makes a school a good place to learn?',
];
assert(filler.every((q) => !questions.includes(q)), '13. no old generic school-pride filler');

assert(client[0].question === 'What bluff overlooks Trinidad from the north?', 'Q1 Simpson\'s Rest');
assert(client[4].question === 'Which famous flat-topped peak stands near Trinidad?', 'Q5 Fishers Peak');
assert(client[5].options[2] === 'Purgatoire River', 'Q6 Purgatoire');
assert(client[8].options[1] === 'Trinidad Lake', 'Q9 Trinidad Lake');
assert(client[20].options[1] === 'Santa Fe Trail', 'Q21 Santa Fe Trail');
assert(client[23].options[0] === 'Raton Pass', 'Q24 Raton Pass');
assert(client[46].options[2] === 'Bat Masterson', 'Q47 Bat Masterson');
assert(client[36].options[1] === 'The Ludlow Massacre', 'Q37 Ludlow');
assert(client[32].options[2] === 'Cokedale', 'Q33 Cokedale');
assert(client[29].options[0] === 'Colorado Highway 12', 'Q30 Highway of Legends');

const hbFe = frontend.getHandbookQuestions();
assert(hbFe.length === 50 && JSON.stringify(hbFe) === JSON.stringify(HANDBOOK_TRIVIA_BANK), '14. Handbook content unchanged vs Worker copy');
assert(hbFe[0].question === 'You are sick and have to miss school. What should happen?', 'Handbook Q1 wording');
assert(hbFe[49].id === 'hb50', 'Handbook still 50');

const asked = [];
const seen = new Set();
let last = '';
for (let i = 0; i < 50; i++) {
  const next = pickNextQuestion(worker, asked, last);
  assert(!!next && !seen.has(next.id), '12. unique until pool exhausted #' + (i + 1), next && next.id);
  seen.add(next.id);
  asked.push(next.id);
  last = next.id;
}
const after = pickNextQuestion(worker, asked, last);
assert(!!after && after.id !== last, '12b. reuse/shuffle only after exhausting the 50');

console.log('\nTrinidad history bank #153:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
