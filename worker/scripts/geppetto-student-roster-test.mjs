/**
 * Geppetto S2S roster read — Bearer LANTERN_GEPPETTO_BRIDGE_SECRET only.
 *
 * Usage: node worker/scripts/geppetto-student-roster-test.mjs
 */
import worker from '../index.js';
import {
  buildGeppettoStudentRosterPayload,
  GEPPETTO_STUDENT_ROSTER_PATH,
} from '../geppetto-student-handoff.js';

let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

const TEST_GEPPETTO_BRIDGE = 'test-geppetto-bridge-secret-not-real';
const TMS_SECRET = 'tms-staff-secret-must-not-be-accepted';

function makeEnv() {
  return {
    DB: { prepare() { return { bind() { return this; }, async first() { return null; }, async all() { return { results: [] }; }, async run() { return { success: true, meta: { changes: 0 } }; } }; } },
    LANTERN_GEPPETTO_BRIDGE_SECRET: TEST_GEPPETTO_BRIDGE,
    TMS_LANTERN_BRIDGE_SECRET: TMS_SECRET,
    TMS_NUGGETS_API_BASE_URL: 'https://mtss-behavior-log.example.test',
  };
}

function tmsRoster(students) {
  return {
    ok: true,
    students,
  };
}

async function rosterFetch(env, bearer, method) {
  const headers = {};
  if (bearer != null) headers.Authorization = 'Bearer ' + bearer;
  return worker.fetch(
    new Request('https://lantern-api.mrradle.workers.dev' + GEPPETTO_STUDENT_ROSTER_PATH, {
      method: method || 'GET',
      headers,
    }),
    env
  );
}

function mockTms(students) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const u = String(url || '');
    if (!u.includes('/api/lantern-bridge/roster/list')) {
      return { ok: false, status: 404, json: async () => ({ ok: false, error: 'unexpected_fetch' }) };
    }
    const auth = String((opts && opts.headers && opts.headers.Authorization) || '');
    if (auth !== 'Bearer ' + TMS_SECRET) {
      return { ok: false, status: 401, json: async () => ({ ok: false, error: 'tms_unauthorized' }) };
    }
    return { ok: true, status: 200, json: async () => tmsRoster(students) };
  };
  return () => { globalThis.fetch = original; };
}

async function testNoSecretRejected() {
  const restore = mockTms([{ student_name: 'Ada Lovelace', student_id: '111', is_active: 1 }]);
  try {
    const env = makeEnv();
    const none = await rosterFetch(env, null);
    const noneJ = await none.json();
    if (none.status !== 401 || noneJ.ok) return bad('missing bearer must 401', noneJ);
    const wrong = await rosterFetch(env, 'wrong-secret');
    const wrongJ = await wrong.json();
    if (wrong.status !== 401 || wrongJ.ok) return bad('wrong bearer must 401', wrongJ);
    const tms = await rosterFetch(env, TMS_SECRET);
    const tmsJ = await tms.json();
    if (tms.status !== 401 || tmsJ.ok) return bad('TMS secret must not open Geppetto roster', tmsJ);
    ok('1. no/invalid bridge secret rejected');
  } finally {
    restore();
  }
}

async function testValidSecretAccepted() {
  const restore = mockTms([
    { student_name: 'Ada Lovelace', student_id: '111', is_active: 1 },
    { student_name: 'Archived Kid', student_id: '999', is_active: 0 },
    { student_name: 'No Id', student_id: '', is_active: 1 },
  ]);
  try {
    const env = makeEnv();
    const res = await rosterFetch(env, TEST_GEPPETTO_BRIDGE);
    const json = await res.json();
    if (!res.ok || !json.ok) return bad('valid secret must succeed', json);
    if (json.students.length !== 1 || json.students[0].student_id !== '111') {
      return bad('only Ada with id should be returned', json);
    }
    if (json.students[0].first_name !== 'Ada' || json.students[0].last_name !== 'Lovelace') {
      return bad('name split failed', json.students[0]);
    }
    if (json.counts.active_with_id !== 1 || json.counts.skipped_missing_id !== 1) {
      return bad('counts wrong', json.counts);
    }
    const acao = res.headers.get('Access-Control-Allow-Origin');
    if (acao) return bad('roster route must not send CORS ACAO', acao);
    ok('2/3/4. valid secret returns active IDs only; missing IDs skipped');
  } finally {
    restore();
  }
}

async function testDuplicateIdsOmitted() {
  const payload = buildGeppettoStudentRosterPayload([
    { student_name: 'One A', student_id: '20889', is_active: 1 },
    { student_name: 'One B', student_id: '20889', is_active: 1 },
    { student_name: 'Safe Kid', student_id: '22000', is_active: 1 },
  ]);
  if (payload.students.length !== 1 || payload.students[0].student_id !== '22000') {
    return bad('duplicate IDs must not be returned as safe rows', payload);
  }
  if (payload.counts.duplicate_id_conflicts !== 1) return bad('duplicate count', payload.counts);
  if (!payload.conflicts.some((c) => c.student_id === '20889' && c.count === 2)) {
    return bad('conflict must report id only', payload.conflicts);
  }
  ok('5. duplicate IDs flagged and omitted');
}

async function testMinimumPii() {
  const restore = mockTms([
    {
      student_name: 'Jamie Adams',
      student_id: '20889',
      is_active: 1,
      grade: '7',
      password_hash: 'secret-hash',
      lantern_username: 'jadams',
      balance: 99,
    },
  ]);
  try {
    const env = makeEnv();
    const res = await rosterFetch(env, TEST_GEPPETTO_BRIDGE);
    const json = await res.json();
    const row = json.students[0];
    const keys = Object.keys(row).sort().join(',');
    // Additive `grade` is approved for Geppetto admin Login Sheet (still S2S-only).
    if (keys !== 'display_name,first_name,grade,last_name,student_id') {
      return bad('roster row must be minimum fields only (+ grade)', keys);
    }
    if (String(row.grade) !== '7') return bad('grade must pass through from TMS', row.grade);
    const blob = JSON.stringify(json);
    if (/password|hash|cookie|nugget|balance|media|lantern_username/i.test(blob)) {
      return bad('roster payload leaked extra fields', blob);
    }
    ok('6/7. minimum PII only (+ grade); no Nugget/login/password fields');
  } finally {
    restore();
  }
}

async function testNoCorsPreflight() {
  const env = makeEnv();
  const res = await worker.fetch(
    new Request('https://lantern-api.mrradle.workers.dev' + GEPPETTO_STUDENT_ROSTER_PATH, { method: 'OPTIONS' }),
    env
  );
  if (res.headers.get('Access-Control-Allow-Origin')) {
    return bad('OPTIONS must not advertise CORS', res.headers.get('Access-Control-Allow-Origin'));
  }
  ok('roster OPTIONS has no CORS exposure');
}

async function testAuthoritativeMultiWordFirstName() {
  const payload = buildGeppettoStudentRosterPayload([
    { student_id: '21004', student_name: 'Phay Son Khuu', first_name: 'Phay Son', last_name: 'Khuu', is_active: 1 },
    { student_id: '20889', student_name: 'Lucas Radle', first_name: null, last_name: null, is_active: 1 },
  ]);
  const phay = payload.students.find((s) => s.student_id === '21004');
  const lucas = payload.students.find((s) => s.student_id === '20889');
  if (phay && phay.first_name === 'Phay Son' && phay.last_name === 'Khuu' && phay.display_name === 'Phay Son Khuu') {
    ok('6. Geppetto keeps authoritative multi-word first name');
  } else bad('geppetto 21004 parts', phay);
  if (lucas && lucas.first_name === 'Lucas' && lucas.last_name === 'Radle') {
    ok('7. Geppetto still falls back to split for null TMS parts');
  } else bad('geppetto legacy fallback', lucas);
}

await testNoSecretRejected();
await testValidSecretAccepted();
await testDuplicateIdsOmitted();
await testMinimumPii();
await testNoCorsPreflight();
await testAuthoritativeMultiWordFirstName();

console.log(pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
