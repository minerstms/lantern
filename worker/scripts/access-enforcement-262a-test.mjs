/**
 * Prompt #262A — Class Access wired to authoritative group unlock UI.
 * Usage: node worker/scripts/access-enforcement-262a-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  evaluateCentralSchoolAccess,
} from '../school-access-decision.js';
import { hashOpaqueSecret } from '../access-requests.js';
import { DEVICE_TOKEN_HEADER } from '../device-enrollment.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const teacherHtml = fs.readFileSync(path.join(root, 'app/teacher.html'), 'utf8');
const indexJs = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');

let pass = 0;
let fail = 0;
function ok(m) { pass++; console.log('PASS', m); }
function bad(m, d) { fail++; console.error('FAIL', m, d != null ? d : ''); }
function assert(c, m, d) { if (c) ok(m); else bad(m, d); }

assert(/id="classAccessGroupsList"/.test(teacherHtml), 'Class Access renders group list');
assert(/updateClassAccessStatusPill/.test(teacherHtml), 'badge from group unlock state');
assert(/callDeviceApi\('groups\/unlock'/.test(teacherHtml), 'Unlock Class uses group unlock API');
assert(/callDeviceApi\('groups\/lock'/.test(teacherHtml), 'Lock Now uses group lock API');
assert(/id="classJoinCodePanel"/.test(teacherHtml), 'legacy board code renamed Class Join Code');
assert(/does <strong>not<\/strong> bypass school-time enforcement/.test(teacherHtml), 'join code disclaimed');
assert(!/Start Class Access/.test(teacherHtml), 'no misleading Start Class Access on primary card');
assert(/Start Join Code Session/.test(teacherHtml), 'legacy start renamed');
assert(indexJs.includes('/api/class-access/device/groups/unlock'), 'authoritative unlock endpoint exists');
assert(!indexJs.includes('device_token_hash') || !/groups.*device_token_hash/s.test(indexJs.slice(indexJs.indexOf('/api/class-access/device/groups'), indexJs.indexOf('/api/class-access/device/groups') + 800)), 'groups API does not leak device tokens');

const LOCK_INSTANT = new Date('2026-09-10T15:00:00.000Z');
const envOn = { SCHOOL_SCHEDULE_ENFORCEMENT_ENABLED: 'true' };

function makeDb(opts) {
  const devices = opts.devices || [];
  const groups = opts.groups || [];
  const unlocks = opts.unlocks || [];
  const grants = opts.grants || [];
  return {
    prepare(sql) {
      const s = String(sql);
      const binds = [];
      const api = {
        bind(...a) { binds.length = 0; binds.push(...a); return api; },
        async first() {
          if (s.includes('lantern_access_devices')) return devices.find((d) => d.device_token_hash === binds[0]) || null;
          if (s.includes('lantern_access_device_groups')) return groups.find((g) => g.id === binds[0]) || null;
          if (s.includes('lantern_access_group_unlocks')) {
            return unlocks.filter((u) => u.group_id === binds[0]).sort((a, b) => (a.created_at > b.created_at ? -1 : 1))[0] || null;
          }
          if (s.includes('lantern_access_requests')) return grants.find((g) => g.device_secret_hash === binds[0]) || null;
          if (s.includes('lantern_access_overrides')) return null;
          if (s.includes('lantern_settings')) return null;
          return null;
        },
        async run() { return { success: true }; },
      };
      return api;
    },
  };
}

async function req(opts) {
  const headers = new Headers(opts.headers || {});
  if (opts.deviceToken) headers.set(DEVICE_TOKEN_HEADER, opts.deviceToken);
  if (opts.cookie) headers.set('Cookie', 'lantern_access_device=' + encodeURIComponent(opts.cookie));
  return new Request('https://lantern.test/api/missions', { headers });
}

// Wrong-group isolation + lock after Lock Now
{
  const tokenA = 'tok-a';
  const tokenB = 'tok-b';
  const hashA = await hashOpaqueSecret(tokenA);
  const hashB = await hashOpaqueSecret(tokenB);
  const dbUnlockedA = makeDb({
    devices: [
      { id: 'd1', device_token_hash: hashA, group_id: 'gA', revoked_at: null },
      { id: 'd2', device_token_hash: hashB, group_id: 'gB', revoked_at: null },
    ],
    groups: [{ id: 'gA', name: 'Period 1 STEM' }, { id: 'gB', name: 'Period 3 STEM' }],
    unlocks: [{ group_id: 'gA', expires_at: '2099-01-01T00:00:00.000Z', is_active: 1, revoked_at: null, created_at: 't1' }],
  });
  const allowA = await evaluateCentralSchoolAccess(await req({ deviceToken: tokenA }), { ...envOn, DB: dbUnlockedA }, { getPilotAccountFromRequest: async () => null }, LOCK_INSTANT);
  const lockB = await evaluateCentralSchoolAccess(await req({ deviceToken: tokenB }), { ...envOn, DB: dbUnlockedA }, { getPilotAccountFromRequest: async () => null }, LOCK_INSTANT);
  assert(allowA.allowed && allowA.reason === 'device_group_unlock', 'Group A unlocked → device A allowed');
  assert(!lockB.allowed, 'Group B locked → device B locked');

  const dbLockedA = makeDb({
    devices: [{ id: 'd1', device_token_hash: hashA, group_id: 'gA', revoked_at: null }],
    groups: [{ id: 'gA', name: 'Period 1 STEM' }],
    unlocks: [{ group_id: 'gA', expires_at: '2099-01-01T00:00:00.000Z', is_active: 0, revoked_at: 't2', created_at: 't1' }],
  });
  const lockedA = await evaluateCentralSchoolAccess(await req({ deviceToken: tokenA }), { ...envOn, DB: dbLockedA }, { getPilotAccountFromRequest: async () => null }, LOCK_INSTANT);
  assert(!lockedA.allowed, 'After Lock Now → device A locked');
}

// Individual grant while class locked
{
  const secret = 'ind-grant';
  const hash = await hashOpaqueSecret(secret);
  const token = 'class-device';
  const deviceHash = await hashOpaqueSecret(token);
  const db = makeDb({
    grants: [{ device_secret_hash: hash, status: 'approved', grant_expires_at: '2099-01-01T00:00:00.000Z', revoked_at: null }],
    devices: [{ id: 'd1', device_token_hash: deviceHash, group_id: 'g1', revoked_at: null }],
    groups: [{ id: 'g1', name: 'Lab' }],
    unlocks: [],
  });
  const r = await evaluateCentralSchoolAccess(await req({ cookie: secret, deviceToken: token }), { ...envOn, DB: db }, { getPilotAccountFromRequest: async () => null }, LOCK_INSTANT);
  assert(r.allowed && r.reason === 'individual_grant', 'Individual grant while class locked');
}

console.log('\naccess-enforcement-262a-test:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
