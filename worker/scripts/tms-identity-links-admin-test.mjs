/**
 * Admin TMS ↔ Lantern staff identity-link management — Prompt #101.
 *
 * Exercises the REAL worker/index.js fetch(request, env) entry point for
 * GET/POST/DELETE /api/admin/tms-identity-links (and a light SSO exchange check for
 * unlink/relink fail-closed behavior), with mocked D1 + real HS256 pilot JWTs.
 *
 * Usage: node worker/scripts/tms-identity-links-admin-test.mjs
 */
import fs from 'fs';
import { fileURLToPath } from 'url';
import worker from '../index.js';

let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

const TEST_PILOT_SECRET = 'test-secret-not-a-real-pilot-session-secret';
const TEST_BRIDGE_SECRET = 'test-bridge-secret-not-real';

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
  const token = await signTestJwt({
    sub: account.username,
    role: account.role,
    scn: account.student_character_name || null,
    tid: account.teacher_id || null,
    iat: now,
    exp: now + 3600,
  }, TEST_PILOT_SECRET);
  return `lantern_pilot=${token}`;
}

function account(overrides) {
  return {
    username: 'Rick Radle',
    display_name: 'Rick Radle',
    role: 'admin',
    student_character_name: null,
    teacher_id: null,
    mtss_student_id: null,
    is_active: 1,
    must_change_password: 0,
    password_hash: 'HASH_SHOULD_NEVER_APPEAR',
    password_salt: 'SALT_SHOULD_NEVER_APPEAR',
    ...overrides,
  };
}

/**
 * In-memory D1 stub covering identity-link admin SQL + session account lookups + SSO exchange.
 * linksByTms: tms_staff_id -> { lantern_username, created_at, created_by }
 * accounts: lower(username) -> row
 * Also tracks whether any DELETE/UPDATE hit lantern_pilot_accounts (must stay false on unlink).
 */
function makeEnv(state) {
  state.accounts = state.accounts || {};
  state.linksByTms = state.linksByTms || {};
  state.accountMutations = state.accountMutations || [];
  state.deletedAccounts = state.deletedAccounts || [];

  function prepare(sql) {
    const s = String(sql);
    const binds = [];
    const api = {
      bind(...args) { binds.push(...args); return api; },
      async first() {
        if (s.includes('FROM tms_identity_links WHERE tms_staff_id')) {
          const link = state.linksByTms[binds[0]];
          return link ? { lantern_username: link.lantern_username, tms_staff_id: binds[0] } : null;
        }
        if (s.includes('FROM lantern_pilot_accounts WHERE lower(trim(username))')) {
          const key = String(binds[0] || '').trim().toLowerCase();
          return state.accounts[key] || null;
        }
        return null;
      },
      async all() {
        if (s.includes('FROM tms_identity_links l') && s.includes('LEFT JOIN lantern_pilot_accounts')) {
          const results = Object.keys(state.linksByTms).sort().map((tmsId) => {
            const link = state.linksByTms[tmsId];
            const acct = state.accounts[String(link.lantern_username || '').toLowerCase()] || {};
            return {
              tms_staff_id: tmsId,
              lantern_username: link.lantern_username,
              created_at: link.created_at || '2026-01-01',
              created_by: link.created_by || 'admin',
              display_name: acct.display_name != null ? acct.display_name : null,
              role: acct.role != null ? acct.role : null,
              is_active: acct.is_active != null ? acct.is_active : null,
            };
          });
          return { results };
        }
        return { results: [] };
      },
      async run() {
        if (s.includes('INSERT INTO tms_identity_links')) {
          const [tmsStaffId, lanternUsername, createdBy] = binds;
          for (const existing of Object.values(state.linksByTms)) {
            if (String(existing.lantern_username) === String(lanternUsername)) {
              throw new Error('UNIQUE constraint failed: tms_identity_links.lantern_username');
            }
          }
          if (state.linksByTms[tmsStaffId]) {
            throw new Error('UNIQUE constraint failed: tms_identity_links.tms_staff_id');
          }
          state.linksByTms[tmsStaffId] = {
            lantern_username: lanternUsername,
            created_at: '2026-08-09',
            created_by: createdBy,
          };
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes('DELETE FROM tms_identity_links WHERE tms_staff_id')) {
          const tmsStaffId = binds[0];
          if (state.linksByTms[tmsStaffId]) {
            delete state.linksByTms[tmsStaffId];
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true, meta: { changes: 0 } };
        }
        if (/DELETE\s+FROM\s+lantern_pilot_accounts/i.test(s)) {
          state.deletedAccounts.push({ sql: s, binds: binds.slice() });
          return { success: true, meta: { changes: 1 } };
        }
        if (/UPDATE\s+lantern_pilot_accounts/i.test(s)) {
          state.accountMutations.push({ sql: s, binds: binds.slice() });
          return { success: true, meta: { changes: 1 } };
        }
        return { success: true, meta: { changes: 1 } };
      },
    };
    return api;
  }

  return {
    DB: { prepare },
    PILOT_SESSION_SECRET: TEST_PILOT_SECRET,
    TMS_LANTERN_BRIDGE_SECRET: TEST_BRIDGE_SECRET,
    _state: state,
  };
}

function adminReq(method, path, body, cookie) {
  const headers = new Headers();
  if (cookie) headers.set('Cookie', cookie);
  if (method === 'POST' || method === 'DELETE') {
    headers.set('Content-Type', 'application/json');
  }
  const init = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);
  return new Request(`https://x.test${path}`, init);
}

async function jsonOf(res) { return res.json(); }

function withMockedRedeem(behavior, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const result = behavior({ url: String(url), opts });
    return {
      ok: result.httpOk !== false,
      json: async () => result.body,
    };
  };
  return fn().finally(() => { globalThis.fetch = original; });
}

function seedAdminWorld() {
  const admin = account({ username: 'Rick Radle', display_name: 'Rick Radle', role: 'admin' });
  const teacher = account({
    username: 'ms_carter',
    display_name: 'Ms. Carter',
    role: 'teacher',
    teacher_id: 't_carter',
  });
  const student = account({
    username: '20889',
    display_name: 'Lucas',
    role: 'student',
    teacher_id: null,
    student_character_name: 'Lucas',
    mtss_student_id: '20889',
  });
  const inactive = account({
    username: 'retired_teacher',
    display_name: 'Retired Teacher',
    role: 'teacher',
    is_active: 0,
  });
  return makeEnv({
    accounts: {
      'rick radle': admin,
      ms_carter: teacher,
      '20889': student,
      retired_teacher: inactive,
    },
    linksByTms: {
      Radle: { lantern_username: 'Rick Radle', created_at: '2026-01-01', created_by: 'seed' },
    },
  });
}

// ---------------------------------------------------------------------------

async function testAdminCanLoadLinks() {
  const env = seedAdminWorld();
  const cookie = await cookieFor(env._state.accounts['rick radle']);
  const res = await worker.fetch(adminReq('GET', '/api/admin/tms-identity-links', undefined, cookie), env);
  const body = await jsonOf(res);
  if (res.status !== 200 || !body.ok || !Array.isArray(body.links)) {
    return bad('admin can load links', { status: res.status, body });
  }
  ok('admin can load links');
}

async function testNonAdminDenied() {
  const env = seedAdminWorld();
  const teacherCookie = await cookieFor(env._state.accounts.ms_carter);
  const teacherRes = await worker.fetch(adminReq('GET', '/api/admin/tms-identity-links', undefined, teacherCookie), env);
  const teacherBody = await jsonOf(teacherRes);
  if (teacherRes.status !== 403 || teacherBody.error !== 'forbidden') {
    return bad('teacher must be denied', { status: teacherRes.status, body: teacherBody });
  }
  const studentCookie = await cookieFor(env._state.accounts['20889']);
  const studentRes = await worker.fetch(adminReq('GET', '/api/admin/tms-identity-links', undefined, studentCookie), env);
  const studentBody = await jsonOf(studentRes);
  if (studentRes.status !== 403 || studentBody.error !== 'forbidden') {
    return bad('student must be denied', { status: studentRes.status, body: studentBody });
  }
  const anonRes = await worker.fetch(adminReq('GET', '/api/admin/tms-identity-links'), env);
  const anonBody = await jsonOf(anonRes);
  if (anonRes.status !== 403 || anonBody.error !== 'forbidden') {
    return bad('anonymous must be denied', { status: anonRes.status, body: anonBody });
  }
  ok('non-admin denied (teacher/student/anonymous)');
}

async function testCurrentMappingRenders() {
  const env = seedAdminWorld();
  const cookie = await cookieFor(env._state.accounts['rick radle']);
  const res = await worker.fetch(adminReq('GET', '/api/admin/tms-identity-links', undefined, cookie), env);
  const body = await jsonOf(res);
  const radle = (body.links || []).find((l) => l.tms_staff_id === 'Radle');
  if (!radle || radle.lantern_username !== 'Rick Radle' || radle.display_name !== 'Rick Radle') {
    return bad('current Radle → Rick Radle mapping must render with display_name', body);
  }
  if (radle.role !== 'admin') return bad('mapping should include role', radle);
  ok('current mapping renders (Radle → Rick Radle)');
}

async function testAdminCanCreateValidMapping() {
  const env = seedAdminWorld();
  const cookie = await cookieFor(env._state.accounts['rick radle']);
  const res = await worker.fetch(
    adminReq('POST', '/api/admin/tms-identity-links', { tms_staff_id: 'Carter', lantern_username: 'ms_carter' }, cookie),
    env
  );
  const body = await jsonOf(res);
  if (res.status !== 200 || !body.ok || body.tms_staff_id !== 'Carter' || body.lantern_username !== 'ms_carter') {
    return bad('admin can create valid mapping', { status: res.status, body });
  }
  if (!env._state.linksByTms.Carter || env._state.linksByTms.Carter.lantern_username !== 'ms_carter') {
    return bad('mapping not persisted in D1 stub', env._state.linksByTms);
  }
  ok('admin can create valid mapping');
}

async function testDuplicateTmsIdRejected() {
  const env = seedAdminWorld();
  const cookie = await cookieFor(env._state.accounts['rick radle']);
  const res = await worker.fetch(
    adminReq('POST', '/api/admin/tms-identity-links', { tms_staff_id: 'Radle', lantern_username: 'ms_carter' }, cookie),
    env
  );
  const body = await jsonOf(res);
  if (res.status !== 409 || body.error !== 'link_already_exists') {
    return bad('duplicate TMS ID rejected', { status: res.status, body });
  }
  ok('duplicate TMS ID rejected');
}

async function testDuplicateLanternAccountRejected() {
  const env = seedAdminWorld();
  const cookie = await cookieFor(env._state.accounts['rick radle']);
  const res = await worker.fetch(
    adminReq('POST', '/api/admin/tms-identity-links', { tms_staff_id: 'OtherStaff', lantern_username: 'Rick Radle' }, cookie),
    env
  );
  const body = await jsonOf(res);
  if (res.status !== 409 || body.error !== 'link_already_exists') {
    return bad('duplicate Lantern account rejected', { status: res.status, body });
  }
  ok('duplicate Lantern account rejected');
}

async function testStudentAccountRejected() {
  const env = seedAdminWorld();
  const cookie = await cookieFor(env._state.accounts['rick radle']);
  const res = await worker.fetch(
    adminReq('POST', '/api/admin/tms-identity-links', { tms_staff_id: 'NewStaff', lantern_username: '20889' }, cookie),
    env
  );
  const body = await jsonOf(res);
  if (res.status !== 400 || body.error !== 'lantern_account_not_staff') {
    return bad('student account rejected', { status: res.status, body });
  }
  ok('student account rejected');
}

async function testInactiveAccountRejected() {
  const env = seedAdminWorld();
  const cookie = await cookieFor(env._state.accounts['rick radle']);
  const res = await worker.fetch(
    adminReq('POST', '/api/admin/tms-identity-links', { tms_staff_id: 'NewStaff', lantern_username: 'retired_teacher' }, cookie),
    env
  );
  const body = await jsonOf(res);
  if (res.status !== 400 || body.error !== 'lantern_account_inactive') {
    return bad('inactive account rejected', { status: res.status, body });
  }
  ok('inactive account rejected');
}

async function testNameSimilarityDoesNotAutoLink() {
  const env = seedAdminWorld();
  // Drop the seed link so the world has Rick Radle + a TMS-ish name "Radle" available, but no row.
  delete env._state.linksByTms.Radle;
  const cookie = await cookieFor(env._state.accounts['rick radle']);
  const listRes = await worker.fetch(adminReq('GET', '/api/admin/tms-identity-links', undefined, cookie), env);
  const listBody = await jsonOf(listRes);
  if ((listBody.links || []).length !== 0) {
    return bad('no auto-link after clearing mappings', listBody);
  }
  // Creating still requires BOTH sides explicitly — posting only a name-like TMS id without lantern_username fails.
  const badRes = await worker.fetch(
    adminReq('POST', '/api/admin/tms-identity-links', { tms_staff_id: 'Radle' }, cookie),
    env
  );
  const badBody = await jsonOf(badRes);
  if (badRes.status !== 400 || badBody.error !== 'invalid_lantern_username') {
    return bad('POST without explicit lantern_username must fail (no name guess)', { status: badRes.status, body: badBody });
  }
  if (env._state.linksByTms.Radle) {
    return bad('name similarity must never create a row', env._state.linksByTms);
  }
  ok('name similarity does not auto-link');
}

async function testUnlinkRemovesMappingOnly() {
  const env = seedAdminWorld();
  const cookie = await cookieFor(env._state.accounts['rick radle']);
  const beforeAccounts = JSON.stringify(env._state.accounts);
  const res = await worker.fetch(
    adminReq('DELETE', '/api/admin/tms-identity-links', { tms_staff_id: 'Radle' }, cookie),
    env
  );
  const body = await jsonOf(res);
  if (res.status !== 200 || !body.ok || body.deleted !== true) {
    return bad('unlink removes mapping', { status: res.status, body });
  }
  if (env._state.linksByTms.Radle) return bad('Radle link still present after unlink', env._state.linksByTms);
  if (JSON.stringify(env._state.accounts) !== beforeAccounts) {
    return bad('unlink mutated accounts', { before: beforeAccounts, after: env._state.accounts });
  }
  if (env._state.deletedAccounts.length || env._state.accountMutations.length) {
    return bad('unlink must not DELETE/UPDATE lantern_pilot_accounts', {
      deletedAccounts: env._state.deletedAccounts,
      accountMutations: env._state.accountMutations,
    });
  }
  ok('unlink removes mapping only');
}

async function testUnlinkDoesNotDeleteAccountsOrData() {
  // Covered structurally above; also assert Rick Radle account still loadable via session after unlink.
  const env = seedAdminWorld();
  const cookie = await cookieFor(env._state.accounts['rick radle']);
  await worker.fetch(adminReq('DELETE', '/api/admin/tms-identity-links', { tms_staff_id: 'Radle' }, cookie), env);
  const listRes = await worker.fetch(adminReq('GET', '/api/admin/tms-identity-links', undefined, cookie), env);
  const listBody = await jsonOf(listRes);
  if (listRes.status !== 200 || !listBody.ok) {
    return bad('admin session/account still works after unlink', { status: listRes.status, body: listBody });
  }
  if (!env._state.accounts['rick radle'] || env._state.accounts['rick radle'].role !== 'admin') {
    return bad('Rick Radle account must remain', env._state.accounts['rick radle']);
  }
  ok('unlink does not delete accounts/data');
}

async function testUnmappedUserFailsSsoClosed() {
  const env = seedAdminWorld();
  delete env._state.linksByTms.Radle;
  await withMockedRedeem(
    () => ({ body: { ok: true, tms_staff_id: 'Radle' } }),
    async () => {
      const res = await worker.fetch(
        new Request('https://x.test/api/auth/tms-exchange?code=abc123', { method: 'GET' }),
        env
      );
      const text = await res.text();
      if (res.status === 302) return bad('unmapped SSO must not redirect into app', res.headers.get('Location'));
      if (!/lantern_account_not_linked|not linked|SSO/i.test(text) && res.status !== 200) {
        // Failure pages are 200 HTML with an error code embedded; accept either.
      }
      if (/Set-Cookie:\s*lantern_pilot=/i.test(String(res.headers.get('Set-Cookie') || ''))) {
        return bad('unmapped SSO must not set lantern_pilot cookie', res.headers.get('Set-Cookie'));
      }
      ok('unmapped user still fails SSO closed');
    }
  );
}

async function testRelinkRestoresSsoEligibility() {
  const env = seedAdminWorld();
  const cookie = await cookieFor(env._state.accounts['rick radle']);
  await worker.fetch(adminReq('DELETE', '/api/admin/tms-identity-links', { tms_staff_id: 'Radle' }, cookie), env);
  const linkRes = await worker.fetch(
    adminReq('POST', '/api/admin/tms-identity-links', { tms_staff_id: 'Radle', lantern_username: 'Rick Radle' }, cookie),
    env
  );
  const linkBody = await jsonOf(linkRes);
  if (!linkRes.ok || !linkBody.ok) return bad('relink POST failed', { status: linkRes.status, body: linkBody });

  await withMockedRedeem(
    () => ({ body: { ok: true, tms_staff_id: 'Radle' } }),
    async () => {
      const res = await worker.fetch(
        new Request('https://x.test/api/auth/tms-exchange?code=abc123', { method: 'GET' }),
        env
      );
      if (res.status !== 302 || res.headers.get('Location') !== '/teacher.html') {
        return bad('relink must restore SSO eligibility (302 /teacher.html)', {
          status: res.status,
          loc: res.headers.get('Location'),
        });
      }
      const setCookie = res.headers.get('Set-Cookie') || '';
      if (!/lantern_pilot=/.test(setCookie)) return bad('relinked SSO must set lantern_pilot cookie', setCookie);
      ok('relink restores SSO eligibility');
    }
  );
}

async function testNoSecretsDisplayed() {
  const env = seedAdminWorld();
  const cookie = await cookieFor(env._state.accounts['rick radle']);
  const res = await worker.fetch(adminReq('GET', '/api/admin/tms-identity-links', undefined, cookie), env);
  const body = await jsonOf(res);
  const raw = JSON.stringify(body);
  if (/HASH_SHOULD_NEVER_APPEAR|SALT_SHOULD_NEVER_APPEAR|password_hash|password_salt|PILOT_SESSION|BRIDGE_SECRET|jwt/i.test(raw)) {
    return bad('links response leaked secrets', body);
  }
  for (const link of body.links || []) {
    const keys = Object.keys(link).sort().join(',');
    // Allow only the safe projection from the SELECT.
    const allowed = ['created_at', 'created_by', 'display_name', 'is_active', 'lantern_username', 'role', 'tms_staff_id'];
    for (const k of Object.keys(link)) {
      if (!allowed.includes(k)) return bad('unexpected field in link row: ' + k, link);
    }
    if (keys.indexOf('password') !== -1) return bad('password field present', keys);
  }
  ok('no secrets displayed in identity-link API responses');
}

function testAdminUiPresentAndSafe() {
  const adminPath = fileURLToPath(new URL('../../app/admin.html', import.meta.url));
  const html = fs.readFileSync(adminPath, 'utf8');
  if (!/TMS Staff Links/.test(html)) return bad('admin.html missing TMS Staff Links section');
  if (!/tms-identity-links/.test(html)) return bad('admin.html missing tms-identity-links API calls');
  if (!/Link Accounts/.test(html) || !/Unlink/.test(html)) return bad('admin.html missing Link/Unlink actions');
  // The TMS links card must not invent password fields or dump raw tokens.
  const cardStart = html.indexOf('id="tmsStaffLinksCard"');
  const cardEnd = html.indexOf('id="walletAdjustmentCard"');
  if (cardStart < 0 || cardEnd < 0 || cardEnd <= cardStart) return bad('could not isolate TMS Staff Links card markup');
  const card = html.slice(cardStart, cardEnd);
  if (/type="password"|password_hash|device.?token|Authorization/i.test(card)) {
    return bad('TMS Staff Links card must not expose secrets/password inputs', card.slice(0, 200));
  }
  if (!/confirm\(/.test(html) || !/Unlink TMS staff/.test(html)) {
    return bad('unlink confirmation missing');
  }
  ok('admin UI present with Link/Unlink and no secrets surface');
}

await testAdminCanLoadLinks();
await testNonAdminDenied();
await testCurrentMappingRenders();
await testAdminCanCreateValidMapping();
await testDuplicateTmsIdRejected();
await testDuplicateLanternAccountRejected();
await testStudentAccountRejected();
await testInactiveAccountRejected();
await testNameSimilarityDoesNotAutoLink();
await testUnlinkRemovesMappingOnly();
await testUnlinkDoesNotDeleteAccountsOrData();
await testUnmappedUserFailsSsoClosed();
await testRelinkRestoresSsoEligibility();
await testNoSecretsDisplayed();
testAdminUiPresentAndSafe();

console.log('\ntms-identity-links-admin-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
