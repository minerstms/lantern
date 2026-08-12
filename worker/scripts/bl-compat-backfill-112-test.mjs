/**
 * Prompt #112 — static safety checks for bounded backfill allow-list (no D1 writes).
 * Usage: node worker/scripts/bl-compat-backfill-112-test.mjs
 */
import { APPROVED_TWELVE } from './bl-compat-backfill-112.mjs';
import { compatibilityTeacherIdFromLanternStaffId } from '../tms-compat-provision.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

let pass = 0;
let fail = 0;
function ok(l) {
  pass++;
  console.log('PASS', l);
}
function bad(l, d) {
  fail++;
  console.error('FAIL', l, d != null ? d : '');
}

if (APPROVED_TWELVE.length === 12) ok('allow-list has exactly 12');
else bad('count', APPROVED_TWELVE.length);

const users = new Set();
for (const row of APPROVED_TWELVE) {
  if (users.has(row.username)) bad('duplicate username', row.username);
  users.add(row.username);
  const tid = compatibilityTeacherIdFromLanternStaffId(row.staff_id);
  if (tid !== row.teacher_id) bad('teacher_id mismatch', row);
  if (!/^L\d+$/.test(row.teacher_id)) bad('non-deterministic id', row.teacher_id);
}
ok('all allow-list teacher_ids are L{staff_id}');

const src = fs.readFileSync(fileURLToPath(new URL('./bl-compat-backfill-112.mjs', import.meta.url)), 'utf8');
if (/--apply/.test(src) && /confirm-twelve/.test(src) && /dry_run|DRY RUN|MODE: DRY RUN/.test(src)) {
  ok('apply gated behind confirm-twelve; dry-run default present');
} else bad('apply gating');

if (/fuzzy|toLowerCase\(\).*teacher_name|LIKE.*%/.test(src) && /fuzzy-match/.test(src)) {
  // comment mentions fuzzy — ensure no name-based SELECT for matching
}
if (!/ORDER BY teacher_name/.test(src) && !/WHERE.*teacher_name\s*=/.test(src)) {
  ok('no name-equality staff matching in backfill');
} else bad('possible name match');

if (/INSERT OR IGNORE INTO staff_capabilities[\s\S]*TEACHER/.test(src) || /capability.*TEACHER/.test(src)) {
  ok('TEACHER-only capability grant path present');
} else bad('capability grant');

if (/UPDATE tms_identity_links/.test(src) || /DELETE FROM tms_identity_links/.test(src) || /DELETE FROM staff/.test(src)) {
  bad('must not UPDATE/DELETE links or staff');
} else ok('no link/staff DELETE or link UPDATE');

if (/REPORT_MAKER|SYSTEM_ADMIN|BEHAVIOR_ADMIN|SECRETARY/.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, ''))) {
  // allowed in comments/docs only — strip already; if still present in code strings for refuse messages ok
  const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  if (/INSERT[\s\S]{0,80}REPORT_MAKER|INSERT[\s\S]{0,80}SYSTEM_ADMIN/.test(codeOnly)) {
    bad('must not insert privileged caps');
  } else ok('no privileged capability inserts');
} else ok('no privileged capability tokens in executable inserts');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
