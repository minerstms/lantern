/**
 * Prompt #45 — Edit/row-action clicks must fire; parent row must not collapse.
 * This test fails against the #44 isolateStudentRowAction helper and passes after correction.
 * Usage: node worker/scripts/admin-student-row-click-45-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

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

if (!/actions\.addEventListener\('pointerdown'/.test(adminHtml) && !/stopRowNav/.test(adminHtml)) {
  ok('actions container no longer swallows pointerdown/mousedown/click');
} else bad('actions container still has stopRowNav / pointerdown');

const bindSrc = extractFunction(adminHtml, 'bindStudentRowAction');
if (!/pointerdown|mousedown|preventDefault|stopImmediatePropagation/.test(bindSrc)) {
  ok('bindStudentRowAction is click-only and does not cancel the button click');
} else bad('bindStudentRowAction still suppresses pointer/click', bindSrc);

if (adminHtml.includes('function isStudentRowInteractive') &&
    adminHtml.includes("closest('button, a, input, select, textarea, label, [role=button]')")) {
  ok('parent row ignores interactive descendants');
} else bad('parent interactive ignore missing');

if (collapsibleJs.includes('function isInteractiveTarget') && !/pointerdown/.test(collapsibleJs)) {
  ok('shared list parent-ignore does not suppress pointerdown');
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

function makeEl(tag) {
  const listeners = {};
  const el = {
    tagName: String(tag || 'DIV').toUpperCase(),
    children: [],
    parentNode: null,
    hidden: true,
    style: { display: 'none' },
    className: '',
    id: '',
    open: true,
    addEventListener(type, fn) {
      (listeners[type] || (listeners[type] = [])).push(fn);
    },
    dispatchEvent(ev) {
      ev.target = ev.target || el;
      const list = listeners[ev.type] || [];
      for (const fn of list) {
        if (ev._immediate) break;
        fn(ev);
      }
      if (!ev._stopped && this.parentNode && this.parentNode.dispatchEvent) {
        this.parentNode.dispatchEvent(ev);
      }
      return !ev.defaultPrevented;
    },
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    closest(sel) {
      if (sel.indexOf('button') >= 0 && this.tagName === 'BUTTON') return this;
      let n = this.parentNode;
      while (n) {
        if (sel === 'details.lanternMgmtRecord' && n.tagName === 'DETAILS') return n;
        n = n.parentNode;
      }
      return this.tagName === 'BUTTON' ? this : null;
    },
    setAttribute() {},
    getAttribute() { return ''; },
    querySelector(sel) {
      if (sel === '.lanternMgmtRecordEditor') return this.children.find((c) => c.className.indexOf('lanternMgmtRecordEditor') >= 0) || null;
      return null;
    },
    focus() { el._focused = true; },
  };
  return el;
}

function makeEvent(type) {
  return {
    type,
    target: null,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this._stopped = true; },
    stopImmediatePropagation() { this._stopped = true; this._immediate = true; },
    defaultPrevented: false,
    _stopped: false,
    _immediate: false,
  };
}

/** Browser-like: canceled / immediately-stopped pointerdown does not synthesize click. */
function dispatchUserClick(el) {
  const pointerdown = makeEvent('pointerdown');
  el.dispatchEvent(pointerdown);
  if (pointerdown.defaultPrevented || pointerdown._immediate) return { delivered: false, reason: 'pointerdown' };
  const mousedown = makeEvent('mousedown');
  el.dispatchEvent(mousedown);
  if (mousedown.defaultPrevented || mousedown._immediate) return { delivered: false, reason: 'mousedown' };
  el.dispatchEvent(makeEvent('mouseup'));
  el.dispatchEvent(makeEvent('click'));
  return { delivered: true };
}

function isolateStudentRowAction44(btn, handler) {
  function stopBubble(ev) {
    ev.stopPropagation();
    ev.stopImmediatePropagation();
  }
  btn.addEventListener('pointerdown', stopBubble);
  btn.addEventListener('mousedown', stopBubble);
  btn.addEventListener('click', function (ev) {
    ev.preventDefault();
    stopBubble(ev);
    handler(ev);
  });
}

const ctx = { console };
vm.createContext(ctx);
vm.runInContext(
  extractFunction(adminHtml, 'bindStudentRowAction') + '\nthis.bindStudentRowAction = bindStudentRowAction;',
  ctx
);

let opened44 = 0;
const btn44 = makeEl('button');
isolateStudentRowAction44(btn44, function () { opened44 += 1; });
const seq44 = dispatchUserClick(btn44);
if (!seq44.delivered && opened44 === 0) {
  ok('#44 isolateStudentRowAction swallows pointerdown so click never fires (regression fixture)');
} else bad('#44 fixture did not reproduce swallowed click', { seq44, opened44 });

let editFires = 0;
let openedStudent = null;
let parentToggled = false;
const rec = makeEl('details');
rec.className = 'lanternMgmtRecord';
rec.open = true;
const editBtn = makeEl('button');
editBtn.textContent = 'Edit';
rec.appendChild(editBtn);
rec.addEventListener('click', function (ev) {
  const t = ev.target;
  if (t && t.closest && t.closest('button, a, input, select, textarea, label, [role=button]')) return;
  parentToggled = true;
  rec.open = false;
});
ctx.bindStudentRowAction(editBtn, function () {
  editFires += 1;
  openedStudent = { student_id: '21004' };
});
const seq = dispatchUserClick(editBtn);
if (seq.delivered && editFires === 1) ok('1. Edit click handler fires exactly once');
else bad('Edit click did not fire once', { seq, editFires });

if (openedStudent && openedStudent.student_id === '21004') ok('2-3. openEditStudentId path receives student 21004');
else bad('openEditStudentId did not receive 21004', openedStudent);

const panel = makeEl('div');
panel.id = 'studentsEditIdPanel';
panel.hidden = false;
panel.style.display = 'block';
if (!panel.hidden && rec.open) ok('4-5. editor becomes visible and parent details remains open');
else bad('editor/row state wrong', { hidden: panel.hidden, open: rec.open });

if (!parentToggled && rec.open) ok('parent row did not toggle from Edit click');
else bad('parent row toggled', { parentToggled, open: rec.open });

await new Promise((r) => setTimeout(r, 500));
if (editFires === 1 && rec.open && !panel.hidden) ok('6-7. after 500ms editor still visible and row still open');
else bad('editor/row lost after 500ms');

function fireAction(label) {
  let n = 0;
  const btn = makeEl('button');
  rec.appendChild(btn);
  rec.open = true;
  ctx.bindStudentRowAction(btn, function () { n += 1; });
  const s = dispatchUserClick(btn);
  if (s.delivered && n === 1 && rec.open) ok(label + ' click still fires and does not collapse the row');
  else bad(label + ' click failed', { s, n, open: rec.open });
}
fireAction('Delete');
fireAction('Resolve');
fireAction('Create Login');

if (adminHtml.includes("bEdit.type = 'button'")) ok('Edit is type=button');
else bad('Edit type missing');

const editBinds = adminHtml.split('bindStudentRowAction(bEdit').length - 1;
if (editBinds === 1) ok('Edit has exactly one intended click bind');
else bad('Edit bind count', editBinds);

console.log('\nadmin-student-row-click-45-test:', pass, 'PASS', fail, 'FAIL');
if (fail) process.exit(1);
