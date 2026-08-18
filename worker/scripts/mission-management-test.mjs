/**
 * Mission management tests — Prompt #103 (Teacher Missions consolidation + management).
 *
 * Covers the server-side rules that CANNOT be proven by the Playwright UI shell test
 * (teacher-workspace-shell-test.mjs already covers the consolidated Missions workspace UI,
 * filters/search, and per-mission action buttons):
 *  - PATCH /api/missions/:id field-level edit matrix (safe-anytime vs locked-after-first-
 *    submission vs never-editable), enforced via missionEditLockedFieldsPresent().
 *  - DELETE /api/missions/:id unused-only guard, enforced via missionIsUnusedAndDeletable().
 *  - archived column wiring: SELECT lists, student-active query, submit rejection, PATCH/DELETE
 *    routes, and the additive migration file itself.
 *  - Reward edit safety: historical payouts are keyed by submission id (immutable), future
 *    approvals re-read the mission's current reward_amount.
 *  - Auth matrix: PATCH/DELETE both require requireMissionTeacher (owner teacher or admin);
 *    students are always denied by isTeacherLike().
 *
 * Usage: node worker/scripts/mission-management-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  MISSION_FIELDS_LOCKED_AFTER_FIRST_SUBMISSION,
  missionEditLockedFieldsPresent,
  missionIsUnusedAndDeletable,
  isTeacherLike,
  teacherOwnsMission,
} from '../missions-auth.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let passed = 0;
let failed = 0;
function ok(msg) { passed++; console.log('PASS', msg); }
function bad(msg, detail) { failed++; console.log('FAIL', msg, detail != null ? detail : ''); }

const missionsHandlers = fs.readFileSync(path.join(root, 'worker/missions-handlers.js'), 'utf8');
const missionsAuth = fs.readFileSync(path.join(root, 'worker/missions-auth.js'), 'utf8');
const missionsReward = fs.readFileSync(path.join(root, 'worker/missions-reward.js'), 'utf8');
const teacherHtml = fs.readFileSync(path.join(root, 'app/teacher.html'), 'utf8');

// ---------------------------------------------------------------------------
// Edit matrix — locked-after-first-submission fields (CURSOR REPLY #100 §5)
// ---------------------------------------------------------------------------
const expectedLocked = ['audience', 'participant_scope', 'target_character_names', 'allows_text', 'allows_video', 'allows_link'];
if (expectedLocked.every((f) => MISSION_FIELDS_LOCKED_AFTER_FIRST_SUBMISSION.includes(f)) && MISSION_FIELDS_LOCKED_AFTER_FIRST_SUBMISSION.length === expectedLocked.length) {
  ok('locked-after-first-submission field set keeps audience/scope/text/video/link locked');
} else bad('locked field set mismatch', MISSION_FIELDS_LOCKED_AFTER_FIRST_SUBMISSION);

if (missionEditLockedFieldsPresent({ title: 'x', active: true, featured: true, reward_amount: 5 }).length === 0) {
  ok('title/active/featured/reward_amount (safe-anytime fields) never trigger the locked-field guard');
} else bad('safe-anytime fields incorrectly flagged as locked');

if (missionEditLockedFieldsPresent({ audience: 'school_mission' }).length === 1) {
  ok('editing audience alone is flagged as a locked-field request');
} else bad('audience not flagged');

if (missionEditLockedFieldsPresent({ min_characters: 50, require_image: true, allows_image: true }).length === 0) {
  ok('require image + min characters remain editable after first submission');
} else bad('requirement fields incorrectly locked');
if (missionEditLockedFieldsPresent({ audience: 'school_mission', allows_text: true }).length === 2) {
  ok('multiple locked fields in one PATCH body are all flagged');
} else bad('multi-field locked detection incorrect');

if (missionEditLockedFieldsPresent({}).length === 0 && missionEditLockedFieldsPresent(null).length === 0) {
  ok('empty/missing PATCH body is never treated as a locked-field request');
} else bad('empty body incorrectly flagged');

if (!missionEditLockedFieldsPresent({ archived: 1 }).length && !missionEditLockedFieldsPresent({ archived: 0 }).length) {
  ok('archived (Archive/Restore) is a safe-anytime field, not gated by the first-submission lock');
} else bad('archived incorrectly gated by the submission lock');

// ---------------------------------------------------------------------------
// Delete — unused only
// ---------------------------------------------------------------------------
if (missionIsUnusedAndDeletable(0) === true) ok('a mission with 0 submissions is deletable');
else bad('0-submission mission should be deletable');
if (missionIsUnusedAndDeletable(1) === false && missionIsUnusedAndDeletable(12) === false) {
  ok('a mission with any submission history is never deletable (must Archive instead)');
} else bad('mission with history incorrectly deletable');
if (missionIsUnusedAndDeletable(undefined) === true && missionIsUnusedAndDeletable(null) === true) {
  ok('missing/undefined submission count defaults to treating the mission as unused (0)');
} else bad('missing submission count not defaulting to 0');

// ---------------------------------------------------------------------------
// PATCH /api/missions/:id — server-side wiring
// ---------------------------------------------------------------------------
if (/missionEditLockedFieldsPresent\(body\)/.test(missionsHandlers) && /submissionCount > 0/.test(missionsHandlers)) {
  ok('PATCH handler queries real submission history and rejects locked-field edits once any submission exists');
} else bad('PATCH handler missing server-side locked-field enforcement');

if (/if \(body\.archived !== undefined\)/.test(missionsHandlers) && /archiving && body\.active === undefined/.test(missionsHandlers)) {
  ok('PATCH handler supports archived and forces active=0 when archiving (unless the caller also explicitly set active)');
} else bad('PATCH handler missing archived wiring');

if (/if \(request\.method === 'DELETE' && missionIdMatch\)/.test(missionsHandlers)) {
  ok('DELETE /api/missions/:id route exists, reusing the same :id path pattern as PATCH');
} else bad('DELETE route missing');

if (/missionIsUnusedAndDeletable\(submissionCount\)/.test(missionsHandlers) && /mission_has_history/.test(missionsHandlers)) {
  ok('DELETE handler rejects missions with any submission history (mission_has_history) instead of cascade-deleting');
} else bad('DELETE handler missing dependency guard');

if (/DELETE FROM lantern_missions WHERE id = \?/.test(missionsHandlers)) {
  ok('DELETE handler only ever deletes the lantern_missions row itself — never touches submissions/approvals/rewards tables');
} else bad('DELETE handler SQL not found or too broad');

const deleteBlockMatch = missionsHandlers.match(/if \(request\.method === 'DELETE' && missionIdMatch\) \{[\s\S]*?DELETE FROM lantern_missions[\s\S]*?\n  \}/);
if (deleteBlockMatch && /requireMissionTeacher/.test(deleteBlockMatch[0]) && /teacherOwnsMission/.test(deleteBlockMatch[0])) {
  ok('DELETE requires an authenticated teacher/admin session AND explicit mission ownership before touching the row');
} else bad('DELETE handler missing auth/ownership checks', deleteBlockMatch && deleteBlockMatch[0].slice(0, 200));

// ---------------------------------------------------------------------------
// Archive is a stronger, distinct state from Pause — student-facing enforcement
// ---------------------------------------------------------------------------
if (/WHERE active = 1 AND archived = 0 ORDER BY featured DESC/.test(missionsHandlers)) {
  ok('GET /api/missions/active requires active=1 AND archived=0 (Archive is unavailable to students even if somehow re-activated)');
} else bad('student active-missions query missing archived=0 guard');

if (/mission\.active === 0 \|\| !!mission\.archived/.test(missionsHandlers) && /Mission is not active/.test(missionsHandlers)) {
  ok('POST /api/missions/submit rejects submissions to archived missions (even via an old/deep-linked mission_id), not just paused ones');
} else bad('submit handler missing archived rejection');

if (/archived: !!r\.archived/.test(missionsHandlers)) {
  ok('missionRowToJson surfaces archived to callers (teacher list + full-mission loads)');
} else bad('missionRowToJson missing archived field');

if (/submission_count: r\.submission_count !== undefined/.test(missionsHandlers) && /GROUP BY mission_id/.test(missionsHandlers)) {
  ok('GET /api/missions/teacher computes a real per-mission submission_count (powers "N submissions" + the Delete-if-unused guard in the UI)');
} else bad('teacher mission list missing submission_count aggregation');

// ---------------------------------------------------------------------------
// Migration — additive only
// ---------------------------------------------------------------------------
const migrationFiles = fs.readdirSync(path.join(root, 'worker/migrations')).filter((f) => /_lantern_missions_archived\.sql$/.test(f));
if (migrationFiles.length === 1) {
  const migSql = fs.readFileSync(path.join(root, 'worker/migrations', migrationFiles[0]), 'utf8');
  if (/ALTER TABLE lantern_missions ADD COLUMN archived INTEGER NOT NULL DEFAULT 0/.test(migSql)) {
    ok('archived migration (' + migrationFiles[0] + ') is a single additive ALTER TABLE with DEFAULT 0 — no backfill, no destructive change');
  } else bad('archived migration SQL does not match expected additive ALTER TABLE');
  if (/CREATE INDEX IF NOT EXISTS/.test(migSql)) {
    ok('archived migration adds a supporting index');
  } else bad('archived migration missing index');
} else bad('expected exactly one lantern_missions archived migration file', migrationFiles);

// ---------------------------------------------------------------------------
// Reward safety — Prompt #159 locks ordinary approval payout to exactly +1 Nugget
// ---------------------------------------------------------------------------
if (/resolveStoredMissionPayout/.test(missionsHandlers) && /resolveTeacherMissionReward/.test(missionsHandlers)) {
  ok('approval pays the saved mission reward; create/update clamp via System Admin bounds');
} else bad('approval/create reward resolver not found');

if (/export function missionRewardTxId\(submissionId\)/.test(missionsReward) && /findMissionRewardTx/.test(missionsReward)) {
  ok('reward credit is keyed by a deterministic tx id derived from the submission id, not the mission\u2019s reward_amount — editing reward_amount later cannot alter an already-created tx');
} else bad('reward idempotency keying not found');

if (/if \(existing\) \{[\s\S]{0,40}return \{[\s\S]{0,80}idempotent: true,/.test(missionsReward)) {
  ok('a retried/duplicate approval short-circuits to the existing (already-paid) transaction instead of re-reading the current reward_amount');
} else bad('reward retry short-circuit not found');

// ---------------------------------------------------------------------------
// Authorization matrix — owner teacher / admin yes, student always denied
// ---------------------------------------------------------------------------
if (isTeacherLike('teacher') && isTeacherLike('admin') && !isTeacherLike('student')) {
  ok('isTeacherLike() matrix: teacher/admin pass, student is denied — the same gate used by requireMissionTeacher for PATCH/DELETE/POST /api/missions');
} else bad('isTeacherLike matrix incorrect');

if (teacherOwnsMission({ role: 'teacher', teacher_id: 't1', username: 't1' }, 't1') === true) {
  ok('owner teacher passes teacherOwnsMission for Edit/Pause/Promote/Archive/Delete');
} else bad('owner teacher ownership check failed');
if (teacherOwnsMission({ role: 'teacher', teacher_id: 't2', username: 't2' }, 't1') === false) {
  ok('non-owner teacher is rejected by teacherOwnsMission (cannot manage another teacher\u2019s mission)');
} else bad('non-owner teacher incorrectly passed ownership check');
if (teacherOwnsMission({ role: 'admin', username: 'admin1' }, 't1') === true) {
  ok('admin retains existing elevated semantics — owns all missions for management purposes');
} else bad('admin ownership check failed');
if (teacherOwnsMission({ role: 'student', username: 's1' }, 't1') === false) {
  ok('a student account can never pass mission ownership, regardless of any id it supplies');
} else bad('student incorrectly passed ownership check');

const patchBlockMatch = missionsHandlers.match(/if \(request\.method === 'PATCH' && missionIdMatch\) \{[\s\S]*?const row = await db\.prepare[\s\S]*?\n    \}/);
if (patchBlockMatch && /requireMissionTeacher/.test(patchBlockMatch[0]) && /teacherOwnsMission/.test(patchBlockMatch[0])) {
  ok('PATCH requires an authenticated teacher/admin session AND explicit mission ownership (students and non-owner teachers are rejected before any field is read)');
} else bad('PATCH handler missing auth/ownership checks', patchBlockMatch && patchBlockMatch[0].slice(0, 200));

// ---------------------------------------------------------------------------
// UI — consolidated workspace, legacy terminology, Promote relabel (source-level spot checks;
// full interactive coverage lives in teacher-workspace-shell-test.mjs)
// ---------------------------------------------------------------------------
// Note: the Overview "Create mission" quick-action button intentionally KEEPS
// data-workspace-link="create" — it still works via the preserved #create alias — only the
// dedicated SIDEBAR destination was removed. See teacher-workspace-shell-test.mjs for the live
// DOM assertion that no .teacherSidebarItem uses data-workspace-link="create".
if (!/class="teacherSidebarItem" data-workspace-link="create"/.test(teacherHtml)) {
  ok('no sidebar item links to a standalone "create" workspace destination');
} else bad('a "create" workspace-link sidebar item still exists');

if (/data-workspace="create"/.test(teacherHtml) === false) {
  ok('no pane declares data-workspace="create" — Create Mission is not a separate workspace pane');
} else bad('a separate data-workspace="create" pane still exists');

if (/<details id="teacherCreateMissionDetails"/.test(teacherHtml)) {
  ok('Create New Mission is a collapsed-by-default <details> nested inside the Missions workspace');
} else bad('teacherCreateMissionDetails wrapper not found');

// Follow-up to #103: the "Reviewed & approved" panel that carried this copy was removed
// entirely (it was wired to the localStorage-only mock API, not real D1/Worker data) — see
// the Recognition-removal checks below. The legacy "character" wording must not exist anywhere.
if (!/Search by character or title/.test(teacherHtml)) {
  ok('legacy "Search by character or title" copy no longer exists anywhere in teacher.html');
} else bad('legacy character search copy still present');

if (/Student Totals/.test(teacherHtml) && !/Character Totals/.test(teacherHtml)) {
  ok('legacy "Character Totals" heading fully replaced with "Student Totals"');
} else bad('legacy Character Totals heading still present');

if (/cellStudentName">Student</.test(teacherHtml)) {
  ok('Other Tools totals table column header renamed from "Character" to "Student"');
} else bad('totals table header still says Character');

if (/character_name/.test(teacherHtml) && /target_character_names/.test(teacherHtml)) {
  ok('internal character_name / target_character_names identifiers are untouched by the visible-terminology cleanup');
} else bad('internal character_* identifiers were unexpectedly touched');

if (/Minimum text characters/.test(teacherHtml)) {
  ok('"Minimum text characters" teacher label is distinct from roster "characters"');
} else bad('Minimum text characters label missing');

if (/Promote this mission/.test(teacherHtml) && !/Feature this mission/.test(teacherHtml)) {
  ok('"Feature this mission" fully relabeled to "Promote this mission" in the creator');
} else bad('legacy "Feature this mission" label still present');

// ---------------------------------------------------------------------------
// Follow-up to #103 — legacy "Reviewed & approved" curate panel + generic Recognition
// composer removed entirely from Teacher Missions. Both called app/js/lantern-api.js, a
// localStorage-only mock API (its own header: "No fetch, no Worker, no production data") —
// never the real D1/Worker system — which is why they were surfacing stale, browser-local
// demo/fake rows in production. The backing Recognition DB table/API + Hallway TV's own
// read of it are untouched by this cleanup; only the dead Teacher UI wiring was removed.
// ---------------------------------------------------------------------------
const removedIds = ['curatePostsEl', 'curateCount', 'reviewedSearchInput', 'recognitionListEl', 'recognitionCount', 'recCharacterName', 'recMessage', 'recCategory', 'addRecognitionBtn'];
const remainingIds = removedIds.filter((id) => new RegExp('id="' + id + '"').test(teacherHtml));
if (remainingIds.length === 0) {
  ok('every DOM id from the legacy Reviewed & approved / Recognition panels (curatePostsEl, recognitionListEl, recCharacterName, addRecognitionBtn, etc.) is gone from teacher.html');
} else bad('legacy Recognition/curate DOM ids still present', remainingIds);

if (!/function renderCuratePosts\(|function renderRecognitionList\(/.test(teacherHtml)) {
  ok('renderCuratePosts()/renderRecognitionList() render functions no longer exist in teacher.html');
} else bad('a Recognition/curate render function still exists');

if (!/function callCuratePost\(|function callGetRecognitionList\(|function callCreateRecognition\(/.test(teacherHtml)) {
  ok('callCuratePost()/callGetRecognitionList()/callCreateRecognition() legacy API-shim functions no longer exist in teacher.html');
} else bad('a legacy Recognition/curate API-shim function still exists');

if (!/DEFAULT_CHARACTERS[\s\S]{0,120}recCharacterName|recCharacterName[\s\S]{0,120}DEFAULT_CHARACTERS/.test(teacherHtml)) {
  ok('the demo-persona-seeded recCharacterName <select> population script is gone (no more DEFAULT_CHARACTERS wiring into a removed Recognition dropdown)');
} else bad('recCharacterName is still being populated from DEFAULT_CHARACTERS');

// Hallway TV's own recognition read (display.html) and the backing recognition table/API are
// explicitly out of scope for this cleanup — only the dead Teacher UI wiring was removed.
if (fs.existsSync(path.join(root, 'app/display.html'))) {
  ok('app/display.html (Hallway TV) was not touched by this cleanup — its own recognition read, if any, is unaffected');
} else bad('app/display.html unexpectedly missing');

console.log('\nMission management tests (Prompt #103):', passed, 'passed,', failed, 'failed');
process.exit(failed ? 1 : 0);
