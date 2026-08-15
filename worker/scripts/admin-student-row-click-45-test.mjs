/**
 * Prompt #45 leftover checks — #46 replaced per-button binds with delegation.
 * Usage: node worker/scripts/admin-student-row-click-45-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const adminHtml = fs.readFileSync(path.join(root, 'app/admin.html'), 'utf8');
const collapsibleJs = fs.readFileSync(path.join(root, 'app/js/lantern-collapsible-list.js'), 'utf8');

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

if (!adminHtml.includes('function isolateStudentRowAction') && !adminHtml.includes('isolateStudentRowAction(')) {
  ok('#44 isolateStudentRowAction removed');
} else bad('#44 isolateStudentRowAction still present');

if (!adminHtml.includes('function bindStudentRowAction') && !adminHtml.includes('bindStudentRowAction(')) {
  ok('#45 per-button bindStudentRowAction removed');
} else bad('bindStudentRowAction still present');

if (!/actions\.addEventListener\('pointerdown'/.test(adminHtml) && !/stopRowNav/.test(adminHtml)) {
  ok('actions container no longer swallows pointerdown/mousedown/click');
} else bad('actions container still has stopRowNav / pointerdown');

if (adminHtml.includes('function onAdminStudentActionCapture') &&
    adminHtml.includes("document.addEventListener('click', onAdminStudentActionCapture, true)") &&
    adminHtml.includes("studentRowActionAttrs(s, 'edit')")) {
  ok('#47 document capture is the single student-row dispatch path');
} else bad('document capture dispatcher missing');

if (collapsibleJs.includes("[data-student-action]") &&
    collapsibleJs.includes('function isInteractiveTarget') &&
    !/pointerdown/.test(collapsibleJs)) {
  ok('shared list ignores [data-student-action] without pointerdown suppression');
} else bad('shared list still uses pointerdown suppression');

if (adminHtml.includes('var studentEditorState') &&
    adminHtml.includes('if (studentEditorState.open) return;') &&
    adminHtml.includes('keepStudentEditorOpen') &&
    adminHtml.includes('preventScroll: true')) {
  ok('#44 stay-open / refresh guard / preventScroll preserved');
} else bad('#44 stay-open guards missing');

const saveFn = extractFunction(adminHtml, 'saveStudentIdEdit');
if (saveFn.includes('studentEditSaveAccepted') &&
    saveFn.indexOf("showStudentsRosterMsg(msg, 'err')") < saveFn.indexOf('closeStudentsEditPanels()')) {
  ok('#42/#43 verified Save still closes only after success; failure leaves editor open');
} else bad('save lifecycle regressed');

if (adminHtml.includes('type="button" data-student-action="edit"') ||
    adminHtml.includes("studentRowActionAttrs(s, 'edit')")) {
  ok('Edit is type=button via shared row-action attrs');
} else bad('Edit type missing');

console.log('\nadmin-student-row-click-45-test:', pass, 'PASS', fail, 'FAIL');
if (fail) process.exit(1);
