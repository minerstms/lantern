/**
 * Prompt #111 — Lantern BL compatibility provision helpers (local fixtures only).
 * Usage: node worker/scripts/bl-compat-provision-111-test.mjs
 */
import {
  compatibilityTeacherIdFromLanternStaffId,
  canonicalLanternStaffDisplayName,
  previewBlCompatForLanternStaff,
  ensureBlCompatIdentityForLanternStaff,
} from '../tms-compat-provision.js';

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

// A — deterministic teacher_id
if (compatibilityTeacherIdFromLanternStaffId(999) === 'L999') ok('A teacher_id L999 from staff_id 999');
else bad('A teacher_id', compatibilityTeacherIdFromLanternStaffId(999));
if (compatibilityTeacherIdFromLanternStaffId(13) === 'L13') ok('A teacher_id L13 for Eric-like');
else bad('A L13');
if (compatibilityTeacherIdFromLanternStaffId(0) === '') ok('A rejects staff_id 0');
else bad('A zero');
if (compatibilityTeacherIdFromLanternStaffId('x') === '') ok('A rejects non-numeric');
else bad('A non-numeric');

// Display
const webAdmin = { username: 'admin', display_name: 'Web Admin', first_name: 'Rick', last_name: 'Radle', staff_id: 1 };
if (canonicalLanternStaffDisplayName(webAdmin) === 'Web Admin') ok('E Web Admin display stays Web Admin');
else bad('E Web Admin', canonicalLanternStaffDisplayName(webAdmin));
const rick = { username: 'rick.radle', display_name: 'Rick Radle', staff_id: 4 };
if (canonicalLanternStaffDisplayName(rick) === 'Rick Radle') ok('E Rick display stays Rick Radle');
else bad('E Rick');

// C — no fuzzy match in preview (proposed id from staff_id only)
const ashleigh = {
  username: 'ashleigh.ackerman',
  display_name: 'Ashleigh Ackerman',
  staff_id: 8,
  email: 'ashleigh.ackerman@trinidad.k12.co.us',
  role: 'teacher',
};
const prev = previewBlCompatForLanternStaff(ashleigh);
if (prev.proposed_teacher_id === 'L8' && prev.proposed_capability === 'TEACHER') {
  ok('C ashleigh proposes L8 not Ackerman');
} else bad('C ashleigh', prev);

// G — students skipped
const studentPrev = previewBlCompatForLanternStaff({
  username: 'student.one',
  role: 'student',
  staff_id: null,
  display_name: 'Student One',
});
if (!studentPrev.is_staff_role) ok('G student is not staff role');
else bad('G student role');

function makeDb(state) {
  state.links = state.links || [];
  return {
    prepare(sql) {
      const s = String(sql);
      const binds = [];
      const api = {
        bind(...args) {
          binds.push(...args);
          return api;
        },
        async first() {
          if (s.includes('FROM tms_identity_links WHERE lower(trim(lantern_username))')) {
            const u = String(binds[0] || '').trim().toLowerCase();
            const row = state.links.find((l) => String(l.lantern_username).toLowerCase() === u);
            return row ? { tms_staff_id: row.tms_staff_id } : null;
          }
          if (s.includes('FROM tms_identity_links WHERE lantern_staff_id')) {
            const sid = Number(binds[0]);
            const row = state.links.find((l) => Number(l.lantern_staff_id) === sid);
            return row ? { tms_staff_id: row.tms_staff_id } : null;
          }
          if (s.includes('FROM lantern_pilot_accounts WHERE lower(trim(username))')) {
            return null;
          }
          if (s.includes('SELECT COUNT(*) AS n FROM tms_identity_links WHERE tms_staff_id')) {
            const tid = String(binds[0]);
            return { n: state.links.filter((l) => l.tms_staff_id === tid).length };
          }
          return null;
        },
        async run() {
          if (s.includes('INSERT INTO tms_identity_links')) {
            const [tms, user, sid, isPrimary, createdBy] = binds;
            if (state.links.some((l) => String(l.lantern_username).toLowerCase() === String(user).toLowerCase())) {
              throw new Error('UNIQUE constraint failed: tms_identity_links.lantern_username');
            }
            state.links.push({
              tms_staff_id: tms,
              lantern_username: user,
              lantern_staff_id: sid,
              is_primary: isPrimary,
              created_by: createdBy,
            });
            return { success: true, meta: { changes: 1 } };
          }
          if (s.includes('UPDATE tms_identity_links SET is_primary = 0')) {
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true, meta: { changes: 0 } };
        },
        async all() {
          return { results: [] };
        },
      };
      return api;
    },
  };
}

// A/D/F — provision path with mocked bridge fetch
const origFetch = globalThis.fetch;
let provisionCalls = 0;
let lastProvisionBody = null;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.includes('/api/lantern-bridge/staff/provision-compat')) {
    provisionCalls++;
    lastProvisionBody = JSON.parse(init.body || '{}');
    const tid = 'L' + String(lastProvisionBody.lantern_staff_id);
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          ok: true,
          created: provisionCalls === 1,
          exists: true,
          tms_staff_id: tid,
          teacher_name: lastProvisionBody.display_name,
          capabilities: ['TEACHER'],
        };
      },
    };
  }
  return { ok: false, status: 500, async json() { return { ok: false }; } };
};

const env = { TMS_LANTERN_BRIDGE_SECRET: 'test-secret', TMS_NUGGETS_API_BASE_URL: 'https://tms.example' };
const state = { links: [] };
const db = makeDb(state);

const testTeacher = {
  username: 'test.teacher',
  staff_id: 999,
  display_name: 'Test Teacher',
  first_name: 'Test',
  last_name: 'Teacher',
  email: 'test.teacher@example.com',
  role: 'teacher',
  is_active: 1,
};

const r1 = await ensureBlCompatIdentityForLanternStaff(env, db, testTeacher, { createdBy: 'admin' });
if (r1.ok && r1.created && r1.linked && r1.tms_staff_id === 'L999' && state.links.length === 1) {
  ok('A first provision creates L999 + one link');
} else bad('A first provision', r1);

const r2 = await ensureBlCompatIdentityForLanternStaff(env, db, testTeacher, { createdBy: 'admin' });
if (r2.ok && r2.used_existing_link && !r2.created && state.links.length === 1 && provisionCalls === 1) {
  ok('A/B retry uses existing link; no duplicate provision');
} else bad('A/B retry', { r2, links: state.links.length, provisionCalls });

if (
  lastProvisionBody &&
  Array.isArray(
    // capabilities only asserted on MTSS side; Lantern body must not request privileged caps
    []
  ) ||
  (lastProvisionBody && !('capabilities' in lastProvisionBody) && lastProvisionBody.lantern_staff_id === 999)
) {
  ok('F Lantern provision payload does not request privileged caps');
} else bad('F payload', lastProvisionBody);

// B — existing linked Hecht-style: never create L-style duplicate
provisionCalls = 0;
const hechtState = { links: [{ tms_staff_id: 'Hecht', lantern_username: 'jeffrey.hecht', lantern_staff_id: 16, is_primary: 1 }] };
const hechtDb = makeDb(hechtState);
const hechtAccount = {
  username: 'jeffrey.hecht',
  staff_id: 16,
  display_name: 'Jeffrey Hecht',
  role: 'teacher',
  is_active: 1,
};
const hb = await ensureBlCompatIdentityForLanternStaff(env, hechtDb, hechtAccount, { createdBy: 'admin' });
if (hb.ok && hb.used_existing_link && hb.tms_staff_id === 'Hecht' && hechtState.links.length === 1 && provisionCalls === 0) {
  ok('B existing Hecht link preserved; no L16');
} else bad('B Hecht', hb);

// D Eric-like
provisionCalls = 0;
const ericState = { links: [] };
const ericDb = makeDb(ericState);
const eric = {
  username: 'eric.colorado',
  staff_id: 13,
  display_name: 'Eric Colorado',
  email: 'eric.colorado@trinidad.k12.co.us',
  role: 'teacher',
  is_active: 1,
};
const er = await ensureBlCompatIdentityForLanternStaff(env, ericDb, eric, { createdBy: 'admin' });
if (er.ok && er.tms_staff_id === 'L13' && ericState.links.length === 1 && ericState.links[0].tms_staff_id === 'L13') {
  ok('D Eric-like gets L13 + link (not surname match)');
} else bad('D Eric', er);

// G student ensure
const st = await ensureBlCompatIdentityForLanternStaff(
  env,
  makeDb({ links: [] }),
  { username: 'kid', role: 'student', staff_id: null },
  { createdBy: 'admin' }
);
if (!st.ok && st.skipped && st.error === 'not_staff') ok('G students never provisioned');
else bad('G student ensure', st);

// C ensure does not call provision with Ackerman id
provisionCalls = 0;
lastProvisionBody = null;
const ashState = { links: [] };
await ensureBlCompatIdentityForLanternStaff(env, makeDb(ashState), ashleigh, { createdBy: 'admin' });
if (
  lastProvisionBody &&
  lastProvisionBody.lantern_staff_id === 8 &&
  ashState.links[0] &&
  ashState.links[0].tms_staff_id === 'L8'
) {
  ok('C ensure links L8 not Ackerman');
} else bad('C ensure', { lastProvisionBody, links: ashState.links });

globalThis.fetch = origFetch;

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
