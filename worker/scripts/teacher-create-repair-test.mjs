/**
 * Teacher mission CREATE repair tests — Prompt #71
 *
 * Forensic finding: production D1 proves the POST /api/missions write path itself
 * works (a mission titled "b" landed with the correct server-derived owner "Rick
 * Radle" right after the Prompt #70 deploy), but Rick's actual "8-8 LIVE TEST"
 * attempt never produced a row. The most likely production-shaped failure mode is
 * an unexpected exception between `btn.disabled = true` and `btn.disabled = false`
 * in the Save click handler (e.g. a transient network/Worker error, or a bug in an
 * unrelated code path touched during refresh()) — which, with NO try/catch around
 * the handler, would (a) leave the Save button permanently disabled with no visible
 * error, making every subsequent click silently do nothing, exactly matching "Rick
 * still CANNOT successfully create/save the mission", and (b) throw an unhandled
 * promise rejection instead of a user-facing toast.
 *
 * This test dynamically executes the REAL click handler extracted from
 * app/teacher.html (not a reimplementation) against a DOM/fetch-mocked sandbox to
 * prove: exactly one POST /api/missions with credentials, visible success toast,
 * form reset only after success, visible failure toast + form preserved + button
 * re-enabled on 400/401/403/500/network failures, and re-enablement even if an
 * unrelated exception is thrown inside the try block.
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const teacherHtml = fs.readFileSync(path.join(root, 'app/teacher.html'), 'utf8');

let pass = 0;
let fail = 0;
function ok(msg) { pass++; console.log('PASS', msg); }
function bad(msg, detail) { fail++; console.log('FAIL', msg, detail != null ? detail : ''); }

// ---------------------------------------------------------------------------
// 1. Static checks
// ---------------------------------------------------------------------------
function extractStatement(startNeedle, source) {
  const startIdx = source.indexOf(startNeedle);
  if (startIdx === -1) return null;
  let i = source.indexOf('{', startIdx);
  if (i === -1) return null;
  const braceStart = i;
  let depth = 1;
  i++;
  while (depth > 0 && i < source.length) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') depth--;
    i++;
  }
  // Consume trailing `);` that closes the addEventListener(...) call.
  let end = i;
  while (end < source.length && /[\s\)\;]/.test(source[end])) {
    end++;
    if (source[end - 1] === ';') break;
  }
  return source.slice(startIdx, end);
}

const clickBlockText = extractStatement("el('createMissionBtn').addEventListener('click', async function()", teacherHtml);
const clickBlockMatch = clickBlockText ? [clickBlockText] : null;
if (!clickBlockMatch) {
  bad('could not locate createMissionBtn click handler block in app/teacher.html — aborting dynamic tests');
} else {
  const clickBlock = clickBlockMatch[0];
  // Prompt #73 Defect 1: the handler now has an explicit `catch` that always re-enables/relabels
  // the button (functionally a try/finally for btn.disabled, but written as try/catch since the
  // success path already re-enables the button itself via the delayed "Created ✓" restore).
  if (/btn\.disabled = true;/.test(clickBlock) && /catch \(e\) \{[\s\S]*?btn\.disabled = false;[\s\S]*?btn\.textContent = restoreLabel;/.test(clickBlock)) {
    ok('Save Mission click handler always re-enables + relabels the button in its catch block, even on an unexpected exception (no more permanently-stuck "does nothing" button)');
  } else {
    bad('Save Mission click handler is missing exception-safe btn.disabled/textContent reset — a thrown exception can permanently disable Save with no visible error');
  }
  if (/\} catch \(e\) \{[\s\S]*?toast\(/.test(clickBlock)) {
    ok('Save Mission click handler has a catch block that shows a visible toast for any unexpected exception (no silent failure)');
  } else {
    bad('Save Mission click handler does not visibly report unexpected exceptions');
  }
  if (/if \(!res \|\| !res\.ok\)\{/.test(clickBlock) && /toast\('Couldn/.test(clickBlock)) {
    ok('Save Mission only shows success after res.ok — failures (including a falsy/undefined response) surface a visible toast');
  } else {
    bad('create click handler missing error-visibility guard for falsy/undefined response');
  }
  if (/statusEl\.className = 'createMissionStatus ' \+ \(kind === 'success'/.test(clickBlock) && /showInlineStatus\('success', 'Mission created\.'\)/.test(clickBlock)) {
    ok('Save Mission click handler shows an inline (non-toast) "Mission created." success status beside the controls');
  } else {
    bad('create click handler missing inline success status (Prompt #73 Defect 1 requires a non-toast confirmation)');
  }
  if (/btn\.textContent = 'Creating\\u2026'/.test(clickBlock) && /btn\.textContent = 'Created \\u2713'/.test(clickBlock)) {
    ok('Save Mission button visibly transitions Creating\u2026 \u2192 Created \u2713 (Prompt #73 Defect 1 convincing success state)');
  } else {
    bad('create click handler missing Creating\u2026/Created \u2713 button state transition');
  }
}

const avatarTruthyBugPatterns = [
  /function callGetPendingAvatars\(\)\{\s*if \(avatarApiBase\) \{/,
  /function callApproveAvatarSubmission\(id\)\{\s*if \(avatarApiBase\) \{/,
  /function callRejectAvatarSubmission\(id, reason\)\{\s*if \(avatarApiBase\) \{/,
  /if \(avatarApiBase\) \{\s*var recRes = await callGetRecognitionList/,
];
const stillBuggy = avatarTruthyBugPatterns.filter((re) => re.test(teacherHtml));
if (stillBuggy.length === 0) {
  ok('teacher.html: no remaining truthy-only `if (avatarApiBase)` gates in the refresh()-reachable path (same-origin "" is correctly treated as configured)');
} else {
  bad('teacher.html still has truthy-only avatarApiBase gate(s) that silently skip the Worker call for same-origin ""', stillBuggy.length);
}

// ---------------------------------------------------------------------------
// 2. Dynamic execution of the REAL click handler against a mocked fetch/DOM
// ---------------------------------------------------------------------------
function makeFieldStub(initial) {
  return { value: initial != null ? initial : '', checked: false };
}

function buildSandbox({ postMissionsResponse, networkError }) {
  const fields = {
    missionTitle: makeFieldStub('8-8 LIVE TEST'),
    missionDesc: makeFieldStub('Live acceptance test description'),
    missionReward: makeFieldStub('3'),
    missionType: makeFieldStub('text'),
    missionAudience: makeFieldStub('school_mission'),
    missionSiteEligible: makeFieldStub(),
    missionFeatured: makeFieldStub(),
    missionAllowsText: Object.assign(makeFieldStub(), { checked: true }),
    missionAllowsImage: makeFieldStub(),
    missionAllowsVideo: makeFieldStub(),
    missionAllowsLink: makeFieldStub(),
    missionMinChars: makeFieldStub('0'),
    createMissionBtn: { disabled: false, addEventListener() {} },
  };
  const toasts = [];
  const fetchCalls = [];
  const refreshCalls = [];

  const sandbox = {
    console,
    Promise,
    JSON,
    String,
    Math,
    parseInt,
    document: { getElementById: () => null },
    approvalStaffId: '',
    toast: (msg) => toasts.push(msg),
    el: (id) => fields[id] || null,
    refresh: async () => { refreshCalls.push(true); },
    fetch: (url, init) => {
      fetchCalls.push({ url, init });
      if (networkError) return Promise.reject(new Error('network down'));
      return Promise.resolve({
        ok: postMissionsResponse.httpOk,
        json: () => Promise.resolve(postMissionsResponse.body),
      });
    },
    avatarApiBase: '',
  };
  sandbox._fields = fields;
  sandbox._toasts = toasts;
  sandbox._fetchCalls = fetchCalls;
  sandbox._refreshCalls = refreshCalls;
  return sandbox;
}

function extractFn(name, source) {
  const re = new RegExp('function ' + name + '\\([^)]*\\)\\{');
  const m = re.exec(source);
  if (!m) return null;
  let i = m.index + m[0].length;
  let depth = 1;
  while (depth > 0 && i < source.length) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') depth--;
    i++;
  }
  return source.slice(m.index, i);
}

const callCreateTeacherMissionSrc = extractFn('callCreateTeacherMission', teacherHtml);
if (!callCreateTeacherMissionSrc) {
  bad('could not extract callCreateTeacherMission() from app/teacher.html');
}

async function runDynamicCase(label, { postMissionsResponse, networkError }, assertFn) {
  if (!clickBlockMatch || !callCreateTeacherMissionSrc) return;
  const sandbox = buildSandbox({ postMissionsResponse, networkError });
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  try {
    vm.runInContext(callCreateTeacherMissionSrc, sandbox);
    // Reset fields consumed by the click handler each run (extracted block starts fresh).
    const handlerSrc =
      'var __handler = null;\n' +
      'var el_orig = el;\n' +
      "el = function(id){ var e = el_orig(id); if (id === 'createMissionBtn') { e = { disabled: false, addEventListener: function(t, fn){ __handler = fn; } }; } return e; };\n" +
      clickBlockMatch[0] +
      '\n__handler;';
    const handler = vm.runInContext(handlerSrc, sandbox);
    await handler();
  } catch (e) {
    assertFn({ threw: e, sandbox });
    return;
  }
  assertFn({ threw: null, sandbox });
}

await runDynamicCase(
  'success',
  { postMissionsResponse: { httpOk: true, body: { ok: true, id: 'tmission_x', mission: { id: 'tmission_x', title: '8-8 LIVE TEST' } } } },
  ({ threw, sandbox }) => {
    const posts = sandbox._fetchCalls.filter((c) => /\/api\/missions$/.test(c.url) && c.init && c.init.method === 'POST');
    if (threw) return bad('success case: handler threw unexpectedly', String(threw));
    if (posts.length !== 1) return bad('success case: expected exactly one POST /api/missions', posts.length);
    if (posts[0].init.credentials !== 'include') return bad('success case: POST /api/missions missing credentials: include');
    if (!sandbox._toasts.some((t) => t === 'Mission created')) return bad('success case: no visible "Mission created" success toast', sandbox._toasts);
    if (sandbox._fields.missionTitle.value !== '') return bad('success case: title field not reset after success');
    if (sandbox._refreshCalls.length !== 1) return bad('success case: refresh() not called exactly once after success', sandbox._refreshCalls.length);
    if (sandbox._fields.createMissionBtn.disabled !== false) return bad('success case: Save button left disabled after success');
    ok('success case: exactly one credentialed POST /api/missions, visible "Mission created" toast, form reset, refresh() called, button re-enabled');
  }
);

async function runFailureCase(label, mockResponse) {
  await runDynamicCase(label, mockResponse, ({ threw, sandbox }) => {
    if (threw) return bad(label + ': handler threw unexpectedly instead of showing a toast', String(threw));
    if (sandbox._fields.missionTitle.value !== '8-8 LIVE TEST') return bad(label + ': title field was cleared on failure (work should be preserved)');
    if (sandbox._fields.missionDesc.value !== 'Live acceptance test description') return bad(label + ': description field was cleared on failure');
    if (sandbox._toasts.some((t) => t === 'Mission created')) return bad(label + ': false success toast shown on failure', sandbox._toasts);
    if (sandbox._toasts.length === 0) return bad(label + ': no visible failure toast shown (silent failure)');
    if (sandbox._fields.createMissionBtn.disabled !== false) return bad(label + ': Save button left permanently disabled after failure');
    if (sandbox._refreshCalls.length !== 0) return bad(label + ': refresh() should not run after a failed create');
    ok(label + ': visible failure toast (' + JSON.stringify(sandbox._toasts[0]) + '), form preserved, no fake mission, button re-enabled');
  });
}

await runFailureCase('400 Missing title', { postMissionsResponse: { httpOk: false, body: { ok: false, error: 'Missing title' } } });
await runFailureCase('401 not_authenticated', { postMissionsResponse: { httpOk: false, body: { ok: false, error: 'not_authenticated' } } });
await runFailureCase('403 forbidden', { postMissionsResponse: { httpOk: false, body: { ok: false, error: 'forbidden' } } });
await runFailureCase('500 Internal error', { postMissionsResponse: { httpOk: false, body: { ok: false, error: 'Internal error' } } });
await runFailureCase('network error', { postMissionsResponse: { httpOk: false, body: null }, networkError: true });

console.log('\n--- teacher-create-repair-test: ' + pass + ' passed, ' + fail + ' failed ---');
process.exit(fail > 0 ? 1 : 0);
