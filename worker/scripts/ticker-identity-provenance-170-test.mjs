/**
 * Prompt #170 — durable identity is captured at WRITE time and resolved at READ time.
 * Usage: node worker/scripts/ticker-identity-provenance-170-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import worker from '../index.js';
import { durableAccountKeyFromPilotAccount, staffIdFromEconomyKey } from '../durable-account-key.js';
import {
  collectMarqueeEvents,
  resolveMarqueeActorIdentity,
  avatarProfileKeyForAccountRow,
} from '../marquee-events.js';
import { buildStaffPublicNameIndex } from '../staff-public-name.js';
import { formatTickerCopy } from '../marquee-ticker-contract.js';
import { handleMissionsRoutes } from '../missions-handlers.js';
import { resolveParticipantMissionIdentity, staffMissionSubmitterKey } from '../missions-auth.js';
import { staffEconomyKey, resolveEconomyGamePlayTransact } from '../economy-balance-auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

let pass = 0;
let fail = 0;
function ok(msg) {
  pass++;
  console.log('PASS', msg);
}
function bad(msg, detail) {
  fail++;
  console.error('FAIL', msg, detail != null ? detail : '');
}
function assert(cond, msg, detail) {
  if (cond) ok(msg);
  else bad(msg, detail);
}

const TEST_PILOT_SECRET = 'test-secret-not-a-real-pilot-session-secret';

function b64url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function signTestJwt(payload, secret) {
  const enc = new TextEncoder();
  const headerB64 = b64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payloadB64 = b64url(enc.encode(JSON.stringify(payload)));
  const data = `${headerB64}.${payloadB64}`;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return `${data}.${b64url(new Uint8Array(sigBuf))}`;
}

async function cookieFor(account) {
  const now = Math.floor(Date.now() / 1000);
  const token = await signTestJwt(
    {
      sub: account.username,
      role: account.role,
      scn: account.student_character_name || null,
      tid: account.teacher_id || null,
      iat: now,
      exp: now + 3600,
    },
    TEST_PILOT_SECRET
  );
  return `lantern_pilot=${token}`;
}

const STUDENT = {
  username: '20889',
  display_name: 'Lucas',
  public_display_name: 'Lucas R.',
  first_name: 'Lucas',
  last_name: 'Reed',
  role: 'student',
  student_character_name: 'Lucas',
  mtss_student_id: '20889',
  teacher_id: null,
  staff_id: null,
  is_active: 1,
  must_change_password: 0,
  password_hash: 'x',
  password_salt: 'x',
};
const TEACHER = {
  username: 'rick.radle',
  display_name: 'Teacher',
  public_display_name: 'Mr. Radle',
  first_name: 'Rick',
  last_name: 'Radle',
  honorific: 'Mr.',
  role: 'teacher',
  student_character_name: null,
  mtss_student_id: null,
  teacher_id: 'T4',
  staff_id: 4,
  is_active: 1,
  must_change_password: 0,
  password_hash: 'x',
  password_salt: 'x',
};
const ADMIN = {
  username: 'admin',
  display_name: 'Web Admin',
  public_display_name: 'Web Admin',
  first_name: 'Web',
  last_name: 'Admin',
  role: 'admin',
  student_character_name: null,
  mtss_student_id: null,
  teacher_id: null,
  staff_id: 1,
  is_active: 1,
  must_change_password: 0,
  password_hash: 'x',
  password_salt: 'x',
};
const COLORADO = {
  username: 'eric.colorado',
  display_name: 'Eric Colorado',
  public_display_name: 'Mr. Colorado',
  first_name: 'Eric',
  last_name: 'Colorado',
  honorific: 'Mr.',
  role: 'teacher',
  teacher_id: 'T13',
  staff_id: 13,
  is_active: 1,
  must_change_password: 0,
};
const JOHN_A = {
  username: 'john.a',
  display_name: 'John Smith',
  public_display_name: 'John S.',
  first_name: 'John',
  last_name: 'Smith',
  role: 'student',
  student_character_name: 'john.a',
  mtss_student_id: '11111',
  is_active: 1,
};
const JOHN_B = {
  username: 'john.b',
  display_name: 'John Baker',
  public_display_name: 'John B.',
  first_name: 'John',
  last_name: 'Baker',
  role: 'student',
  student_character_name: 'John B',
  mtss_student_id: '22222',
  is_active: 1,
};

function accountRow(row) {
  return {
    ...row,
    is_active: row.is_active != null ? row.is_active : 1,
    must_change_password: row.must_change_password != null ? row.must_change_password : 0,
    password_hash: row.password_hash || 'x',
    password_salt: row.password_salt || 'x',
  };
}

function makeWriteState(accounts) {
  const state = {
    accounts: {},
    contribs: [],
    polls: [],
    news: [],
    recognitions: [],
    people: [],
    approvals: [],
    missions: [],
    submissions: [],
    entries: [],
    transactions: [],
  };
  (accounts || []).forEach((a) => {
    state.accounts[String(a.username).toLowerCase()] = accountRow(a);
  });
  return state;
}

function makeWriteEnv(state) {
  function prepare(sql) {
    const s = String(sql);
    const binds = [];
    const api = {
      bind(...args) {
        binds.push(...args);
        return api;
      },
      async first() {
        if (s.includes('FROM lantern_pilot_accounts WHERE lower(trim(username))')) {
          const key = String(binds[0] || '').trim().toLowerCase();
          return state.accounts[key] || null;
        }
        if (s.includes('FROM lantern_polls WHERE mission_submission_id')) {
          return state.polls.find((p) => p.mission_submission_id === binds[0]) || null;
        }
        if (s.includes('FROM lantern_missions WHERE id')) {
          return state.missions.find((m) => m.id === binds[0]) || null;
        }
        if (s.includes('FROM lantern_mission_submissions WHERE mission_id') && s.includes('character_name')) {
          const [mid, cname] = binds;
          const rows = state.submissions.filter((x) => x.mission_id === mid && x.character_name === cname);
          return rows.length ? rows[rows.length - 1] : null;
        }
        if (s.includes('FROM lantern_transactions') && s.includes("json_extract(meta_json, '$.run_id')")) {
          const runId = binds[0];
          return (
            state.transactions.find((t) => {
              let meta = {};
              try {
                meta = JSON.parse(t.meta_json || '{}');
              } catch (_) {}
              return t.kind === 'game_play' && meta.run_id === runId;
            }) || null
          );
        }
        if (s.includes('FROM lantern_leaderboard_entries') && s.includes("json_extract(meta_json, '$.run_id')")) {
          const [characterName, gameName, runId] = binds;
          return (
            state.entries.find((e) => {
              let meta = {};
              try {
                meta = JSON.parse(e.meta_json || '{}');
              } catch (_) {}
              return e.character_name === characterName && e.game_name === gameName && meta.run_id === runId;
            }) || null
          );
        }
        return null;
      },
      async all() {
        if (s.includes('FROM lantern_leaderboard_entries')) return { results: state.entries.slice() };
        if (s.includes('FROM lantern_polls')) return { results: state.polls.slice() };
        if (s.includes('FROM lantern_missions')) return { results: state.missions.slice() };
        if (s.includes('FROM lantern_mission_submissions')) return { results: state.submissions.slice() };
        if (s.includes('FROM lantern_news_submissions')) return { results: state.news.slice() };
        if (s.includes('FROM lantern_teacher_recognition')) return { results: state.recognitions.slice() };
        if (s.includes('FROM lantern_content_people')) return { results: state.people.slice() };
        if (s.includes('FROM lantern_pilot_accounts')) {
          return { results: Object.values(state.accounts) };
        }
        if (s.includes('FROM tms_identity_links')) return { results: [] };
        return { results: [] };
      },
      async run() {
        if (s.includes('INSERT INTO lantern_poll_contributions')) {
          state.contribs.push({
            id: binds[0],
            character_name: binds[1],
            question: binds[2],
            choices_json: binds[3],
            status: binds[6],
          });
        }
        if (s.includes('INSERT INTO lantern_polls')) {
          const hasImage = s.includes('image_url');
          state.polls.push({
            id: binds[0],
            mission_submission_id: binds[1],
            question: binds[2],
            created_by_character: hasImage ? binds[5] : binds[4],
            character_name: hasImage ? binds[6] : binds[5],
            created_at: hasImage ? binds[7] : binds[6],
            approved_at: hasImage ? binds[8] : binds[7],
            hidden_at: null,
          });
        }
        if (s.includes('INSERT INTO lantern_news_submissions')) {
          state.news.push({
            id: binds[0],
            title: binds[1],
            body: binds[2],
            actor_id: binds[3],
            author_name: binds[4],
            author_type: binds[5],
            category: binds[17],
            status: binds[18],
            created_at: binds[19],
            reviewed_at: binds[20],
            hidden_at: null,
          });
        }
        if (s.includes('INSERT INTO lantern_teacher_recognition')) {
          state.recognitions.push({
            id: binds[0],
            character_name: binds[1],
            message: binds[2],
            created_by_teacher_id: binds[5],
            created_by_teacher_name: binds[6],
            created_at: binds[4],
          });
        }
        if (s.includes('INSERT INTO lantern_content_people')) {
          state.people.push({
            content_kind: binds[1],
            content_id: binds[2],
            person_kind: binds[3],
            person_key: binds[4],
            relationship: binds[5],
            display_label: binds[6],
          });
        }
        if (s.includes('INSERT INTO lantern_approvals')) {
          state.approvals.push({ id: binds[0], item_type: binds[1], submitted_by_actor_id: binds[4] });
        }
        if (s.includes('INSERT INTO lantern_missions')) {
          state.missions.push({
            id: binds[0],
            teacher_id: binds[1],
            teacher_name: binds[2],
            title: binds[3],
            active: 1,
            archived: 0,
            created_at: binds[binds.length - 1],
          });
        }
        if (s.includes('INSERT INTO lantern_mission_submissions')) {
          state.submissions.push({
            id: binds[0],
            mission_id: binds[1],
            character_name: binds[2],
            submission_type: binds[3],
            submission_content: binds[4],
            status: binds[5],
            created_at: binds[6],
          });
        }
        if (s.includes('INSERT INTO lantern_leaderboard_entries')) {
          state.entries.push({
            id: binds[0],
            game_name: binds[1],
            character_name: binds[2],
            score: binds[3],
            score_display: binds[4],
            meta_json: binds[5],
            created_at: binds[6],
          });
        }
        if (s.includes('UPDATE lantern_leaderboard_entries SET meta_json')) {
          const row = state.entries.find((e) => e.id === binds[1]);
          if (row) row.meta_json = binds[0];
        }
        return { success: true, meta: { changes: 1 } };
      },
    };
    return api;
  }
  return {
    DB: { prepare },
    PILOT_SESSION_SECRET: TEST_PILOT_SECRET,
  };
}

function makeMarqueeDb(tables) {
  tables = tables || {};
  return {
    prepare(sql) {
      const s = String(sql);
      const api = {
        bind() {
          return api;
        },
        async all() {
          if (s.includes('FROM lantern_polls')) return { results: tables.polls || [] };
          if (s.includes('FROM lantern_mission_submissions')) return { results: tables.submissions || [] };
          if (s.includes('FROM lantern_missions')) return { results: tables.missions || [] };
          if (s.includes('FROM lantern_news_submissions')) return { results: tables.news || [] };
          if (s.includes('FROM lantern_teacher_recognition')) return { results: tables.recognition || [] };
          if (s.includes('FROM lantern_leaderboard_entries')) {
            let rows = tables.leaderboard || [];
            if (s.includes('marquee_board_entry')) {
              rows = rows.filter((r) => {
                try {
                  const m = typeof r.meta_json === 'string' ? JSON.parse(r.meta_json) : r.meta_json || {};
                  return m.marquee_board_entry === true || m.marquee_board_entry === 1;
                } catch (_) {
                  return false;
                }
              });
            }
            return { results: rows };
          }
          if (s.includes('FROM lantern_pilot_accounts') && s.includes("'student'") && s.includes("'teacher'")) {
            return { results: [].concat(tables.staff || [], tables.students || []) };
          }
          if (s.includes('FROM lantern_pilot_accounts') && s.includes("'student'")) return { results: tables.students || [] };
          if (s.includes('FROM lantern_pilot_accounts')) return { results: tables.staff || [] };
          if (s.includes('FROM tms_identity_links')) return { results: tables.links || [] };
          if (s.includes('FROM lantern_content_people')) return { results: tables.people || [] };
          return { results: [] };
        },
        async first() {
          return null;
        },
      };
      return api;
    },
  };
}

async function postJson(env, cookie, urlPath, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  const req = new Request('https://lantern.example' + urlPath, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const res = await worker.fetch(req, env);
  const json = await res.json();
  return { status: res.status, json };
}

const jsonResponse = (body, status) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const missionDeps = {
  jsonResponse,
  pilotEconomyCharacterName: (a) => (a && a.mtss_student_id) || (a && a.student_character_name) || '',
  getPilotAccountFromRequest: async () => null,
  pilotAccountRequiresChangePassword: () => false,
};

async function missionCall(env, account, method, urlPath, body) {
  const req = new Request('https://lantern.test' + urlPath, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const res = await handleMissionsRoutes(req, new URL(req.url), urlPath.replace(/\?.*$/, ''), env, {}, {
    ...missionDeps,
    getPilotAccountFromRequest: async () => account,
  });
  const json = await res.json();
  return { status: res.status, json };
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const pollBody = {
  question: 'What is your favorite sport?',
  choices: ['Soccer', 'Basketball'],
  character_name: 'spoofed.user',
  author_name: 'Mr. Radle',
  account_key: 'eric.colorado',
};

assert(durableAccountKeyFromPilotAccount(STUDENT) === '20889', '1. student durable key is MTSS/economy id');
assert(durableAccountKeyFromPilotAccount(TEACHER) === 'rick.radle', '3. staff durable key is username, not display_name');
assert(durableAccountKeyFromPilotAccount(ADMIN) === 'admin', '4. Web Admin key is admin, not rick.radle');
assert(avatarProfileKeyForAccountRow(TEACHER) === 'rick.radle', '1b. avatar PK matches durable staff key');
assert(avatarProfileKeyForAccountRow(STUDENT) === '20889', '1c. avatar PK matches durable student key');
assert(staffIdFromEconomyKey('staff_id:4') === '4', 'staff_id economy key parses exactly');
assert(staffIdFromEconomyKey('staff:rick.radle') === '', 'staff:username is not a staff_id key');

{
  const idx = buildStaffPublicNameIndex([TEACHER, ADMIN, STUDENT, COLORADO, JOHN_A, JOHN_B]);
  const staffActor = resolveMarqueeActorIdentity(idx, ['rick.radle']);
  assert(staffActor.public_display_name === 'Mr. Radle' && staffActor.author_avatar_key === 'rick.radle', '2. staff session username maps to current name/avatar');
  const studentActor = resolveMarqueeActorIdentity(idx, ['20889']);
  assert(studentActor.public_display_name === 'Lucas R.' && studentActor.author_avatar_key === '20889', '2b. student session key maps to current name/avatar');
  const adminActor = resolveMarqueeActorIdentity(idx, ['admin']);
  assert(adminActor.author_avatar_key === 'admin' && adminActor.public_display_name === 'Web Admin', '4b/27. Web Admin != Rick');
  const rickFromAdmin = resolveMarqueeActorIdentity(idx, ['admin']);
  assert(rickFromAdmin.author_avatar_key !== 'rick.radle', '27. admin key does not resolve to rick.radle');
  assert(!resolveMarqueeActorIdentity(idx, ['Teacher']).author_avatar_key, '25. Teacher label does not map');
  assert(!resolveMarqueeActorIdentity(idx, ['Staff']).author_avatar_key, '26. Staff label does not map');
  assert(!resolveMarqueeActorIdentity(idx, ['Mr. Radle', 'Rick Radle']).author_avatar_key, '23. no fuzzy display-name matching');
  assert(!resolveMarqueeActorIdentity(idx, ['John', 'John Smith', 'John Baker', 'John S.']).author_avatar_key, '23b. same first name / display name does not match');
  assert(!resolveMarqueeActorIdentity(idx, ['rick']).author_avatar_key, '24. partial username does not match');
  assert(!resolveMarqueeActorIdentity(idx, ['eric', 'Eric Colorado', 'Colorado']).author_avatar_key, '28. Eric is not auto-linked');
  const gone = resolveMarqueeActorIdentity(idx, ['retired.account']);
  assert(!gone.author_avatar_key && !gone.public_display_name, 'inactive/removed account is unresolved');
  const paidStaff = resolveMarqueeActorIdentity(idx, ['staff_id:4']);
  assert(paidStaff.author_avatar_key === 'rick.radle' && paidStaff.public_display_name === 'Mr. Radle', '17. staff_id:N paid-run key resolves to username avatar');
  const staffPrefix = resolveMarqueeActorIdentity(idx, ['staff:rick.radle']);
  assert(staffPrefix.author_avatar_key === 'rick.radle', 'staff:username strips to durable username');
}

{
  const idxA = buildStaffPublicNameIndex([{ ...TEACHER, public_display_name: 'Mr. Radle' }]);
  const idxB = buildStaffPublicNameIndex([{ ...TEACHER, public_display_name: 'Coach Radle' }]);
  const a = resolveMarqueeActorIdentity(idxA, ['rick.radle']);
  const b = resolveMarqueeActorIdentity(idxB, ['rick.radle']);
  assert(a.public_display_name === 'Mr. Radle' && b.public_display_name === 'Coach Radle', '19/21. current public_display_name, not snapshot');
  assert(a.author_avatar_key === 'rick.radle' && b.author_avatar_key === 'rick.radle', '20/22. current approved avatar key, not snapshot URL');
}

{
  const copy = formatTickerCopy({ type: 'poll_created', primary_name: 'Lucas R.', object_title: 'What is your favorite sport?' });
  assert(copy === 'Lucas R. created a poll: What is your favorite sport?', '30. #167 poll grammar unchanged');
}

const workerIndex = read('worker/index.js');
const missionsSrc = read('worker/missions-handlers.js');
const eventsSrc = read('worker/marquee-events.js');
const tickerSrc = read('app/js/lantern-ticker.js');
assert(workerIndex.includes('durableAccountKeyFromPilotAccount(account)'), '38. poll/news use existing durable key helper');
assert(!/canonical_user_id_v2/.test(workerIndex + eventsSrc + missionsSrc), '38. no parallel identity store');
assert(!/byDisplayName/.test(eventsSrc), '23c. ticker still has no display-name index');
assert(missionsSrc.includes('sessionTeacherId(auth.account)') && !missionsSrc.includes('body.created_by_teacher_id || body.teacher_id'), '9. mission create ignores client teacher_id');
assert(workerIndex.includes('evaluatePaidGamePlayRun') && workerIndex.includes("error: 'invalid_run'"), '18. #159 paid-run proof still required');
assert(/Fail closed/.test(tickerSrc), '29. #146 fail-closed preserved');
assert(/formatTickerCopy/.test(eventsSrc), '30. #167 formatter still used');
assert(!/CREATE TABLE lantern_|ALTER TABLE lantern_/.test(eventsSrc + missionsSrc + workerIndex.slice(0, 500)), '36. no inline D1 migration');

{
  const contribIdx = workerIndex.indexOf("path === '/api/polls/contribute'");
  const slice = workerIndex.slice(contribIdx, contribIdx + 3500);
  assert(slice.includes('durableAccountKeyFromPilotAccount') && !slice.includes('account.display_name || account.username'), '5/6. poll write uses durable key, not display_name');
}

{
  const newsIdx = workerIndex.indexOf("path === '/api/news/create'");
  const slice = workerIndex.slice(newsIdx, newsIdx + 2500);
  assert(slice.includes('durableAccountKeyFromPilotAccount(account)') && !slice.includes('body.actor_id || account.username'), '20. news actor_id is session durable key');
}

// Poll student write + spoof
{
  const state = makeWriteState([STUDENT, TEACHER]);
  const env = makeWriteEnv(state);
  const r = await postJson(env, await cookieFor(STUDENT), '/api/polls/contribute', pollBody);
  assert(r.status === 200 && r.json.ok, '5. student poll contribute succeeds', r);
  assert(state.contribs[0] && state.contribs[0].character_name === '20889', '5. student poll stores exact durable key', state.contribs[0]);
  assert(state.contribs[0].character_name !== 'spoofed.user' && state.contribs[0].character_name !== 'Mr. Radle', '7. poll spoof ignored');
  assert(state.approvals[0] && state.approvals[0].submitted_by_actor_id === '20889', '5b. approval actor is student key');
}

// Poll staff write + spoof
{
  const state = makeWriteState([STUDENT, TEACHER]);
  const env = makeWriteEnv(state);
  const r = await postJson(env, await cookieFor(TEACHER), '/api/polls/contribute', {
    ...pollBody,
    character_name: 'Teacher',
    author_name: 'A student',
  });
  assert(r.status === 200 && r.json.ok && r.json.status === 'approved', '6. teacher poll publishes', r);
  assert(state.contribs[0] && state.contribs[0].character_name === 'rick.radle', '6. teacher poll stores username, not Teacher', state.contribs[0]);
  assert(state.polls[0] && state.polls[0].character_name === 'rick.radle' && state.polls[0].created_by_character === 'rick.radle', '6b. published poll retains exact teacher key', state.polls[0]);
}

// Mission create + spoof
{
  const state = makeWriteState([TEACHER, ADMIN]);
  const env = makeWriteEnv(state);
  const spoof = await missionCall(env, TEACHER, 'POST', '/api/missions', {
    title: 'STEM Today',
    description: 'x',
    teacher_id: 'admin',
    created_by_teacher_id: 'eric.colorado',
    teacher_name: 'Teacher',
    created_by_teacher_name: 'Staff',
  });
  assert(spoof.status === 200 && spoof.json.ok, '8. teacher mission create succeeds', spoof);
  assert(spoof.json.mission.created_by_teacher_id === 'T4', '8. exact teacher_id retained', spoof.json.mission);
  assert(spoof.json.mission.created_by_teacher_id !== 'eric.colorado', '9. mission creator spoof ignored');
  assert(spoof.json.mission.created_by_teacher_name !== 'Staff', '11. teacher_name is not client identity');

  const adminCreate = await missionCall(env, ADMIN, 'POST', '/api/missions', {
    title: 'Admin Mission',
    created_by_teacher_id: 'T4',
    teacher_id: 'rick.radle',
    teacher_name: 'Mr. Radle',
  });
  assert(adminCreate.json.mission.created_by_teacher_id === 'admin', '27. Web Admin mission is not Rick', adminCreate.json.mission);
}

// Mission completion + spoof
{
  const state = makeWriteState([STUDENT, TEACHER]);
  state.missions.push({
    id: 'tmission_stem',
    teacher_id: 'T4',
    teacher_name: 'Mr. Radle',
    title: 'STEM Today',
    description: 'd',
    reward_amount: 1,
    submission_type: 'text',
    audience: 'school_mission',
    participant_scope: 'everyone',
    featured: 0,
    active: 1,
    archived: 0,
    site_eligible: 0,
    allows_text: 1,
    allows_image: 0,
    allows_video: 0,
    allows_link: 0,
    min_characters: 0,
    created_at: '2026-08-13T00:00:00.000Z',
  });
  const env = makeWriteEnv(state);
  const r = await missionCall(env, STUDENT, 'POST', '/api/missions/submit', {
    mission_id: 'tmission_stem',
    submission_type: 'text',
    submission_content:
      'I finished the walk around the school and wrote about what I saw in the hallway, the gym, and the library so this meets the length gate for a text mission submission in Lantern and keeps going with extra detail about the day.',
    character_name: 'rick.radle',
  });
  assert(r.status === 200 && r.json.ok, '13. student mission submit succeeds', r);
  assert(state.submissions[0] && state.submissions[0].character_name === '20889', '14. completion stores exact completer key', state.submissions[0]);
  assert(state.submissions[0].character_name !== 'rick.radle', '15. spoofed completer ignored');
  const ident = resolveParticipantMissionIdentity(STUDENT, (a) => a.mtss_student_id);
  assert(ident.characterName === '20889', '13b. completer identity is session-derived');
  assert(staffMissionSubmitterKey(TEACHER) === 'staff:rick.radle', 'staff completion key is staff:username');
}

// Shout-Out / recognition
{
  const state = makeWriteState([TEACHER]);
  const env = makeWriteEnv(state);
  const team = await postJson(env, await cookieFor(TEACHER), '/api/recognition/create', {
    recognition_label: 'TMS Football',
    message: 'Great season, Trojans.',
  });
  assert(team.status === 200 && team.json.ok, '14. team shout-out succeeds', team);
  assert(state.recognitions[0] && state.recognitions[0].character_name === 'TMS Football', '14. team recipient remains entity label', state.recognitions[0]);
  assert(state.recognitions[0].created_by_teacher_id === 'T4', '13. sender exact teacher_id retained');
  assert(state.people.length === 0, '14b. team recipient does not create a fake person row');
}

{
  const events = await collectMarqueeEvents(
    makeMarqueeDb({
      staff: [TEACHER, COLORADO],
      students: [STUDENT],
      polls: [],
      missions: [],
      submissions: [],
      news: [],
      recognition: [
        {
          id: 'rec_team',
          character_name: 'TMS Football',
          created_by_teacher_id: 'T4',
          created_by_teacher_name: 'Teacher',
          created_at: '2026-08-13T12:00:00.000Z',
        },
      ],
      people: [],
      leaderboard: [],
    })
  );
  const rec = events.find((e) => e.source_id === 'rec_team');
  assert(rec && /TMS Football/.test(rec.public_text), '14c. ticker keeps TMS Football as entity', rec && rec.public_text);
  assert(rec && !rec.author_avatar_key, '14d. entity recipient has no fake person avatar', rec);
}

{
  const events = await collectMarqueeEvents(
    makeMarqueeDb({
      staff: [TEACHER, COLORADO],
      students: [STUDENT],
      polls: [],
      missions: [],
      submissions: [],
      news: [],
      recognition: [
        {
          id: 'rec_person',
          character_name: 'Mr. Colorado',
          created_by_teacher_id: 'T4',
          created_by_teacher_name: 'Teacher',
          created_at: '2026-08-13T12:00:00.000Z',
        },
      ],
      people: [
        {
          content_kind: 'recognition',
          content_id: 'rec_person',
          person_kind: 'staff',
          person_key: 'eric.colorado',
          relationship: 'recognized',
          display_label: 'Mr. Colorado',
        },
      ],
      leaderboard: [],
    })
  );
  const rec = events.find((e) => e.source_id === 'rec_person');
  assert(rec && rec.public_display_name === 'Mr. Colorado' && rec.author_avatar_key === 'eric.colorado', '12. human recipient key exact', rec);
  assert(rec && rec.secondary_display_name === 'Mr. Radle', '13b. sender resolves from created_by_teacher_id', rec);
  assert(rec && /Mr\. Colorado got a Shout-Out from Mr\. Radle/.test(rec.public_text), '18. recipient remains primary', rec && rec.public_text);
}

// News + spoof
{
  const state = makeWriteState([TEACHER, STUDENT]);
  const env = makeWriteEnv(state);
  const r = await postJson(env, await cookieFor(TEACHER), '/api/news/create', {
    title: 'Field Day Friday',
    body: 'Bring water.',
    actor_id: 'eric.colorado',
    author_name: 'Mr. Colorado',
    account_key: '20889',
  });
  assert(r.status === 200 && r.json.ok, '15. news create succeeds', r);
  assert(state.news[0] && state.news[0].actor_id === 'rick.radle', '15. news author exact key retained', state.news[0]);
  assert(state.news[0].actor_id !== 'eric.colorado', '16. spoofed author ignored');
}

{
  const state = makeWriteState([STUDENT, TEACHER]);
  const env = makeWriteEnv(state);
  const r = await postJson(env, await cookieFor(STUDENT), '/api/news/create', {
    title: 'Student post',
    body: 'Hello hallway.',
    actor_id: 'rick.radle',
    author_name: 'Mr. Radle',
  });
  assert(r.status === 200 && r.json.ok, 'student news contribute succeeds', r);
  assert(state.news[0] && state.news[0].actor_id === '20889', 'student news stores student durable key', state.news[0]);
}

// Leaderboard paid-run identity
{
  const state = makeWriteState([TEACHER]);
  state.transactions.push({
    id: 'tx-run-staff',
    character_name: staffEconomyKey(TEACHER),
    delta: -1,
    kind: 'game_play',
    source: 'GAME',
    note: 'Nugget Click Rush',
    created_at: new Date().toISOString(),
    meta_json: JSON.stringify({ game_name: 'Nugget Click Rush', game_id: 'clickrush', run_id: 'run-staff-1' }),
  });
  const env = makeWriteEnv(state);
  const r = await postJson(env, await cookieFor(TEACHER), '/api/leaderboards/record', {
    game_id: 'clickrush',
    score: 40,
    score_display: '40 taps',
    run_id: 'run-staff-1',
    character_name: 'Staff',
    account_key: 'admin',
  });
  const paid = resolveEconomyGamePlayTransact(TEACHER, 'Staff', () => '');
  assert(paid.ok && paid.characterName === 'staff_id:4', '22. paid-run identity is staff_id:N', paid);
  assert(r.status === 200 && r.json.ok, '22. staff paid record succeeds', r);
  assert(state.entries[0] && state.entries[0].character_name === 'staff_id:4', '22. leaderboard keeps paid-run account key', state.entries[0]);
  assert(state.entries[0].character_name !== 'Staff' && state.entries[0].score === 40, '35. score unchanged; not generic Staff');
}

{
  const events = await collectMarqueeEvents(
    makeMarqueeDb({
      staff: [TEACHER],
      students: [STUDENT],
      polls: [
        {
          id: 'poll_new',
          question: 'What is your favorite sport?',
          character_name: 'rick.radle',
          created_by_character: 'rick.radle',
          created_at: '2026-08-13T10:00:00.000Z',
          approved_at: '2026-08-13T10:00:00.000Z',
        },
        {
          id: 'poll_legacy',
          question: 'Legacy poll',
          character_name: 'Teacher',
          created_by_character: 'Teacher',
          created_at: '2026-08-01T10:00:00.000Z',
          approved_at: '2026-08-01T10:00:00.000Z',
        },
      ],
      missions: [
        {
          id: 'mission_t4',
          title: 'STEM Today',
          teacher_id: 'T4',
          teacher_name: 'Teacher',
          created_at: '2026-08-13T11:00:00.000Z',
          active: 1,
          archived: 0,
        },
        {
          id: 'perm_sys',
          title: 'SRP Safety',
          teacher_id: 'mr_radle',
          teacher_name: 'Mr. Radle',
          created_at: '2026-08-12T00:00:00.000Z',
          active: 1,
          archived: 0,
        },
      ],
      submissions: [
        {
          id: 'sub_lucas',
          mission_id: 'mission_t4',
          character_name: '20889',
          submission_type: 'text',
          submission_content: 'Done',
          status: 'accepted',
          created_at: '2026-08-13T12:00:00.000Z',
          reviewed_at: '2026-08-13T12:01:00.000Z',
          mission_title: 'STEM Today',
        },
      ],
      news: [
        {
          id: 'news_rick',
          title: 'Field Day Friday',
          body: 'Bring water.',
          actor_id: 'rick.radle',
          author_name: 'Teacher',
          author_type: 'teacher',
          category: 'news',
          created_at: '2026-08-13T14:00:00.000Z',
          reviewed_at: '2026-08-13T14:00:00.000Z',
          status: 'approved',
          hidden_at: null,
        },
      ],
      recognition: [],
      leaderboard: [
        {
          id: 'lb_staff',
          game_name: 'Nugget Click Rush',
          character_name: 'staff_id:4',
          score: 40,
          score_display: '40 taps',
          meta_json: JSON.stringify({ marquee_board_entry: true, rank: 3 }),
          created_at: '2026-08-13T15:00:00.000Z',
        },
      ],
      people: [],
    })
  );
  const poll = events.find((e) => e.source_id === 'poll_new');
  assert(poll && poll.public_display_name === 'Mr. Radle' && poll.author_avatar_key === 'rick.radle', '4/8. new poll ticker uses current name/avatar', poll);
  const legacy = events.find((e) => e.source_id === 'poll_legacy');
  assert(
    legacy && !legacy.author_avatar_key && !/Mr\. Radle/.test(legacy.public_text || ''),
    '25. legacy Teacher stays unresolved (no guessed account)',
    legacy && { text: legacy.public_text, avatar: legacy.author_avatar_key, name: legacy.public_display_name }
  );
  const mission = events.find((e) => e.source_id === 'mission_t4');
  assert(mission && mission.author_avatar_key === 'rick.radle' && /Mr\. Radle created a mission: STEM Today/.test(mission.public_text), '8b. teacher_id is identity; teacher_name is not', mission);
  const sys = events.find((e) => e.source_id === 'perm_sys');
  assert(!sys || sys.author_avatar_key !== 'rick.radle' || sys.author_avatar_key === '', 'system mission is not fabricated as Rick unless exact key exists');
  const done = events.find((e) => e.source_id === 'sub_lucas');
  assert(done && done.author_avatar_key === '20889' && done.public_display_name === 'Lucas R.', '13c. completion ticker uses student key');
  const news = events.find((e) => e.source_id === 'news_rick');
  assert(news && news.author_avatar_key === 'rick.radle' && /Mr\. Radle posted: Field Day Friday/.test(news.public_text), '15b. news ticker uses current name', news);
  const lb = events.find((e) => e.source_id === 'lb_staff');
  assert(lb && lb.author_avatar_key === 'rick.radle' && !/Staff reached/.test(lb.public_text), '23/24. leaderboard does not degrade to Staff', lb);

  const renamed = await collectMarqueeEvents(
    makeMarqueeDb({
      staff: [{ ...TEACHER, public_display_name: 'Coach Radle' }],
      students: [STUDENT],
      polls: [
        {
          id: 'poll_new',
          question: 'What is your favorite sport?',
          character_name: 'rick.radle',
          created_by_character: 'rick.radle',
          created_at: '2026-08-13T10:00:00.000Z',
          approved_at: '2026-08-13T10:00:00.000Z',
        },
      ],
      missions: [],
      submissions: [],
      news: [],
      recognition: [],
      leaderboard: [],
      people: [],
    })
  );
  const renamedPoll = renamed.find((e) => e.source_id === 'poll_new');
  assert(renamedPoll && renamedPoll.public_display_name === 'Coach Radle' && renamedPoll.author_avatar_key === 'rick.radle', '19. name evolution without rewriting the poll row', renamedPoll);
}

{
  const hidden = await collectMarqueeEvents(
    makeMarqueeDb({
      staff: [TEACHER],
      students: [STUDENT],
      polls: [
        {
          id: 'poll_hidden',
          question: 'Secret',
          character_name: 'rick.radle',
          created_by_character: 'rick.radle',
          created_at: '2026-08-13T10:00:00.000Z',
          approved_at: '2026-08-13T10:00:00.000Z',
          hidden_at: '2026-08-13T11:00:00.000Z',
        },
      ],
      missions: [],
      submissions: [],
      news: [],
      recognition: [],
      leaderboard: [],
      people: [],
    })
  );
  assert(!hidden.some((e) => e.source_id === 'poll_hidden'), '29. hidden poll stays off ticker');
}

console.log(pass + ' passed,', fail + ' failed');
if (fail) process.exit(1);
