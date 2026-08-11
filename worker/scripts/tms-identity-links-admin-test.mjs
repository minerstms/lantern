/**
 * Admin TMS ↔ Lantern staff identity-link management — Prompt #101 / #184.
 *
 * Exercises the REAL worker/index.js fetch(request, env) entry point for
 * GET/POST/DELETE /api/admin/tms-identity-links (+ /primary), with mocked D1 +
 * real HS256 pilot JWTs.
 *
 * Prompt #184 cardinality:
 *   ONE TMS staff → MANY Lantern accounts
 *   ONE Lantern account → at most ONE TMS staff
 *   Explicit is_primary (at most one per tms_staff_id)
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
    username: 'admin',
    display_name: 'Web Admin',
    role: 'admin',
    student_character_name: null,
    teacher_id: null,
    mtss_student_id: null,
    staff_id: 1,
    is_active: 1,
    must_change_password: 0,
    password_hash: 'HASH_SHOULD_NEVER_APPEAR',
    password_salt: 'SALT_SHOULD_NEVER_APPEAR',
    ...overrides,
  };
}

/**
 * In-memory D1 stub for #184 schema:
 * state.links[] = { id, tms_staff_id, lantern_username, lantern_staff_id, is_primary, created_at, created_by }
 */
function makeEnv(state) {
  state.accounts = state.accounts || {};
  state.links = state.links || [];
  state.nextLinkId = state.nextLinkId || (state.links.reduce((m, l) => Math.max(m, Number(l.id) || 0), 0) + 1);
  state.accountMutations = state.accountMutations || [];
  state.deletedAccounts = state.deletedAccounts || [];

  function allLinks() {
    return state.links.slice();
  }

  function prepare(sql) {
    const s = String(sql).replace(/\s+/g, ' ');
    const binds = [];
    const api = {
      bind(...args) { binds.push(...args); return api; },
      async first() {
        if (s.includes('SELECT COUNT(*) AS n FROM tms_identity_links WHERE tms_staff_id')) {
          const tms = binds[0];
          return { n: allLinks().filter((l) => l.tms_staff_id === tms).length };
        }
        if (s.includes('FROM tms_identity_links WHERE id = ?')) {
          const id = Number(binds[0]);
          return allLinks().find((l) => Number(l.id) === id) || null;
        }
        if (
          s.includes('FROM tms_identity_links') &&
          s.includes('lower(trim(lantern_username))') &&
          s.includes('is_primary')
        ) {
          const u = String(binds[0] || '').trim().toLowerCase();
          return allLinks().find((l) => String(l.lantern_username).toLowerCase() === u) || null;
        }
        if (s.includes('FROM tms_identity_links') && s.includes('is_primary = 1')) {
          const tms = binds[0];
          const row = allLinks().find((l) => l.tms_staff_id === tms && Number(l.is_primary) === 1);
          return row ? { lantern_username: row.lantern_username } : null;
        }
        if (s.includes('FROM tms_identity_links WHERE tms_staff_id = ?') && !s.includes('is_primary') && !s.includes('COUNT')) {
          const tms = binds[0];
          const row = allLinks().find((l) => l.tms_staff_id === tms);
          return row ? { lantern_username: row.lantern_username, tms_staff_id: tms } : null;
        }
        if (s.includes('FROM lantern_pilot_accounts WHERE lower(trim(username))')) {
          const key = String(binds[0] || '').trim().toLowerCase();
          return state.accounts[key] || null;
        }
        return null;
      },
      async all() {
        if (s.includes('FROM tms_identity_links l') && s.includes('LEFT JOIN lantern_pilot_accounts')) {
          const results = allLinks()
            .slice()
            .sort((a, b) => {
              if (a.tms_staff_id !== b.tms_staff_id) return String(a.tms_staff_id).localeCompare(String(b.tms_staff_id));
              const ap = Number(a.is_primary) === 1 ? 0 : 1;
              const bp = Number(b.is_primary) === 1 ? 0 : 1;
              if (ap !== bp) return ap - bp;
              return String(a.lantern_username).localeCompare(String(b.lantern_username));
            })
            .map((link) => {
              const acct = state.accounts[String(link.lantern_username || '').toLowerCase()] || {};
              return {
                id: link.id,
                tms_staff_id: link.tms_staff_id,
                lantern_username: link.lantern_username,
                lantern_staff_id: link.lantern_staff_id != null ? link.lantern_staff_id : null,
                is_primary: Number(link.is_primary) === 1 ? 1 : 0,
                created_at: link.created_at || '2026-01-01',
                created_by: link.created_by || 'admin',
                display_name: acct.display_name != null ? acct.display_name : null,
                role: acct.role != null ? acct.role : null,
                is_active: acct.is_active != null ? acct.is_active : null,
              };
            });
          return { results };
        }
        if (s.includes('FROM tms_identity_links') && s.includes('WHERE tms_staff_id = ? AND id != ?')) {
          const tms = binds[0];
          const excludeId = Number(binds[1]);
          const results = allLinks()
            .filter((l) => l.tms_staff_id === tms && Number(l.id) !== excludeId)
            .sort((a, b) => String(a.lantern_username).localeCompare(String(b.lantern_username)))
            .map((l) => ({ id: l.id, lantern_username: l.lantern_username, is_primary: l.is_primary }));
          return { results };
        }
        return { results: [] };
      },
      async run() {
        if (s.includes('INSERT INTO tms_identity_links')) {
          const [tmsStaffId, lanternUsername, lanternStaffId, isPrimary, createdBy] = binds;
          for (const existing of allLinks()) {
            if (String(existing.lantern_username).toLowerCase() === String(lanternUsername).toLowerCase()) {
              throw new Error('UNIQUE constraint failed: tms_identity_links.lantern_username');
            }
            if (
              lanternStaffId != null &&
              existing.lantern_staff_id != null &&
              Number(existing.lantern_staff_id) === Number(lanternStaffId)
            ) {
              throw new Error('UNIQUE constraint failed: tms_identity_links.lantern_staff_id');
            }
          }
          const id = state.nextLinkId++;
          state.links.push({
            id,
            tms_staff_id: tmsStaffId,
            lantern_username: lanternUsername,
            lantern_staff_id: lanternStaffId,
            is_primary: Number(isPrimary) === 1 ? 1 : 0,
            created_at: '2026-08-10',
            created_by: createdBy,
          });
          return { success: true, meta: { changes: 1, last_row_id: id } };
        }
        if (s.includes('UPDATE tms_identity_links SET is_primary = 0 WHERE tms_staff_id')) {
          const tms = binds[0];
          for (const l of state.links) {
            if (l.tms_staff_id === tms) l.is_primary = 0;
          }
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes('UPDATE tms_identity_links SET is_primary = 1 WHERE id')) {
          const id = Number(binds[0]);
          for (const l of state.links) {
            if (Number(l.id) === id) l.is_primary = 1;
          }
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes('DELETE FROM tms_identity_links WHERE id = ?')) {
          const id = Number(binds[0]);
          const before = state.links.length;
          state.links = state.links.filter((l) => Number(l.id) !== id);
          return { success: true, meta: { changes: before - state.links.length } };
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

  async function batch(statements) {
    const out = [];
    for (const stmt of statements) {
      out.push(await stmt.run());
    }
    return out;
  }

  return {
    DB: { prepare, batch },
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
  const admin = account({ username: 'admin', display_name: 'Web Admin', role: 'admin', staff_id: 1 });
  const teacherRick = account({
    username: 'rick.radle',
    display_name: 'Rick Radle',
    role: 'teacher',
    staff_id: 4,
    teacher_id: 't_rick',
  });
  const teacher = account({
    username: 'ms_carter',
    display_name: 'Ms. Carter',
    role: 'teacher',
    teacher_id: 't_carter',
    staff_id: 10,
  });
  const student = account({
    username: '20889',
    display_name: 'Lucas',
    role: 'student',
    teacher_id: null,
    student_character_name: 'Lucas',
    mtss_student_id: '20889',
    staff_id: null,
  });
  const inactive = account({
    username: 'retired_teacher',
    display_name: 'Retired Teacher',
    role: 'teacher',
    is_active: 0,
    staff_id: 11,
  });
  return makeEnv({
    accounts: {
      admin,
      'rick.radle': teacherRick,
      ms_carter: teacher,
      '20889': student,
      retired_teacher: inactive,
    },
    links: [
      {
        id: 1,
        tms_staff_id: 'Radle',
        lantern_username: 'admin',
        lantern_staff_id: 1,
        is_primary: 1,
        created_at: '2026-01-01',
        created_by: 'seed',
      },
    ],
    nextLinkId: 2,
  });
}

function linksForTms(env, tms) {
  return env._state.links.filter((l) => l.tms_staff_id === tms);
}

// ---------------------------------------------------------------------------

async function testAdminCanLoadLinks() {
  const env = seedAdminWorld();
  const cookie = await cookieFor(env._state.accounts.admin);
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
  const cookie = await cookieFor(env._state.accounts.admin);
  const res = await worker.fetch(adminReq('GET', '/api/admin/tms-identity-links', undefined, cookie), env);
  const body = await jsonOf(res);
  const radle = (body.links || []).find((l) => l.tms_staff_id === 'Radle');
  if (!radle || radle.lantern_username !== 'admin' || radle.display_name !== 'Web Admin') {
    return bad('current Radle → admin mapping must render with display_name', body);
  }
  if (radle.role !== 'admin') return bad('mapping should include role', radle);
  if (Number(radle.is_primary) !== 1) return bad('seed link should be primary', radle);
  if (radle.id == null) return bad('link rows must include id', radle);
  ok('current mapping renders (Radle → admin, primary)');
}

async function testAdminCanCreateValidMapping() {
  const env = seedAdminWorld();
  const cookie = await cookieFor(env._state.accounts.admin);
  const res = await worker.fetch(
    adminReq('POST', '/api/admin/tms-identity-links', { tms_staff_id: 'Carter', lantern_username: 'ms_carter' }, cookie),
    env
  );
  const body = await jsonOf(res);
  if (res.status !== 200 || !body.ok || body.tms_staff_id !== 'Carter' || body.lantern_username !== 'ms_carter') {
    return bad('admin can create valid mapping', { status: res.status, body });
  }
  if (Number(body.is_primary) !== 1) return bad('first link for TMS staff must be primary', body);
  const carter = linksForTms(env, 'Carter');
  if (carter.length !== 1 || carter[0].lantern_username !== 'ms_carter' || Number(carter[0].is_primary) !== 1) {
    return bad('mapping not persisted in D1 stub', env._state.links);
  }
  ok('admin can create valid mapping (first link auto-primary)');
}

async function testSecondLinkSameTmsAllowedAsSecondary() {
  const env = seedAdminWorld();
  const cookie = await cookieFor(env._state.accounts.admin);
  const res = await worker.fetch(
    adminReq('POST', '/api/admin/tms-identity-links', { tms_staff_id: 'Radle', lantern_username: 'rick.radle' }, cookie),
    env
  );
  const body = await jsonOf(res);
  if (res.status !== 200 || !body.ok || body.lantern_username !== 'rick.radle') {
    return bad('second Lantern link for same TMS must be allowed', { status: res.status, body });
  }
  if (Number(body.is_primary) !== 0) return bad('additional link must default is_primary=0', body);
  const radleLinks = linksForTms(env, 'Radle');
  if (radleLinks.length !== 2) return bad('expected two Radle links', radleLinks);
  const primaries = radleLinks.filter((l) => Number(l.is_primary) === 1);
  if (primaries.length !== 1 || primaries[0].lantern_username !== 'admin') {
    return bad('exactly one primary must remain on admin account until switched', primaries);
  }
  ok('ONE TMS → TWO Lantern links allowed; additional defaults secondary');
}

async function testDuplicateLanternAccountRejected() {
  const env = seedAdminWorld();
  const cookie = await cookieFor(env._state.accounts.admin);
  const res = await worker.fetch(
    adminReq('POST', '/api/admin/tms-identity-links', { tms_staff_id: 'OtherStaff', lantern_username: 'admin' }, cookie),
    env
  );
  const body = await jsonOf(res);
  if (res.status !== 409 || body.error !== 'link_already_exists') {
    return bad('duplicate Lantern account rejected', { status: res.status, body });
  }
  ok('duplicate Lantern account rejected (ONE Lantern → ONE TMS)');
}

async function testStudentAccountRejected() {
  const env = seedAdminWorld();
  const cookie = await cookieFor(env._state.accounts.admin);
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
  const cookie = await cookieFor(env._state.accounts.admin);
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
  env._state.links = [];
  const cookie = await cookieFor(env._state.accounts.admin);
  const listRes = await worker.fetch(adminReq('GET', '/api/admin/tms-identity-links', undefined, cookie), env);
  const listBody = await jsonOf(listRes);
  if ((listBody.links || []).length !== 0) {
    return bad('no auto-link after clearing mappings', listBody);
  }
  const badRes = await worker.fetch(
    adminReq('POST', '/api/admin/tms-identity-links', { tms_staff_id: 'Radle' }, cookie),
    env
  );
  const badBody = await jsonOf(badRes);
  if (badRes.status !== 400 || badBody.error !== 'invalid_lantern_username') {
    return bad('POST without explicit lantern_username must fail (no name guess)', { status: badRes.status, body: badBody });
  }
  if (linksForTms(env, 'Radle').length) {
    return bad('name similarity must never create a row', env._state.links);
  }
  ok('name similarity does not auto-link');
}

async function testSetPrimaryAtomic() {
  const env = seedAdminWorld();
  const cookie = await cookieFor(env._state.accounts.admin);
  await worker.fetch(
    adminReq('POST', '/api/admin/tms-identity-links', { tms_staff_id: 'Radle', lantern_username: 'rick.radle' }, cookie),
    env
  );
  const teacherLink = linksForTms(env, 'Radle').find((l) => l.lantern_username === 'rick.radle');
  const res = await worker.fetch(
    adminReq('POST', '/api/admin/tms-identity-links/primary', { id: teacherLink.id }, cookie),
    env
  );
  const body = await jsonOf(res);
  if (res.status !== 200 || !body.ok || body.lantern_username !== 'rick.radle') {
    return bad('set primary failed', { status: res.status, body });
  }
  const radle = linksForTms(env, 'Radle');
  const primaries = radle.filter((l) => Number(l.is_primary) === 1);
  if (primaries.length !== 1 || primaries[0].lantern_username !== 'rick.radle') {
    return bad('exactly one primary after switch', radle);
  }
  const adminLink = radle.find((l) => l.lantern_username === 'admin');
  if (!adminLink || Number(adminLink.is_primary) !== 0) {
    return bad('admin link must become secondary', adminLink);
  }
  ok('primary designation is atomic (one primary per TMS)');
}

async function testUnlinkByIdRemovesOneLinkOnly() {
  const env = seedAdminWorld();
  const cookie = await cookieFor(env._state.accounts.admin);
  await worker.fetch(
    adminReq('POST', '/api/admin/tms-identity-links', { tms_staff_id: 'Radle', lantern_username: 'rick.radle' }, cookie),
    env
  );
  const teacherLink = linksForTms(env, 'Radle').find((l) => l.lantern_username === 'rick.radle');
  const beforeAccounts = JSON.stringify(env._state.accounts);
  const res = await worker.fetch(
    adminReq('DELETE', '/api/admin/tms-identity-links', { id: teacherLink.id }, cookie),
    env
  );
  const body = await jsonOf(res);
  if (res.status !== 200 || !body.ok || body.deleted !== true) {
    return bad('unlink by id removes mapping', { status: res.status, body });
  }
  if (linksForTms(env, 'Radle').length !== 1) return bad('must leave other Radle link', env._state.links);
  if (linksForTms(env, 'Radle')[0].lantern_username !== 'admin') {
    return bad('admin link must remain', env._state.links);
  }
  if (JSON.stringify(env._state.accounts) !== beforeAccounts) {
    return bad('unlink mutated accounts', { before: beforeAccounts, after: env._state.accounts });
  }
  if (env._state.deletedAccounts.length || env._state.accountMutations.length) {
    return bad('unlink must not DELETE/UPDATE lantern_pilot_accounts', {
      deletedAccounts: env._state.deletedAccounts,
      accountMutations: env._state.accountMutations,
    });
  }
  ok('unlink by id removes one link only');
}

async function testDeleteByTmsStaffIdAloneRefused() {
  const env = seedAdminWorld();
  const cookie = await cookieFor(env._state.accounts.admin);
  const res = await worker.fetch(
    adminReq('DELETE', '/api/admin/tms-identity-links', { tms_staff_id: 'Radle' }, cookie),
    env
  );
  const body = await jsonOf(res);
  if (res.status !== 400 || body.error !== 'missing_link_id') {
    return bad('DELETE by tms_staff_id alone must be refused', { status: res.status, body });
  }
  if (linksForTms(env, 'Radle').length !== 1) return bad('must not delete any links', env._state.links);
  ok('DELETE by tms_staff_id alone refused (no bulk unlink-all)');
}

async function testPrimaryUnlinkRequiresReplacement() {
  const env = seedAdminWorld();
  const cookie = await cookieFor(env._state.accounts.admin);
  await worker.fetch(
    adminReq('POST', '/api/admin/tms-identity-links', { tms_staff_id: 'Radle', lantern_username: 'rick.radle' }, cookie),
    env
  );
  const primary = linksForTms(env, 'Radle').find((l) => Number(l.is_primary) === 1);
  const refuse = await worker.fetch(
    adminReq('DELETE', '/api/admin/tms-identity-links', { id: primary.id }, cookie),
    env
  );
  const refuseBody = await jsonOf(refuse);
  if (refuse.status !== 400 || refuseBody.error !== 'replacement_primary_required') {
    return bad('primary unlink without replacement must fail', { status: refuse.status, body: refuseBody });
  }
  const okRes = await worker.fetch(
    adminReq(
      'DELETE',
      '/api/admin/tms-identity-links',
      { id: primary.id, replacement_lantern_username: 'rick.radle' },
      cookie
    ),
    env
  );
  const okBody = await jsonOf(okRes);
  if (okRes.status !== 200 || !okBody.ok || okBody.new_primary_lantern_username !== 'rick.radle') {
    return bad('primary unlink with replacement failed', { status: okRes.status, body: okBody });
  }
  const remaining = linksForTms(env, 'Radle');
  if (remaining.length !== 1 || remaining[0].lantern_username !== 'rick.radle' || Number(remaining[0].is_primary) !== 1) {
    return bad('replacement must become sole primary', remaining);
  }
  ok('primary unlink requires explicit replacement');
}

async function testUnmappedUserFailsSsoClosed() {
  const env = seedAdminWorld();
  env._state.links = [];
  await withMockedRedeem(
    () => ({ body: { ok: true, tms_staff_id: 'Radle' } }),
    async () => {
      const res = await worker.fetch(
        new Request('https://x.test/api/auth/tms-exchange?code=abc123', { method: 'GET' }),
        env
      );
      if (res.status === 302) return bad('unmapped SSO must not redirect into app', res.headers.get('Location'));
      if (/Set-Cookie:\s*lantern_pilot=/i.test(String(res.headers.get('Set-Cookie') || ''))) {
        return bad('unmapped SSO must not set lantern_pilot cookie', res.headers.get('Set-Cookie'));
      }
      ok('unmapped user still fails SSO closed');
    }
  );
}

async function testPrimaryWinsReverseSso() {
  const env = seedAdminWorld();
  const cookie = await cookieFor(env._state.accounts.admin);
  await worker.fetch(
    adminReq('POST', '/api/admin/tms-identity-links', { tms_staff_id: 'Radle', lantern_username: 'rick.radle' }, cookie),
    env
  );
  const teacherLink = linksForTms(env, 'Radle').find((l) => l.lantern_username === 'rick.radle');
  await worker.fetch(adminReq('POST', '/api/admin/tms-identity-links/primary', { id: teacherLink.id }, cookie), env);

  await withMockedRedeem(
    () => ({ body: { ok: true, tms_staff_id: 'Radle' } }),
    async () => {
      const res = await worker.fetch(
        new Request('https://x.test/api/auth/tms-exchange?code=abc123', { method: 'GET' }),
        env
      );
      const loc = res.headers.get('Location') || '';
      if (res.status !== 302 || (loc !== '/teacher.html' && loc !== '/teacher')) {
        return bad('primary reverse SSO must land in teacher account session', {
          status: res.status,
          loc,
        });
      }
      const setCookie = res.headers.get('Set-Cookie') || '';
      if (!/lantern_pilot=/.test(setCookie)) return bad('primary SSO must set lantern_pilot cookie', setCookie);
      // Decode JWT payload sub
      const m = /lantern_pilot=([^;]+)/.exec(setCookie);
      const token = decodeURIComponent(m[1]);
      const payload = JSON.parse(Buffer.from(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
      if (payload.sub !== 'rick.radle' || payload.role !== 'teacher') {
        return bad('SSO must target primary rick.radle teacher, not admin', payload);
      }
      ok('TMS→Lantern reverse SSO uses primary rick.radle (not admin)');
    }
  );
}

async function testNoSecretsDisplayed() {
  const env = seedAdminWorld();
  const cookie = await cookieFor(env._state.accounts.admin);
  const res = await worker.fetch(adminReq('GET', '/api/admin/tms-identity-links', undefined, cookie), env);
  const body = await jsonOf(res);
  const raw = JSON.stringify(body);
  if (/HASH_SHOULD_NEVER_APPEAR|SALT_SHOULD_NEVER_APPEAR|password_hash|password_salt|PILOT_SESSION|BRIDGE_SECRET|jwt/i.test(raw)) {
    return bad('links response leaked secrets', body);
  }
  const allowed = [
    'created_at',
    'created_by',
    'display_name',
    'id',
    'is_active',
    'is_primary',
    'lantern_staff_id',
    'lantern_username',
    'role',
    'tms_staff_id',
  ];
  for (const link of body.links || []) {
    for (const k of Object.keys(link)) {
      if (!allowed.includes(k)) return bad('unexpected field in link row: ' + k, link);
    }
  }
  ok('no secrets displayed in identity-link API responses');
}

function testAdminUiPresentAndSafe() {
  const adminPath = fileURLToPath(new URL('../../app/admin.html', import.meta.url));
  const html = fs.readFileSync(adminPath, 'utf8');
  if (!/TMS Staff Links/.test(html)) return bad('admin.html missing TMS Staff Links section');
  if (!/tms-identity-links/.test(html)) return bad('admin.html missing tms-identity-links API calls');
  if (!/Link Accounts|Link Behavior Logger identity/.test(html) || !/Unlink/.test(html)) {
    return bad('admin.html missing Link/Unlink actions');
  }
  if (!/Make Primary/.test(html) || !/is_primary/.test(html)) {
    return bad('admin.html missing Primary designation UI');
  }
  if (!/data-canonical-superseded="staff"/.test(html)) {
    return bad('TMS Staff Links must be marked superseded by Staff');
  }
  if (!/Behavior Logger Link/.test(html) || !/staffNeedsAttention/.test(html)) {
    return bad('Staff must host Behavior Logger link + Needs Attention');
  }
  const cardStart = html.indexOf('id="tmsStaffLinksCard"');
  const cardEnd = html.indexOf('id="walletAdjustmentCard"');
  if (cardStart < 0 || cardEnd < 0 || cardEnd <= cardStart) return bad('could not isolate TMS Staff Links card markup');
  const card = html.slice(cardStart, cardEnd);
  if (/type="password"|password_hash|device.?token|Authorization/i.test(card)) {
    return bad('TMS Staff Links card must not expose secrets/password inputs', card.slice(0, 200));
  }
  if (!/confirm\(/.test(html) || !/Unlink Lantern account/.test(html)) {
    return bad('unlink confirmation missing');
  }
  if (/deleteAdminJson\(\s*'\/api\/admin\/tms-identity-links'\s*,\s*\{\s*tms_staff_id:/.test(html)) {
    return bad('Admin UI must not DELETE by tms_staff_id alone');
  }
  ok('admin UI present with Link/Unlink/Primary and no secrets surface');
}

function testMigration063Present() {
  const migPath = fileURLToPath(new URL('../migrations/063_tms_identity_links_one_tms_many_lantern.sql', import.meta.url));
  const sql = fs.readFileSync(migPath, 'utf8');
  if (!/tms_identity_links_v2/.test(sql) || !/is_primary/.test(sql)) {
    return bad('migration 063 missing v2 table / is_primary');
  }
  if (!/idx_tms_identity_links_one_primary/.test(sql) || !/WHERE is_primary = 1/.test(sql)) {
    return bad('migration 063 missing one-primary partial unique index');
  }
  if (!/idx_tms_identity_links_tms_staff_id/.test(sql)) {
    return bad('migration 063 missing non-unique tms_staff_id index');
  }
  ok('migration 063 schema present');
}

await testAdminCanLoadLinks();
await testNonAdminDenied();
await testCurrentMappingRenders();
await testAdminCanCreateValidMapping();
await testSecondLinkSameTmsAllowedAsSecondary();
await testDuplicateLanternAccountRejected();
await testStudentAccountRejected();
await testInactiveAccountRejected();
await testNameSimilarityDoesNotAutoLink();
await testSetPrimaryAtomic();
await testUnlinkByIdRemovesOneLinkOnly();
await testDeleteByTmsStaffIdAloneRefused();
await testPrimaryUnlinkRequiresReplacement();
await testUnmappedUserFailsSsoClosed();
await testPrimaryWinsReverseSso();
await testNoSecretsDisplayed();
testAdminUiPresentAndSafe();
testMigration063Present();

console.log('\ntms-identity-links-admin-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
