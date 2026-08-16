/**
 * Prompt #239 — 7 Habits bank validator and content-quality audit.
 * Usage: node worker/scripts/seven-habits-bank-239-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  SEVEN_HABITS_TRIVIA_BANK,
  SEVEN_HABITS_NAMES,
  validateSevenHabitsBank,
} from '../seven-habits-trivia-bank.js';
import { HANDBOOK_TRIVIA_BANK, LOCAL_HISTORY_TRIVIA_BANK, SRP_SAFETY_TRIVIA_BANK } from '../educational-trivia-banks.js';
import { getEducationalTriviaBank } from '../educational-trivia-missions.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

const bank = SEVEN_HABITS_TRIVIA_BANK;
const viaLookup = getEducationalTriviaBank('seven-habits-trivia');
const report = validateSevenHabitsBank(bank);

if (report.ok) ok('validator: 84 / 12 per habit / 6+6 types / unique ids / no blanks');
else bad('validator', report.errors);

if (JSON.stringify(bank) === JSON.stringify(viaLookup)) ok('getEducationalTriviaBank returns the same bank');
else bad('lookup mismatch');

const ids = bank.map((q) => q.id);
if (ids.every((id) => /^7h_(bp|em|ff|ww|su|sy|ss)_[ra][1-6]$/.test(id))) ok('stable id pattern 7h_<habit>_<r|a><1-6>');
else bad('id pattern', ids.filter((id) => !/^7h_(bp|em|ff|ww|su|sy|ss)_[ra][1-6]$/.test(id)));

const blob = JSON.stringify(bank);
if (!/\bTODO\b|\bTBD\b|\.\.\./.test(blob)) ok('no TODO / TBD / ellipsis placeholders');
else bad('placeholders found');

if (!/franklincovey|leader in me|emotional bank account|circle of (influence|concern)|private victory|public victory/i.test(blob)) {
  ok('no FranklinCovey / Leader in Me proprietary language');
} else bad('proprietary language');

const stems = bank.map((q) => String(q.question || '').trim().toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' '));
if (stems.length === new Set(stems).size) ok('no duplicate normalized stems');
else bad('duplicate stems');

const pos = [0, 0, 0, 0];
bank.forEach((q) => { pos[q.correctIndex] += 1; });
if (pos.every((n) => n >= 12 && n <= 30)) ok('correct-answer positions reasonably balanced ' + pos.join('/'));
else bad('correct-answer clustering', pos);

const whichHabit = bank.filter((q) => /which habit/i.test(q.question)).length;
if (whichHabit <= 28) ok('not dominated by "Which habit" stems (' + whichHabit + ')');
else bad('too many which-habit stems', whichHabit);

const app = bank.filter((q) => q.qtype === 'application');
const appIdentifyOnly = app.filter((q) => /which habit/i.test(q.question)).length;
if (appIdentifyOnly === 0) ok('application questions are not habit-name identification');
else bad('application identify-only', appIdentifyOnly);

const longRare = [];
bank.forEach((q) => {
  String(q.question + ' ' + (q.options || []).join(' ') + ' ' + q.explanation)
    .split(/[^A-Za-z]+/)
    .forEach((w) => {
      if (w.length >= 14 && !/Understood|Sharpen|Synergize|Proactive/.test(w)) longRare.push(q.id + ':' + w);
    });
});
if (longRare.length <= 8) ok('reading level: few long uncommon words');
else bad('many long words', longRare);

console.log('\nHabit | Recognition | Application | Total');
SEVEN_HABITS_NAMES.forEach((h) => {
  const rec = report.habitCounts[h].recognition;
  const ap = report.habitCounts[h].application;
  console.log(h + ' | ' + rec + ' | ' + ap + ' | ' + (rec + ap));
});
console.log('TOTAL | ' + report.recTotal + ' | ' + report.appTotal + ' | ' + bank.length);

if (HANDBOOK_TRIVIA_BANK.length === 50 && LOCAL_HISTORY_TRIVIA_BANK.length === 50 && SRP_SAFETY_TRIVIA_BANK.length === 30) {
  ok('existing educational banks unchanged in length');
} else bad('existing bank lengths drifted');

const contentSrc = fs.readFileSync(path.join(root, 'app/js/lantern-game-content.js'), 'utf8');
if (!contentSrc.includes('7h_bp_r1') && !contentSrc.includes('7h_ss_a6')) {
  ok('client game-content does not ship the 7 Habits answer bank');
} else bad('client bank leaked 7 Habits answers');

console.log('\n7 Habits bank #239:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
