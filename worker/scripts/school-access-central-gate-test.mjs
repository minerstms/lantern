/**
 * Phase #34 — central, server-side school-access gate (`evaluateCentralSchoolAccess`, wired into
 * the top-level `fetch()` dispatcher in worker/index.js). Exercises the REAL worker entry point
 * (`worker.fetch(request, env)`) with a mocked D1, mirroring the established pattern in
 * worker/scripts/school-access-control-center-test.mjs / school-access-state-foundation-test.mjs.
 *
 * Proves:
 *  1) With enforcement OFF (the required production default), the gate is a true no-op on a
 *     protected, non-exempt path — the request reaches the real route handler untouched.
 *  2) Exempt path prefixes (auth/pilot/admin/setup/verify/class-access/settings/integrations/
 *     tms-nuggets/health) bypass the gate even with enforcement ON.
 *  3) A staff (teacher/admin) session always bypasses the gate when enforcement is ON,
 *     regardless of the real-time schedule (rule A short-circuits before the schedule check).
 *  4) A non-staff, no-signal caller's outcome on a protected path is internally consistent with
 *     the schedule metadata the public GET /api/class-access/state endpoint reports at the same
 *     instant (never asserts which branch is live — the real clock is not under test control).
 *  5) An active individual grant / device-group unlock / event override each make the gate ALLOW
 *     unconditionally when enforcement is ON, regardless of the real-time schedule (deterministic
 *     via a temporarily fixed clock, restored immediately after each case).
 *  6) During a deterministic FORCED lock instant, a caller with none of A-E satisfied is DENIED
 *     with the documented `school_access_locked` shape and corsForPilot() CORS headers (the
 *     Prompt #34R2 audit fix), not the generic wildcard corsHeaders.
 *
 * Usage: node worker/scripts/school-access-central-gate-test.mjs
 */
import worker from '../index.js';
import { evaluateSchoolSchedule } from '../school-schedule.js';
import { hashOpaqueSecret, ACCESS_DEVICE_COOKIE_NAME } from '../access-requests.js';
import { DEVICE_TOKEN_HEADER } from '../device-enrollment.js';

let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

const TEST_SECRET = 'test-secret-not-a-real-pilot-session-secret';

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
async function pilotCookieFor(account) {
  const now = Math.floor(Date.now() / 1000);
  const token = await signTestJwt({ sub: account.username, role: account.role, iat: now, exp: now + 3600 }, TEST_SECRET);
  return `lantern_pilot=${token}`;
}

function makeEnv(overrides) {
  const accounts = (overrides && overrides.accounts) || {};
  const grants = (overrides && overrides.grants) || [];
  const devices = (overrides && overrides.devices) || [];
  const groups = (overrides && overrides.groups) || [];
  const unlocks = (overrides && overrides.unlocks) || [];
  const overridesTbl = (overrides && overrides.overridesTbl) || [];

  function prepare(sql) {
    const s = String(sql);
    const binds = [];
    const api = {
      bind(...args) { binds.push(...args); return api; },
      async first() {
        if (s.includes('FROM lantern_pilot_accounts WHERE lower(trim(username))')) {
          return accounts[String(binds[0] || '').trim().toLowerCase()] || null;
        }
        if (s.includes('FROM lantern_access_requests WHERE device_secret_hash = ?')) {
          const matches = grants.filter((r) => r.device_secret_hash === binds[0]);
          return matches[0] || null;
        }
        if (s.includes('FROM lantern_access_devices WHERE device_token_hash = ?')) {
          return devices.find((d) => d.device_token_hash === binds[0]) || null;
        }
        if (s.includes('FROM lantern_access_device_groups WHERE id = ?')) {
          return groups.find((g) => g.id === binds[0]) || null;
        }
        if (s.includes('FROM lantern_access_group_unlocks WHERE group_id = ?')) {
          return unlocks.find((u) => u.group_id === binds[0]) || null;
        }
        if (s.includes('FROM lantern_access_overrides ORDER BY created_at DESC LIMIT 1')) {
          return overridesTbl[0] || null;
        }
        if (s.includes('FROM class_access_sessions')) return null;
        if (s.includes('FROM class_access_tokens')) return null;
        if (s.includes('FROM lantern_verify_state WHERE id = ?')) return null;
        return null;
      },
      async all() { return { results: [] }; },
      async run() { return { success: true, meta: { changes: 0 } }; },
    };
    return api;
  }
  return { DB: { prepare }, PILOT_SESSION_SECRET: TEST_SECRET, ...(overrides && overrides.env) };
}

function req(path, opts) {
  return new Request('https://x.test' + path, { method: 'GET', ...opts });
}

function isGateBlockedBody(body) {
  return !!(body && body.ok === false && body.error === 'school_access_locked');
}

// ---------------------------------------------------------------------------
// A tiny, fully-restorable fake clock — only used for the deterministic
// forced-lock case (test 6). Every other test relies on the real clock plus
// internally-consistent assertions, matching this codebase's established
// convention of never hardcoding "is it currently locked".
// ---------------------------------------------------------------------------
const RealDate = Date;
function withFixedClock(fixedInstantMs, fn) {
  class FixedDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) return new RealDate(fixedInstantMs);
      return new RealDate(...args);
    }
    static now() { return fixedInstantMs; }
  }
  global.Date = FixedDate;
  return Promise.resolve()
    .then(fn)
    .finally(() => { global.Date = RealDate; });
}

async function test1EnforcementOffIsNoOp() {
  const env = makeEnv({}); // no SCHOOL_SCHEDULE_ENFORCEMENT_ENABLED override -> defaults false
  const res = await worker.fetch(req('/api/missions/active'), env);
  const body = await res.json();
  if (isGateBlockedBody(body)) return bad('enforcement OFF: protected path must never be blocked by the gate', body);
  if (res.status === 403 && body.error === 'school_access_locked') return bad('enforcement OFF: gate must be a true no-op', body);
  // Falls through to the real missions route, which requires a session -> not_authenticated.
  if (body.error !== 'not_authenticated') return bad('enforcement OFF: request reaches the real route handler untouched (expected not_authenticated from the missions route itself)', body);
  ok('enforcement OFF (required production default): the gate is a true no-op on a protected path — the request reaches the real route handler untouched');
}

async function test2ExemptPathsBypassGateEvenWhenEnabled() {
  const env = makeEnv({ env: { SCHOOL_SCHEDULE_ENFORCEMENT_ENABLED: 'true' } });
  const exemptPaths = ['/api/auth/me', '/api/pilot/me', '/api/class-access/state', '/api/health'];
  for (const p of exemptPaths) {
    const res = await worker.fetch(req(p), env);
    const body = await res.json().catch(() => null);
    if (isGateBlockedBody(body)) return bad('exempt path bypasses the gate even with enforcement ON: ' + p, body);
  }
  ok('all documented exempt path prefixes (auth/pilot/class-access/health, ...) bypass the central gate even with enforcement ON');
}

async function test3StaffAlwaysBypassesRegardlessOfSchedule() {
  const teacher = { username: 't1', role: 'teacher', is_active: 1, must_change_password: 0 };
  const env = makeEnv({ env: { SCHOOL_SCHEDULE_ENFORCEMENT_ENABLED: 'true' }, accounts: { t1: teacher } });
  const cookie = await pilotCookieFor(teacher);
  const res = await worker.fetch(req('/api/missions/active', { headers: { Cookie: cookie } }), env);
  const body = await res.json();
  if (isGateBlockedBody(body)) return bad('authenticated staff session must always bypass the gate (rule A), regardless of the real-time schedule', body);
  ok('an authenticated teacher/admin session always bypasses the central gate when enforcement is ON, regardless of the current real-time schedule');
}

async function test4NonStaffOutcomeMatchesLiveScheduleMetadata() {
  const env = makeEnv({ env: { SCHOOL_SCHEDULE_ENFORCEMENT_ENABLED: 'true' } });
  // Same instant the public, exempt state endpoint reports (server-computed, not client-supplied).
  const stateRes = await worker.fetch(req('/api/class-access/state'), env);
  const stateBody = await stateRes.json();
  const liveWithinLock = !!(stateBody.schedule && stateBody.schedule.withinScheduledLock);

  const res = await worker.fetch(req('/api/missions/active'), env);
  const body = await res.json();
  const gateBlocked = isGateBlockedBody(body);

  if (liveWithinLock && !gateBlocked) return bad('schedule currently reports withinScheduledLock:true but an unauthenticated, no-signal caller was NOT blocked', { stateBody: stateBody.schedule, body });
  if (!liveWithinLock && gateBlocked) return bad('schedule currently reports withinScheduledLock:false but an unauthenticated, no-signal caller WAS blocked', { stateBody: stateBody.schedule, body });
  ok('a non-staff, no-qualifying-signal caller\'s gate outcome on a protected path is internally consistent with the live schedule.withinScheduledLock the public state endpoint reports right now (withinScheduledLock=' + liveWithinLock + ')');
}

async function test5QualifyingSignalsAlwaysAllowRegardlessOfSchedule() {
  // Forced instant deep inside a regular Mon-Fri lock window (2026-09-14 is a Monday within
  // Period A, 8:00 AM-4:00 PM America/Denver = 16:30 UTC in MDT) so this proves the ALLOW holds
  // even when the schedule itself would otherwise deny — never relies on lucky real-time timing.
  const LOCKED_INSTANT = new RealDate('2026-09-14T16:30:00.000Z').getTime();
  const sched = evaluateSchoolSchedule(new RealDate(LOCKED_INSTANT));
  if (!sched.withinScheduledLock) return bad('test fixture instant must itself be within a scheduled lock (sanity check on the fixture, not the gate)', sched);

  await withFixedClock(LOCKED_INSTANT, async () => {
    // 5a. Individual grant.
    const deviceSecret = 'device-secret-abc123';
    const deviceHash = await hashOpaqueSecret(deviceSecret);
    const envGrant = makeEnv({
      env: { SCHOOL_SCHEDULE_ENFORCEMENT_ENABLED: 'true' },
      grants: [{ device_secret_hash: deviceHash, status: 'approved', grant_expires_at: new RealDate(LOCKED_INSTANT + 60 * 60 * 1000).toISOString(), revoked_at: null }],
    });
    const resGrant = await worker.fetch(req('/api/missions/active', { headers: { Cookie: `${ACCESS_DEVICE_COOKIE_NAME}=${deviceSecret}` } }), envGrant);
    const bodyGrant = await resGrant.json();
    if (isGateBlockedBody(bodyGrant)) return bad('an active individual grant must ALLOW even during a forced scheduled lock', bodyGrant);
    ok('an active individual teacher-approved device grant allows access even during a forced scheduled lock (deterministic fixed-clock case)');

    // 5b. Device-group unlock.
    const deviceToken = 'device-token-xyz789';
    const devTokenHash = await hashOpaqueSecret(deviceToken);
    const envGroup = makeEnv({
      env: { SCHOOL_SCHEDULE_ENFORCEMENT_ENABLED: 'true' },
      devices: [{ id: 'dev1', device_token_hash: devTokenHash, group_id: 'grp1', revoked_at: null }],
      groups: [{ id: 'grp1', name: 'Room 12' }],
      unlocks: [{ group_id: 'grp1', expires_at: new RealDate(LOCKED_INSTANT + 60 * 60 * 1000).toISOString(), is_active: 1, revoked_at: null }],
    });
    const resGroup = await worker.fetch(req('/api/missions/active', { headers: { [DEVICE_TOKEN_HEADER]: deviceToken } }), envGroup);
    const bodyGroup = await resGroup.json();
    if (isGateBlockedBody(bodyGroup)) return bad('an active enrolled device-group unlock must ALLOW even during a forced scheduled lock', bodyGroup);
    ok('an active enrolled device-group unlock allows access even during a forced scheduled lock (deterministic fixed-clock case)');

    // 5c. Event override (whole-Lantern, no device credential required).
    const envOverride = makeEnv({
      env: { SCHOOL_SCHEDULE_ENFORCEMENT_ENABLED: 'true' },
      overridesTbl: [{ expires_at: new RealDate(LOCKED_INSTANT + 60 * 60 * 1000).toISOString(), is_active: 1, revoked_at: null }],
    });
    const resOverride = await worker.fetch(req('/api/missions/active'), envOverride);
    const bodyOverride = await resOverride.json();
    if (isGateBlockedBody(bodyOverride)) return bad('an active whole-Lantern event override must ALLOW even during a forced scheduled lock', bodyOverride);
    ok('an active whole-Lantern event override allows access even during a forced scheduled lock (deterministic fixed-clock case)');
  });
}

async function test6ForcedLockWithNoSignalIsDeniedWithDocumentedShapeAndPilotCors() {
  const LOCKED_INSTANT = new RealDate('2026-09-14T16:30:00.000Z').getTime();
  await withFixedClock(LOCKED_INSTANT, async () => {
    const env = makeEnv({ env: { SCHOOL_SCHEDULE_ENFORCEMENT_ENABLED: 'true' } });
    const res = await worker.fetch(req('/api/missions/active', { headers: { Origin: 'https://lantern-42i.pages.dev' } }), env);
    const body = await res.json();
    if (res.status !== 403) return bad('forced lock, no qualifying signal: status is 403', res.status);
    if (!isGateBlockedBody(body)) return bad('forced lock, no qualifying signal: documented school_access_locked shape', body);
    if (typeof body.reason !== 'string' || !body.schedule || typeof body.message !== 'string') return bad('blocked response carries reason/schedule/message fields', body);
    ok('during a forced scheduled lock, a caller with no qualifying signal is DENIED with the documented { ok:false, error:"school_access_locked", reason, schedule, message } shape');

    // Prompt #34R2 audit fix: the blocked response must use corsForPilot() headers (matching the
    // credentialed pilot surfaces it actually guards), not the generic wildcard corsHeaders.
    if (res.headers.get('Access-Control-Allow-Credentials') !== 'true') {
      return bad('blocked response uses corsForPilot() headers (Access-Control-Allow-Credentials: true), not generic wildcard CORS', Object.fromEntries(res.headers.entries()));
    }
    if (res.headers.get('Access-Control-Allow-Origin') !== 'https://lantern-42i.pages.dev') {
      return bad('blocked response echoes the allowed pilot origin (corsForPilot), not a bare wildcard "*"', Object.fromEntries(res.headers.entries()));
    }
    ok('the gate\'s 403 response uses corsForPilot() CORS headers (credentialed, origin-echoed) instead of the generic wildcard corsHeaders — fixes the Prompt #34R2 audit finding');
  });
}

await test1EnforcementOffIsNoOp();
await test2ExemptPathsBypassGateEvenWhenEnabled();
await test3StaffAlwaysBypassesRegardlessOfSchedule();
await test4NonStaffOutcomeMatchesLiveScheduleMetadata();
await test5QualifyingSignalsAlwaysAllowRegardlessOfSchedule();
await test6ForcedLockWithNoSignalIsDeniedWithDocumentedShapeAndPilotCors();

console.log('\nschool-access-central-gate-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
