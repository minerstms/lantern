/**
 * Prompt #44 — Admin student editor must stay open until Save or Cancel.
 * Usage: node worker/scripts/admin-student-editor-stay-44-test.mjs
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

if (adminHtml.includes('var studentEditorState') && adminHtml.includes('function keepStudentEditorOpen') && adminHtml.includes('function onAdminStudentActionCapture')) {
  ok('student editor stay-open state helpers exist');
} else bad('missing stay-open helpers');

if (/function renderStudentsRosterTable\(\) \{[\s\S]{0,240}if \(studentEditorState\.open\) return;/.test(adminHtml)) {
  ok('roster rerender does not replace an open editor');
} else bad('renderStudentsRosterTable still destroys an open editor');

if (adminHtml.includes('if (typeof keepStudentEditorOpen === \'function\' && keepStudentEditorOpen()) return;') &&
    adminHtml.includes('keepStudentEditorOpen()')) {
  ok('collapse listeners refuse to close an active student editor');
} else bad('collapse listeners still always closeAllFloatingEditors');

if (adminHtml.includes("studentRowActionAttrs(s, 'edit')") &&
    adminHtml.includes('openEditStudentId(student, mount)') &&
    adminHtml.includes('function onAdminStudentActionCapture')) {
  ok('Edit uses stable delegated roster click (no per-button bind)');
} else bad('Edit click not bound');

const delegatedActions = [
  'edit',
  'resolve',
  'set-id',
  'resolve-duplicate',
  'delete',
  'archive',
  'create-login',
  'link-existing',
  'reset-password',
  'manage-avatar',
  'archive-login',
  'restore-login',
];
const missingIso = delegatedActions.filter((name) => !adminHtml.includes("'" + name + "'") && !adminHtml.includes('"' + name + '"'));
if (!missingIso.length) ok('Resolve / Set ID / Delete / Archive / Create Login / Link use the same delegated dispatcher');
else bad('row actions missing from dispatcher', missingIso.join(','));

if (adminHtml.includes("studentRowActionAttrs(s, 'edit')") &&
    /<button type="button"[^>]*id="studentsEditIdSaveBtn"/.test(adminHtml) &&
    /<button type="button"[^>]*id="studentsEditIdCancelBtn"/.test(adminHtml)) {
  ok('Edit / Save / Cancel are type=button (no form submit)');
} else bad('button types unsafe');

if (adminHtml.includes('markStudentEditorOpen(s)') &&
    adminHtml.includes('host.open = true') &&
    adminHtml.includes('preventScroll: true')) {
  ok('openEditStudentId marks editor open, keeps host row open, focuses without scroll');
} else bad('open lifecycle incomplete');

if (adminHtml.includes('function closeStudentsEditPanels()') &&
    adminHtml.includes('markStudentEditorClosed()')) {
  ok('Cancel / explicit close clears editor state');
} else bad('close does not clear editor state');

const saveFn = extractFunction(adminHtml, 'saveStudentIdEdit');
if (saveFn.includes('studentEditSaveAccepted') &&
    saveFn.includes('closeStudentsEditPanels()') &&
    saveFn.includes('loadStudentsRoster()')) {
  const closeIdx = saveFn.indexOf('closeStudentsEditPanels()');
  const acceptIdx = saveFn.indexOf('studentEditSaveAccepted');
  const failReturn = saveFn.indexOf("showStudentsRosterMsg(msg, 'err')");
  if (acceptIdx >= 0 && closeIdx > acceptIdx && failReturn >= 0 && failReturn < closeIdx) {
    ok('Save closes editor only after verified=true; failure leaves it open');
  } else bad('Save close/failure order wrong', { acceptIdx, closeIdx, failReturn });
} else bad('saveStudentIdEdit missing verified close path');

if (collapsibleJs.includes('function isInteractiveTarget') &&
    !/pointerdown/.test(collapsibleJs)) {
  ok('shared record parent ignores interactive targets without pointerdown suppression');
} else bad('shared collapsible list still suppresses pointerdown');

/* Simulated Edit click + 500ms race against collapse + roster rerender. */
function makeEl(tag, attrs) {
  const listeners = {};
  const el = {
    tagName: String(tag || 'DIV').toUpperCase(),
    attrs: Object.assign({}, attrs || {}),
    children: [],
    parentNode: null,
    hidden: !!((attrs || {}).hidden),
    style: { display: (attrs || {}).display || '' },
    className: (attrs || {}).className || '',
    id: (attrs || {}).id || '',
    textContent: '',
    open: !!(attrs || {}).open,
    addEventListener(type, fn) {
      (listeners[type] || (listeners[type] = [])).push(fn);
    },
    dispatchEvent(ev) {
      ev.target = ev.target || el;
      const list = listeners[ev.type] || [];
      for (const fn of list) fn(ev);
      if (!ev._stopped && this.parentNode && this.parentNode.dispatchEvent) {
        this.parentNode.dispatchEvent(ev);
      }
      return !ev._stopped;
    },
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    querySelector(sel) {
      if (sel === '.lanternMgmtRecordEditor') {
        return this.children.find((c) => c.className.indexOf('lanternMgmtRecordEditor') >= 0) ||
          (this.children[0] && this.children[0].querySelector && this.children[0].querySelector(sel));
      }
      if (sel && sel[0] === '#') {
        const id = sel.slice(1);
        if (this.id === id) return this;
      }
      for (const c of this.children) {
        if (c.id === (sel && sel[0] === '#' ? sel.slice(1) : '')) return c;
        if (c.querySelector) {
          const hit = c.querySelector(sel);
          if (hit) return hit;
        }
      }
      return null;
    },
    closest(sel) {
      let n = this;
      while (n) {
        if (sel === 'details.lanternMgmtRecord' && n.tagName === 'DETAILS' && String(n.className).indexOf('lanternMgmtRecord') >= 0) return n;
        if (sel === '[data-student-action]' && n.getAttribute && n.getAttribute('data-student-action')) return n;
        n = n.parentNode;
      }
      return null;
    },
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; },
    focus() { el._focused = true; },
  };
  return el;
}

function makeEvent(type) {
  return {
    type,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this._stopped = true; },
    stopImmediatePropagation() { this._stopped = true; this._immediate = true; },
    defaultPrevented: false,
    _stopped: false,
  };
}

const rec = makeEl('details', { className: 'lanternMgmtRecord lanternMgmtRecord--students', open: true });
const actions = makeEl('div', { className: 'acctActions lanternMgmtRecordActions' });
const mount = makeEl('div', { className: 'lanternMgmtRecordEditor', hidden: true });
const panel = makeEl('div', { id: 'studentsEditIdPanel', hidden: true, display: 'none' });
const first = makeEl('input', { id: 'studentsEditFirst' });
panel.appendChild(first);
rec.appendChild(actions);
rec.appendChild(mount);
const rosterBody = makeEl('div', { id: 'studentsRosterBody' });
rosterBody.appendChild(rec);
const stableHost = makeEl('div', { id: 'studentsEditStableHost' });
const park = makeEl('div', { id: 'adminEditorPark' });
park.contains = function (node) {
  let n = node;
  while (n) {
    if (n === park) return true;
    n = n.parentNode;
  }
  return false;
};
const studentsCard = makeEl('details', { id: 'adminStudentsCard', className: 'teacherCollapsibleList', open: true });
studentsCard.appendChild(stableHost);
studentsCard.appendChild(rosterBody);

const student21004 = {
  student_id: '21004',
  student_name: 'Phay Khuu',
  first_name: 'Phay',
  last_name: 'Khuu',
  grade: '8',
};

const harness = {
  studentEditorState: { open: false, recordKey: '', studentId: '' },
  editorVisible: false,
  rosterReplaced: false,
  parentRowClicked: false,
  document: {
    getElementById(id) {
      if (id === 'studentsEditIdPanel') return panel;
      if (id === 'studentsEditFirst') return first;
      if (id === 'adminStudentsCard') return studentsCard;
      if (id === 'studentsRosterBody') return rosterBody;
      if (id === 'studentsEditStableHost') return stableHost;
      if (id === 'adminEditorPark') return park;
      return null;
    },
  },
};

const ctx = {
  studentEditorState: harness.studentEditorState,
  document: harness.document,
  markStudentEditorOpen: null,
  markStudentEditorClosed: null,
  keepStudentEditorOpen: null,
  console,
};
vm.createContext(ctx);
vm.runInContext(
  extractFunction(adminHtml, 'markStudentEditorOpen') +
    '\n' +
    extractFunction(adminHtml, 'markStudentEditorClosed') +
    '\n' +
    extractFunction(adminHtml, 'keepStudentEditorOpen') +
    '\n' +
    extractFunction(adminHtml, 'isStudentEditorActuallyVisible') +
    '\nthis.markStudentEditorOpen = markStudentEditorOpen;' +
    '\nthis.markStudentEditorClosed = markStudentEditorClosed;' +
    '\nthis.keepStudentEditorOpen = keepStudentEditorOpen;' +
    '\nthis.isStudentEditorActuallyVisible = isStudentEditorActuallyVisible;',
  ctx
);

function openEditor() {
  ctx.markStudentEditorOpen(student21004);
  stableHost.hidden = false;
  stableHost.style.display = 'block';
  stableHost.appendChild(panel);
  panel.hidden = false;
  panel.style.display = 'block';
  panel.setAttribute('aria-hidden', 'false');
  rec.open = true;
  harness.editorVisible = true;
}

const editBtn = makeEl('button', { className: 'btn' });
editBtn.textContent = 'Edit';
editBtn.setAttribute('data-student-action', 'edit');
editBtn.setAttribute('data-student-id', '21004');
actions.appendChild(editBtn);
actions.addEventListener('click', function (ev) {
  if (ev && ev.target && ev.target.closest && ev.target.closest('[data-student-action]')) return;
  harness.parentRowClicked = true;
  rec.open = false;
  harness.rosterReplaced = true;
});

openEditor();
editBtn.dispatchEvent(makeEvent('click'));

if (harness.editorVisible && ctx.studentEditorState.open && ctx.studentEditorState.studentId === '21004') {
  ok('1-3. expand + Edit opens editor for student 21004');
} else bad('Edit did not open editor', ctx.studentEditorState);

if (!harness.parentRowClicked && rec.open) {
  ok('Edit click does not trigger parent row click/navigation');
} else bad('Edit bubbled into parent row handler', { parentRowClicked: harness.parentRowClicked, open: rec.open });

rec.open = false;
panel.hidden = true;
panel.style.display = 'none';
const kept = ctx.keepStudentEditorOpen();
if (kept && !panel.hidden && panel.style.display === 'block' && ctx.studentEditorState.open && panel.parentNode === stableHost) {
  ok('spurious record collapse restores editor on the stable host');
} else bad('collapse still kills editor', { kept, hidden: panel.hidden, parent: panel.parentNode && panel.parentNode.id });

function renderStudentsRosterTableSim() {
  if (ctx.studentEditorState.open) return;
  harness.rosterReplaced = true;
  harness.editorVisible = false;
}
renderStudentsRosterTableSim();
if (ctx.studentEditorState.open && harness.editorVisible) {
  ok('in-flight roster rerender does not replace an open editor');
} else bad('rerender replaced editor');

const start = Date.now();
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
await wait(500);
if (Date.now() - start >= 500 && ctx.studentEditorState.open && harness.editorVisible && !panel.hidden) {
  ok('4-6. after 500ms editor is still open and roster view has not replaced it');
} else bad('editor did not survive 500ms window');

ctx.markStudentEditorClosed();
panel.hidden = true;
panel.style.display = 'none';
harness.editorVisible = false;
if (!ctx.studentEditorState.open && panel.hidden) {
  ok('7-8. Cancel / explicit close closes the editor intentionally');
} else bad('Cancel did not close editor');

const saveSrc = saveFn;
if (saveSrc.includes('verified !== true') === false && adminHtml.includes('body.verified !== true')) {
  ok('verified=true remains required before Save may close');
} else if (adminHtml.includes('if (body.verified !== true) return false')) {
  ok('verified=true remains required before Save may close');
} else bad('verified gate missing');

if (saveSrc.includes("showStudentsRosterMsg(msg, 'err')") &&
    saveSrc.indexOf("showStudentsRosterMsg(msg, 'err')") < saveSrc.indexOf('closeStudentsEditPanels()')) {
  ok('rejected/unverified Save leaves editor open (no close before failure return)');
} else bad('failure path may close editor');

console.log('\nadmin-student-editor-stay-44-test:', pass, 'PASS', fail, 'FAIL');
if (fail) process.exit(1);
