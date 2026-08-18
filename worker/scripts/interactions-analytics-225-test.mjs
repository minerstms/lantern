/**
 * Prompt #225 — Interactions Analytics classification and admin-only wiring.
 * Usage: node worker/scripts/interactions-analytics-225-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { classifyEarnKind, classifySpendKind, toSqlTimestamp, rangeCutoff } from '../interactions-analytics.js';

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

if (classifyEarnKind('lantern_mission_reward', 'fight_song', '') === 'Fight Song') ok('Fight Song earn mapping');
else bad('Fight Song');
if (classifyEarnKind('mission', 'srp', 'SRP quiz') === 'SRP') ok('SRP earn mapping');
else bad('SRP');
if (classifyEarnKind('handbook', 'perm_handbook_trivia', '') === 'Handbook') ok('Handbook earn mapping');
else bad('Handbook');
if (classifyEarnKind('lantern_mission_reward', 'mission', 'accepted') === 'Missions') ok('Missions earn mapping');
else bad('Missions');
if (classifyEarnKind('manual', 'seed', 'old row') === 'Other / Unclassified') ok('unknown earn stays unclassified');
else bad('unclassified earn');
if (classifySpendKind('game_play', 'games', 'Avatar Match') === 'Games') ok('game spend mapping');
else bad('game spend');
if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(toSqlTimestamp(new Date())) && !toSqlTimestamp(new Date()).includes('T')) {
  ok('analytics cutoffs use SQLite timestamps');
} else bad('sql timestamp');
if (rangeCutoff('today').since && rangeCutoff('today').since.indexOf('T') < 0) ok('today cutoff is SQLite-format');
else bad('today cutoff');

const indexSrc = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
const adminBlock = indexSrc.slice(indexSrc.indexOf('async function handleAdminRoutes'));
if (
  /role \|\| ''\)\.trim\(\)\.toLowerCase\(\) !== 'admin'/.test(adminBlock.slice(0, 800)) &&
  /\/api\/admin\/interactions-analytics/.test(adminBlock)
) {
  ok('analytics route is inside existing admin-role gate');
} else bad('analytics route auth placement');

const adminHtml = fs.readFileSync(path.join(root, 'app/admin.html'), 'utf8');
if (/adminInteractionsAnalyticsCard/.test(adminHtml) && /Today/.test(adminHtml) && /All Time/.test(adminHtml) && !/<details[^>]+adminInteractionsAnalyticsCard/.test(adminHtml)) {
  ok('admin.html has always-visible Interactions Analytics + period chips');
} else bad('admin analytics UI');
if (!/mountResultRace/.test(adminHtml) && !/lantern-result-reveal/.test(adminHtml)) {
  ok('admin dashboard does not use poll race animation');
} else bad('admin must not use race reveal');
if (/role !== 'admin'/.test(adminHtml)) ok('admin.html remains admin-role gated');
else bad('admin page gate');

const teacherHtml = fs.readFileSync(path.join(root, 'app/teacher.html'), 'utf8');
if (!/interactions-analytics/.test(teacherHtml)) ok('teacher tools do not expose this analytics page');
else bad('teacher leak');

console.log('\n--- interactions-analytics-225-test: ' + pass + ' passed, ' + fail + ' failed ---');
process.exit(fail ? 1 : 0);
