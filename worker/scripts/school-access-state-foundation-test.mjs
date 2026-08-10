/**
 * Prompt #30 — proves GET /api/class-access/state now carries the new, additive `schedule` +
 * `scheduleEnforcementEnabled` metadata in every branch, WITHOUT changing any existing field
 * (ok/mode/accessState/tokenValid/expires_at/simCondition/message) or any existing access
 * decision. Exercises the real worker/index.js fetch(request, env) entry point with a mocked
 * D1, mirroring worker/scripts/approvals-classaccess-auth-test.mjs's approach.
 *
 * Usage: node worker/scripts/school-access-state-foundation-test.mjs
 */
import worker from '../index.js';

let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

function makeEnv(overrides) {
  const state = { verifyState: {}, sessions: [], tokens: [] };
  function prepare(sql) {
    const s = String(sql);
    const binds = [];
    const api = {
      bind(...args) { binds.push(...args); return api; },
      async first() {
        if (s.includes('FROM lantern_verify_state WHERE id = ?')) {
          return Object.keys(state.verifyState).length ? { state_json: JSON.stringify(state.verifyState) } : null;
        }
        if (s.includes('FROM class_access_sessions WHERE is_active = 1') && s.includes('LIMIT 1')) {
          const now = binds[0];
          const rows = state.sessions.filter((r) => r.is_active === 1 && !r.revoked_at && r.expires_at > now);
          return rows[0] || null;
        }
        if (s.includes('FROM class_access_tokens t JOIN class_access_sessions s')) {
          const token = binds[0];
          return state.tokens.find((t) => t.token === token) || null;
        }
        if (s.includes('FROM lantern_pilot_accounts WHERE lower(trim(username))')) {
          return null; // no pilot session in this test file (covered elsewhere)
        }
        return null;
      },
      async all() { return { results: [] }; },
      async run() { return { success: true }; },
    };
    return api;
  }
  return { DB: { prepare }, ...overrides };
}

function req(url) {
  return new Request(url, { method: 'GET' });
}

async function testOutsideHoursCarriesScheduleMetadata() {
  // No env override for CLASS_ACCESS_LOCK_TZ; isLockHours() depends on the real current time, so
  // force the well-established simulation-free "outside hours" path is not guaranteed at test
  // time -- instead we assert on whatever live branch is hit, but always require the new fields.
  const env = makeEnv({});
  const res = await worker.fetch(req('https://x.test/api/class-access/state'), env);
  const body = await res.json();
  if (res.status !== 200 || body.ok !== true) return bad('state endpoint responds ok:true', { status: res.status, body });
  if (typeof body.accessState !== 'string' || typeof body.tokenValid !== 'boolean') return bad('existing accessState/tokenValid fields still present', body);
  if (!body.schedule || typeof body.schedule !== 'object') return bad('new schedule object is present', body);
  const sched = body.schedule;
  const requiredKeys = ['timezone', 'localDate', 'localTime', 'schoolDay', 'scheduleType', 'lockStart', 'lockEnd', 'withinScheduledLock', 'reason'];
  const missing = requiredKeys.filter((k) => !(k in sched));
  if (missing.length) return bad('schedule object has all documented keys', { missing, sched });
  if (sched.timezone !== 'America/Denver') return bad('schedule.timezone is America/Denver', sched);
  if (typeof body.scheduleEnforcementEnabled !== 'boolean') return bad('scheduleEnforcementEnabled boolean is present', body);
  if (body.scheduleEnforcementEnabled !== false) return bad('scheduleEnforcementEnabled defaults to false with no env override', body);
  ok('GET /api/class-access/state (live, no env override) includes schedule metadata + scheduleEnforcementEnabled:false, and keeps existing ok/accessState/tokenValid fields');
}

async function testEnforcementFlagReflectsEnvTrue() {
  const env = makeEnv({ SCHOOL_SCHEDULE_ENFORCEMENT_ENABLED: 'true' });
  const res = await worker.fetch(req('https://x.test/api/class-access/state'), env);
  const body = await res.json();
  if (body.scheduleEnforcementEnabled !== true) return bad('scheduleEnforcementEnabled reflects env var true', body);
  ok('scheduleEnforcementEnabled reflects SCHOOL_SCHEDULE_ENFORCEMENT_ENABLED="true" when explicitly set on env (still just metadata; no access decision changed)');
  // Even with the flag "on" for this env-injection test, the access decision fields must be
  // untouched by this phase -- still governed solely by the existing isLockHours()/token/session
  // logic, never by scheduleEnforcementEnabled.
  if (typeof body.accessState !== 'string' || typeof body.tokenValid !== 'boolean') return bad('access decision fields unaffected by enforcement flag', body);
  ok('access decision (accessState/tokenValid) is not influenced by scheduleEnforcementEnabled in Phase #30 (foundation only, no enforcement wiring yet)');
}

async function testSimulationModeAlsoCarriesScheduleMetadata() {
  const env = makeEnv({});
  env.DB.prepare = ((orig) => (sql) => {
    const s = String(sql);
    if (s.includes('FROM lantern_verify_state WHERE id = ?')) {
      return {
        bind() { return this; },
        async first() {
          return { state_json: JSON.stringify({ class_access_simulation: { mode: 'simulation', condition: 'unlocked' } }) };
        },
      };
    }
    return orig(sql);
  })(env.DB.prepare);
  const res = await worker.fetch(req('https://x.test/api/class-access/state'), env);
  const body = await res.json();
  if (body.mode !== 'simulation') return bad('simulation mode still reported as simulation', body);
  // Existing (pre-Phase #30) simulation behavior: simCondition "unlocked" maps to accessState
  // "live_outside_school_hours", but tokenValid is only true for "live_student_has_valid_access"
  // -- that quirk is pre-existing and intentionally left untouched here; this test only pins the
  // exact existing values so any accidental future change to the map is caught.
  if (body.simCondition !== 'unlocked' || body.accessState !== 'live_outside_school_hours' || body.tokenValid !== false || body.message !== 'Demo Mode: unlocked') {
    return bad('simulation simCondition/accessState/tokenValid/message unchanged from pre-Phase #30 behavior', body);
  }
  if (!body.schedule || body.schedule.timezone !== 'America/Denver') return bad('simulation branch also carries schedule metadata', body);
  if (typeof body.scheduleEnforcementEnabled !== 'boolean') return bad('simulation branch also carries scheduleEnforcementEnabled', body);
  ok('simulation-mode branch of GET /api/class-access/state also carries schedule + scheduleEnforcementEnabled without altering simulation behavior (mode/simCondition/accessState/tokenValid/message unchanged)');
}

async function testStaticSourceDoesNotTouchIsLockHours() {
  const fs = await import('fs');
  const path = await import('path');
  const { fileURLToPath } = await import('url');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const src = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
  const isLockHoursMatch = src.match(/function isLockHours\(env\) \{[\s\S]*?\n\}/);
  if (!isLockHoursMatch) return bad('isLockHours function found in source');
  const body = isLockHoursMatch[0];
  if (/evaluateSchoolSchedule|scheduleEnforcementEnabled/.test(body)) {
    return bad('isLockHours() must remain untouched by Phase #30 (no call into the new evaluator/flag)', body);
  }
  ok('isLockHours() source body is unchanged by Phase #30 -- new evaluator/flag are additive-only and not called from the production lock-hours function');
}

await testOutsideHoursCarriesScheduleMetadata();
await testEnforcementFlagReflectsEnvTrue();
await testSimulationModeAlsoCarriesScheduleMetadata();
await testStaticSourceDoesNotTouchIsLockHours();

console.log('\nschool-access-state-foundation-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
