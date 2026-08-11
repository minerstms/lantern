/**
 * TMS Nuggets -> Lantern staff SSO exchange tests — Prompt #94.
 *
 * Exercises the REAL worker/index.js fetch(request, env) entry point (GET /api/auth/tms-exchange)
 * with a mocked D1 (env.DB) and a mocked server-to-server redemption call to Nuggets (global
 * fetch), so redeemTmsLanternHandoff / sanitizeTmsExchangeReturnTarget / signPilotJwt /
 * pilotSetCookieHeader / isTeacherLike all run their actual production code paths. Proves:
 *  - A valid mapped staff identity exchanges into a normal lantern_pilot session (indistinguishable
 *    from a password login).
 *  - Lantern role/access is loaded from Lantern's OWN account row, never trusted from Nuggets.
 *  - A Lantern student account, a disabled account, or an unmapped TMS identity all fail closed.
 *  - Invalid/expired/consumed codes fail closed.
 *  - Foreign/unsafe return URLs are rejected (no open redirect); valid Teacher deep links and the
 *    no-return default (Teacher -> Nuggets) are preserved.
 *
 * Usage: node worker/scripts/tms-sso-exchange-test.mjs
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

/**
 * identityLinks[tms_staff_id]:
 *   - string username (legacy single primary), OR
 *   - array of { lantern_username, is_primary }
 */
function normalizeLinks(entry) {
  if (entry == null) return [];
  if (typeof entry === 'string') return [{ lantern_username: entry, is_primary: 1 }];
  if (Array.isArray(entry)) return entry;
  return [];
}

function makeEnv(state) {
  state.accounts = state.accounts || {};
  state.identityLinks = state.identityLinks || {};

  function prepare(sql) {
    const s = String(sql).replace(/\s+/g, ' ');
    const binds = [];
    const api = {
      bind(...args) { binds.push(...args); return api; },
      async first() {
        if (s.includes('FROM tms_identity_links') && s.includes('is_primary = 1')) {
          const links = normalizeLinks(state.identityLinks[binds[0]]);
          const primary = links.find((l) => Number(l.is_primary) === 1);
          return primary ? { lantern_username: primary.lantern_username } : null;
        }
        if (s.includes('SELECT COUNT(*) AS n FROM tms_identity_links WHERE tms_staff_id')) {
          const links = normalizeLinks(state.identityLinks[binds[0]]);
          return { n: links.length };
        }
        if (s.includes('FROM tms_identity_links WHERE tms_staff_id')) {
          // Legacy pre-063 fallback path inside resolvePrimaryLanternUsernameForTmsStaff.
          const links = normalizeLinks(state.identityLinks[binds[0]]);
          return links[0] ? { lantern_username: links[0].lantern_username } : null;
        }
        if (s.includes('FROM lantern_pilot_accounts WHERE lower(trim(username))')) {
          const key = String(binds[0] || '').trim().toLowerCase();
          return state.accounts[key] || null;
        }
        return null;
      },
      async all() { return { results: [] }; },
      async run() { return { success: true, meta: { changes: 1 } }; },
    };
    return api;
  }
  return {
    DB: { prepare },
    PILOT_SESSION_SECRET: TEST_PILOT_SECRET,
    TMS_LANTERN_BRIDGE_SECRET: TEST_BRIDGE_SECRET,
  };
}

function account(overrides) {
  return {
    username: 'ms_carter',
    display_name: 'Ms. Carter',
    role: 'teacher',
    student_character_name: null,
    teacher_id: 't_carter',
    mtss_student_id: null,
    is_active: 1,
    must_change_password: 0,
    ...overrides,
  };
}

/** Installs a fake global.fetch that simulates Nuggets' POST /api/auth/lantern-handoff/redeem. */
function withMockedRedeem(behavior, fn) {
  const original = globalThis.fetch;
  let lastCall = null;
  globalThis.fetch = async (url, opts) => {
    lastCall = { url: String(url), opts };
    const result = behavior(lastCall);
    return {
      ok: result.httpOk !== false,
      json: async () => result.body,
    };
  };
  return fn(() => lastCall).finally(() => { globalThis.fetch = original; });
}

function b64urlDecodeToString(str) {
  const s = String(str || '').replace(/\s/g, '');
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(b64, 'base64').toString('utf8');
}

function decodeCookieJwt(setCookieHeader) {
  const m = /lantern_pilot=([^;]+)/.exec(setCookieHeader || '');
  if (!m) return null;
  const token = decodeURIComponent(m[1]);
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  return JSON.parse(b64urlDecodeToString(parts[1]));
}

async function exchange(env, query) {
  const qs = new URLSearchParams(query || {}).toString();
  return worker.fetch(new Request(`https://x.test/api/auth/tms-exchange${qs ? '?' + qs : ''}`, { method: 'GET' }), env);
}

// ---------------------------------------------------------------------------

async function testValidMappedStaffExchangesToNormalSession() {
  await withMockedRedeem(
    () => ({ body: { ok: true, tms_staff_id: 'Radle' } }),
    async () => {
      const teacher = account({ username: 'ms_carter', role: 'teacher' });
      const env = makeEnv({ accounts: { ms_carter: teacher }, identityLinks: { Radle: 'ms_carter' } });
      const res = await exchange(env, { code: 'abc123' });
      const setCookie = res.headers.get('Set-Cookie') || '';
      const payload = decodeCookieJwt(setCookie);
      if (res.status !== 302 || !setCookie.includes('lantern_pilot=') || !payload || payload.sub !== 'ms_carter' || payload.role !== 'teacher') {
        return bad('valid mapped staff exchanges into normal session', { status: res.status, setCookie, payload });
      }
      if (res.headers.get('Location') !== '/teacher') {
        return bad('valid exchange with no return defaults to /teacher', res.headers.get('Location'));
      }
      ok('valid mapped teacher identity -> 302 + lantern_pilot cookie with correct sub/role, default Location /teacher');
    }
  );
}

async function testRoleLoadedLocallyNotTrustedFromNuggets() {
  // Nuggets response never includes a role at all -- Lantern only ever reads tms_staff_id from it.
  // This proves the ONLY way role reaches the session is via the local lantern_pilot_accounts row.
  await withMockedRedeem(
    (call) => {
      const body = JSON.parse(call.opts.body);
      if ('role' in body || 'capabilities' in body) throw new Error('Lantern must never SEND role/capabilities to Nuggets');
      return { body: { ok: true, tms_staff_id: 'Radle' } };
    },
    async () => {
      const admin = account({ username: 'rick', role: 'admin', teacher_id: null });
      const env = makeEnv({ accounts: { rick: admin }, identityLinks: { Radle: 'rick' } });
      const res = await exchange(env, { code: 'abc123' });
      const payload = decodeCookieJwt(res.headers.get('Set-Cookie') || '');
      if (res.status !== 302 || !payload || payload.role !== 'admin') {
        return bad('role sourced from local Lantern account row', { status: res.status, payload });
      }
      ok('session role comes from lantern_pilot_accounts.role (local), never from the Nuggets redemption response');
    }
  );
}

async function testStudentAccountCannotBecomeTeacher() {
  await withMockedRedeem(
    () => ({ body: { ok: true, tms_staff_id: 'some_staff' } }),
    async () => {
      const student = account({ username: 'zane', role: 'student', teacher_id: null });
      const env = makeEnv({ accounts: { zane: student }, identityLinks: { some_staff: 'zane' } });
      const res = await exchange(env, { code: 'abc123' });
      if (res.status !== 401 || (res.headers.get('Set-Cookie') || '').includes('lantern_pilot=')) {
        return bad('student account must not receive a Teacher session', { status: res.status, setCookie: res.headers.get('Set-Cookie') });
      }
      ok('Lantern student account -> 401, no session cookie issued (cannot become Teacher via handoff)');
    }
  );
}

async function testDisabledAccountFails() {
  await withMockedRedeem(
    () => ({ body: { ok: true, tms_staff_id: 'some_staff' } }),
    async () => {
      const disabled = account({ username: 'ms_old', role: 'teacher', is_active: 0 });
      const env = makeEnv({ accounts: { ms_old: disabled }, identityLinks: { some_staff: 'ms_old' } });
      const res = await exchange(env, { code: 'abc123' });
      if (res.status !== 401 || (res.headers.get('Set-Cookie') || '').includes('lantern_pilot=')) {
        return bad('disabled Lantern account must fail closed', { status: res.status });
      }
      ok('disabled Lantern account -> 401, no session cookie issued');
    }
  );
}

async function testUnmappedIdentityFailsClosed() {
  await withMockedRedeem(
    () => ({ body: { ok: true, tms_staff_id: 'nobody_linked' } }),
    async () => {
      const env = makeEnv({ accounts: {}, identityLinks: {} });
      const res = await exchange(env, { code: 'abc123' });
      if (res.status !== 401 || (res.headers.get('Set-Cookie') || '').includes('lantern_pilot=')) {
        return bad('unmapped TMS staff identity must fail closed', { status: res.status });
      }
      ok('unmapped TMS staff identity -> 401 "Lantern account not linked" style failure, no auto-provisioning');
    }
  );
}

async function testInvalidExpiredConsumedCodeFails() {
  await withMockedRedeem(
    () => ({ body: { ok: false, error: 'invalid_or_expired_code' } }),
    async () => {
      const teacher = account({ username: 'ms_carter', role: 'teacher' });
      const env = makeEnv({ accounts: { ms_carter: teacher }, identityLinks: { Radle: 'ms_carter' } });
      const res = await exchange(env, { code: 'stale-or-reused' });
      if (res.status !== 401 || (res.headers.get('Set-Cookie') || '').includes('lantern_pilot=')) {
        return bad('invalid/expired/consumed code must fail closed', { status: res.status });
      }
      ok('Nuggets-reported invalid/expired/consumed code -> 401, no session cookie issued');
    }
  );
}

async function testMissingCodeFailsClosed() {
  const env = makeEnv({});
  const res = await exchange(env, {});
  if (res.status !== 401) return bad('missing code must fail closed', res.status);
  ok('missing ?code= -> 401 (no server-to-server call attempted)');
}

async function testForeignReturnUrlRejected() {
  await withMockedRedeem(
    () => ({ body: { ok: true, tms_staff_id: 'Radle' } }),
    async () => {
      const teacher = account({ username: 'ms_carter', role: 'teacher' });
      const env = makeEnv({ accounts: { ms_carter: teacher }, identityLinks: { Radle: 'ms_carter' } });
      const attempts = [
        'https://evil.example.com/steal',
        '//evil.example.com/steal',
        'javascript:alert(1)',
        '/../../etc/passwd',
        'teacher.html#not-a-real-workspace',
      ];
      for (const bad_return of attempts) {
        const res = await exchange(env, { code: 'abc123', return: bad_return });
        const loc = res.headers.get('Location');
        if (res.status !== 302 || loc !== '/teacher') {
          return bad('unsafe return value must fall back to /teacher default, not be honored', { bad_return, status: res.status, loc });
        }
      }
      ok('foreign/protocol-relative/javascript:/path-traversal/unknown-workspace return values all fall back to safe default /teacher (no open redirect)');
    }
  );
}

async function testValidDeepLinkReturnPreserved() {
  await withMockedRedeem(
    () => ({ body: { ok: true, tms_staff_id: 'Radle' } }),
    async () => {
      const teacher = account({ username: 'ms_carter', role: 'teacher' });
      const env = makeEnv({ accounts: { ms_carter: teacher }, identityLinks: { Radle: 'ms_carter' } });
      const res = await exchange(env, { code: 'abc123', return: 'teacher.html#overview' });
      if (res.status !== 302 || res.headers.get('Location') !== '/teacher#overview') {
        return bad('valid Teacher deep link must be preserved', { status: res.status, loc: res.headers.get('Location') });
      }
      ok('return=teacher.html#overview is preserved exactly as /teacher#overview');
    }
  );
}

/** Prompt #196 — Behavior Logger Teacher handoff return forms must survive sanitize → Location /teacher. */
async function testTeacherReturnFormsSurviveIncludingCanonicalAbsolute() {
  await withMockedRedeem(
    () => ({ body: { ok: true, tms_staff_id: 'Radle' } }),
    async () => {
      const teacher = account({ username: 'ms_carter', role: 'teacher' });
      const env = makeEnv({ accounts: { ms_carter: teacher }, identityLinks: { Radle: 'ms_carter' } });
      const good = [
        '/teacher',
        'teacher',
        'teacher.html',
        '/teacher.html',
        'https://tmslantern.org/teacher',
        'https://tmslantern.org/teacher.html',
        'https://tmslantern.org/teacher#economy',
      ];
      for (const ret of good) {
        const res = await exchange(env, { code: 'abc123', return: ret });
        const loc = res.headers.get('Location');
        const expect = ret.indexOf('#economy') !== -1 ? '/teacher#economy' : '/teacher';
        if (res.status !== 302 || loc !== expect) {
          return bad('Teacher return form must map to /teacher', { ret, status: res.status, loc, expect });
        }
      }
      const lockerish = ['/locker', '/locker.html', '/', 'https://tmslantern.org/', 'https://tmslantern.org/locker'];
      for (const ret of lockerish) {
        const res = await exchange(env, { code: 'abc123', return: ret });
        const loc = res.headers.get('Location');
        if (res.status !== 302 || loc !== '/teacher') {
          return bad('Locker/root return must NOT win over Teacher default', { ret, status: res.status, loc });
        }
      }
      ok('#196 Teacher return forms → /teacher; Locker/root returns do not override Teacher default');
    }
  );
}

async function testNoReturnDefaultsToNuggets() {
  await withMockedRedeem(
    () => ({ body: { ok: true, tms_staff_id: 'Radle' } }),
    async () => {
      const teacher = account({ username: 'ms_carter', role: 'teacher' });
      const env = makeEnv({ accounts: { ms_carter: teacher }, identityLinks: { Radle: 'ms_carter' } });
      const res = await exchange(env, { code: 'abc123' });
      // /teacher.html with no hash lands on the Prompt #91 default workspace (Nuggets) client-side.
      if (res.status !== 302 || res.headers.get('Location') !== '/teacher') {
        return bad('no-return must default to /teacher (Teacher -> Nuggets default)', res.headers.get('Location'));
      }
      ok('no return= param -> Location /teacher (client-side defaults to Nuggets per Prompt #91)');
    }
  );
}

async function testBridgeSecretSentAsBearer() {
  await withMockedRedeem(
    (call) => {
      const auth = call.opts.headers.Authorization || '';
      if (auth !== `Bearer ${TEST_BRIDGE_SECRET}`) throw new Error('bridge secret not sent as expected Bearer header: ' + auth);
      return { body: { ok: true, tms_staff_id: 'Radle' } };
    },
    async () => {
      const teacher = account({ username: 'ms_carter', role: 'teacher' });
      const env = makeEnv({ accounts: { ms_carter: teacher }, identityLinks: { Radle: 'ms_carter' } });
      const res = await exchange(env, { code: 'abc123' });
      if (res.status !== 302) return bad('bridge secret Bearer header wiring', res.status);
      ok('outbound redemption call sends TMS_LANTERN_BRIDGE_SECRET as Authorization: Bearer (mirrors Nuggets\' own outbound secret convention)');
    }
  );
}

async function testPrimaryChosenWhenMultipleLinks() {
  await withMockedRedeem(
    () => ({ body: { ok: true, tms_staff_id: 'Radle' } }),
    async () => {
      const teacher = account({ username: 'rick.radle', role: 'teacher', teacher_id: 't_rick' });
      const admin = account({ username: 'Rick Radle', role: 'admin', teacher_id: null });
      const env = makeEnv({
        accounts: { 'rick.radle': teacher, 'rick radle': admin },
        identityLinks: {
          Radle: [
            { lantern_username: 'Rick Radle', is_primary: 0 },
            { lantern_username: 'rick.radle', is_primary: 1 },
          ],
        },
      });
      const res = await exchange(env, { code: 'abc123' });
      const payload = decodeCookieJwt(res.headers.get('Set-Cookie') || '');
      if (res.status !== 302 || !payload || payload.sub !== 'rick.radle' || payload.role !== 'teacher') {
        return bad('when two links exist, exchange must use is_primary=1 only', { status: res.status, payload });
      }
      ok('ONE TMS → TWO Lantern: reverse SSO lands on explicit primary (rick.radle)');
    }
  );
}

async function testNoPrimaryFailsClosed() {
  await withMockedRedeem(
    () => ({ body: { ok: true, tms_staff_id: 'Radle' } }),
    async () => {
      const teacher = account({ username: 'rick.radle', role: 'teacher' });
      const admin = account({ username: 'Rick Radle', role: 'admin' });
      const env = makeEnv({
        accounts: { 'rick.radle': teacher, 'rick radle': admin },
        identityLinks: {
          Radle: [
            { lantern_username: 'Rick Radle', is_primary: 0 },
            { lantern_username: 'rick.radle', is_primary: 0 },
          ],
        },
      });
      const res = await exchange(env, { code: 'abc123' });
      const setCookie = res.headers.get('Set-Cookie') || '';
      if (res.status === 302 || /lantern_pilot=/.test(setCookie)) {
        return bad('links without primary must fail closed (no arbitrary pick)', { status: res.status, setCookie });
      }
      const text = await res.text();
      if (!/Account setup needed/i.test(text) && res.status !== 401) {
        return bad('no-primary failure should be clear', { status: res.status, text: text.slice(0, 300) });
      }
      ok('linked-but-no-primary fails closed (no .first() fallback)');
    }
  );
}

// ---------------------------------------------------------------------------
// Prompt #203 — silent bootstrap (JSON + Set-Cookie; Behavior Logger origin only)
// ---------------------------------------------------------------------------

async function bootstrap(env, body, origin) {
  return worker.fetch(
    new Request('https://x.test/api/auth/tms-bootstrap', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin || 'https://log.tmslantern.org',
      },
      body: JSON.stringify(body || {}),
    }),
    env
  );
}

async function testSilentBootstrapSuccess() {
  await withMockedRedeem(
    () => ({ body: { ok: true, tms_staff_id: 'Radle' } }),
    async () => {
      const teacher = account({ username: 'ms_carter', role: 'teacher' });
      const env = makeEnv({ accounts: { ms_carter: teacher }, identityLinks: { Radle: 'ms_carter' } });
      const res = await bootstrap(env, { code: 'abc123' }, 'https://log.tmslantern.org');
      const setCookie = res.headers.get('Set-Cookie') || '';
      const payload = decodeCookieJwt(setCookie);
      const json = await res.json();
      const acao = res.headers.get('Access-Control-Allow-Origin') || '';
      const acac = res.headers.get('Access-Control-Allow-Credentials') || '';
      if (
        res.status !== 200 ||
        !json.ok ||
        json.username !== 'ms_carter' ||
        !payload ||
        payload.sub !== 'ms_carter' ||
        acao !== 'https://log.tmslantern.org' ||
        String(acac).toLowerCase() !== 'true'
      ) {
        return bad('silent bootstrap success', { status: res.status, json, setCookie, payload, acao, acac });
      }
      ok('#203 silent bootstrap: BL origin → 200 JSON + lantern_pilot cookie + credentialed CORS');
    }
  );
}

async function testSilentBootstrapRejectsForeignOrigin() {
  await withMockedRedeem(
    () => ({ body: { ok: true, tms_staff_id: 'Radle' } }),
    async () => {
      const teacher = account({ username: 'ms_carter', role: 'teacher' });
      const env = makeEnv({ accounts: { ms_carter: teacher }, identityLinks: { Radle: 'ms_carter' } });
      const res = await bootstrap(env, { code: 'abc123' }, 'https://evil.example.com');
      const setCookie = res.headers.get('Set-Cookie') || '';
      if (res.status !== 403 || /lantern_pilot=/.test(setCookie)) {
        return bad('foreign origin must not bootstrap a session', { status: res.status, setCookie });
      }
      ok('#203 silent bootstrap rejects non-Behavior-Logger Origin (no cookie)');
    }
  );
}

async function testSilentBootstrapReplayFails() {
  await withMockedRedeem(
    () => ({ body: { ok: false, error: 'invalid_or_expired_code' } }),
    async () => {
      const teacher = account({ username: 'ms_carter', role: 'teacher' });
      const env = makeEnv({ accounts: { ms_carter: teacher }, identityLinks: { Radle: 'ms_carter' } });
      const res = await bootstrap(env, { code: 'already-used' }, 'https://log.tmslantern.org');
      const setCookie = res.headers.get('Set-Cookie') || '';
      if (res.status === 200 || /lantern_pilot=/.test(setCookie)) {
        return bad('replayed/invalid bootstrap code must fail', { status: res.status, setCookie });
      }
      ok('#203 silent bootstrap replay/invalid code fails closed');
    }
  );
}

async function testSilentBootstrapStudentDenied() {
  await withMockedRedeem(
    () => ({ body: { ok: true, tms_staff_id: 'some_staff' } }),
    async () => {
      const student = account({ username: 'zane', role: 'student', teacher_id: null });
      const env = makeEnv({ accounts: { zane: student }, identityLinks: { some_staff: 'zane' } });
      const res = await bootstrap(env, { code: 'abc123' }, 'https://log.tmslantern.org');
      const setCookie = res.headers.get('Set-Cookie') || '';
      if (res.status === 200 || /lantern_pilot=/.test(setCookie)) {
        return bad('student must not receive staff session via bootstrap', { status: res.status, setCookie });
      }
      ok('#203 silent bootstrap denies student-linked identity (no cookie)');
    }
  );
}

async function testSilentBootstrapStaticSource() {
  const workerIndexPath = fileURLToPath(new URL('../index.js', import.meta.url));
  const src = fs.readFileSync(workerIndexPath, 'utf8');
  if (!/\/api\/auth\/tms-bootstrap/.test(src) || !/issueLanternSessionFromTmsHandoff/.test(src)) {
    return bad('worker missing tms-bootstrap / shared issueLanternSessionFromTmsHandoff');
  }
  if (!/isBehaviorLoggerOrigin/.test(src)) {
    return bad('worker missing isBehaviorLoggerOrigin allowlist');
  }
  if (/Domain=\.tmslantern\.org/.test(src) || /Domain=\*\.tmslantern/.test(src)) {
    return bad('must not broaden cookie Domain to parent wildcard');
  }
  ok('#203 worker has tms-bootstrap + BL origin check; no wildcard parent-domain cookie');
}

// ---------------------------------------------------------------------------
// Regression: static-source presence checks for adjacent locked behavior.
// ---------------------------------------------------------------------------
function testStaticSourceInspection() {
  const workerIndexPath = fileURLToPath(new URL('../index.js', import.meta.url));
  const src = fs.readFileSync(workerIndexPath, 'utf8');
  if (/tms_staff_id/.test(src) && /tms_identity_links/.test(src)) {
    ok('worker/index.js references tms_identity_links + tms_staff_id (identity link mechanism present)');
  } else bad('worker/index.js missing expected TMS identity link plumbing');
  if (/resolvePrimaryLanternUsernameForTmsStaff/.test(src)) {
    ok('tms-exchange uses resolvePrimaryLanternUsernameForTmsStaff (not .first())');
  } else bad('tms-exchange missing primary resolver');
  if (/isTeacherLike\(row\.role\)/.test(src)) {
    ok('tms-exchange route re-derives role via isTeacherLike(row.role) from the LOCAL account row');
  } else bad('tms-exchange route missing local isTeacherLike(row.role) check');
  const fnStart = src.indexOf('async function redeemTmsLanternHandoff');
  const fnEndMatch = fnStart === -1 ? null : /\r?\n\}\r?\n/.exec(src.slice(fnStart));
  const fnBody = fnStart === -1 || !fnEndMatch ? '' : src.slice(fnStart, fnStart + fnEndMatch.index);
  if (fnBody && !/data\.role|data\.capabilit/.test(fnBody)) {
    ok('redeemTmsLanternHandoff does not read a role/capabilities field from the Nuggets response');
  } else bad('redeemTmsLanternHandoff unexpectedly reads a role/capabilities field from Nuggets', fnBody);
}

await testValidMappedStaffExchangesToNormalSession();
await testRoleLoadedLocallyNotTrustedFromNuggets();
await testStudentAccountCannotBecomeTeacher();
await testDisabledAccountFails();
await testUnmappedIdentityFailsClosed();
await testInvalidExpiredConsumedCodeFails();
await testMissingCodeFailsClosed();
await testForeignReturnUrlRejected();
await testValidDeepLinkReturnPreserved();
await testTeacherReturnFormsSurviveIncludingCanonicalAbsolute();
await testNoReturnDefaultsToNuggets();
await testBridgeSecretSentAsBearer();
await testPrimaryChosenWhenMultipleLinks();
await testNoPrimaryFailsClosed();
await testSilentBootstrapSuccess();
await testSilentBootstrapRejectsForeignOrigin();
await testSilentBootstrapReplayFails();
await testSilentBootstrapStudentDenied();
testSilentBootstrapStaticSource();
testStaticSourceInspection();

console.log('\ntms-sso-exchange-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
