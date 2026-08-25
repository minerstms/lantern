/**
 * Prompt #262 — Lantern Access enforcement + bypass matrix.
 * Usage: node worker/scripts/access-enforcement-262-test.mjs
 */
import {
  evaluateCentralSchoolAccess,
  computeQualifyingAccessSignals,
} from '../school-access-decision.js';
import {
  resolveSchoolScheduleEnforcement,
  setSchoolScheduleEnforcementEnabled,
  buildAccessEnforcementStatus,
  ACCESS_ENFORCEMENT_SETTING_KEY,
} from '../school-access-enforcement.js';
import { evaluateSchoolSchedule } from '../school-schedule.js';
import { hashOpaqueSecret, ACCESS_DEVICE_COOKIE_NAME } from '../access-requests.js';
import { DEVICE_TOKEN_HEADER } from '../device-enrollment.js';

const LOCK_INSTANT = new Date('2026-09-10T15:00:00.000Z'); // Wed 9 AM MT — inside lock
const OUTSIDE_INSTANT = new Date('2026-09-10T22:00:00.000Z'); // Wed 4 PM MT — outside lock

let pass = 0;
let fail = 0;
function ok(m) { pass++; console.log('PASS', m); }
function bad(m, d) { fail++; console.error('FAIL', m, d != null ? d : ''); }
function assert(c, m, d) { if (c) ok(m); else bad(m, d); }

function makeDb(opts) {
  const settings = (opts && opts.settings) || [];
  const grants = (opts && opts.grants) || [];
  const devices = (opts && opts.devices) || [];
  const groups = (opts && opts.groups) || [];
  const unlocks = (opts && opts.unlocks) || [];
  const overrides = (opts && opts.overrides) || [];
  return {
    prepare(sql) {
      const s = String(sql);
      const binds = [];
      const api = {
        bind(...a) { binds.length = 0; binds.push(...a); return api; },
        async first() {
          if (s.includes('lantern_settings') && s.includes('key = ?')) {
            return settings.find((r) => r.key === binds[0]) || null;
          }
          if (s.includes('lantern_access_requests')) {
            return grants.find((g) => g.device_secret_hash === binds[0]) || null;
          }
          if (s.includes('lantern_access_devices')) {
            return devices.find((d) => d.device_token_hash === binds[0]) || null;
          }
          if (s.includes('lantern_access_device_groups')) {
            return groups.find((g) => g.id === binds[0]) || null;
          }
          if (s.includes('lantern_access_group_unlocks')) {
            return unlocks.filter((u) => u.group_id === binds[0]).sort((a, b) => (a.created_at > b.created_at ? -1 : 1))[0] || null;
          }
          if (s.includes('lantern_access_overrides')) {
            return overrides[0] || null;
          }
          return null;
        },
        async run() {
          if (s.includes('INSERT INTO lantern_settings')) {
            const idx = settings.findIndex((r) => r.key === binds[0]);
            const row = { key: binds[0], value: binds[1], updated_at: binds[2], updated_by: binds[3] };
            if (idx >= 0) settings[idx] = row;
            else settings.push(row);
          }
          return { success: true };
        },
      };
      return api;
    },
  };
}

async function mockHash(secret) {
  return hashOpaqueSecret(secret);
}

async function req(opts) {
  const headers = new Headers(opts.headers || {});
  if (opts.cookie) headers.set('Cookie', ACCESS_DEVICE_COOKIE_NAME + '=' + encodeURIComponent(opts.cookie));
  if (opts.deviceToken) headers.set(DEVICE_TOKEN_HEADER, opts.deviceToken);
  return new Request('https://lantern.test/api/missions', { headers });
}

const teacherDeps = {
  getPilotAccountFromRequest: async () => ({ username: 'mr_radle', role: 'teacher' }),
};
const adminDeps = {
  getPilotAccountFromRequest: async () => ({ username: 'admin', role: 'admin' }),
};
const studentDeps = {
  getPilotAccountFromRequest: async () => ({ username: 'lucas', role: 'student' }),
};
const noAuthDeps = { getPilotAccountFromRequest: async () => null };

const envOff = { SCHOOL_SCHEDULE_ENFORCEMENT_ENABLED: 'false', DB: makeDb({}) };
const envOn = { SCHOOL_SCHEDULE_ENFORCEMENT_ENABLED: 'true', DB: makeDb({}) };

// Settings resolve — D1 authoritative over env
{
  const dbObj = makeDb({});
  assert((await resolveSchoolScheduleEnforcement(dbObj, envOff)).enabled === false, 'default enforcement OFF');
  await setSchoolScheduleEnforcementEnabled(dbObj, true, 'admin');
  const resolved = await resolveSchoolScheduleEnforcement(dbObj, envOff);
  assert(resolved.enabled === true && resolved.source === 'settings', 'D1 setting overrides env OFF');
}

// A — enforcement OFF, inside window, no grant → ALLOW
{
  const r = await evaluateCentralSchoolAccess(await req({}), envOff, studentDeps, LOCK_INSTANT);
  assert(r.allowed && r.reason === 'enforcement_disabled', 'A enforcement OFF inside window');
}

// B — enforcement ON, outside window, no grant → ALLOW
{
  const r = await evaluateCentralSchoolAccess(await req({}), envOn, noAuthDeps, OUTSIDE_INSTANT);
  assert(r.allowed && r.reason === 'outside_scheduled_lock', 'B outside window');
}

// C — enforcement ON, inside window, no grant → LOCK
{
  const r = await evaluateCentralSchoolAccess(await req({}), envOn, noAuthDeps, LOCK_INSTANT);
  assert(!r.allowed && r.reason === 'school_lock_active', 'C locked no grant');
}

// D — individual grant active → ALLOW
{
  const secret = 'grant-secret-abc';
  const hash = await mockHash(secret);
  const db = makeDb({
    grants: [{ device_secret_hash: hash, status: 'approved', grant_expires_at: '2099-01-01T00:00:00.000Z', revoked_at: null }],
  });
  const r = await evaluateCentralSchoolAccess(await req({ cookie: secret }), { ...envOn, DB: db }, noAuthDeps, LOCK_INSTANT);
  assert(r.allowed && r.reason === 'individual_grant', 'D individual grant');
}

// E — individual grant expired → LOCK
{
  const secret = 'grant-expired';
  const hash = await mockHash(secret);
  const db = makeDb({
    grants: [{ device_secret_hash: hash, status: 'approved', grant_expires_at: '2020-01-01T00:00:00.000Z', revoked_at: null }],
  });
  const r = await evaluateCentralSchoolAccess(await req({ cookie: secret }), { ...envOn, DB: db }, noAuthDeps, LOCK_INSTANT);
  assert(!r.allowed, 'E expired individual grant locked');
}

// F — class device group unlock → ALLOW
{
  const token = 'device-token-class3';
  const hash = await mockHash(token);
  const db = makeDb({
    devices: [{ id: 'd1', device_token_hash: hash, group_id: 'g3', revoked_at: null }],
    groups: [{ id: 'g3', name: 'Class 3' }],
    unlocks: [{ group_id: 'g3', expires_at: '2099-01-01T00:00:00.000Z', is_active: 1, revoked_at: null, created_at: 't1' }],
  });
  const r = await evaluateCentralSchoolAccess(await req({ deviceToken: token }), { ...envOn, DB: db }, noAuthDeps, LOCK_INSTANT);
  assert(r.allowed && r.reason === 'device_group_unlock', 'F class group unlock');
}

// G — wrong class (group not unlocked) → LOCK
{
  const token = 'device-token-class4';
  const hash = await mockHash(token);
  const db = makeDb({
    devices: [{ id: 'd2', device_token_hash: hash, group_id: 'g4', revoked_at: null }],
    groups: [{ id: 'g4', name: 'Class 4' }],
    unlocks: [],
  });
  const r = await evaluateCentralSchoolAccess(await req({ deviceToken: token }), { ...envOn, DB: db }, noAuthDeps, LOCK_INSTANT);
  assert(!r.allowed, 'G wrong class locked');
}

// H — schoolwide override → ALLOW
{
  const db = makeDb({
    overrides: [{ expires_at: '2099-01-01T00:00:00.000Z', is_active: 1, revoked_at: null }],
  });
  const r = await evaluateCentralSchoolAccess(await req({}), { ...envOn, DB: db }, noAuthDeps, LOCK_INSTANT);
  assert(r.allowed && r.reason === 'event_override', 'H schoolwide override');
}

// I/J/K — staff always allowed
for (const [label, deps] of [['I teacher', teacherDeps], ['J admin', adminDeps], ['K staff', { getPilotAccountFromRequest: async () => ({ role: 'staff' }) }]]) {
  const r = await evaluateCentralSchoolAccess(await req({}), envOn, deps, LOCK_INSTANT);
  assert(r.allowed && r.reason === 'staff', label + ' always allowed');
}

// D1 setting enables enforcement (env off)
{
  const db = makeDb({ settings: [{ key: ACCESS_ENFORCEMENT_SETTING_KEY, value: 'true' }] });
  const status = await buildAccessEnforcementStatus(db, envOff, LOCK_INSTANT);
  assert(status.enforcement_enabled === true && status.effective_enforcement_active === true, 'D1 ON effective inside lock');
}

// Schedule authority
{
  const inside = evaluateSchoolSchedule(LOCK_INSTANT);
  const outside = evaluateSchoolSchedule(OUTSIDE_INSTANT);
  assert(inside.withinScheduledLock && !outside.withinScheduledLock, 'MT school schedule lock window');
}

console.log('\naccess-enforcement-262-test:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
