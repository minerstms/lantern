/**
 * Prompt #262C — Restricted Access / Demo Mode.
 * Usage: node worker/scripts/restricted-mode-262c-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CANONICAL_WEB_ADMIN_USERNAME,
  RESTRICTED_MODE_DEFAULT,
  addRestrictedBypassUsername,
  allowlistHasUsername,
  evaluateRestrictedModeForAccount,
  isCanonicalWebAdminAccount,
  isRestrictedModeExemptPath,
  parseRestrictedModeAllowlist,
  removeRestrictedBypassUsername,
  resolveRestrictedModeState,
  setRestrictedModeAllowlist,
  setRestrictedModeEnabled,
} from '../restricted-mode.js';
import { evaluateCentralSchoolAccess } from '../school-access-decision.js';
import { ACCESS_AUDIT_ACTIONS } from '../access-audit.js';
import worker from '../index.js';
import { hashOpaqueSecret, ACCESS_DEVICE_COOKIE_NAME } from '../access-requests.js';
import { DEVICE_TOKEN_HEADER } from '../device-enrollment.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const teacherHtml = fs.readFileSync(path.join(root, 'app/teacher.html'), 'utf8');
const adminHtml = fs.readFileSync(path.join(root, 'app/admin.html'), 'utf8');
const classAccessJs = fs.readFileSync(path.join(root, 'app/js/class-access.js'), 'utf8');
const restrictedJs = fs.readFileSync(path.join(root, 'app/js/lantern-restricted-mode.js'), 'utf8');

let pass = 0;
let fail = 0;
function ok(m) { pass++; console.log('PASS', m); }
function bad(m, d) { fail++; console.error('FAIL', m, d != null ? d : ''); }
function assert(c, m, d) { if (c) ok(m); else bad(m, d); }

const LOCK_INSTANT = new Date('2026-09-10T15:00:00.000Z');
const OUTSIDE_INSTANT = new Date('2026-09-10T22:00:00.000Z');
const TEST_SECRET = 'test-secret-not-a-real-pilot-session-secret';

assert(RESTRICTED_MODE_DEFAULT === false, 'Restricted Mode default OFF');
assert(CANONICAL_WEB_ADMIN_USERNAME === 'admin', 'break-glass username is admin');
assert(isCanonicalWebAdminAccount({ username: 'Admin', role: 'admin' }), 'break-glass is case-insensitive username');
assert(!isCanonicalWebAdminAccount({ username: 'other.admin', role: 'admin' }), 'other admin is not break-glass');
assert(!isCanonicalWebAdminAccount({ username: 'rick.radle', role: 'admin' }), 'display/other login is not break-glass');
assert(isRestrictedModeExemptPath('/api/auth/me') && isRestrictedModeExemptPath('/api/health'), 'auth/health exempt');
assert(isRestrictedModeExemptPath('/api/class-access/state'), 'state endpoint remains readable');
assert(!isRestrictedModeExemptPath('/api/settings') && !isRestrictedModeExemptPath('/api/admin/users'), 'settings/admin not broadly exempt');
assert(!isRestrictedModeExemptPath('/api/missions'), 'missions not exempt');
assert(parseRestrictedModeAllowlist('["lucas.r","admin","lucas.r"]').join(',') === 'lucas.r', 'allowlist stores unique usernames and never admin');

assert(/function reviewStudentDisplayLabel/.test(teacherHtml), '#261 helper still in teacher.html');
assert(/id="classAccessGroupsList"/.test(teacherHtml) && /id="classJoinCodePanel"/.test(teacherHtml), '#262A Class Access + Join Code preserved');
assert(/id="restrictedAccessCard"/.test(adminHtml) && /Restricted Access/.test(adminHtml), 'admin Restricted Access card');
assert(/Activate Restricted Mode/.test(adminHtml) && /End Restricted Mode/.test(adminHtml), 'activate/end controls');
assert(/ALWAYS ALLOWED/.test(adminHtml) && /Protected/.test(adminHtml), 'Web Admin protected indicator');
assert(/schoolAccessRestrictedBanner/.test(teacherHtml), 'teacher Restricted Mode banner');
assert(/restricted_mode_locked/.test(classAccessJs), 'class-access handles restricted lock');
assert(/Request Access/.test(classAccessJs) && /isRestrictedModeLocked/.test(classAccessJs), 'Request Access remains for school lock only');
assert(/temporarily unavailable/.test(restrictedJs), 'locked copy');
assert(ACCESS_AUDIT_ACTIONS.RESTRICTED_MODE_ENABLED && ACCESS_AUDIT_ACTIONS.RESTRICTED_BYPASS_ADDED, 'audit actions exist');

function makeDb(opts) {
  const settings = (opts && opts.settings) || [];
  const accounts = (opts && opts.accounts) || [];
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
          if (s.includes('lantern_pilot_accounts') && s.includes('lower(trim(username))')) {
            const key = String(binds[0] || '').trim().toLowerCase();
            return accounts.find((r) => String(r.username || '').trim().toLowerCase() === key) || null;
          }
          if (s.includes('lantern_access_requests')) return grants.find((g) => g.device_secret_hash === binds[0]) || null;
          if (s.includes('lantern_access_devices')) return devices.find((d) => d.device_token_hash === binds[0]) || null;
          if (s.includes('lantern_access_device_groups')) return groups.find((g) => g.id === binds[0]) || null;
          if (s.includes('lantern_access_group_unlocks')) {
            return unlocks.filter((u) => u.group_id === binds[0]).sort((a, b) => (a.created_at > b.created_at ? -1 : 1))[0] || null;
          }
          if (s.includes('lantern_access_overrides')) return overrides[0] || null;
          return null;
        },
        async all() {
          if (s.includes('FROM lantern_pilot_accounts')) return { results: accounts.slice() };
          return { results: [] };
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
    _settings: settings,
    _accounts: accounts,
  };
}

function depsFor(account) {
  return { getPilotAccountFromRequest: async () => account };
}

const envOn = { SCHOOL_SCHEDULE_ENFORCEMENT_ENABLED: 'true' };

{
  const db = makeDb({});
  const st = await resolveRestrictedModeState(db);
  assert(st.enabled === false && st.allowlist.length === 0, 'empty settings: OFF + no bypass');
}

{
  const db = makeDb({ accounts: [{ username: 'lucas.r', display_name: 'Lucas R.', role: 'student', is_active: 1 }] });
  await setRestrictedModeEnabled(db, true, 'admin');
  const first = await addRestrictedBypassUsername(db, 'lucas.r', 'admin');
  assert(first.ok && first.added, 'add bypass by canonical username');
  const add = await addRestrictedBypassUsername(db, 'lucas.r', 'admin');
  assert(add.ok && add.already, 'add is idempotent');
  const rmAdmin = await removeRestrictedBypassUsername(db, 'admin', 'admin');
  assert(rmAdmin.error === 'protected_web_admin', 'cannot remove protected Web Admin');
}

const student = { username: 'lucas', role: 'student', is_active: 1 };
const teacher = { username: 'teacher1', role: 'teacher', is_active: 1 };
const staff = { username: 'staff1', role: 'staff', is_active: 1 };
const otherAdmin = { username: 'other.admin', role: 'admin', is_active: 1 };
const webAdmin = { username: 'admin', role: 'admin', is_active: 1 };

function restrictedEnv(allow, extra) {
  const settings = [
    { key: 'access.restricted_mode.enabled', value: 'true' },
    { key: 'access.restricted_mode.allowlist', value: JSON.stringify(allow || []) },
  ];
  return { ...envOn, DB: makeDb({ settings, accounts: extra && extra.accounts || [], grants: extra && extra.grants || [], devices: extra && extra.devices || [], groups: extra && extra.groups || [], unlocks: extra && extra.unlocks || [], overrides: extra && extra.overrides || [] }) };
}

async function decide(account, env, now) {
  return evaluateCentralSchoolAccess(new Request('https://lantern.test/api/missions'), env, depsFor(account), now || LOCK_INSTANT);
}

{
  const off = { SCHOOL_SCHEDULE_ENFORCEMENT_ENABLED: 'false', DB: makeDb({}) };
  const r = await decide(student, off, LOCK_INSTANT);
  assert(r.allowed && r.reason === 'enforcement_disabled', 'A Restricted OFF student uses #262');
}

{
  const env = restrictedEnv([]);
  assert(!(await decide(student, env)).allowed && (await decide(student, env)).reason === 'restricted_mode_locked', 'B ordinary student restricted');
  env.DB._accounts.push({ username: 'lucas', role: 'student', is_active: 1 });
  const allowEnv = restrictedEnv(['lucas']);
  const c = await decide(student, allowEnv);
  assert(c.allowed && c.reason === 'restricted_bypass', 'C allowed student');
  assert(!(await decide(teacher, env)).allowed, 'D teacher without bypass restricted');
  const e = await decide(teacher, restrictedEnv(['teacher1']));
  assert(e.allowed && e.reason === 'restricted_bypass', 'E teacher with bypass');
  assert(!(await decide(staff, env)).allowed, 'F staff without bypass');
  assert((await decide(staff, restrictedEnv(['staff1']))).allowed, 'G staff with bypass');
  assert(!(await decide(otherAdmin, env)).allowed, 'H other admin without bypass');
  assert((await decide(otherAdmin, restrictedEnv(['other.admin']))).allowed, 'I other admin with bypass');
  const j = await decide(webAdmin, env);
  assert(j.allowed && j.reason === 'restricted_break_glass', 'J Web Admin always allowed');
}

{
  const secret = 'ind-only';
  const hash = await hashOpaqueSecret(secret);
  const token = 'dev-a';
  const tokenHash = await hashOpaqueSecret(token);
  const env = restrictedEnv([], {
    grants: [{ device_secret_hash: hash, status: 'approved', grant_expires_at: '2099-01-01T00:00:00.000Z', revoked_at: null }],
    devices: [{ id: 'd1', device_token_hash: tokenHash, group_id: 'gA', revoked_at: null }],
    groups: [{ id: 'gA', name: 'A' }],
    unlocks: [{ group_id: 'gA', expires_at: '2099-01-01T00:00:00.000Z', is_active: 1, revoked_at: null, created_at: 't1' }],
    overrides: [{ expires_at: '2099-01-01T00:00:00.000Z', is_active: 1, revoked_at: null }],
  });
  const reqInd = new Request('https://lantern.test/api/missions', { headers: { Cookie: ACCESS_DEVICE_COOKIE_NAME + '=' + secret } });
  const reqGrp = new Request('https://lantern.test/api/missions', { headers: { [DEVICE_TOKEN_HEADER]: token } });
  const k = await evaluateCentralSchoolAccess(reqInd, env, depsFor(student), LOCK_INSTANT);
  const l = await evaluateCentralSchoolAccess(reqGrp, env, depsFor(student), LOCK_INSTANT);
  const m = await evaluateCentralSchoolAccess(new Request('https://lantern.test/api/missions'), env, depsFor(student), LOCK_INSTANT);
  const n = await evaluateCentralSchoolAccess(new Request('https://lantern.test/api/missions'), env, depsFor(student), OUTSIDE_INSTANT);
  assert(!k.allowed, 'K Individual Access only does not bypass Restricted');
  assert(!l.allowed, 'L Class Access only does not bypass Restricted');
  assert(!m.allowed, 'M schoolwide override does not bypass Restricted');
  assert(!n.allowed, 'N outside hours does not bypass Restricted');
}

{
  const db = makeDb({ accounts: [{ username: 'lucas', role: 'student', is_active: 1 }] });
  await setRestrictedModeEnabled(db, true, 'admin');
  const onEnv = { ...envOn, DB: db };
  assert(!(await decide(student, onEnv)).allowed, 'P before add: locked');
  await addRestrictedBypassUsername(db, 'lucas', 'admin');
  assert((await decide(student, onEnv)).allowed, 'Q add during session: next request ALLOW');
  await removeRestrictedBypassUsername(db, 'lucas', 'admin');
  assert(!(await decide(student, onEnv)).allowed, 'P remove during session: next request LOCK');
  await setRestrictedModeEnabled(db, false, 'admin');
  const afterOff = await decide(student, { SCHOOL_SCHEDULE_ENFORCEMENT_ENABLED: 'true', DB: db }, OUTSIDE_INSTANT);
  assert(afterOff.allowed && afterOff.reason === 'outside_scheduled_lock', 'O Restricted OFF restores #262');
  assert(allowlistHasUsername((await resolveRestrictedModeState(db)).allowlist, 'lucas') === false, 'removed user gone');
}

{
  const db = makeDb({ accounts: [{ username: 'keep.me', role: 'teacher', is_active: 1 }] });
  await addRestrictedBypassUsername(db, 'keep.me', 'admin');
  await setRestrictedModeEnabled(db, true, 'admin');
  await setRestrictedModeEnabled(db, false, 'admin');
  const kept = await resolveRestrictedModeState(db);
  assert(kept.enabled === false && allowlistHasUsername(kept.allowlist, 'keep.me'), 'bypass persists while Restricted Mode is OFF');
}

{
  await setRestrictedModeAllowlist(makeDb({}), ['ghost'], 'admin');
  const db = makeDb({
    settings: [
      { key: 'access.restricted_mode.enabled', value: 'true' },
      { key: 'access.restricted_mode.allowlist', value: JSON.stringify(['inactive.s']) },
    ],
    accounts: [{ username: 'inactive.s', role: 'student', is_active: 0 }],
  });
  const decision = evaluateRestrictedModeForAccount(null, await resolveRestrictedModeState(db));
  assert(decision.active && !decision.allowed, 'R inactive account is not treated as authenticated bypass');
}

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
  const token = await signTestJwt({ sub: account.username, role: account.role, iat: now, exp: now + 3600 }, TEST_SECRET);
  return 'lantern_pilot=' + token;
}

function workerEnv(opts) {
  const db = makeDb(opts);
  return { DB: db, PILOT_SESSION_SECRET: TEST_SECRET, SCHOOL_SCHEDULE_ENFORCEMENT_ENABLED: (opts && opts.enforcement) || 'false' };
}

{
  const env = workerEnv({
    settings: [{ key: 'access.restricted_mode.enabled', value: 'true' }, { key: 'access.restricted_mode.allowlist', value: '[]' }],
    accounts: [
      { username: 'lucas', role: 'student', is_active: 1 },
      { username: 'teacher1', role: 'teacher', is_active: 1 },
      { username: 'other.admin', role: 'admin', is_active: 1, display_name: 'Other' },
      { username: 'admin', role: 'admin', is_active: 1, display_name: 'Web Admin' },
    ],
  });
  const studentRes = await worker.fetch(new Request('https://x.test/api/missions/active', { headers: { Cookie: await cookieFor(student) } }), env);
  const studentBody = await studentRes.json();
  assert(studentRes.status === 403 && studentBody.error === 'restricted_mode_locked', 'direct API student locked');
  const teacherRes = await worker.fetch(new Request('https://x.test/api/missions/active', { headers: { Cookie: await cookieFor(teacher) } }), env);
  const teacherBody = await teacherRes.json();
  assert(teacherRes.status === 403 && teacherBody.error === 'restricted_mode_locked', 'direct API teacher locked');
  const adminRes = await worker.fetch(new Request('https://x.test/api/missions/active', { headers: { Cookie: await cookieFor(otherAdmin) } }), env);
  const adminBody = await adminRes.json();
  assert(adminRes.status === 403 && adminBody.error === 'restricted_mode_locked', 'direct API other-admin locked');
  const webRes = await worker.fetch(new Request('https://x.test/api/missions/active', { headers: { Cookie: await cookieFor(webAdmin) } }), env);
  const webBody = await webRes.json();
  assert(!(webRes.status === 403 && webBody.error === 'restricted_mode_locked'), 'direct API Web Admin not restricted-locked');
}

console.log('\nrestricted-mode-262c-test:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
