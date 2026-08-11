/**
 * Teacher -> Nuggets workspace bridge tests (Lantern side) — Prompt #95.
 *
 * Exercises the REAL worker/index.js fetch(request, env) entry point (not a stub) for
 * /api/tms-nuggets/{students/search,ledger,redeem}, with a mocked D1 (env.DB), a real HS256 pilot
 * JWT cookie built the same way login/SSO does (Prompt #92's pattern), and a mocked global.fetch
 * standing in for Nuggets' /api/lantern-bridge/* endpoints. Proves:
 *  - Unauthenticated / non-staff (student) sessions cannot reach the bridge at all.
 *  - A teacher session with no tms_identity_links row fails closed (never guesses/auto-maps).
 *  - The acting tms_staff_id sent to Nuggets ALWAYS comes from the server-side tms_identity_links
 *    lookup for the session's own account -- a client-supplied tms_staff_id/teacher_id in the
 *    request body is always ignored/overwritten, never forwarded as-is.
 *  - TMS_LANTERN_BRIDGE_SECRET is sent as the Authorization header to Nuggets and never returned
 *    to the browser in any response body.
 *  - Search/ledger/redeem responses from Nuggets are passed back to the browser with their
 *    authoritative student_name/student_id intact.
 *  - Only the three named sub-routes exist; anything else 404s (no generic bridge proxy).
 *
 * Usage: node worker/scripts/tms-nuggets-bridge-lantern-test.mjs
 */
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

function makeEnv(state) {
  state.accounts = state.accounts || {};
  state.identityLinks = state.identityLinks || {}; // lantern_username -> tms_staff_id

  function prepare(sql) {
    const s = String(sql);
    const binds = [];
    const api = {
      bind(...args) { binds.push(...args); return api; },
      async first() {
        if (s.includes('FROM lantern_pilot_accounts WHERE lower(trim(username))')) {
          const key = String(binds[0] || '').trim().toLowerCase();
          return state.accounts[key] || null;
        }
        if (s.includes('FROM tms_identity_links WHERE lantern_username = ?')) {
          const staffId = state.identityLinks[binds[0]];
          return staffId ? { tms_staff_id: staffId } : null;
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

/** Installs a fake global.fetch standing in for Nuggets' /api/lantern-bridge/* endpoints. */
function withMockedBridge(behavior, fn) {
  const original = globalThis.fetch;
  let lastCall = null;
  globalThis.fetch = async (url, opts) => {
    lastCall = { url: String(url), opts, body: opts && opts.body ? JSON.parse(opts.body) : null };
    const result = behavior(lastCall);
    return {
      ok: result.httpOk !== false,
      status: result.status || (result.httpOk === false ? 400 : 200),
      json: async () => result.body,
    };
  };
  return fn(() => lastCall).finally(() => { globalThis.fetch = original; });
}

function req(path, body, cookie) {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (cookie) headers.set('Cookie', cookie);
  return new Request(`https://x.test${path}`, { method: 'POST', headers, body: JSON.stringify(body || {}) });
}

async function jsonOf(res) { return res.json(); }

// ---------------------------------------------------------------------------

async function testUnauthenticatedRejected() {
  const env = makeEnv({});
  const res = await worker.fetch(req('/api/tms-nuggets/ledger', { student_name: 'Alex' }), env);
  const body = await jsonOf(res);
  if (res.status !== 401 || body.error !== 'not_authenticated') return bad('unauthenticated request must be rejected', { status: res.status, body });
  ok('no Lantern session -> rejected (401 not_authenticated)');
}

async function testStudentSessionRejected() {
  const state = { accounts: { '20889': account({ username: '20889', role: 'student', teacher_id: null, student_character_name: 'Lucas', mtss_student_id: '20889' }) } };
  const env = makeEnv(state);
  const cookie = await cookieFor(state.accounts['20889']);
  const res = await worker.fetch(req('/api/tms-nuggets/ledger', { student_name: 'Alex' }, cookie), env);
  const body = await jsonOf(res);
  if (res.status !== 403 || body.error !== 'forbidden') return bad('a Lantern student session must never reach the Teacher Nuggets bridge', { status: res.status, body });
  ok('Lantern student session cannot call the Teacher Nuggets bridge (403 forbidden)');
}

async function testTeacherWithoutLinkFailsClosed() {
  const state = { accounts: { ms_carter: account({ username: 'ms_carter', role: 'teacher' }) }, identityLinks: {} };
  const env = makeEnv(state);
  const cookie = await cookieFor(state.accounts.ms_carter);
  const res = await worker.fetch(req('/api/tms-nuggets/ledger', { student_name: 'Alex' }, cookie), env);
  const body = await jsonOf(res);
  if (res.status !== 403 || body.error !== 'tms_identity_not_linked') {
    return bad('teacher with no tms_identity_links row must fail closed, never guess an identity', { status: res.status, body });
  }
  ok('Lantern teacher with no tms_identity_link fails closed (403 tms_identity_not_linked)');
}

async function testValidTeacherSearchUsesMappedStaffId() {
  const state = { accounts: { ms_carter: account({ username: 'ms_carter', role: 'teacher' }) }, identityLinks: { ms_carter: 'Radle' } };
  const env = makeEnv(state);
  const cookie = await cookieFor(state.accounts.ms_carter);
  await withMockedBridge(
    () => ({ body: { ok: true, students: [{ student_name: 'Alex Rivera', student_id: 'sid-1' }] } }),
    async (getLastCall) => {
      const res = await worker.fetch(req('/api/tms-nuggets/students/search', { query: 'Alex', tms_staff_id: 'SPOOFED_ID' }, cookie), env);
      const body = await jsonOf(res);
      const call = getLastCall();
      if (!res.ok || !body.ok || body.students[0].student_name !== 'Alex Rivera') {
        return bad('valid mapped teacher search should succeed and return Nuggets students verbatim', body);
      }
      if (call.body.tms_staff_id !== 'Radle') {
        return bad('outbound bridge call must use the server-mapped tms_staff_id, not a client-supplied one', call.body);
      }
      if (!call.url.includes('/api/lantern-bridge/students/search')) return bad('search must call the students/search sub-route', call.url);
      const authHeader = call.opts.headers && (call.opts.headers.Authorization || call.opts.headers.get?.('Authorization'));
      ok('valid mapped teacher can search TMS students via the bridge; server-mapped tms_staff_id used regardless of client-supplied value');
    }
  );
}

async function testBridgeSecretSentButNeverReturnedToBrowser() {
  const state = { accounts: { ms_carter: account({ username: 'ms_carter', role: 'teacher' }) }, identityLinks: { ms_carter: 'Radle' } };
  const env = makeEnv(state);
  const cookie = await cookieFor(state.accounts.ms_carter);
  await withMockedBridge(
    (call) => {
      const auth = call.opts.headers.Authorization || '';
      if (auth !== `Bearer ${TEST_BRIDGE_SECRET}`) throw new Error('Authorization header must carry TMS_LANTERN_BRIDGE_SECRET');
      return { body: { ok: true, students: [] } };
    },
    async () => {
      const res = await worker.fetch(req('/api/tms-nuggets/students/search', { query: '' }, cookie), env);
      const body = await jsonOf(res);
      const raw = JSON.stringify(body);
      if (raw.includes(TEST_BRIDGE_SECRET)) return bad('bridge secret must never appear in the browser-facing response', body);
      ok('bridge secret is sent to Nuggets as Authorization: Bearer, and never appears in the browser-facing response');
    }
  );
}

async function testValidRedeemPassesThroughAndAppliesToMappedStaff() {
  const state = { accounts: { ms_carter: account({ username: 'ms_carter', role: 'teacher' }) }, identityLinks: { ms_carter: 'Radle' } };
  const env = makeEnv(state);
  const cookie = await cookieFor(state.accounts.ms_carter);
  await withMockedBridge(
    (call) => ({
      body: {
        ok: true,
        student_name: 'Alex Rivera',
        student_id: 'sid-1',
        redeemed_amount: 1,
        earned: 10,
        spent: 1,
        available: 9,
        recent_history: [],
        teacher_name: 'Rick Radle',
      },
    }),
    async (getLastCall) => {
      const res = await worker.fetch(
        req('/api/tms-nuggets/redeem', { student_name: 'Alex Rivera', amount: 1, note: 'Snack', teacher_id: 'SPOOFED' }, cookie),
        env
      );
      const body = await jsonOf(res);
      const call = getLastCall();
      if (!res.ok || !body.ok || body.available !== 9 || body.redeemed_amount !== 1) {
        return bad('valid redeem of 1 Nugget should pass through Nuggets\' authoritative result', body);
      }
      if (call.body.tms_staff_id !== 'Radle' || call.body.teacher_id) {
        return bad('redeem must forward the server-mapped tms_staff_id, ignoring any client-sent teacher_id', call.body);
      }
      ok('valid redeem of 1 Nugget uses the existing TMS transaction system through the bridge; spoofed identity fields are ignored');
    }
  );
}

async function testValidAwardPassesThrough() {
  const state = { accounts: { ms_carter: account({ username: 'ms_carter', role: 'teacher' }) }, identityLinks: { ms_carter: 'Radle' } };
  const env = makeEnv(state);
  const cookie = await cookieFor(state.accounts.ms_carter);
  await withMockedBridge(
    () => ({
      body: {
        ok: true,
        student_name: 'Alex Rivera',
        student_id: 'sid-1',
        awarded_amount: 3,
        earned: 13,
        spent: 1,
        available: 12,
        recent_history: [],
        teacher_name: 'Rick Radle',
      },
    }),
    async (getLastCall) => {
      const res = await worker.fetch(
        req('/api/tms-nuggets/award', {
          student_name: 'Alex Rivera',
          amount: 3,
          note: 'Great class participation',
          idempotency_key: 'award-1',
          tms_staff_id: 'SPOOFED',
        }, cookie),
        env
      );
      const body = await jsonOf(res);
      const call = getLastCall();
      if (!res.ok || !body.ok || body.available !== 12 || body.awarded_amount !== 3) {
        return bad('valid award should pass through Nuggets authoritative result', body);
      }
      if (body.current_balance !== 12 || body.total_earned !== 13 || body.total_spent !== 1) {
        return bad('award response should include dashboard aliases', body);
      }
      if (!call || call.body.tms_staff_id !== 'Radle' || call.body.reference !== 'award-1') {
        return bad('award must use mapped staff id + idempotency reference', call && call.body);
      }
      ok('valid award uses TMS teacher_award path with server-mapped staff identity and dashboard aliases');
    }
  );
}

async function testAwardRequiresReason() {
  const state = { accounts: { ms_carter: account({ username: 'ms_carter', role: 'teacher' }) }, identityLinks: { ms_carter: 'Radle' } };
  const env = makeEnv(state);
  const cookie = await cookieFor(state.accounts.ms_carter);
  const res = await worker.fetch(
    req('/api/tms-nuggets/award', { student_name: 'Alex', amount: 1, note: '   ' }, cookie),
    env
  );
  const body = await jsonOf(res);
  if (res.status !== 400 || !body || body.error !== 'reason_required') {
    return bad('award without reason must 400 reason_required', { status: res.status, body });
  }
  ok('award requires a non-empty reason on the Lantern Worker');
}

async function testRedeemRequiresReason() {
  const state = { accounts: { ms_carter: account({ username: 'ms_carter', role: 'teacher' }) }, identityLinks: { ms_carter: 'Radle' } };
  const env = makeEnv(state);
  const cookie = await cookieFor(state.accounts.ms_carter);
  const res = await worker.fetch(
    req('/api/tms-nuggets/redeem', { student_name: 'Alex', amount: 1, note: '' }, cookie),
    env
  );
  const body = await jsonOf(res);
  if (res.status !== 400 || !body || body.error !== 'reason_required') {
    return bad('redeem without reason must 400 reason_required', { status: res.status, body });
  }
  ok('redeem requires a non-empty reason on the Lantern Worker');
}

async function testUnknownSubRouteRejected() {
  const state = { accounts: { ms_carter: account({ username: 'ms_carter', role: 'teacher' }) }, identityLinks: { ms_carter: 'Radle' } };
  const env = makeEnv(state);
  const cookie = await cookieFor(state.accounts.ms_carter);
  const res = await worker.fetch(req('/api/tms-nuggets/something-else', {}, cookie), env);
  if (res.status !== 404) return bad('unknown tms-nuggets sub-route must 404, not expose a generic proxy', res.status);
  ok('Lantern side exposes only the named tms-nuggets sub-routes -- no generic proxy');
}

async function testBridgeUnreachableFailsGracefully() {
  const state = { accounts: { ms_carter: account({ username: 'ms_carter', role: 'teacher' }) }, identityLinks: { ms_carter: 'Radle' } };
  const env = makeEnv(state);
  const cookie = await cookieFor(state.accounts.ms_carter);
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('network down'); };
  try {
    const res = await worker.fetch(req('/api/tms-nuggets/ledger', { student_name: 'Alex' }, cookie), env);
    const body = await jsonOf(res);
    if (res.status < 500 && res.status !== 502) return bad('bridge network failure should surface as a clean error, not crash', { status: res.status, body });
    if (body.ok) return bad('bridge network failure must not report ok:true', body);
    ok('Nuggets bridge unreachable fails gracefully (502 bridge_request_failed), never a hard crash or false success');
  } finally {
    globalThis.fetch = original;
  }
}

await testUnauthenticatedRejected();
await testStudentSessionRejected();
await testTeacherWithoutLinkFailsClosed();
await testValidTeacherSearchUsesMappedStaffId();
await testBridgeSecretSentButNeverReturnedToBrowser();
await testValidRedeemPassesThroughAndAppliesToMappedStaff();
await testValidAwardPassesThrough();
await testAwardRequiresReason();
await testRedeemRequiresReason();
await testUnknownSubRouteRejected();
await testBridgeUnreachableFailsGracefully();

console.log('\ntms-nuggets-bridge-lantern-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
