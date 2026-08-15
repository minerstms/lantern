/**
 * Prompt #46 — delegated student-row actions on the stable roster container.
 * Tests the same markup builder + dispatcher the Admin page uses after render.
 * Usage: node worker/scripts/admin-student-delegated-actions-46-test.mjs
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

if (!adminHtml.includes('function bindStudentRowAction') && !adminHtml.includes('bindStudentRowAction(')) {
  ok('per-button bindStudentRowAction is gone');
} else bad('bindStudentRowAction still present');

if (adminHtml.includes('function onStudentsRosterClick') &&
    adminHtml.includes("body.addEventListener('click', onStudentsRosterClick)") &&
    adminHtml.includes('data-student-actions-ready')) {
  ok('one stable roster click dispatcher is wired once');
} else bad('delegated dispatcher missing');

if (adminHtml.includes("studentRowActionAttrs(s, 'edit')") &&
    adminHtml.includes("studentRowActionsHtml(s)") &&
    !/pointerdown|stopImmediatePropagation/.test(extractFunction(adminHtml, 'onStudentsRosterClick'))) {
  ok('Edit markup uses data-student-action; dispatcher does not suppress pointerdown');
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

/* Minimal DOM that can host the same generated button markup + delegated click. */
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
    textContent: '',
    open: false,
    _html: '',
    get dataset() {
      const d = {};
      Object.keys(attrs).forEach((k) => {
        if (k.indexOf('data-') === 0) d[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = attrs[k];
      });
      return d;
    },
    setAttribute(k, v) { attrs[k] = String(v); if (k === 'id') el.id = String(v); if (k === 'class') el.className = String(v); },
    getAttribute(k) { return attrs[k] != null ? attrs[k] : null; },
    addEventListener(type, fn) { (listeners[type] || (listeners[type] = [])).push(fn); },
    dispatchEvent(ev) {
      ev.target = ev.target || el;
      ev.currentTarget = el;
      const list = listeners[ev.type] || [];
      for (const fn of list) fn(ev);
      if (!ev._stopped && el.parentNode && el.parentNode.dispatchEvent) el.parentNode.dispatchEvent(ev);
      return true;
    },
    appendChild(child) {
      child.parentNode = el;
      el.children.push(child);
      return child;
    },
    querySelector(sel) {
      return queryAll(el, sel)[0] || null;
    },
    querySelectorAll(sel) {
      return queryAll(el, sel);
    },
    closest(sel) {
      let n = el;
      while (n) {
        if (matches(n, sel)) return n;
        n = n.parentNode;
      }
      return null;
    },
    set innerHTML(html) {
      el._html = String(html || '');
      el.children = [];
      const re = /<button([^>]*)>([\s\S]*?)<\/button>/g;
      let m;
      while ((m = re.exec(el._html))) {
        const btn = createEl('button');
        const a = m[1];
        const type = /type="([^"]*)"/.exec(a);
        const cls = /class="([^"]*)"/.exec(a);
        const action = /data-student-action="([^"]*)"/.exec(a);
        const key = /data-student-key="([^"]*)"/.exec(a);
        const sid = /data-student-id="([^"]*)"/.exec(a);
        if (type) btn.setAttribute('type', type[1]);
        if (cls) { btn.className = cls[1]; btn.setAttribute('class', cls[1]); }
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
  if (sel === '[data-student-action]') return !!el.getAttribute('data-student-action');
  if (sel === '[data-student-action="edit"]') return el.getAttribute('data-student-action') === 'edit';
  if (sel === '[data-student-action="resolve"]') return el.getAttribute('data-student-action') === 'resolve';
  if (sel === '[data-student-action="delete"]') return el.getAttribute('data-student-action') === 'delete';
  if (sel === '[data-student-action="create-login"]') return el.getAttribute('data-student-action') === 'create-login';
  if (sel === '.lanternMgmtRecordEditor') return String(el.className).indexOf('lanternMgmtRecordEditor') >= 0;
  if (sel === '.lanternMgmtRecordActions') return String(el.className).indexOf('lanternMgmtRecordActions') >= 0;
  if (sel === 'details.lanternMgmtRecord') return el.tagName === 'DETAILS' && String(el.className).indexOf('lanternMgmtRecord') >= 0;
  if (sel === 'button') return el.tagName === 'BUTTON';
  if (sel[0] === '#') return el.id === sel.slice(1);
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

const rosterBody = createEl('div');
rosterBody.id = 'studentsRosterBody';
rosterBody.setAttribute('id', 'studentsRosterBody');

const editorPanel = createEl('div');
editorPanel.id = 'studentsEditIdPanel';
editorPanel.hidden = true;
editorPanel.style.display = 'none';

const firstInput = createEl('input');
firstInput.id = 'studentsEditFirst';

const msgEl = createEl('div');
msgEl.id = 'studentsRosterMsg';

const byId = {
  studentsRosterBody: rosterBody,
  studentsEditIdPanel: editorPanel,
  studentsEditFirst: firstInput,
  studentsRosterMsg: msgEl,
  studentsEditPrevName: createEl('input'),
  studentsEditPrevId: createEl('input'),
  studentsEditIdInput: createEl('input'),
  studentsEditLast: createEl('input'),
  studentsEditPublicDisplay: createEl('input'),
  studentsEditLanternUsername: createEl('input'),
  studentsEditGrade: createEl('select'),
  studentsEditMediaPublicity: createEl('select'),
  studentsEditIdTitle: createEl('p'),
  studentsEditIdHint: createEl('p'),
  studentsEditConflictBox: createEl('div'),
  studentsEditRetryBtn: createEl('button'),
  studentsEditReviewConflictBtn: createEl('button'),
  studentsEditServerConfirm: createEl('p'),
  studentsAddPanel: createEl('div'),
  adminStudentsCard: createEl('details'),
};

const calls = { openEdit: [], resolve: [], delete: [], create: [] };

function renderRow(s) {
  const rec = createEl('details');
  rec.className = 'lanternMgmtRecord lanternMgmtRecord--students';
  rec.setAttribute('data-record-key', String(s.student_name || s.student_id || ''));
  rec.setAttribute('data-student-id', String(s.student_id || ''));
  rec.open = true;
  const actions = createEl('div');
  actions.className = 'acctActions lanternMgmtRecordActions';
  const mount = createEl('div');
  mount.className = 'lanternMgmtRecordEditor';
  rec.appendChild(actions);
  rec.appendChild(mount);
  rosterBody.appendChild(rec);
  actions.innerHTML = ctx.studentRowActionsHtml(s);
  return rec;
}

const ctx = {
  lastStudentsRoster: [student21004],
  studentEditorState: { open: false, recordKey: '', studentId: '' },
  document: {
    getElementById(id) { return byId[id] || null; },
  },
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
  showStudentsRosterMsg(text) { msgEl.textContent = text || ''; },
  openEditStudentId(s, mount) {
    calls.openEdit.push({ s, mount });
    ctx.markStudentEditorOpen(s);
    editorPanel.hidden = false;
    editorPanel.style.display = 'block';
    if (mount) mount.appendChild(editorPanel);
    const host = mount && mount.closest ? mount.closest('details.lanternMgmtRecord') : null;
    if (host) host.open = true;
  },
  openStudentIdentityHub(s) { calls.resolve.push(s); },
  openStudentDeleteModal(s) { calls.delete.push(s); },
  openStudentResolveModal() {},
  openTempPwPanel() {},
  openAdminAvatarPanel() {},
  postAdminJson() { return Promise.resolve({ okHttp: true, body: { ok: true } }); },
  loadStudentsRoster() {},
  loadUsers() {},
  setAccountActive() {},
};
vm.createContext(ctx);
vm.runInContext(
  extractFunction(adminHtml, 'studentActionKey') +
    '\n' +
    extractFunction(adminHtml, 'studentRowActionAttrs') +
    '\n' +
    extractFunction(adminHtml, 'studentRowActionsHtml') +
    '\n' +
    extractFunction(adminHtml, 'resolveStudentForAction') +
    '\n' +
    extractFunction(adminHtml, 'studentRowEditorMount') +
    '\n' +
    extractFunction(adminHtml, 'dispatchStudentRowAction') +
    '\n' +
    extractFunction(adminHtml, 'onStudentsRosterClick') +
    '\n' +
    extractFunction(adminHtml, 'wireStudentRosterActions') +
    '\n' +
    extractFunction(adminHtml, 'markStudentEditorOpen') +
    '\n' +
    extractFunction(adminHtml, 'markStudentEditorClosed') +
    '\nthis.studentActionKey = studentActionKey;' +
    '\nthis.studentRowActionAttrs = studentRowActionAttrs;' +
    '\nthis.studentRowActionsHtml = studentRowActionsHtml;' +
    '\nthis.resolveStudentForAction = resolveStudentForAction;' +
    '\nthis.studentRowEditorMount = studentRowEditorMount;' +
    '\nthis.dispatchStudentRowAction = dispatchStudentRowAction;' +
    '\nthis.onStudentsRosterClick = onStudentsRosterClick;' +
    '\nthis.wireStudentRosterActions = wireStudentRosterActions;' +
    '\nthis.markStudentEditorOpen = markStudentEditorOpen;' +
    '\nthis.markStudentEditorClosed = markStudentEditorClosed;',
  ctx
);

ctx.openStudentIdentityHub = function (s) { calls.resolve.push(s); };
ctx.openStudentDeleteModal = function (s) { calls.delete.push(s); };
ctx.postAdminJson = function () {
  calls.create.push(ctx.lastStudentsRoster[0] || student21004);
  return Promise.resolve({ okHttp: true, body: { ok: true } });
};

ctx.wireStudentRosterActions();
renderRow(student21004);

const editBtn = rosterBody.querySelector('[data-student-action="edit"]');
if (editBtn && editBtn.getAttribute('type') === 'button' && !editBtn.disabled && editBtn.getAttribute('data-student-id') === '21004') {
  ok('1-3. rendered Edit button exists, type=button, enabled, data-student-id=21004');
} else bad('rendered Edit button missing/disabled', editBtn && editBtn.getAttribute('data-student-id'));

const click1 = makeEvent('click', editBtn);
editBtn.dispatchEvent(click1);
if (calls.openEdit.length === 1 && calls.openEdit[0].s && calls.openEdit[0].s.student_id === '21004') {
  ok('4-8. delegated listener received click; action=edit; student=21004; openEditStudentId once');
} else bad('delegated Edit did not fire', calls.openEdit);

if (!editorPanel.hidden && editorPanel.style.display === 'block') ok('9. editor visible after delegated Edit');
else bad('editor not visible');

await new Promise((r) => setTimeout(r, 500));
if (!editorPanel.hidden && calls.openEdit.length === 1) ok('10-11. after 500ms editor still visible; openEdit still once');
else bad('editor lost after wait');

ctx.markStudentEditorClosed();
editorPanel.hidden = true;
editorPanel.style.display = 'none';
calls.openEdit.length = 0;
rosterBody.children = [];
rosterBody._html = '';
renderRow(student21004);
const editBtn2 = rosterBody.querySelector('[data-student-action="edit"]');
editBtn2.dispatchEvent(makeEvent('click', editBtn2));
if (calls.openEdit.length === 1 && calls.openEdit[0].s.student_id === '21004') {
  ok('rerender: new Edit works without rebinding the roster listener');
} else bad('rerender broke Edit', calls.openEdit.length);

const resolveStudent = Object.assign({}, student21004, { needs_attention: true, health_label: 'Needs Attention', lantern_account: 'Missing', lantern_username: '' });
ctx.lastStudentsRoster = [resolveStudent];
rosterBody.children = [];
renderRow(resolveStudent);
const resolveBtn = rosterBody.querySelector('[data-student-action="resolve"]');
if (resolveBtn) {
  resolveBtn.dispatchEvent(makeEvent('click', resolveBtn));
  if (calls.resolve.length === 1) ok('after rerender, Resolve works');
  else bad('Resolve did not fire');
} else bad('Resolve button not rendered');

const delBtn = rosterBody.querySelector('[data-student-action="delete"]');
if (delBtn) {
  delBtn.dispatchEvent(makeEvent('click', delBtn));
  if (calls.delete.length === 1) ok('after rerender, Delete opens inspect flow');
  else bad('Delete did not fire');
} else bad('Delete button not rendered');

const createStudent = Object.assign({}, student21004, { lantern_account: 'Missing', lantern_username: '', exact_match_linkable: false });
ctx.lastStudentsRoster = [createStudent];
rosterBody.children = [];
renderRow(createStudent);
    const createBtn = rosterBody.querySelector('[data-student-action="create-login"]');
if (createBtn) {
  createBtn.dispatchEvent(makeEvent('click', createBtn));
  await Promise.resolve();
  if (calls.create.length === 1) ok('after rerender, Create Login works');
  else bad('Create Login did not fire');
} else bad('Create Login button not rendered');

ctx.lastStudentsRoster = [];
const orphan = rosterBody.querySelector('[data-student-action="edit"]');
if (orphan) {
  msgEl.textContent = '';
  orphan.dispatchEvent(makeEvent('click', orphan));
  if (msgEl.textContent.indexOf('Could not open this student record') >= 0) {
    ok('unknown student shows visible error instead of silence');
  } else bad('lookup failure was silent', msgEl.textContent);
}

console.log('\nadmin-student-delegated-actions-46-test:', pass, 'PASS', fail, 'FAIL');
if (fail) process.exit(1);
