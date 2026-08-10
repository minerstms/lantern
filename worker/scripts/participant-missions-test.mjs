/**
 * Prompt #107 — participant mission access, audience scope, self-approval deny (mock D1).
 */
import { handleMissionsRoutes } from '../missions-handlers.js';
import {
  isSelfMissionSubmission,
  missionVisibleToParticipant,
  normalizeParticipantScope,
  resolveParticipantMissionIdentity,
  staffMissionSubmitterKey,
} from '../missions-auth.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

const missions = new Map();
const submissions = new Map();

function makeDb() {
  return {
    prepare(sql) {
      const s = String(sql);
      return {
        bind(...binds) {
          this._binds = binds;
          return this;
        },
        async all() {
          if (s.includes('FROM lantern_missions') && s.includes('active = 1')) {
            return { results: [...missions.values()].filter((m) => m.active === 1 && !m.archived) };
          }
          if (s.includes('FROM lantern_missions WHERE teacher_id')) {
            const tid = this._binds[0];
            return { results: [...missions.values()].filter((m) => m.teacher_id === tid) };
          }
          if (s.includes('FROM lantern_missions ORDER BY')) {
            return { results: [...missions.values()] };
          }
          if (s.includes('COUNT(*)') && s.includes('lantern_mission_submissions')) {
            const ids = this._binds || [];
            const counts = {};
            for (const sub of submissions.values()) {
              if (ids.includes(sub.mission_id)) counts[sub.mission_id] = (counts[sub.mission_id] || 0) + 1;
            }
            return { results: Object.keys(counts).map((mission_id) => ({ mission_id, n: counts[mission_id] })) };
          }
          return { results: [] };
        },
        async first() {
          if (s.includes('FROM lantern_missions WHERE id')) {
            return missions.get(this._binds[0]) || null;
          }
          if (s.includes('FROM lantern_mission_submissions WHERE id')) {
            return submissions.get(this._binds[0]) || null;
          }
          if (s.includes('FROM lantern_mission_submissions WHERE mission_id') && s.includes('character_name')) {
            const [mid, cname] = this._binds;
            for (const sub of submissions.values()) {
              if (sub.mission_id === mid && sub.character_name === cname) return sub;
            }
            return null;
          }
          if (s.includes('COUNT(*) AS n FROM lantern_mission_submissions WHERE mission_id')) {
            const mid = this._binds[0];
            let n = 0;
            for (const sub of submissions.values()) if (sub.mission_id === mid) n++;
            return { n };
          }
          return null;
        },
        async run() {
          if (s.startsWith('INSERT INTO lantern_missions')) {
            const [
              id, teacher_id, teacher_name, title, description, reward_amount, submission_type,
              audience, participant_scope, target_character_names, featured, active, site_eligible,
              allows_text, allows_image, allows_video, allows_link, min_characters, created_at,
            ] = this._binds;
            missions.set(id, {
              id, teacher_id, teacher_name, title, description, reward_amount, submission_type,
              audience, participant_scope, target_character_names, featured, active, archived: 0,
              site_eligible, allows_text, allows_image, allows_video, allows_link, min_characters, created_at,
            });
            return { meta: { changes: 1 } };
          }
          if (s.startsWith('INSERT INTO lantern_mission_submissions')) {
            const [id, mission_id, character_name, submission_type, submission_content, status, created_at] = this._binds;
            submissions.set(id, { id, mission_id, character_name, submission_type, submission_content, status, created_at });
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 1 } };
        },
      };
    },
  };
}

const jsonResponse = (body, status) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const deps = {
  jsonResponse,
  pilotEconomyCharacterName: (a) => (a && a.mtss_student_id) || (a && a.student_character_name) || '',
  getPilotAccountFromRequest: async (req) => {
    const h = req.headers.get('x-test-account');
    return h ? JSON.parse(h) : null;
  },
  pilotAccountRequiresChangePassword: () => false,
};

async function call(method, path, account, body) {
  const req = new Request('https://lantern.test' + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-test-account': JSON.stringify(account),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  // Patch requireMissionSession path: handlers call deps.getPilotAccountFromRequest
  const env = { DB: makeDb() };
  // missions-handlers uses requireMissionSession from missions-auth which needs getPilotAccountFromRequest on deps
  const res = await handleMissionsRoutes(req, new URL(req.url), path, env, {}, {
    ...deps,
    getPilotAccountFromRequest: async () => account,
  });
  const data = await res.json();
  return { status: res.status, data };
}

const student = { username: 'stu1', role: 'student', mtss_student_id: 'S001', display_name: 'Student One' };
const teacherA = { username: 'teachera', role: 'teacher', teacher_id: 'T1', display_name: 'Teacher A' };
const teacherB = { username: 'teacherb', role: 'teacher', teacher_id: 'T2', display_name: 'Teacher B' };
const admin = { username: 'admin1', role: 'admin', display_name: 'Admin One' };

// Unit checks
assert(normalizeParticipantScope('') === 'students', 'default scope students');
assert(staffMissionSubmitterKey(teacherA) === 'staff:teachera', 'staff submitter key');
const idStaff = resolveParticipantMissionIdentity(teacherA, () => '');
assert(idStaff.ok && idStaff.participantKind === 'staff', 'teacher is participant');
const idAdmin = resolveParticipantMissionIdentity(admin, () => '');
assert(idAdmin.ok && idAdmin.participantKind === 'staff', 'admin is participant');
assert(
  !missionVisibleToParticipant({ participant_scope: 'students', audience: 'school_mission' }, idStaff),
  'staff excluded from students-only'
);
assert(
  missionVisibleToParticipant({ participant_scope: 'staff', audience: 'school_mission' }, idStaff),
  'staff sees staff missions'
);
assert(
  missionVisibleToParticipant({ participant_scope: 'everyone', audience: 'school_mission' }, idStaff),
  'staff sees everyone'
);
assert(
  isSelfMissionSubmission(teacherA, 'staff:teachera'),
  'self submission detected'
);
assert(
  !isSelfMissionSubmission(teacherB, 'staff:teachera'),
  'other teacher not self'
);

// Seed missions via create
{
  const env = { DB: makeDb() };
  const createReq = new Request('https://lantern.test/api/missions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Students Only Mission',
      description: 'd',
      reward_amount: 1,
      audience: 'school_mission',
      participant_scope: 'students',
    }),
  });
  await handleMissionsRoutes(createReq, new URL(createReq.url), '/api/missions', env, {}, {
    ...deps,
    getPilotAccountFromRequest: async () => teacherA,
  });
  const createStaff = new Request('https://lantern.test/api/missions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Staff Mission',
      description: 'd',
      reward_amount: 1,
      audience: 'school_mission',
      participant_scope: 'staff',
    }),
  });
  await handleMissionsRoutes(createStaff, new URL(createStaff.url), '/api/missions', env, {}, {
    ...deps,
    getPilotAccountFromRequest: async () => teacherA,
  });
  const createEveryone = new Request('https://lantern.test/api/missions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Everyone Mission',
      description: 'd',
      reward_amount: 1,
      audience: 'school_mission',
      participant_scope: 'everyone',
    }),
  });
  await handleMissionsRoutes(createEveryone, new URL(createEveryone.url), '/api/missions', env, {}, {
    ...deps,
    getPilotAccountFromRequest: async () => teacherA,
  });

  async function activeFor(account) {
    const req = new Request('https://lantern.test/api/missions/active', { method: 'GET' });
    const res = await handleMissionsRoutes(req, new URL(req.url), '/api/missions/active', env, {}, {
      ...deps,
      getPilotAccountFromRequest: async () => account,
    });
    return res.json();
  }

  const teacherActive = await activeFor(teacherA);
  assert(teacherActive.ok, 'teacher active ok');
  const tTitles = (teacherActive.missions || []).map((m) => m.title);
  assert(!tTitles.includes('Students Only Mission'), 'students-only hidden from teacher');
  assert(tTitles.includes('Staff Mission'), 'staff mission visible to teacher');
  assert(tTitles.includes('Everyone Mission'), 'everyone visible to teacher');

  const adminActive = await activeFor(admin);
  assert(adminActive.ok, 'admin active ok');
  assert((adminActive.missions || []).some((m) => m.title === 'Staff Mission'), 'admin sees staff mission');

  const studentActive = await activeFor(student);
  assert(studentActive.ok, 'student active ok');
  const sTitles = (studentActive.missions || []).map((m) => m.title);
  assert(sTitles.includes('Students Only Mission'), 'student sees students mission');
  assert(!sTitles.includes('Staff Mission'), 'student does not see staff-only');
  assert(sTitles.includes('Everyone Mission'), 'student sees everyone');

  // Staff submit
  const staffMission = (teacherActive.missions || []).find((m) => m.title === 'Staff Mission');
  assert(staffMission, 'staff mission id');
  const submitReq = new Request('https://lantern.test/api/missions/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mission_id: staffMission.id,
      submission_type: 'text',
      submission_content: 'Teacher reflection with enough characters for the default minimum length requirement here. Adding more words so we clear the two hundred character floor for written responses on staff participant missions under Prompt 107.',
    }),
  });
  const submitRes = await handleMissionsRoutes(submitReq, new URL(submitReq.url), '/api/missions/submit', env, {}, {
    ...deps,
    getPilotAccountFromRequest: async () => teacherA,
  });
  const submitData = await submitRes.json();
  assert(submitData.ok, 'staff submit ok: ' + JSON.stringify(submitData));
  const subId = submitData.id || submitData.submission_id || [...submissions.keys()].pop();
  // Find submission
  let submission = null;
  for (const s of submissions.values()) {
    if (s.character_name === 'staff:teachera') submission = s;
  }
  assert(submission, 'submission keyed staff:teachera');

  // Self-approve denied
  const selfApprove = new Request('https://lantern.test/api/missions/submissions/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: submission.id }),
  });
  const selfRes = await handleMissionsRoutes(selfApprove, new URL(selfApprove.url), '/api/missions/submissions/approve', env, {}, {
    ...deps,
    getPilotAccountFromRequest: async () => teacherA,
  });
  const selfData = await selfRes.json();
  assert(selfRes.status === 403 && selfData.error === 'self_approval_forbidden', 'self approve denied');
}

console.log('PASS — participant missions #107 focused tests');
