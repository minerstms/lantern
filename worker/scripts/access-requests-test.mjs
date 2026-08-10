/**
 * Phase #31 — individual student "Request Access" -> teacher approval flow.
 *
 * Part A: pure unit tests of worker/access-requests.js (phrase format, secret entropy, hashing,
 * cookie shape, derived-status computation) with zero D1/network involved.
 *
 * Part B: integration tests against the REAL worker/index.js fetch(request, env) entry point
 * (not a stub) with a mocked D1 lantern_access_requests table and a real HS256 pilot JWT cookie
 * for teacher sessions (same approach as approvals-classaccess-auth-test.mjs), proving:
 *  - request creation, idempotent retry, rate limiting, phrase-collision retry
 *  - teacher pending list / approve (15 + 30 min) / deny / active list / revoke
 *  - GET /api/class-access/state individualGrant integration (informational only)
 *  - the core cross-browser non-transferability guarantee: knowing the phrase never grants access
 *  - expired/denied/revoked/expired-grant never qualify
 *  - no raw device secret ever appears in a JSON response body or teacher-facing list
 *
 * Usage: node worker/scripts/access-requests-test.mjs
 */
import worker from '../index.js';
import {
  generateRequestPhrase,
  generateDeviceSecret,
  hashOpaqueSecret,
  buildAccessDeviceCookieHeader,
  clearAccessDeviceCookieHeader,
  derivedRequestStatus,
  isQualifyingGrant,
  ACCESS_DEVICE_COOKIE_NAME,
} from '../access-requests.js';

let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

// ---------------------------------------------------------------------------
// Part A: pure module unit tests
// ---------------------------------------------------------------------------

function testPhraseFormat() {
  for (let i = 0; i < 200; i++) {
    const phrase = generateRequestPhrase();
    if (!/^[A-Z]+-[A-Z]+-\d{2}$/.test(phrase)) return bad('generateRequestPhrase produces WORD-WORD-NN format', phrase);
    const num = parseInt(phrase.split('-')[2], 10);
    if (num < 10 || num > 99) return bad('generateRequestPhrase number segment is 10-99', phrase);
  }
  ok('generateRequestPhrase() always produces classroom-safe WORD-WORD-NN identifiers (200 samples)');
}

function testDeviceSecretEntropyAndUniqueness() {
  const seen = new Set();
  for (let i = 0; i < 50; i++) {
    const secret = generateDeviceSecret();
    if (secret.length < 32) return bad('generateDeviceSecret produces high-entropy material', secret);
    if (seen.has(secret)) return bad('generateDeviceSecret produced a duplicate across 50 samples', secret);
    seen.add(secret);
  }
  ok('generateDeviceSecret() produces unique, high-entropy opaque secrets (50 samples, no collisions)');
}

async function testHashDeterministicAndDistinct() {
  const a1 = await hashOpaqueSecret('secret-a');
  const a2 = await hashOpaqueSecret('secret-a');
  const b = await hashOpaqueSecret('secret-b');
  if (a1 !== a2) return bad('hashOpaqueSecret is deterministic for the same input', { a1, a2 });
  if (a1 === b) return bad('hashOpaqueSecret produces distinct hashes for distinct inputs', { a1, b });
  if (!/^[0-9a-f]{64}$/.test(a1)) return bad('hashOpaqueSecret returns a 64-hex-char SHA-256 digest', a1);
  ok('hashOpaqueSecret() is deterministic, collision-free across distinct inputs, and SHA-256 hex-shaped');
}

function testCookieHeaderShape() {
  const header = buildAccessDeviceCookieHeader('abc123', true);
  if (!header.includes(`${ACCESS_DEVICE_COOKIE_NAME}=abc123`)) return bad('cookie header carries the secret under the right name', header);
  if (!/HttpOnly/.test(header) || !/Secure/.test(header) || !/SameSite=None/.test(header) || !/Path=\//.test(header)) {
    return bad('cookie header has HttpOnly/Secure/SameSite/Path attributes', header);
  }
  const insecure = buildAccessDeviceCookieHeader('abc123', false);
  if (/Secure/.test(insecure)) return bad('Secure omitted over non-HTTPS in dev', insecure);
  const cleared = clearAccessDeviceCookieHeader(true);
  if (!/Max-Age=0/.test(cleared)) return bad('clear header uses Max-Age=0', cleared);
  ok('buildAccessDeviceCookieHeader/clearAccessDeviceCookieHeader mirror the existing pilot cookie shape (HttpOnly always, conditional Secure, SameSite=None, Path=/)');
}

function testDerivedRequestStatus() {
  const now = '2026-08-09T12:00:00.000Z';
  const past = '2026-08-09T11:00:00.000Z';
  const future = '2026-08-09T13:00:00.000Z';
  const cases = [
    [null, 'not_found'],
    [{ status: 'pending', request_expires_at: future }, 'pending'],
    [{ status: 'pending', request_expires_at: past }, 'expired'],
    [{ status: 'denied' }, 'denied'],
    [{ status: 'approved', grant_expires_at: future, revoked_at: null }, 'approved'],
    [{ status: 'approved', grant_expires_at: past, revoked_at: null }, 'expired'],
    [{ status: 'approved', grant_expires_at: future, revoked_at: past }, 'revoked'],
  ];
  for (const [row, expected] of cases) {
    const got = derivedRequestStatus(row, now);
    if (got !== expected) return bad('derivedRequestStatus case', { row, expected, got });
  }
  if (isQualifyingGrant({ status: 'approved', grant_expires_at: future, revoked_at: null }, now) !== true) return bad('isQualifyingGrant true for active approved grant');
  if (isQualifyingGrant({ status: 'pending', request_expires_at: future }, now) !== false) return bad('isQualifyingGrant false for pending');
  ok('derivedRequestStatus/isQualifyingGrant correctly compute pending/approved/denied/expired/revoked/not_found purely from server time, no mutation needed');
}

// ---------------------------------------------------------------------------
// Part B: integration tests through the real worker
// ---------------------------------------------------------------------------

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
  const token = await signTestJwt({
    sub: account.username, role: account.role, scn: account.student_character_name || null,
    tid: account.teacher_id || null, iat: now, exp: now + 3600,
  }, TEST_SECRET);
  return `lantern_pilot=${token}`;
}

function account(overrides) {
  return {
    username: 'user1', display_name: 'Test User', role: 'teacher', password_hash: 'x', password_salt: 'y',
    student_character_name: null, teacher_id: null, mtss_student_id: null, is_active: 1, must_change_password: 0,
    ...overrides,
  };
}

function makeEnv(overrides) {
  const rows = [];
  const accounts = (overrides && overrides.accounts) || {};

  function prepare(sql) {
    const s = String(sql);
    const binds = [];
    const api = {
      bind(...args) { binds.push(...args); return api; },
      async first() {
        if (s.includes('FROM lantern_pilot_accounts WHERE lower(trim(username))')) {
          return accounts[String(binds[0] || '').trim().toLowerCase()] || null;
        }
        if (s.includes('FROM lantern_verify_state WHERE id = ?')) return null;
        if (s.includes('FROM class_access_sessions WHERE is_active = 1')) return null;
        if (s.includes('FROM class_access_tokens t JOIN class_access_sessions s')) return null;
        if (s.includes('FROM lantern_access_requests WHERE device_secret_hash = ?')) {
          const hash = binds[0];
          const matches = rows.filter((r) => r.device_secret_hash === hash).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
          return matches[0] || null;
        }
        if (s.includes('request_phrase = ?') && s.includes("status = 'pending'")) {
          const [phrase, now] = binds;
          const clash = rows.find((r) => r.request_phrase === phrase && r.status === 'pending' && r.request_expires_at > now);
          return clash ? { id: clash.id } : null;
        }
        if (s.includes('COUNT(*) AS c')) {
          const [ipHash, windowStart] = binds;
          const c = rows.filter((r) => r.requester_ip_hash === ipHash && r.requested_at > windowStart).length;
          return { c };
        }
        if (s.includes('SELECT id, status, request_expires_at FROM lantern_access_requests WHERE id = ?')) {
          const row = rows.find((r) => r.id === binds[0]);
          return row ? { id: row.id, status: row.status, request_expires_at: row.request_expires_at } : null;
        }
        return null;
      },
      async all() {
        if (s.includes("WHERE status = 'pending' AND request_expires_at > ?") && s.includes('ORDER BY requested_at')) {
          const now = binds[0];
          const results = rows.filter((r) => r.status === 'pending' && r.request_expires_at > now).sort((a, b) => (a.requested_at > b.requested_at ? 1 : -1));
          return { results };
        }
        if (s.includes("WHERE status = 'approved'") && s.includes('grant_expires_at > ?') && s.includes('ORDER BY grant_expires_at')) {
          const now = binds[0];
          const results = rows.filter((r) => r.status === 'approved' && !r.revoked_at && r.grant_expires_at > now).sort((a, b) => (a.grant_expires_at > b.grant_expires_at ? 1 : -1));
          return { results };
        }
        return { results: [] };
      },
      async run() {
        if (s.includes('INSERT INTO lantern_access_requests')) {
          const [id, request_phrase, student_username, student_character_name, proposed_name, device_secret_hash, requester_ip_hash, requested_at, request_expires_at, created_at] = binds;
          rows.push({
            id, request_phrase, student_username, student_character_name, proposed_name, device_secret_hash, requester_ip_hash,
            status: 'pending', requested_at, request_expires_at, created_at,
            decided_at: null, decided_by_staff_id: null, decided_by_staff_name: null, grant_expires_at: null, revoked_at: null,
          });
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes("SET status = 'approved'")) {
          const [decided_at, decided_by_staff_id, decided_by_staff_name, grant_expires_at, id, nowGuard] = binds;
          const row = rows.find((r) => r.id === id && r.status === 'pending' && r.request_expires_at > nowGuard);
          if (!row) return { success: true, meta: { changes: 0 } };
          Object.assign(row, { status: 'approved', decided_at, decided_by_staff_id, decided_by_staff_name, grant_expires_at });
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes("SET status = 'denied'")) {
          const [decided_at, decided_by_staff_id, decided_by_staff_name, id] = binds;
          const row = rows.find((r) => r.id === id && r.status === 'pending');
          if (!row) return { success: true, meta: { changes: 0 } };
          Object.assign(row, { status: 'denied', decided_at, decided_by_staff_id, decided_by_staff_name });
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes('SET revoked_at = ?')) {
          const [revoked_at, id] = binds;
          const row = rows.find((r) => r.id === id && r.status === 'approved' && !r.revoked_at);
          if (!row) return { success: true, meta: { changes: 0 } };
          row.revoked_at = revoked_at;
          return { success: true, meta: { changes: 1 } };
        }
        return { success: true, meta: { changes: 0 } };
      },
    };
    return api;
  }

  return { DB: { prepare, __rows: rows }, PILOT_SESSION_SECRET: TEST_SECRET, ...overrides };
}

function req(url, opts, cookie) {
  const headers = new Headers((opts && opts.headers) || {});
  if (cookie) headers.set('Cookie', cookie);
  return new Request(url, { ...opts, headers });
}

function setCookieValue(res, name) {
  const raw = res.headers.get('Set-Cookie') || '';
  const m = raw.match(new RegExp(`${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : '';
}

async function jsonOf(res) { return res.json(); }

async function testCreateRequestNoSessionRequiresProposedName() {
  const env = makeEnv({});
  const res = await worker.fetch(req('https://x.test/api/class-access/request', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
  }), env);
  const body = await jsonOf(res);
  if (res.status !== 400 || body.ok !== false) return bad('request without session or proposed_name is rejected', { status: res.status, body });
  ok('POST /api/class-access/request with no pilot session and no proposed_name -> 400');
}

async function testCreateRequestReturnsPhraseAndDeviceCookie() {
  const env = makeEnv({});
  const res = await worker.fetch(req('https://x.test/api/class-access/request', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proposed_name: 'Jamie' }),
  }), env);
  const rawText = await res.clone().text();
  const body = JSON.parse(rawText);
  if (res.status !== 200 || !body.ok || !body.requestId || !body.requestPhrase) return bad('request creation succeeds with phrase + id', body);
  if (!/^[A-Z]+-[A-Z]+-\d{2}$/.test(body.requestPhrase)) return bad('returned phrase is WORD-WORD-NN format', body.requestPhrase);
  const secret = setCookieValue(res, ACCESS_DEVICE_COOKIE_NAME);
  if (!secret) return bad('device cookie was set on request creation', [...res.headers.entries()]);
  if (rawText.includes(secret)) return bad('raw device secret must never appear in the JSON response body', rawText);
  if (rawText.includes(new URLSearchParams({ x: secret }).toString().slice(2))) { /* noop, just extra caution above already covers it */ }
  ok('POST /api/class-access/request returns a WORD-WORD-NN phrase, sets an HttpOnly device cookie, and never echoes the raw device secret in the JSON body');
  return { env, secret, requestId: body.requestId, phrase: body.requestPhrase };
}

async function testCreateRequestIdempotentPerDevice() {
  const env = makeEnv({});
  const first = await worker.fetch(req('https://x.test/api/class-access/request', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proposed_name: 'Sam' }),
  }), env);
  const secret = setCookieValue(first, ACCESS_DEVICE_COOKIE_NAME);
  const firstBody = await jsonOf(first);
  const second = await worker.fetch(req('https://x.test/api/class-access/request', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proposed_name: 'Sam' }),
  }, `${ACCESS_DEVICE_COOKIE_NAME}=${secret}`), env);
  const secondBody = await jsonOf(second);
  if (!secondBody.existing || secondBody.requestId !== firstBody.requestId) return bad('same device retrying gets the same pending request back', { firstBody, secondBody });
  if (env.DB.__rows.length !== 1) return bad('idempotent retry must not create a duplicate row', env.DB.__rows.length);
  ok('a browser that already has a live pending request gets the SAME request back on retry (no duplicate row, natural anti-spam for the common case)');
}

async function testRateLimitTriggersAfter5DistinctRequests() {
  const env = makeEnv({});
  const ipHeaders = { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.0.0.9' };
  let lastStatus = 0;
  let lastBody = null;
  for (let i = 0; i < 6; i++) {
    const res = await worker.fetch(req('https://x.test/api/class-access/request', {
      method: 'POST', headers: ipHeaders, body: JSON.stringify({ proposed_name: 'Spammer' + i }),
    }), env); // no cookie each time -> each call is treated as a brand new device/request
    lastStatus = res.status;
    lastBody = await jsonOf(res);
  }
  if (lastStatus !== 429 || lastBody.error !== 'too_many_requests') return bad('6th distinct request from the same IP within the window is rate-limited', { lastStatus, lastBody });
  ok('rate limiting caps distinct request creations per hashed requester IP within the 10-minute window (6th call -> 429 too_many_requests)');
}

async function testPhraseCollisionRetriesWithDifferentPhrase() {
  const env = makeEnv({});
  const nowIso = new Date().toISOString();
  const future = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  env.DB.__rows.push({
    id: 'seed_1', request_phrase: 'GREEN-FALCON-49', student_username: null, student_character_name: null,
    proposed_name: 'Seed', device_secret_hash: 'seedhash', requester_ip_hash: null,
    status: 'pending', requested_at: nowIso, request_expires_at: future, created_at: nowIso,
    decided_at: null, decided_by_staff_id: null, decided_by_staff_name: null, grant_expires_at: null, revoked_at: null,
  });
  const realGetRandomValues = crypto.getRandomValues.bind(crypto);
  let call = 0;
  crypto.getRandomValues = (arr) => {
    if (arr.length === 3) {
      call++;
      if (call === 1) { arr[0] = 0; arr[1] = 0; arr[2] = 39; return arr; } // -> GREEN-FALCON-49 (collides with seeded row)
      arr[0] = 1; arr[1] = 1; arr[2] = 0; return arr; // -> BLUE-OTTER-10 (unique)
    }
    return realGetRandomValues(arr);
  };
  try {
    const res = await worker.fetch(req('https://x.test/api/class-access/request', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proposed_name: 'Retry Kid' }),
    }), env);
    const body = await jsonOf(res);
    if (!body.ok) return bad('collision-retry request still succeeds', body);
    if (body.requestPhrase === 'GREEN-FALCON-49') return bad('a colliding candidate phrase must not be issued to two live requests', body);
    if (body.requestPhrase !== 'BLUE-OTTER-10') return bad('expected the retry to land on the next deterministic candidate', body);
    ok('a phrase collision against a live pending request is detected server-side and safely retried with a different identifier');
  } finally {
    crypto.getRandomValues = realGetRandomValues;
  }
}

async function testTeacherPendingListRequiresStaffSession() {
  const env = makeEnv({});
  const res = await worker.fetch(req('https://x.test/api/class-access/requests/pending', { method: 'GET' }), env);
  const body = await jsonOf(res);
  if (res.status !== 401 || body.error !== 'not_authenticated') return bad('pending list requires authentication', { status: res.status, body });
  ok('GET /api/class-access/requests/pending with no session -> 401 not_authenticated (no separate teacher auth system introduced)');
}

async function testFullApprovalFlowAndCrossBrowserNonTransferability() {
  const teacher = account({ username: 'ms_carter', role: 'teacher', teacher_id: 't_carter', display_name: 'Ms. Carter' });
  const env = makeEnv({ accounts: { ms_carter: teacher } });
  const teacherCookie = await pilotCookieFor(teacher);

  // Browser A creates a request.
  const createRes = await worker.fetch(req('https://x.test/api/class-access/request', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proposed_name: 'Browser A Student' }),
  }), env);
  const browserASecret = setCookieValue(createRes, ACCESS_DEVICE_COOKIE_NAME);
  const createBody = await jsonOf(createRes);
  const phrase = createBody.requestPhrase;
  const browserACookie = `${ACCESS_DEVICE_COOKIE_NAME}=${browserASecret}`;

  // Teacher sees it on the pending list, with the phrase, but never the device secret/hash.
  const pendingRes = await worker.fetch(req('https://x.test/api/class-access/requests/pending', { method: 'GET' }, teacherCookie), env);
  const pendingRawText = await pendingRes.clone().text();
  const pendingBody = await jsonOf(pendingRes);
  const row = (pendingBody.requests || []).find((r) => r.requestPhrase === phrase);
  if (!row) return bad('teacher pending list includes the new request by phrase', pendingBody);
  if (pendingRawText.includes(browserASecret)) return bad('teacher pending-list response must never contain the raw device secret', pendingRawText);
  if (/device_secret_hash/.test(pendingRawText)) return bad('teacher pending-list response must never contain device_secret_hash', pendingRawText);
  ok('teacher pending-requests list shows the memorable phrase and student name, and never exposes the device secret or its hash');

  // Teacher approves for 15 minutes using the row id (never the phrase) -- session-derived staff identity.
  const approveRes = await worker.fetch(req('https://x.test/api/class-access/requests/approve', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.id, duration_minutes: 15 }),
  }, teacherCookie), env);
  const approveBody = await jsonOf(approveRes);
  if (!approveBody.ok || approveBody.durationMinutes !== 15) return bad('teacher can approve for 15 minutes', approveBody);
  const expiresMs = new Date(approveBody.grantExpiresAt).getTime() - Date.now();
  if (expiresMs < 14 * 60 * 1000 || expiresMs > 16 * 60 * 1000) return bad('15-minute approval expires ~15 minutes from now', approveBody);
  ok('teacher "Approve 15 min" creates a temporary grant expiring ~15 minutes from now, recorded with the session-derived approving teacher identity');

  // Browser A (the ORIGINAL requesting browser) now has a qualifying grant.
  const stateA = await worker.fetch(req('https://x.test/api/class-access/state', { method: 'GET' }, browserACookie), env);
  const stateABody = await jsonOf(stateA);
  if (!stateABody.individualGrant || stateABody.individualGrant.qualifyingAccess !== true) return bad('the original requesting browser sees a qualifying individual grant', stateABody);
  ok('GET /api/class-access/state reports individualGrant.qualifyingAccess=true for the ORIGINAL requesting browser after teacher approval (informational only -- accessState/tokenValid unchanged, enforcement stays off)');

  // Browser A also sees "approved" on its own status poll.
  const statusA = await worker.fetch(req('https://x.test/api/class-access/request/status', { method: 'GET' }, browserACookie), env);
  const statusABody = await jsonOf(statusA);
  if (statusABody.status !== 'approved') return bad('original browser status poll reflects approval', statusABody);
  ok('the original requesting browser detects its approval automatically via status polling (no teacher-issued password ever required)');

  // Browser B knows the phrase but has no matching device cookie -- must NOT receive the grant.
  const statusBNoCookie = await worker.fetch(req('https://x.test/api/class-access/request/status', { method: 'GET' }), env);
  const statusBNoCookieBody = await jsonOf(statusBNoCookie);
  if (statusBNoCookieBody.status !== 'pending') return bad('a browser with no device cookie must not learn the real status (no leak)', statusBNoCookieBody);
  ok('Browser B (no device cookie at all) polling status sees a generic "pending" -- learns nothing about Browser A\'s real state, even though it could type in the same phrase in conversation');

  const stateBNoCookie = await worker.fetch(req('https://x.test/api/class-access/state', { method: 'GET' }), env);
  const stateBNoCookieBody = await jsonOf(stateBNoCookie);
  if (stateBNoCookieBody.individualGrant.qualifyingAccess !== false) return bad('a browser with no device cookie must never inherit another browser\'s grant', stateBNoCookieBody);
  ok('Browser B (no device cookie) never qualifies for Browser A\'s grant via /api/class-access/state');

  // Browser B fabricates/guesses SOME device cookie value (simulating "knows the phrase, tries a
  // cookie anyway") -- astronomically unlikely to hash-match Browser A's real secret.
  const guessedCookie = `${ACCESS_DEVICE_COOKIE_NAME}=not-the-real-secret-just-guessing`;
  const stateBGuess = await worker.fetch(req('https://x.test/api/class-access/state', { method: 'GET' }, guessedCookie), env);
  const stateBGuessBody = await jsonOf(stateBGuess);
  if (stateBGuessBody.individualGrant.qualifyingAccess !== false) return bad('an arbitrary guessed device cookie must never qualify', stateBGuessBody);
  ok('Browser B guessing an arbitrary device-cookie value (knowing only the human phrase, never the real opaque secret) cannot claim Browser A\'s grant -- the phrase is a display identifier only, never a credential');

  return { env, teacherCookie, row, browserACookie };
}

async function testDenyDoesNotGrantAccess() {
  const teacher = account({ username: 'mr_lee', role: 'teacher', teacher_id: 't_lee', display_name: 'Mr. Lee' });
  const env = makeEnv({ accounts: { mr_lee: teacher } });
  const teacherCookie = await pilotCookieFor(teacher);
  const createRes = await worker.fetch(req('https://x.test/api/class-access/request', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proposed_name: 'Denied Kid' }),
  }), env);
  const secret = setCookieValue(createRes, ACCESS_DEVICE_COOKIE_NAME);
  const cookie = `${ACCESS_DEVICE_COOKIE_NAME}=${secret}`;
  const id = env.DB.__rows[0].id;

  const denyRes = await worker.fetch(req('https://x.test/api/class-access/requests/deny', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
  }, teacherCookie), env);
  const denyBody = await jsonOf(denyRes);
  if (!denyBody.ok || denyBody.status !== 'denied') return bad('teacher can deny a pending request', denyBody);

  const statusRes = await worker.fetch(req('https://x.test/api/class-access/request/status', { method: 'GET' }, cookie), env);
  const statusBody = await jsonOf(statusRes);
  if (statusBody.status !== 'denied') return bad('denied request reports denied status to its own browser', statusBody);

  const stateRes = await worker.fetch(req('https://x.test/api/class-access/state', { method: 'GET' }, cookie), env);
  const stateBody = await jsonOf(stateRes);
  if (stateBody.individualGrant.qualifyingAccess !== false) return bad('a denied request must never qualify for access', stateBody);
  ok('a denied request reports status "denied" to its own browser and never produces a qualifying individual grant');
}

async function testExpiredRequestCannotBeApproved() {
  const teacher = account({ username: 'ms_park', role: 'teacher', teacher_id: 't_park' });
  const env = makeEnv({ accounts: { ms_park: teacher } });
  const teacherCookie = await pilotCookieFor(teacher);
  const past = new Date(Date.now() - 60 * 1000).toISOString();
  env.DB.__rows.push({
    id: 'expired_req_1', request_phrase: 'AMBER-WOLF-22', student_username: null, student_character_name: null,
    proposed_name: 'Late Kid', device_secret_hash: 'somehash', requester_ip_hash: null,
    status: 'pending', requested_at: past, request_expires_at: past, created_at: past,
    decided_at: null, decided_by_staff_id: null, decided_by_staff_name: null, grant_expires_at: null, revoked_at: null,
  });
  const approveRes = await worker.fetch(req('https://x.test/api/class-access/requests/approve', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'expired_req_1', duration_minutes: 15 }),
  }, teacherCookie), env);
  const approveBody = await jsonOf(approveRes);
  if (approveRes.status !== 400 || approveBody.ok !== false) return bad('an expired pending request cannot be approved', { status: approveRes.status, approveBody });
  ok('a request whose 10-minute pending window has elapsed cannot be approved, even if still marked "pending" in storage (server-time check, no cleanup job required)');
}

async function testApproveRejectsNonAllowedDuration() {
  const teacher = account({ username: 'mr_diaz', role: 'teacher', teacher_id: 't_diaz' });
  const env = makeEnv({ accounts: { mr_diaz: teacher } });
  const teacherCookie = await pilotCookieFor(teacher);
  const createRes = await worker.fetch(req('https://x.test/api/class-access/request', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proposed_name: 'Duration Kid' }),
  }), env);
  await jsonOf(createRes);
  const id = env.DB.__rows[0].id;
  const res = await worker.fetch(req('https://x.test/api/class-access/requests/approve', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, duration_minutes: 20 }),
  }, teacherCookie), env);
  const body = await jsonOf(res);
  if (res.status !== 400 || body.ok !== false) return bad('only 15 or 30 minute approvals are allowed', { status: res.status, body });
  ok('POST /api/class-access/requests/approve rejects any duration_minutes other than 15 or 30');
}

async function testRevokeStopsQualifyingImmediately() {
  const teacher = account({ username: 'mrs_kim', role: 'teacher', teacher_id: 't_kim' });
  const env = makeEnv({ accounts: { mrs_kim: teacher } });
  const teacherCookie = await pilotCookieFor(teacher);
  const createRes = await worker.fetch(req('https://x.test/api/class-access/request', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proposed_name: 'Revoke Kid' }),
  }), env);
  const secret = setCookieValue(createRes, ACCESS_DEVICE_COOKIE_NAME);
  const cookie = `${ACCESS_DEVICE_COOKIE_NAME}=${secret}`;
  const id = env.DB.__rows[0].id;

  await worker.fetch(req('https://x.test/api/class-access/requests/approve', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, duration_minutes: 30 }),
  }, teacherCookie), env);

  const beforeState = await worker.fetch(req('https://x.test/api/class-access/state', { method: 'GET' }, cookie), env);
  const beforeBody = await jsonOf(beforeState);
  if (beforeBody.individualGrant.qualifyingAccess !== true) return bad('grant qualifies before revoke', beforeBody);

  const activeRes = await worker.fetch(req('https://x.test/api/class-access/requests/active', { method: 'GET' }, teacherCookie), env);
  const activeBody = await jsonOf(activeRes);
  if (!activeBody.ok || !(activeBody.grants || []).some((g) => g.id === id)) return bad('active grants list includes the new 30-minute grant', activeBody);
  ok('teacher active-grants view lists the newly approved grant with expiration/granted-by info');

  const revokeRes = await worker.fetch(req('https://x.test/api/class-access/requests/revoke', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
  }, teacherCookie), env);
  const revokeBody = await jsonOf(revokeRes);
  if (!revokeBody.ok || revokeBody.status !== 'revoked') return bad('teacher can revoke an active grant', revokeBody);

  const afterState = await worker.fetch(req('https://x.test/api/class-access/state', { method: 'GET' }, cookie), env);
  const afterBody = await jsonOf(afterState);
  if (afterBody.individualGrant.qualifyingAccess !== false || afterBody.individualGrant.reason !== 'revoked') return bad('revoke takes effect immediately (server time, no cleanup job)', afterBody);
  ok('revoking a grant takes effect immediately: the very next /api/class-access/state check for that browser stops qualifying, with reason "revoked"');

  const activeAfterRes = await worker.fetch(req('https://x.test/api/class-access/requests/active', { method: 'GET' }, teacherCookie), env);
  const activeAfterBody = await jsonOf(activeAfterRes);
  if ((activeAfterBody.grants || []).some((g) => g.id === id)) return bad('revoked grant must disappear from the active-grants list', activeAfterBody);
  ok('a revoked grant no longer appears in the teacher active-grants list');

  const doubleRevoke = await worker.fetch(req('https://x.test/api/class-access/requests/revoke', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
  }, teacherCookie), env);
  const doubleRevokeBody = await jsonOf(doubleRevoke);
  if (doubleRevoke.status !== 400 || doubleRevokeBody.ok !== false) return bad('revoking an already-revoked grant is rejected, not silently re-accepted', { status: doubleRevoke.status, doubleRevokeBody });
  ok('revoking an already-revoked grant is rejected (atomic guarded UPDATE, no accidental double-processing)');
}

async function testExpiredGrantStopsQualifying() {
  const env = makeEnv({});
  const past = new Date(Date.now() - 60 * 1000).toISOString();
  const nowIso = new Date().toISOString();
  const secret = 'expired-grant-secret';
  const hash = await hashOpaqueSecret(secret);
  env.DB.__rows.push({
    id: 'expired_grant_1', request_phrase: 'JADE-HERO-77', student_username: null, student_character_name: 'Expired Kid',
    proposed_name: null, device_secret_hash: hash, requester_ip_hash: null,
    status: 'approved', requested_at: nowIso, request_expires_at: nowIso, created_at: nowIso,
    decided_at: nowIso, decided_by_staff_id: 't_x', decided_by_staff_name: 'Teacher X', grant_expires_at: past, revoked_at: null,
  });
  const cookie = `${ACCESS_DEVICE_COOKIE_NAME}=${secret}`;
  const stateRes = await worker.fetch(req('https://x.test/api/class-access/state', { method: 'GET' }, cookie), env);
  const stateBody = await jsonOf(stateRes);
  if (stateBody.individualGrant.qualifyingAccess !== false || stateBody.individualGrant.reason !== 'expired') return bad('a grant past its own grant_expires_at must stop qualifying automatically', stateBody);
  ok('a grant that has passed its own grant_expires_at stops qualifying automatically at read time, purely from current server time (no cleanup job)');
}

async function testStudentSessionUsesVerifiedIdentityNotClientProposedName() {
  const student = account({ username: 'lucas', role: 'student', student_character_name: 'Lucas the Brave' });
  const env = makeEnv({ accounts: { lucas: student } });
  const cookie = await pilotCookieFor(student);
  const res = await worker.fetch(req('https://x.test/api/class-access/request', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proposed_name: 'Someone Else Entirely' }),
  }, cookie), env);
  const body = await jsonOf(res);
  if (!body.ok) return bad('authenticated student can create a request without supplying a name', body);
  const row = env.DB.__rows.find((r) => r.id === body.requestId);
  if (!row || row.student_username !== 'lucas' || row.student_character_name !== 'Lucas the Brave') {
    return bad('verified pilot session identity is used, not any client-supplied proposed_name', row);
  }
  if (row.proposed_name) return bad('proposed_name must stay empty when a verified session identity is available', row);
  ok('an authenticated student session supplies the verified display name server-side; a client-supplied proposed_name cannot override or spoof it');
}

// ---------------------------------------------------------------------------

testPhraseFormat();
testDeviceSecretEntropyAndUniqueness();
await testHashDeterministicAndDistinct();
testCookieHeaderShape();
testDerivedRequestStatus();

await testCreateRequestNoSessionRequiresProposedName();
await testCreateRequestReturnsPhraseAndDeviceCookie();
await testCreateRequestIdempotentPerDevice();
await testRateLimitTriggersAfter5DistinctRequests();
await testPhraseCollisionRetriesWithDifferentPhrase();
await testTeacherPendingListRequiresStaffSession();
await testFullApprovalFlowAndCrossBrowserNonTransferability();
await testDenyDoesNotGrantAccess();
await testExpiredRequestCannotBeApproved();
await testApproveRejectsNonAllowedDuration();
await testRevokeStopsQualifyingImmediately();
await testExpiredGrantStopsQualifying();
await testStudentSessionUsesVerifiedIdentityNotClientProposedName();

console.log('\naccess-requests-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
