/**
 * Teacher mission pipeline tests — Prompt #70
 *
 * Covers the real production bugs found during forensic investigation:
 *  - Admin (Rick Radle) pilot accounts have role='admin', teacher_id=null, so
 *    sessionTeacherId() previously returned '' for them, which made every
 *    teacher-scoped LIST endpoint return 403 forbidden (no way to see any
 *    mission or pending submission) and made mission CREATE fall back to an
 *    orphaned 'teacher' placeholder owner nobody could ever list as "mine".
 *  - teacher.html's `refresh()` gated its D1-backed mission list/queue re-fetch
 *    on `if (avatarApiBase)`, which is FALSE when LANTERN_AVATAR_API is the
 *    documented same-origin sentinel '' (empty string is falsy but is a valid
 *    configured value — see app/js/lantern-games-page.js comment). That silently
 *    skipped the Worker-backed read entirely, leaving Rick's queue showing
 *    stale/empty legacy dashboard data forever, regardless of real D1 rows.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { handleMissionsRoutes } from '../missions-handlers.js';
import { sessionTeacherId, teacherOwnsMission, isAdminRole } from '../missions-auth.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let passed = 0;
let failed = 0;

function ok(msg) {
  passed++;
  console.log('PASS', msg);
}
function bad(msg, detail) {
  failed++;
  console.log('FAIL', msg, detail != null ? detail : '');
}

function jsonResponse(obj, status, corsHeaders) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', ...(corsHeaders || {}) },
  });
}

// ---- Minimal in-memory D1 mock for lantern_missions / lantern_mission_submissions ----
function makeMissionsDb(seed) {
  const missions = new Map((seed.missions || []).map((m) => [m.id, { ...m }]));
  const submissions = new Map((seed.submissions || []).map((s) => [s.id, { ...s }]));

  function missionCols(r) {
    return {
      id: r.id,
      teacher_id: r.teacher_id,
      teacher_name: r.teacher_name,
      title: r.title,
      description: r.description || '',
      reward_amount: r.reward_amount != null ? r.reward_amount : 3,
      submission_type: r.submission_type || 'text',
      audience: r.audience || 'school_mission',
      target_character_names: r.target_character_names || null,
      featured: r.featured || 0,
      active: r.active != null ? r.active : 1,
      site_eligible: r.site_eligible || 0,
      allows_text: r.allows_text != null ? r.allows_text : 1,
      allows_image: r.allows_image || 0,
      allows_video: r.allows_video || 0,
      allows_link: r.allows_link || 0,
      min_characters: r.min_characters != null ? r.min_characters : 200,
      created_at: r.created_at,
    };
  }

  function runQuery(s, binds) {
    if (s.startsWith('SELECT id, teacher_id, teacher_name, title, description, reward_amount, submission_type, audience, target_character_names, featured, active, site_eligible, allows_text, allows_image, allows_video, allows_link, min_characters, created_at FROM lantern_missions')) {
      let rows = [...missions.values()];
      if (s.includes('WHERE teacher_id = ?')) {
        const tid = binds[0];
        rows = rows.filter((r) => r.teacher_id === tid);
      }
      rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      return { results: rows.map(missionCols) };
    }
    if (s.startsWith('SELECT id, title, reward_amount, teacher_id, teacher_name FROM lantern_missions')) {
      let rows = [...missions.values()];
      if (s.includes('WHERE teacher_id = ?')) {
        const tid = binds[0];
        rows = rows.filter((r) => r.teacher_id === tid);
      }
      return { results: rows.map((r) => ({ id: r.id, title: r.title, reward_amount: r.reward_amount, teacher_id: r.teacher_id, teacher_name: r.teacher_name })) };
    }
    if (s.startsWith('SELECT id, mission_id, character_name, submission_type, submission_content, status, created_at FROM lantern_mission_submissions WHERE mission_id IN')) {
      const nPlaceholders = (s.match(/\?/g) || []).length - 1; // last ? is status
      const missionIds = binds.slice(0, nPlaceholders);
      const status = binds[nPlaceholders];
      let rows = [...submissions.values()].filter((r) => missionIds.includes(r.mission_id) && r.status === status);
      rows.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
      return { results: rows };
    }
    throw new Error('Unhandled SELECT (.all): ' + s);
  }

  function runFirst(s, binds) {
    if (s.startsWith('SELECT id, teacher_id FROM lantern_missions WHERE id = ?')) {
      const row = missions.get(binds[0]);
      return row ? { id: row.id, teacher_id: row.teacher_id } : null;
    }
    if (s.startsWith('SELECT reward_amount, teacher_id FROM lantern_missions WHERE id = ?')) {
      const row = missions.get(binds[0]);
      return row ? { reward_amount: row.reward_amount, teacher_id: row.teacher_id } : null;
    }
    throw new Error('Unhandled SELECT (.first): ' + s);
  }

  function runExec(s, binds) {
    if (s.startsWith('INSERT INTO lantern_missions')) {
      const [
        id, teacher_id, teacher_name, title, description, reward_amount, submission_type, audience,
        target_character_names, featured, active, site_eligible, allows_text, allows_image, allows_video,
        allows_link, min_characters, created_at,
      ] = binds;
      missions.set(id, {
        id, teacher_id, teacher_name, title, description, reward_amount, submission_type, audience,
        target_character_names, featured, active, site_eligible, allows_text, allows_image, allows_video,
        allows_link, min_characters, created_at,
      });
      return { meta: { changes: 1 } };
    }
    if (s.startsWith('INSERT INTO lantern_mission_submissions')) {
      const [id, mission_id, character_name, submission_type, submission_content, status, created_at] = binds;
      submissions.set(id, { id, mission_id, character_name, submission_type, submission_content, status, created_at });
      return { meta: { changes: 1 } };
    }
    if (s.startsWith('UPDATE lantern_missions SET')) {
      const id = binds[binds.length - 1];
      const row = missions.get(id);
      if (row) row.active = binds[0]; // simplistic: only 'active' toggled in these tests
      return { meta: { changes: row ? 1 : 0 } };
    }
    throw new Error('Unhandled RUN: ' + s);
  }

  function prepare(sql) {
    const s = String(sql).replace(/\s+/g, ' ').trim();
    function withBinds(binds) {
      return {
        bind(...more) {
          return withBinds(more);
        },
        all: async () => runQuery(s, binds),
        first: async () => runFirst(s, binds),
        run: async () => runExec(s, binds),
      };
    }
    return withBinds([]);
  }

  return { prepare, _missions: missions, _submissions: submissions };
}

function makeDeps(account) {
  return {
    jsonResponse,
    getPilotAccountFromRequest: async () => account,
    pilotEconomyCharacterName: (row) => (row && row.role === 'student' ? String(row.username || '').trim() : ''),
    pilotAccountRequiresChangePassword: () => false,
  };
}

function req(method, urlStr, body) {
  const init = { method };
  if (body !== undefined) init.body = JSON.stringify(body);
  return new Request(urlStr, init);
}

async function call(account, method, urlStr, body) {
  const url = new URL(urlStr);
  const request = req(method, urlStr, body);
  const env = { DB: call.db };
  const deps = makeDeps(account);
  const res = await handleMissionsRoutes(request, url, url.pathname, env, {}, deps);
  const json = await res.json();
  return { status: res.status, json };
}

const rick = { username: 'Rick Radle', display_name: 'Rick Radle', role: 'admin', teacher_id: null };
const teacher1 = { username: 'teacher1', display_name: 'Ms. Carter', role: 'teacher', teacher_id: 'teacher1' };
const teacher2 = { username: 'teacher2', display_name: 'Mr. Lee', role: 'teacher', teacher_id: 'teacher2' };
const lucas = { username: '20889', display_name: 'Lucas', role: 'student', teacher_id: null };

const seedMissions = [
  { id: 'perm_report_good_news', teacher_id: 'mr_radle', teacher_name: 'Mr. Radle', title: 'Report Good News', created_at: '2026-03-16T00:00:00.000Z' },
  { id: 'tmission_t1_a', teacher_id: 'teacher1', teacher_name: 'Ms. Carter', title: "Carter's Mission", created_at: '2026-03-16T00:00:01.000Z' },
];
const seedSubmissions = [
  { id: 'msub_lucas_1', mission_id: 'perm_report_good_news', character_name: '20889', submission_type: 'text', submission_content: 'hi', status: 'pending', created_at: '2026-08-08T23:48:38.624Z' },
];

// ---------------------------------------------------------------------------
// 1. sessionTeacherId / teacherOwnsMission unit behavior
// ---------------------------------------------------------------------------
if (sessionTeacherId(rick) === 'Rick Radle') {
  ok('sessionTeacherId gives admin a stable identity (own username) instead of empty string');
} else bad('sessionTeacherId admin identity', sessionTeacherId(rick));

if (sessionTeacherId(teacher1) === 'teacher1') {
  ok('sessionTeacherId unaffected for real teacher accounts');
} else bad('sessionTeacherId teacher unaffected', sessionTeacherId(teacher1));

if (isAdminRole(rick.role) && teacherOwnsMission(rick, 'mr_radle') && teacherOwnsMission(rick, 'anything_else')) {
  ok('teacherOwnsMission still grants admin authority over every mission (unchanged from Prompt #67)');
} else bad('teacherOwnsMission admin authority regressed');

if (!teacherOwnsMission(teacher2, 'teacher1')) {
  ok('teacherOwnsMission still blocks Teacher B from Teacher A missions (unchanged)');
} else bad('cross-teacher ownership leak');

// ---------------------------------------------------------------------------
// 2. GET /api/missions/teacher — admin broader scope vs real-teacher isolation
// ---------------------------------------------------------------------------
async function runListTests() {
  call.db = makeMissionsDb({ missions: seedMissions, submissions: seedSubmissions });

  const asRick = await call(rick, 'GET', 'https://x/api/missions/teacher');
  if (asRick.status === 200 && asRick.json.ok && asRick.json.missions.length === seedMissions.length) {
    ok('admin with no ?teacher_id= sees every teacher\'s missions (broader scope, matches teacherOwnsMission authority)');
  } else bad('admin broad-scope missions list', asRick);

  const asRickScoped = await call(rick, 'GET', 'https://x/api/missions/teacher?teacher_id=mr_radle');
  if (asRickScoped.status === 200 && asRickScoped.json.ok && asRickScoped.json.missions.length === 1 && asRickScoped.json.missions[0].id === 'perm_report_good_news') {
    ok('admin with explicit ?teacher_id= can still narrow to one teacher\'s missions');
  } else bad('admin explicit teacher_id scoping', asRickScoped);

  const asTeacher1 = await call(teacher1, 'GET', 'https://x/api/missions/teacher');
  if (asTeacher1.status === 200 && asTeacher1.json.ok && asTeacher1.json.missions.length === 1 && asTeacher1.json.missions[0].id === 'tmission_t1_a') {
    ok('real teacher sees only their own missions (unaffected by admin broad scope)');
  } else bad('teacher own-scope missions list', asTeacher1);

  const asStudent = await call(lucas, 'GET', 'https://x/api/missions/teacher');
  if (asStudent.status === 403) {
    ok('student is forbidden from the teacher missions list endpoint');
  } else bad('student blocked from teacher missions list', asStudent);
}

// ---------------------------------------------------------------------------
// 3. GET /api/missions/submissions/teacher — this is the exact endpoint that
//    hid Lucas's real pending submission from Rick in production.
// ---------------------------------------------------------------------------
async function runSubmissionsQueueTests() {
  call.db = makeMissionsDb({ missions: seedMissions, submissions: seedSubmissions });

  const asRick = await call(rick, 'GET', 'https://x/api/missions/submissions/teacher');
  if (asRick.status === 200 && asRick.json.ok && asRick.json.submissions.length === 1 && asRick.json.submissions[0].character_name === '20889') {
    ok('admin with no ?teacher_id= sees Lucas\'s pending submission on the mr_radle-owned mission (reproduces + fixes the real production bug)');
  } else bad('admin sees real pending submission across all teachers', asRick);

  const asTeacher2 = await call(teacher2, 'GET', 'https://x/api/missions/submissions/teacher');
  if (asTeacher2.status === 200 && asTeacher2.json.ok && asTeacher2.json.submissions.length === 0) {
    ok('unrelated teacher (Mr. Lee) does not see Lucas\'s submission on a mission he does not own');
  } else bad('cross-teacher submission isolation', asTeacher2);

  const asStudent = await call(lucas, 'GET', 'https://x/api/missions/submissions/teacher');
  if (asStudent.status === 403) {
    ok('student cannot use the teacher submissions queue endpoint');
  } else bad('student blocked from submissions queue', asStudent);
}

// ---------------------------------------------------------------------------
// 4. POST /api/missions — owner must be server-derived, never an orphaned
//    placeholder that no account can ever list as "mine".
// ---------------------------------------------------------------------------
async function runCreateTests() {
  call.db = makeMissionsDb({ missions: [], submissions: [] });

  const createdByAdmin = await call(rick, 'POST', 'https://x/api/missions', { title: '8-8-26', description: 'test', created_by_teacher_id: '' });
  if (createdByAdmin.status === 200 && createdByAdmin.json.ok && createdByAdmin.json.mission.created_by_teacher_id === 'Rick Radle') {
    ok('admin-created mission with no explicit owner gets a real, stable, server-derived owner (Rick\'s own identity), not the orphaned "teacher" placeholder');
  } else bad('admin create owner derivation', createdByAdmin);

  // The newly created mission must now be visible in admin's own broad-scope list.
  const listAfter = await call(rick, 'GET', 'https://x/api/missions/teacher');
  if (listAfter.json.ok && listAfter.json.missions.some((m) => m.title === '8-8-26')) {
    ok('a mission admin just created immediately appears in admin\'s own missions list (no more "would not save" symptom)');
  } else bad('newly created admin mission visible in list', listAfter);

  const createdByTeacher = await call(teacher1, 'POST', 'https://x/api/missions', { title: 'Carter mission 2' });
  if (createdByTeacher.status === 200 && createdByTeacher.json.mission.created_by_teacher_id === 'teacher1') {
    ok('real teacher-created mission is owned by their own session teacher_id');
  } else bad('teacher create owner', createdByTeacher);

  const createdByStudent = await call(lucas, 'POST', 'https://x/api/missions', { title: 'nope' });
  if (createdByStudent.status === 403) {
    ok('student cannot create missions (teacher-only route gate preserved)');
  } else bad('student blocked from create', createdByStudent);

  const missingTitle = await call(rick, 'POST', 'https://x/api/missions', {});
  if (missingTitle.status === 400 && !missingTitle.json.ok) {
    ok('create validation still rejects a missing title with a visible error');
  } else bad('missing title validation', missingTitle);
}

// ---------------------------------------------------------------------------
// 5. Frontend static checks — teacher.html must not re-introduce the
//    falsy-empty-string bug, and must surface real errors instead of a false
//    success state.
// ---------------------------------------------------------------------------
function runFrontendStaticChecks() {
  const teacherHtml = fs.readFileSync(path.join(root, 'app/teacher.html'), 'utf8');

  const refreshBlock = teacherHtml.match(/async function refresh\(\)\{[\s\S]{0,1600}/);
  if (refreshBlock && /if \(avatarApiBase !== null\) \{\s*var missionsRes/.test(refreshBlock[0])) {
    ok('teacher.html refresh(): D1-backed mission/submission re-fetch gate uses avatarApiBase !== null (same-origin "" no longer silently skipped)');
  } else bad('refresh() mission re-fetch gate regressed to a falsy truthy-check', refreshBlock && refreshBlock[0].slice(0, 400));

  if (!/if \(avatarApiBase\) \{\s*var missionsRes/.test(teacherHtml)) {
    ok('teacher.html: no lingering truthy-only avatarApiBase gate around the Worker mission re-fetch');
  } else bad('teacher.html still has a truthy-only avatarApiBase gate around mission re-fetch');

  const createBlock = teacherHtml.match(/function callCreateTeacherMission\(opts\)\{[\s\S]{0,700}/);
  if (createBlock && /avatarApiBase !== null/.test(createBlock[0]) && /\/api\/missions/.test(createBlock[0]) && /credentials: 'include'/.test(createBlock[0])) {
    ok('teacher.html: mission create posts directly to the secured /api/missions Worker route with credentials');
  } else bad('callCreateTeacherMission missing secured Worker path', createBlock && createBlock[0]);

  if (createBlock && !/created_by_teacher_id: approvalStaffId \|\| 'teacher'/.test(createBlock[0])) {
    ok('teacher.html: create request does not inject a client-side "teacher" placeholder owner (server derives the real owner)');
  } else bad('client-side owner placeholder re-introduced', createBlock && createBlock[0]);

  const clickBlock = teacherHtml.match(/createMissionBtn'\)\.addEventListener\('click'[\s\S]{0,4500}/);
  if (clickBlock && /if \(!res \|\| !res\.ok\)\{/.test(clickBlock[0]) && /toast\('Couldn/.test(clickBlock[0])) {
    ok('teacher.html: Save Mission only shows success after res.ok — failures surface a visible toast (false-success guard)');
  } else bad('create click handler missing error-visibility guard', clickBlock && clickBlock[0]);

  // Prompt #73 Defect 1: rewritten as try/catch (not try/finally) because the success path itself
  // re-enables the button after a delayed "Created ✓" state; the catch block still guarantees the
  // button is never permanently stuck disabled on an unexpected exception (Prompt #71 contract kept).
  if (clickBlock && /btn\.disabled = true;/.test(clickBlock[0]) && /catch \(e\) \{[\s\S]*?btn\.disabled = false;/.test(clickBlock[0])) {
    ok('teacher.html: Save Mission click handler always re-enables the button in its catch block — can never get permanently stuck disabled on an unexpected exception (Prompt #71)');
  } else bad('create click handler missing exception-safe button-reenable guard (Prompt #71 regression)', clickBlock && clickBlock[0]);

  const approveBlock = teacherHtml.match(/function callApproveMissionSubmission\(id\)\{[\s\S]{0,500}/);
  if (approveBlock && /avatarApiBase !== null && id/.test(approveBlock[0]) && /submissions\/approve/.test(approveBlock[0]) && /credentials: 'include'/.test(approveBlock[0])) {
    ok('teacher.html: approve control still calls the secured Prompt #67 Worker route with credentials');
  } else bad('approve control missing secured Worker path', approveBlock && approveBlock[0]);

  const rejectBlock = teacherHtml.match(/function callRejectMissionSubmission\(id\)\{[\s\S]{0,600}/);
  if (rejectBlock && /submissions\/reject/.test(rejectBlock[0]) && /credentials: 'include'/.test(rejectBlock[0])) {
    ok('teacher.html: reject control reaches the secured Worker route (was previously legacy-runner-only)');
  } else bad('reject control missing secured Worker path', rejectBlock && rejectBlock[0]);

  const returnBlock = teacherHtml.match(/function callReturnMissionSubmissionForImprovements\(id, reason\)\{[\s\S]{0,700}/);
  if (returnBlock && /submissions\/return/.test(returnBlock[0]) && /credentials: 'include'/.test(returnBlock[0])) {
    ok('teacher.html: return-for-improvements control reaches the secured Worker route (was previously legacy-runner-only)');
  } else bad('return control missing secured Worker path', returnBlock && returnBlock[0]);

  // Private/incognito-context proof: the D1-backed read functions must not depend on localStorage.
  const readFns = teacherHtml.match(/function callGetMissionSubmissionsForTeacher\(\)\{[\s\S]{0,300}/);
  if (readFns && !/localStorage/.test(readFns[0])) {
    ok('teacher submissions queue read has no localStorage dependency — works from a fresh/private browser context');
  } else bad('teacher submissions queue read depends on localStorage', readFns && readFns[0]);
}

// ---------------------------------------------------------------------------
await runListTests();
await runSubmissionsQueueTests();
await runCreateTests();
runFrontendStaticChecks();

console.log('\n--- teacher-mission-pipeline-test: ' + passed + ' passed, ' + failed + ' failed ---');
process.exit(failed > 0 ? 1 : 0);
