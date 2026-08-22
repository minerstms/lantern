/**
 * Missions identity + authorization tests — Prompt #66
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  resolveStudentMissionIdentity,
  resolveSubmissionHistoryIdentity,
  missionVisibleToStudent,
  teacherOwnsMission,
} from '../missions-auth.js';
import { missionRewardTxId } from '../missions-reward.js';

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

const pilotEconomyCharacterName = (row) => {
  const mid = row.mtss_student_id != null ? String(row.mtss_student_id).trim() : '';
  if (mid) return mid;
  const scn = row.student_character_name != null ? String(row.student_character_name).trim() : '';
  if (scn) return scn;
  return String(row.username || '').trim();
};

const lucas = {
  username: '20889',
  role: 'student',
  display_name: 'Lucas',
  student_character_name: 'Lucas',
  mtss_student_id: '20889',
};

const workerIndex = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
const missionsHtml = fs.readFileSync(path.join(root, 'app/missions.html'), 'utf8');
const teacherHtml = fs.readFileSync(path.join(root, 'app/teacher.html'), 'utf8');
const apiJs = fs.readFileSync(path.join(root, 'app/js/lantern-api.js'), 'utf8');
const missionsHandlers = fs.readFileSync(path.join(root, 'worker/missions-handlers.js'), 'utf8');
const missionsReward = fs.readFileSync(path.join(root, 'worker/missions-reward.js'), 'utf8');

if (/import \{[^}]*handleMissionsRoutes[^}]*\} from '\.\/missions-handlers\.js'/.test(workerIndex)) {
  ok('worker imports secured missions-handlers module');
} else bad('worker missing missions-handlers import');

if (!/async function handleMissionsRoutes/.test(workerIndex)) {
  ok('legacy inline handleMissionsRoutes removed from index.js');
} else bad('legacy handleMissionsRoutes still in index.js');

if (/requireMissionSession/.test(missionsHandlers) && /approveMissionWithReward/.test(missionsHandlers)) {
  ok('missions-handlers uses session auth + server-side approval reward');
} else bad('missions-handlers missing auth/reward wiring');

const self = resolveStudentMissionIdentity(lucas, pilotEconomyCharacterName);
if (self.ok && self.characterName === '20889' && self.session_scoped) {
  ok('Lucas session mission identity resolves to economy key 20889');
} else bad('student mission identity', self);

const histSelf = resolveSubmissionHistoryIdentity(lucas, '99999', pilotEconomyCharacterName);
if (histSelf.ok && histSelf.characterName === '20889') {
  ok('student submission history ignores foreign character_name param');
} else bad('student cross-read blocked', histSelf);

const teacherHist = resolveSubmissionHistoryIdentity(
  { username: 't1', role: 'teacher', teacher_id: 't1' },
  '20889',
  pilotEconomyCharacterName
);
if (!teacherHist.ok && teacherHist.error === 'forbidden') {
  ok('teacher cannot browse submissions via character endpoint');
} else bad('teacher character submissions blocked', teacherHist);

const myStudents = missionVisibleToStudent({ audience: 'my_students' }, '20889');
if (myStudents === false) ok('my_students hidden until roster data exists');
else bad('my_students should not be visible to students');

const school = missionVisibleToStudent({ audience: 'school_mission' }, '20889');
if (school === true) ok('school_mission visible to student');
else bad('school_mission visibility');

const owns = teacherOwnsMission({ username: 't1', role: 'teacher', teacher_id: 't1' }, 't1');
if (owns) ok('teacher owns own missions');
else bad('teacher ownership');

const txId = missionRewardTxId('msub_test123');
if (txId === 'tx_mission_msub_test123') ok('deterministic mission reward tx id');
else bad('reward tx id', txId);

if (/revertOnRewardFailure/.test(missionsReward) && /pending/.test(missionsReward)) {
  ok('approval reverts to pending if reward credit fails');
} else bad('reward failure revert missing');

if (!/missions\/active\?character_name=/.test(missionsHtml)) {
  ok('missions.html: active list no longer sends character_name');
} else bad('missions.html still sends character_name to active');

if (!/submissions\/character\?character_name=/.test(missionsHtml)) {
  ok('missions.html: submission history session-scoped');
} else bad('missions.html still sends character_name to submissions');

const submitBlock = missionsHtml.match(/function callSubmitMissionCompletion[\s\S]{0,450}/);
if (submitBlock && !/"character_name": characterName/.test(submitBlock[0])) {
  ok('missions.html: worker submit fetch no longer includes character_name');
} else bad('missions.html worker submit still sends character_name');

const approveBlock = teacherHtml.match(/function callApproveMissionSubmission[\s\S]{0,600}/);
if (approveBlock && !/callEconomyTransact/.test(approveBlock[0])) {
  ok('teacher.html: mission approval no longer calls separate economy transact');
} else bad('teacher.html still has client mission payout in callApproveMissionSubmission');

if (approveBlock && /credentials: 'include'/.test(approveBlock[0]) && /submissions\/approve/.test(approveBlock[0])) {
  ok('teacher.html: approve uses credentialed session fetch');
} else bad('teacher approve missing credentials');

if (!/economy_backend_charged/.test(apiJs.match(/approveMissionSubmission[\s\S]{0,400}/)?.[0] || '')) {
  ok('lantern-api: approve no longer sends economy_backend_charged to worker');
} else bad('lantern-api still sends economy_backend_charged on approve');

if (/path\.startsWith\('\/api\/missions'\)/.test(workerIndex) && /corsForPilot/.test(workerIndex.match(/api\/missions[\s\S]{0,500}/)?.[0] || '')) {
  ok('worker: missions routes use pilot CORS');
} else bad('worker missions CORS');

// Authorization matrix (static route wiring)
if (/requireMissionTeacher\(deps, request, env, cors\)/.test(missionsHandlers)) {
  ok('create/patch/moderation routes call requireMissionTeacher');
} else bad('teacher gate missing on management routes');

if (/rewardAmount: reward/.test(missionsHandlers) && /mission\.reward_amount/.test(missionsHandlers)) {
  ok('approval reward amount loaded from authoritative mission row');
} else bad('reward amount not server-sourced from mission');

if (/reviewerLabelFromAccount\(auth\.account\)/.test(missionsHandlers)) {
  ok('reviewer audit fields come from session account');
} else bad('reviewer identity not session-derived');

if (!/body\.teacher_id/.test(missionsHandlers.match(/submissions\/approve[\s\S]{0,800}/)?.[0] || '')) {
  ok('approve route does not trust body.teacher_id');
} else bad('approve still trusts body.teacher_id');

const tOwn = teacherOwnsMission({ username: 'ta', role: 'teacher', teacher_id: 'ta' }, 'tb');
if (!tOwn) ok('Teacher A cannot own Teacher B mission');
else bad('cross-teacher ownership leak');

const studentCreate = resolveStudentMissionIdentity(lucas, pilotEconomyCharacterName);
if (studentCreate.ok) ok('student has mission identity for self-service');
else bad('student identity', studentCreate);

const unauth = resolveStudentMissionIdentity(null, pilotEconomyCharacterName);
if (!unauth.ok && unauth.error === 'not_authenticated') ok('unauthenticated student identity rejected');
else bad('unauthenticated', unauth);

if (/firstTimeApproval/.test(missionsHandlers) && /!result\.idempotent/.test(missionsHandlers)) {
  ok('achievement/side effects skipped on idempotent approval replay');
} else bad('idempotent replay may rerun side effects');

console.log('\n--- missions-identity-auth-test: ' + passed + ' passed, ' + failed + ' failed ---');
process.exit(failed > 0 ? 1 : 0);
