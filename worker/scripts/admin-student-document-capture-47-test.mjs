/**
 * Prompt #47 — document-level capture must be installed by the same boot
 * production runs, then a real Edit click on student 21004 must open the editor.
 * Usage: node worker/scripts/admin-student-document-capture-47-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

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

if (adminHtml.includes('bootAdminStudentActions();') &&
    adminHtml.indexOf('bootAdminStudentActions();') < adminHtml.indexOf('initTeacherCollapsibleLists')) {
  ok('production IIFE invokes bootAdminStudentActions before the rest of Admin init');
} else bad('boot is not the first Admin init step');

if (adminHtml.includes("document.addEventListener('click', onAdminStudentActionCapture, true)")) {
  ok('document capture listener is the production installer');
} else bad('document capture addEventListener missing');

if (!adminHtml.includes('function wireStudentRosterActions') &&
    !adminHtml.includes('function onStudentsRosterClick') &&
    !adminHtml.includes('function bindStudentRowAction')) {
  ok('roster-body and per-button student-action listeners are gone');
} else bad('competing student-action listeners remain');

if (adminHtml.includes('Edit click received: ') &&
    adminHtml.includes('Opening editor: ') &&
    adminHtml.includes('Editor open: ') &&
    adminHtml.includes('Edit click received, but student ') &&
    adminHtml.includes('Edit handler ran, but the editor did not open.')) {
  ok('visible Edit diagnostics are present');
} else bad('diagnostic strings missing');

if (adminHtml.includes('id="studentsEditStableHost"') &&
    adminHtml.includes("getElementById('studentsEditStableHost')")) {
  ok('editor mounts on a stable host outside roster rows');
} else bad('stable editor host missing');

const saveFn = extractFunction(adminHtml, 'saveStudentIdEdit');
if (saveFn.includes('studentEditSaveAccepted')) ok('#42/#43 verified Save path unchanged');
else bad('save path changed');

function createEl(tag) {
  const listeners = {};
  const attrs = {};
  const el = {
    tagName: String(tag || 'DIV').toUpperCase(),
    children: [],
    parentNode: null,
    hidden: false,
    disabled: false,
    style: { display: '' },
    className: '',
    id: '',
    value: '',
    textContent: '',
    open: false,
    nodeType: 1,
    _html: '',
    contains(node) {
      let n = node;
      while (n) {
        if (n === el) return true;
        n = n.parentNode;
      }
      return false;
    },
    setAttribute(k, v) {
      attrs[k] = String(v);
      if (k === 'id') el.id = String(v);
      if (k === 'class') el.className = String(v);
      if (k === 'hidden') el.hidden = true;
    },
    getAttribute(k) {
      if (k === 'hidden') return el.hidden ? '' : null;
      return attrs[k] != null ? attrs[k] : null;
    },
    addEventListener(type, fn) { (listeners[type] || (listeners[type] = [])).push(fn); },
    dispatchEvent(ev) {
      ev.target = ev.target || el;
      const list = listeners[ev.type] || [];
      for (const fn of list) fn(ev);
      if (!ev._stopped && el.parentNode && el.parentNode.dispatchEvent) el.parentNode.dispatchEvent(ev);
      return true;
    },
    appendChild(child) {
      if (child.parentNode && child.parentNode.children) {
        child.parentNode.children = child.parentNode.children.filter((c) => c !== child);
      }
      child.parentNode = el;
      el.children.push(child);
      return child;
    },
    querySelector(sel) { return queryAll(el, sel)[0] || null; },
    querySelectorAll(sel) { return queryAll(el, sel); },
    closest(sel) {
      let n = el;
      while (n) {
        if (matches(n, sel)) return n;
        n = n.parentNode;
      }
      return null;
    },
    focus() { el._focused = true; },
    set innerHTML(html) {
      el._html = String(html || '');
      el.children = [];
      const re = /<button([^>]*)>([\s\S]*?)<\/button>/g;
      let m;
      while ((m = re.exec(el._html))) {
        const btn = createEl('button');
        const a = m[1];
        const type = /type="([^"]*)"/.exec(a);
        const action = /data-student-action="([^"]*)"/.exec(a);
        const key = /data-student-key="([^"]*)"/.exec(a);
        const sid = /data-student-id="([^"]*)"/.exec(a);
        if (type) btn.setAttribute('type', type[1]);
        if (action) btn.setAttribute('data-student-action', action[1]);
        if (key) btn.setAttribute('data-student-key', key[1]);
        if (sid) btn.setAttribute('data-student-id', sid[1]);
        btn.textContent = m[2].replace(/<[^>]+>/g, '');
        el.appendChild(btn);
      }
    },
    get innerHTML() { return el._html; },
  };
  return el;
}

function matches(el, sel) {
  if (!el || !sel) return false;
  if (sel[0] === '#') return el.id === sel.slice(1);
  if (sel === '[data-student-action]') return !!el.getAttribute('data-student-action');
  if (sel === '[data-student-action="edit"]') return el.getAttribute('data-student-action') === 'edit';
  if (sel === 'details.lanternMgmtRecord') return el.tagName === 'DETAILS' && String(el.className).indexOf('lanternMgmtRecord') >= 0;
  if (sel === '.lanternMgmtRecordEditor') return String(el.className).indexOf('lanternMgmtRecordEditor') >= 0;
  return false;
}

function queryAll(root, sel) {
  const out = [];
  function walk(n) {
    if (matches(n, sel)) out.push(n);
    (n.children || []).forEach(walk);
  }
  (root.children || []).forEach(walk);
  return out;
}

function makeEvent(type, target) {
  return {
    type,
    target,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this._stopped = true; },
    defaultPrevented: false,
    _stopped: false,
  };
}

const htmlEl = createEl('html');
htmlEl.tagName = 'HTML';
const capture = { click: [] };
const student21004 = {
  student_id: '21004',
  student_name: 'Phay Khuu',
  first_name: 'Phay',
  last_name: 'Khuu',
  grade: '8',
  is_active: 1,
  tms_status: 'Active',
  lantern_account: 'Linked',
  lantern_username: '21004',
  health_label: 'Healthy',
  needs_attention: false,
};

const studentsCard = createEl('details');
studentsCard.id = 'adminStudentsCard';
studentsCard.setAttribute('id', 'adminStudentsCard');
studentsCard.open = true;

const rosterBody = createEl('div');
rosterBody.id = 'studentsRosterBody';
rosterBody.setAttribute('id', 'studentsRosterBody');

const stableHost = createEl('div');
stableHost.id = 'studentsEditStableHost';
stableHost.setAttribute('id', 'studentsEditStableHost');

const park = createEl('div');
park.id = 'adminEditorPark';
park.setAttribute('id', 'adminEditorPark');
park.hidden = true;

const editorPanel = createEl('div');
editorPanel.id = 'studentsEditIdPanel';
editorPanel.setAttribute('id', 'studentsEditIdPanel');
editorPanel.hidden = true;
editorPanel.style.display = 'none';
editorPanel.setAttribute('aria-hidden', 'true');
park.appendChild(editorPanel);

const diag = createEl('p');
diag.id = 'studentsActionDiag';
diag.setAttribute('id', 'studentsActionDiag');
diag.style.display = 'none';

const firstInput = createEl('input');
firstInput.id = 'studentsEditFirst';
firstInput.setAttribute('id', 'studentsEditFirst');

function field(id) {
  const el = createEl('input');
  el.id = id;
  el.setAttribute('id', id);
  return el;
}

const byId = {
  adminStudentsCard: studentsCard,
  studentsRosterBody: rosterBody,
  studentsEditStableHost: stableHost,
  adminEditorPark: park,
  studentsEditIdPanel: editorPanel,
  studentsActionDiag: diag,
  studentsEditFirst: firstInput,
  studentsEditPrevName: field('studentsEditPrevName'),
  studentsEditPrevId: field('studentsEditPrevId'),
  studentsEditIdInput: field('studentsEditIdInput'),
  studentsEditLast: field('studentsEditLast'),
  studentsEditPublicDisplay: field('studentsEditPublicDisplay'),
  studentsEditLanternUsername: field('studentsEditLanternUsername'),
  studentsEditGrade: field('studentsEditGrade'),
  studentsEditMediaPublicity: field('studentsEditMediaPublicity'),
  studentsEditIdTitle: createEl('p'),
  studentsEditIdHint: createEl('p'),
  studentsEditConflictBox: createEl('div'),
  studentsEditRetryBtn: createEl('button'),
  studentsEditReviewConflictBtn: createEl('button'),
  studentsAddPanel: createEl('div'),
  studentsRosterMsg: createEl('div'),
};
byId.studentsEditIdTitle.id = 'studentsEditIdTitle';
byId.studentsEditIdHint.id = 'studentsEditIdHint';
byId.studentsEditConflictBox.id = 'studentsEditConflictBox';
byId.studentsAddPanel.id = 'studentsAddPanel';

studentsCard.appendChild(diag);
studentsCard.appendChild(stableHost);
studentsCard.appendChild(rosterBody);

const calls = { openEdit: 0 };

const fakeDoc = {
  documentElement: htmlEl,
  getElementById(id) { return byId[id] || null; },
  addEventListener(type, fn, opts) {
    if ((opts === true || (opts && opts.capture)) && type === 'click') capture.click.push(fn);
  },
};

const ctx = {
  lastStudentsRoster: [student21004],
  studentEditorState: { open: false, recordKey: '', studentId: '' },
  studentsEditConflictState: null,
  document: fakeDoc,
  window: { confirm() { return true; } },
  console,
  studentNeedsAttention(s) { return !!(s && (s.needs_attention === true || s.health_label === 'Needs Attention')); },
  escapeRosterHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },
  findCanonicalDuplicate() { return null; },
  showStudentsRosterMsg() {},
  closeEditUserPanel() {},
  closeTempPwPanel() {},
  closeAdminAvatarPanel() {},
  setStudentsEditServerConfirm() {},
  openStudentIdentityHub() { calls.resolve = (calls.resolve || 0) + 1; },
  openStudentDeleteModal() { calls.delete = (calls.delete || 0) + 1; },
  postAdminJson() {
    calls.create = (calls.create || 0) + 1;
    return Promise.resolve({ okHttp: true, body: { ok: true } });
  },
  loadStudentsRoster() {},
  loadUsers() {},
  setAccountActive() {},
};
vm.createContext(ctx);
vm.runInContext(
  [
    'studentActionKey',
    'studentRowActionAttrs',
    'studentRowActionsHtml',
    'resolveStudentForAction',
    'studentRowEditorMount',
    'showStudentActionDiag',
    'adminEventElement',
    'isStudentEditorActuallyVisible',
    'onAdminStudentActionCapture',
    'installAdminStudentActionCapture',
    'bootAdminStudentActions',
    'markStudentEditorOpen',
    'markStudentEditorClosed',
    'keepStudentEditorOpen',
    'parkAdminEditor',
    'mountAdminEditor',
    'hideStudentsEditSaveProof',
    'openEditStudentId',
    'dispatchStudentRowAction',
  ].map((name) => extractFunction(adminHtml, name) + '\nthis.' + name + ' = ' + name + ';').join('\n'),
  ctx
);

const realOpen = ctx.openEditStudentId;
ctx.openEditStudentId = function (s, mount) {
  calls.openEdit += 1;
  return realOpen(s, mount);
};

function renderRow(s) {
  const rec = createEl('details');
  rec.className = 'lanternMgmtRecord lanternMgmtRecord--students';
  rec.setAttribute('data-record-key', String(s.student_name || s.student_id || ''));
  rec.setAttribute('data-student-id', String(s.student_id || ''));
  rec.open = true;
  const actions = createEl('div');
  actions.className = 'acctActions lanternMgmtRecordActions';
  rec.appendChild(actions);
  rosterBody.appendChild(rec);
  studentsCard.appendChild(rosterBody);
  actions.innerHTML = ctx.studentRowActionsHtml(s);
  return rec;
}

function clickThroughDocument(target) {
  const ev = makeEvent('click', target);
  capture.click.forEach((fn) => fn(ev));
  return ev;
}

ctx.bootAdminStudentActions();
if (htmlEl.getAttribute('data-admin-student-actions-ready') === '1' && capture.click.length === 1) {
  ok('1-3. production boot attached exactly one document capture listener');
} else bad('boot did not attach document capture', { ready: htmlEl.getAttribute('data-admin-student-actions-ready'), n: capture.click.length });

ctx.bootAdminStudentActions();
if (capture.click.length === 1) ok('boot is idempotent — still one listener');
else bad('boot double-bound', capture.click.length);

renderRow(student21004);
const editBtn = rosterBody.querySelector('[data-student-action="edit"]');
if (editBtn && editBtn.getAttribute('type') === 'button' && editBtn.getAttribute('data-student-id') === '21004' && !editBtn.disabled) {
  ok('4-5. rendered Edit button exists, type=button, enabled, 21004');
} else bad('rendered Edit button missing');

const textTarget = { nodeType: 3, parentElement: editBtn, parentNode: editBtn };
clickThroughDocument(textTarget);
if (diag.textContent.indexOf('Edit click received: 21004') >= 0 || diag.textContent.indexOf('Editor open: 21004') >= 0) {
  ok('6-7. text-node click still reaches capture and shows Edit click received: 21004');
} else bad('text-node click was silent', diag.textContent);

if (calls.openEdit === 1) ok('8. openEditStudentId invoked once');
else bad('openEditStudentId count', calls.openEdit);

if (ctx.isStudentEditorActuallyVisible() && ctx.studentEditorState.open && editorPanel.parentNode === stableHost && !park.contains(editorPanel)) {
  ok('9. editor truly visible on stable host, not in #adminEditorPark');
} else bad('editor not actually visible', {
  visible: ctx.isStudentEditorActuallyVisible(),
  open: ctx.studentEditorState.open,
  parent: editorPanel.parentNode && editorPanel.parentNode.id,
});

if (diag.textContent === 'Editor open: 21004') ok('diagnostic reached Editor open: 21004');
else bad('final diagnostic wrong', diag.textContent);

await new Promise((r) => setTimeout(r, 1000));
if (ctx.isStudentEditorActuallyVisible() && calls.openEdit === 1 && diag.textContent === 'Editor open: 21004') {
  ok('10-11. after 1s editor still visible');
} else bad('editor lost after 1s');

ctx.markStudentEditorClosed();
ctx.parkAdminEditor(editorPanel);
editorPanel.hidden = true;
editorPanel.style.display = 'none';
editorPanel.setAttribute('aria-hidden', 'true');
calls.openEdit = 0;
diag.textContent = '';
rosterBody.children = [];
renderRow(student21004);
const editBtn2 = rosterBody.querySelector('[data-student-action="edit"]');
clickThroughDocument(editBtn2);
if (calls.openEdit === 1 && ctx.isStudentEditorActuallyVisible() && diag.textContent === 'Editor open: 21004') {
  ok('rerender: new Edit works without rebinding because document listener survived');
} else bad('rerender broke Edit', { calls: calls.openEdit, diag: diag.textContent, visible: ctx.isStudentEditorActuallyVisible() });

ctx.lastStudentsRoster = [];
clickThroughDocument(editBtn2);
if (diag.textContent.indexOf('could not be resolved') >= 0) {
  ok('unresolved student shows a visible diagnostic');
} else bad('unresolved lookup was silent', diag.textContent);

console.log('\nadmin-student-document-capture-47-test:', pass, 'PASS', fail, 'FAIL');
if (fail) process.exit(1);
