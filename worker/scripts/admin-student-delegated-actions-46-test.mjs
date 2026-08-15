/**
 * Prompt #46 leftover checks — #47 replaced roster-body delegation with document capture.
 * Usage: node worker/scripts/admin-student-delegated-actions-46-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const adminHtml = fs.readFileSync(path.join(root, 'app/admin.html'), 'utf8');

let pass = 0;
let fail = 0;
function ok(label) {
  pass++;
  console.log('PASS', label);
}
function bad(label, detail) {
  fail++;
  console.error('FAIL', label, detail != null ? detail : '');
}

function extractFunction(src, name) {
  const needle = 'function ' + name + '(';
  const start = src.indexOf(needle);
  if (start < 0) throw new Error('missing ' + name);
  const brace = src.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error('unclosed ' + name);
}

if (!adminHtml.includes('function bindStudentRowAction') && !adminHtml.includes('bindStudentRowAction(')) {
  ok('per-button bindStudentRowAction is gone');
} else bad('bindStudentRowAction still present');

if (!adminHtml.includes('function onStudentsRosterClick') &&
    !adminHtml.includes('function wireStudentRosterActions') &&
    adminHtml.includes("document.addEventListener('click', onAdminStudentActionCapture, true)")) {
  ok('#47 document capture replaced the #46 roster-body dispatcher');
} else bad('competing or missing dispatcher');

if (adminHtml.includes("studentRowActionAttrs(s, 'edit')") &&
    adminHtml.includes("studentRowActionsHtml(s)") &&
    !/pointerdown|stopImmediatePropagation/.test(extractFunction(adminHtml, 'onAdminStudentActionCapture'))) {
  ok('Edit markup uses data-student-action; capture does not suppress pointerdown');
} else bad('Edit markup / dispatcher unsafe');

const requiredActions = ['edit', 'resolve', 'set-id', 'resolve-duplicate', 'delete', 'archive', 'create-login', 'link-existing', 'reset-password', 'manage-avatar', 'archive-login', 'restore-login'];
const missing = requiredActions.filter((a) => !adminHtml.includes("'" + a + "'") && !adminHtml.includes('"' + a + '"'));
if (!missing.length) ok('all student row actions share the same dispatcher');
else bad('missing actions', missing.join(','));

if (adminHtml.includes('Could not open this student record. Refresh and try again.')) {
  ok('failed lookup shows a visible error');
} else bad('silent failure still possible');

if (adminHtml.includes('if (studentEditorState.open) return;') && adminHtml.includes('keepStudentEditorOpen')) {
  ok('#44 editor stay-open / rerender guard preserved');
} else bad('stay-open guard missing');

const saveFn = extractFunction(adminHtml, 'saveStudentIdEdit');
if (saveFn.includes('studentEditSaveAccepted') &&
    saveFn.indexOf("showStudentsRosterMsg(msg, 'err')") < saveFn.indexOf('closeStudentsEditPanels()')) {
  ok('#42/#43 verified Save path unchanged');
} else bad('save path changed');

console.log('\nadmin-student-delegated-actions-46-test:', pass, 'PASS', fail, 'FAIL');
if (fail) process.exit(1);
