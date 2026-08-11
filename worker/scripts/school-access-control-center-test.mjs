/**
 * Phase #33 — Teacher School Access Control Center + Event Overrides.
 *
 * Part A: pure unit tests of the new Phase #33 helpers — access-requests.js
 * computeExtendedGrantExpiresAt (extension semantics + the "never permanent" ceiling) and
 * access-audit.js recordAccessAuditEvent (best-effort insert, never throws, never logs secrets).
 *
 * Part B: integration tests against the REAL worker/index.js fetch(request, env) entry point with
 * a mocked D1 covering lantern_access_requests (Phase #31), lantern_access_device_pairings /
 * lantern_access_devices / lantern_access_device_groups / lantern_access_group_unlocks
 * (Phase #32), lantern_access_overrides (schema from migration 050, wired up in this phase), and
 * the new lantern_access_audit_log table (migration 054) -- proving the Phase #33 test matrix:
 *  1)  "Extend +15/+30" pushes an active grant's expiry forward and is rejected for any
 *      inactive/expired/denied/revoked grant or any duration other than 15/30
 *  2)  Extend has a hard ceiling -- repeated extension can never make a grant de-facto permanent
 *  3)  GET /api/class-access/state now also reports eventOverride (informational only)
 *  4)  Schoolwide Access override supports 15/30/60/custom/until-school-close, always with an
 *      explicit expiration (no "forever" option anywhere in the API)
 *  5)  starting a new override supersedes (ends) any prior active override
 *  6)  "END SCHOOLWIDE ACCESS NOW" ends the active override immediately, evaluated purely by server time
 *  7)  override start/end are admin-only; override/active remains staff-readable (Prompt #171)
 *  8)  the public state endpoint's eventOverride field never leaks staff identity (that is
 *      staff-only via GET .../override/active)
 *  9)  security actions (request approved/denied/extended/revoked, device enrolled/revoked, group
 *      unlocked/locked, override started/ended) are written to lantern_access_audit_log, and no
 *      audit row or teacher-facing response ever contains a raw credential secret
 *  10) audit logging is best-effort -- a failing DB write never blocks the underlying action
 *
 * Usage: node worker/scripts/school-access-control-center-test.mjs
 */
import worker from '../index.js';
import { computeExtendedGrantExpiresAt, ACCESS_GRANT_MAX_TOTAL_MINUTES, derivedRequestStatus, ACCESS_DEVICE_COOKIE_NAME } from '../access-requests.js';
import { ACCESS_AUDIT_ACTIONS, recordAccessAuditEvent } from '../access-audit.js';
import { DEVICE_TOKEN_HEADER } from '../device-enrollment.js';

let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

// ---------------------------------------------------------------------------
// Part A: pure module unit tests
// ---------------------------------------------------------------------------

function testComputeExtendedGrantExpiresAtBasicAddition() {
  const now = new Date('2026-08-09T18:00:00.000Z');
  const currentExpiry = new Date(now.getTime() + 10 * 60 * 1000).toISOString(); // 10 min from now
  const extended = computeExtendedGrantExpiresAt(currentExpiry, 15, now);
  const deltaFromNowMs = new Date(extended).getTime() - now.getTime();
  if (Math.abs(deltaFromNowMs - 25 * 60 * 1000) > 1000) return bad('extend +15 min adds to the CURRENT expiry (10 min left -> 25 min left), not to now', { currentExpiry, extended });
  ok('computeExtendedGrantExpiresAt adds the extension to the grant\'s current expiry (still-active case)');
}

function testComputeExtendedGrantExpiresAtElapsedGrantExtendsFromNow() {
  const now = new Date('2026-08-09T18:00:00.000Z');
  const staleExpiry = new Date(now.getTime() - 5 * 60 * 1000).toISOString(); // already 5 min in the past
  const extended = computeExtendedGrantExpiresAt(staleExpiry, 15, now);
  const deltaFromNowMs = new Date(extended).getTime() - now.getTime();
  if (Math.abs(deltaFromNowMs - 15 * 60 * 1000) > 1000) return bad('extending a grant whose stale expiry is already in the past extends from NOW, not from the stale past expiry', { staleExpiry, extended });
  ok('computeExtendedGrantExpiresAt extends from "now" (never from a stale past expiry) when the grant\'s old expiry has already elapsed');
}

function testComputeExtendedGrantExpiresAtNeverExceedsCeiling() {
  const now = new Date('2026-08-09T18:00:00.000Z');
  let expiry = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
  // Repeatedly "extend" far beyond the ceiling to prove it can never become permanent.
  for (let i = 0; i < 20; i++) {
    expiry = computeExtendedGrantExpiresAt(expiry, 30, now);
  }
  const deltaFromNowMs = new Date(expiry).getTime() - now.getTime();
  const ceilingMs = ACCESS_GRANT_MAX_TOTAL_MINUTES * 60 * 1000;
  if (deltaFromNowMs > ceilingMs + 1000) return bad('20 repeated +30 min extensions must never push expiry past the hard ceiling', { deltaFromNowMs, ceilingMs });
  if (deltaFromNowMs < ceilingMs - 1000) return bad('20 repeated +30 min extensions (600 min total) should have hit the ceiling', { deltaFromNowMs, ceilingMs });
  ok(`computeExtendedGrantExpiresAt clamps to a hard ceiling of ${ACCESS_GRANT_MAX_TOTAL_MINUTES} minutes from "now" no matter how many times a grant is extended -- this is what guarantees "Extend" can never accidentally make a temporary grant permanent`);
}

async function testRecordAccessAuditEventInsertsExpectedRow() {
  const inserted = [];
  const db = {
    prepare(sql) {
      return {
        bind(...args) { this._args = args; return this; },
        async run() {
          if (String(sql).includes('INSERT INTO lantern_access_audit_log')) inserted.push(this._args);
          return { success: true, meta: { changes: 1 } };
        },
      };
    },
  };
  await recordAccessAuditEvent(db, {
    action: ACCESS_AUDIT_ACTIONS.GROUP_UNLOCKED,
    staffId: 't_1', staffName: 'Ms. Rivera', targetId: 'grp_1',
    detail: { durationMinutes: 15 },
  });
  if (inserted.length !== 1) return bad('recordAccessAuditEvent writes exactly one row', inserted);
  const [id, action, staffId, staffName, targetId, detail, createdAt] = inserted[0];
  if (action !== 'group_unlocked' || staffId !== 't_1' || staffName !== 'Ms. Rivera' || targetId !== 'grp_1') return bad('audit row carries the expected action/staff/target fields', inserted[0]);
  if (!id || !createdAt) return bad('audit row has an id and created_at timestamp', inserted[0]);
  if (!detail || !detail.includes('15')) return bad('audit row detail is serialized', inserted[0]);
  ok('recordAccessAuditEvent writes one lantern_access_audit_log row with the expected action/staff/target/detail/timestamp fields');
}

async function testRecordAccessAuditEventNeverThrowsOnDbFailure() {
  const db = { prepare() { throw new Error('simulated D1 outage'); } };
  let threw = false;
  try {
    await recordAccessAuditEvent(db, { action: ACCESS_AUDIT_ACTIONS.OVERRIDE_STARTED, staffId: 'x', staffName: 'y' });
  } catch (_) {
    threw = true;
  }
  if (threw) return bad('recordAccessAuditEvent must swallow DB errors, never throw');
  ok('recordAccessAuditEvent is best-effort -- a failing D1 write is swallowed and never throws, so audit logging can never block or break the security action it describes');
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
  const requests = [];
  const overridesTbl = [];
  const auditLog = [];
  const pairings = [];
  const devices = [];
  const groups = [];
  const unlocks = [];
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

        // -- individual requests (Phase #31 + #33 extend) --
        if (s.includes('FROM lantern_access_requests WHERE device_secret_hash = ?')) {
          const matches = requests.filter((r) => r.device_secret_hash === binds[0]).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
          return matches[0] || null;
        }
        if (s.includes('SELECT id, status, request_expires_at FROM lantern_access_requests WHERE id = ?')) {
          const row = requests.find((r) => r.id === binds[0]);
          return row ? { id: row.id, status: row.status, request_expires_at: row.request_expires_at } : null;
        }
        if (s.includes('SELECT id, status, grant_expires_at, revoked_at FROM lantern_access_requests WHERE id = ?')) {
          const row = requests.find((r) => r.id === binds[0]);
          return row ? { id: row.id, status: row.status, grant_expires_at: row.grant_expires_at, revoked_at: row.revoked_at } : null;
        }
        if (s.includes('request_phrase = ?') && s.includes("status = 'pending'")) {
          const [phrase, now] = binds;
          const clash = requests.find((r) => r.request_phrase === phrase && r.status === 'pending' && r.request_expires_at > now);
          return clash ? { id: clash.id } : null;
        }
        if (s.includes('COUNT(*) AS c') && s.includes('lantern_access_requests') && !s.includes('device_pairings')) {
          const [ipHash, windowStart] = binds;
          const c = requests.filter((r) => r.requester_ip_hash === ipHash && r.requested_at > windowStart).length;
          return { c };
        }

        // -- device pairings/devices/groups/unlocks (Phase #32, reused so audit wiring on
        // enroll/revoke/unlock/lock can be exercised end-to-end too) --
        if (s.includes('FROM lantern_access_device_pairings WHERE pairing_secret_hash = ?')) {
          const matches = pairings.filter((r) => r.pairing_secret_hash === binds[0]).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
          return matches[0] || null;
        }
        if (s.includes('pairing_phrase = ?') && s.includes("status = 'pending'")) {
          const [phrase, now] = binds;
          const clash = pairings.find((r) => r.pairing_phrase === phrase && r.status === 'pending' && r.request_expires_at > now);
          return clash ? { id: clash.id } : null;
        }
        if (s.includes('COUNT(*) AS c') && s.includes('lantern_access_device_pairings')) {
          const [ipHash, windowStart] = binds;
          const c = pairings.filter((r) => r.requester_ip_hash === ipHash && r.requested_at > windowStart).length;
          return { c };
        }
        if (s.includes('SELECT id, status, request_expires_at FROM lantern_access_device_pairings WHERE id = ?')) {
          const row = pairings.find((r) => r.id === binds[0]);
          return row ? { id: row.id, status: row.status, request_expires_at: row.request_expires_at } : null;
        }
        if (s.includes('FROM lantern_access_devices WHERE device_token_hash = ?')) {
          const row = devices.find((d) => d.device_token_hash === binds[0]);
          return row ? { id: row.id, group_id: row.group_id, revoked_at: row.revoked_at } : null;
        }
        if (s.includes('SELECT id, label, group_id FROM lantern_access_devices WHERE id = ?')) {
          const row = devices.find((d) => d.id === binds[0]);
          return row ? { id: row.id, label: row.label, group_id: row.group_id } : null;
        }
        if (s.includes('COUNT(*) AS c') && s.includes('lantern_access_devices')) {
          const c = devices.filter((d) => d.group_id === binds[0] && !d.revoked_at).length;
          return { c };
        }
        if (s.includes('FROM lantern_access_device_groups WHERE id = ?')) {
          return groups.find((g) => g.id === binds[0]) || null;
        }
        if (s.includes('FROM lantern_access_group_unlocks WHERE group_id = ?') && s.includes('ORDER BY created_at DESC LIMIT 1')) {
          const matches = unlocks.filter((u) => u.group_id === binds[0]).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
          return matches[0] || null;
        }

        // -- Phase #33: global event overrides --
        if (s.includes('FROM lantern_access_overrides ORDER BY created_at DESC LIMIT 1')) {
          const matches = overridesTbl.slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
          return matches[0] || null;
        }
        return null;
      },
      async all() {
        if (s.includes("FROM lantern_access_requests WHERE status = 'pending'") && s.includes('ORDER BY requested_at')) {
          const now = binds[0];
          return { results: requests.filter((r) => r.status === 'pending' && r.request_expires_at > now).sort((a, b) => (a.requested_at > b.requested_at ? 1 : -1)) };
        }
        if (s.includes("FROM lantern_access_requests WHERE status = 'approved'")) {
          const now = binds[0];
          return { results: requests.filter((r) => r.status === 'approved' && !r.revoked_at && r.grant_expires_at > now).sort((a, b) => (a.grant_expires_at > b.grant_expires_at ? 1 : -1)) };
        }
        if (s.includes("FROM lantern_access_device_pairings WHERE status = 'pending'")) {
          const now = binds[0];
          return { results: pairings.filter((r) => r.status === 'pending' && r.request_expires_at > now).sort((a, b) => (a.requested_at > b.requested_at ? 1 : -1)) };
        }
        if (s.includes('FROM lantern_access_device_groups ORDER BY name')) {
          return { results: groups.slice().sort((a, b) => (a.name > b.name ? 1 : -1)) };
        }
        if (s.includes('FROM lantern_access_devices d LEFT JOIN lantern_access_device_groups g')) {
          return { results: devices.map((d) => ({ id: d.id, label: d.label, group_id: d.group_id, group_name: (groups.find((g) => g.id === d.group_id) || {}).name || null, enrolled_at: d.enrolled_at, enrolled_by_staff_name: d.enrolled_by_staff_name, last_seen_at: d.last_seen_at, revoked_at: d.revoked_at })) };
        }
        return { results: [] };
      },
      async run() {
        // -- individual requests --
        if (s.includes('INSERT INTO lantern_access_requests')) {
          const [id, request_phrase, student_username, student_character_name, proposed_name, device_secret_hash, requester_ip_hash, requested_at, request_expires_at, created_at] = binds;
          requests.push({ id, request_phrase, student_username, student_character_name, proposed_name, device_secret_hash, requester_ip_hash, status: 'pending', requested_at, request_expires_at, created_at, decided_at: null, decided_by_staff_id: null, decided_by_staff_name: null, grant_expires_at: null, revoked_at: null });
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes("SET status = 'approved'") && s.includes('grant_expires_at = ?')) {
          const [decided_at, decided_by_staff_id, decided_by_staff_name, grant_expires_at, id, nowGuard] = binds;
          const row = requests.find((r) => r.id === id && r.status === 'pending' && r.request_expires_at > nowGuard);
          if (!row) return { success: true, meta: { changes: 0 } };
          Object.assign(row, { status: 'approved', decided_at, decided_by_staff_id, decided_by_staff_name, grant_expires_at });
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes("SET status = 'denied'")) {
          const [decided_at, decided_by_staff_id, decided_by_staff_name, id] = binds;
          const row = requests.find((r) => r.id === id && r.status === 'pending');
          if (!row) return { success: true, meta: { changes: 0 } };
          Object.assign(row, { status: 'denied', decided_at, decided_by_staff_id, decided_by_staff_name });
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes('UPDATE lantern_access_requests SET revoked_at = ?')) {
          const [revoked_at, id] = binds;
          const row = requests.find((r) => r.id === id && r.status === 'approved' && !r.revoked_at);
          if (!row) return { success: true, meta: { changes: 0 } };
          row.revoked_at = revoked_at;
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes('UPDATE lantern_access_requests SET grant_expires_at = ?')) {
          const [grant_expires_at, id, nowGuard] = binds;
          const row = requests.find((r) => r.id === id && r.status === 'approved' && !r.revoked_at && r.grant_expires_at > nowGuard);
          if (!row) return { success: true, meta: { changes: 0 } };
          row.grant_expires_at = grant_expires_at;
          return { success: true, meta: { changes: 1 } };
        }

        // -- device pairings/devices/groups/unlocks --
        if (s.includes('INSERT INTO lantern_access_device_pairings')) {
          const [id, pairing_phrase, pairing_secret_hash, requester_ip_hash, requested_at, request_expires_at, created_at] = binds;
          pairings.push({ id, pairing_phrase, pairing_secret_hash, requester_ip_hash, status: 'pending', requested_at, request_expires_at, created_at, decided_at: null, decided_by_staff_id: null, decided_by_staff_name: null, device_id: null, credential_delivered_at: null });
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes("SET status = 'approved'") && s.includes('lantern_access_device_pairings')) {
          const [decided_at, decided_by_staff_id, decided_by_staff_name, device_id, id, nowGuard] = binds;
          const row = pairings.find((r) => r.id === id && r.status === 'pending' && r.request_expires_at > nowGuard);
          if (!row) return { success: true, meta: { changes: 0 } };
          Object.assign(row, { status: 'approved', decided_at, decided_by_staff_id, decided_by_staff_name, device_id });
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes('DELETE FROM lantern_access_devices WHERE id = ?')) {
          const idx = devices.findIndex((d) => d.id === binds[0]);
          if (idx >= 0) devices.splice(idx, 1);
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes('INSERT INTO lantern_access_devices')) {
          const [id, device_token_hash, group_id, label, enrolled_by_staff_id, enrolled_by_staff_name, enrolled_at, created_at] = binds;
          devices.push({ id, device_token_hash, group_id, label, enrolled_by_staff_id, enrolled_by_staff_name, enrolled_at, created_at, revoked_at: null, last_seen_at: null, last_seen_ip_hash: null });
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes('SET device_token_hash = ?')) {
          const [device_token_hash, id] = binds;
          const row = devices.find((d) => d.id === id);
          if (row) row.device_token_hash = device_token_hash;
          return { success: true, meta: { changes: row ? 1 : 0 } };
        }
        if (s.includes('SET group_id = ? WHERE id = ?')) {
          const [group_id, id] = binds;
          const row = devices.find((d) => d.id === id);
          if (!row) return { success: true, meta: { changes: 0 } };
          row.group_id = group_id;
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes('UPDATE lantern_access_devices SET revoked_at = ?')) {
          const [revoked_at, id] = binds;
          const row = devices.find((d) => d.id === id && !d.revoked_at);
          if (!row) return { success: true, meta: { changes: 0 } };
          row.revoked_at = revoked_at;
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes('SET last_seen_at = ?')) return { success: true, meta: { changes: 1 } };
        if (s.includes('INSERT INTO lantern_access_device_groups')) {
          const [id, name, created_by_staff_id, created_by_staff_name, created_at] = binds;
          groups.push({ id, name, created_by_staff_id, created_by_staff_name, created_at });
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes('INSERT INTO lantern_access_group_unlocks')) {
          const [id, group_id, started_by_staff_id, started_by_staff_name, starts_at, expires_at, created_at] = binds;
          unlocks.push({ id, group_id, started_by_staff_id, started_by_staff_name, starts_at, expires_at, is_active: 1, revoked_at: null, created_at });
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes('UPDATE lantern_access_group_unlocks SET is_active = 0, revoked_at = ?')) {
          const [revoked_at, group_id] = binds;
          const active = unlocks.filter((u) => u.group_id === group_id && u.is_active && !u.revoked_at);
          for (const u of active) { u.is_active = 0; u.revoked_at = revoked_at; }
          return { success: true, meta: { changes: active.length } };
        }

        // -- Phase #33: overrides --
        if (s.includes('INSERT INTO lantern_access_overrides')) {
          const [id, reason, created_by_staff_id, created_by_staff_name, starts_at, expires_at, created_at] = binds;
          overridesTbl.push({ id, reason, created_by_staff_id, created_by_staff_name, starts_at, expires_at, is_active: 1, revoked_at: null, created_at });
          return { success: true, meta: { changes: 1 } };
        }
        if (s.includes('UPDATE lantern_access_overrides SET is_active = 0, revoked_at = ?')) {
          const [revoked_at] = binds;
          const active = overridesTbl.filter((o) => o.is_active && !o.revoked_at);
          for (const o of active) { o.is_active = 0; o.revoked_at = revoked_at; }
          return { success: true, meta: { changes: active.length } };
        }

        // -- Phase #33: audit log --
        if (s.includes('INSERT INTO lantern_access_audit_log')) {
          const [id, action, staff_id, staff_name, target_id, detail, created_at] = binds;
          auditLog.push({ id, action, staff_id, staff_name, target_id, detail, created_at });
          return { success: true, meta: { changes: 1 } };
        }
        return { success: true, meta: { changes: 0 } };
      },
    };
    return api;
  }

  return {
    DB: { prepare, __requests: requests, __overrides: overridesTbl, __auditLog: auditLog, __pairings: pairings, __devices: devices, __groups: groups, __unlocks: unlocks },
    PILOT_SESSION_SECRET: TEST_SECRET,
    ...overrides,
  };
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

async function createAndApproveRequest(env, teacherCookie, minutes) {
  const createRes = await worker.fetch(req('https://x.test/api/class-access/request', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proposed_name: 'Student ' + Math.random().toString(36).slice(2, 6) }),
  }), env);
  const secret = setCookieValue(createRes, ACCESS_DEVICE_COOKIE_NAME);
  const createBody = await jsonOf(createRes);
  const pendingBody = await jsonOf(await worker.fetch(req('https://x.test/api/class-access/requests/pending', { method: 'GET' }, teacherCookie), env));
  const row = pendingBody.requests.find((r) => r.requestPhrase === createBody.requestPhrase);
  const approveBody = await jsonOf(await worker.fetch(req('https://x.test/api/class-access/requests/approve', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.id, duration_minutes: minutes }),
  }, teacherCookie), env));
  return { id: row.id, secret, grantExpiresAt: approveBody.grantExpiresAt };
}

async function testExtendHappyPathAndValidation() {
  const teacher = account({ username: 'ms_park', role: 'teacher', teacher_id: 't_park', display_name: 'Ms. Park' });
  const env = makeEnv({ accounts: { ms_park: teacher } });
  const teacherCookie = await pilotCookieFor(teacher);
  const grant = await createAndApproveRequest(env, teacherCookie, 15);

  const noSession = await worker.fetch(req('https://x.test/api/class-access/requests/extend', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: grant.id, duration_minutes: 15 }) }), env);
  if (noSession.status !== 401) return bad('extend requires an authenticated staff session', noSession.status);
  ok('POST /api/class-access/requests/extend with no staff session -> 401 (same staff-only guard as approve/deny/revoke)');

  const badDuration = await jsonOf(await worker.fetch(req('https://x.test/api/class-access/requests/extend', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: grant.id, duration_minutes: 45 }) }, teacherCookie), env));
  if (badDuration.ok !== false) return bad('extend rejects any duration other than 15 or 30', badDuration);
  ok('POST /api/class-access/requests/extend rejects duration_minutes other than 15 or 30');

  const before = new Date(grant.grantExpiresAt).getTime();
  const extendRes = await worker.fetch(req('https://x.test/api/class-access/requests/extend', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: grant.id, duration_minutes: 15 }) }, teacherCookie), env);
  const extendBody = await jsonOf(extendRes);
  if (!extendBody.ok) return bad('Extend +15 min succeeds on an active grant', extendBody);
  const after = new Date(extendBody.grantExpiresAt).getTime();
  if (Math.abs((after - before) - 15 * 60 * 1000) > 2000) return bad('Extend +15 min pushes expiry forward by ~15 minutes', { before, after });
  ok('"Extend +15 min" on an active individual grant (#33) pushes its expiry forward by 15 minutes from its current expiry');

  const extend30 = await jsonOf(await worker.fetch(req('https://x.test/api/class-access/requests/extend', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: grant.id, duration_minutes: 30 }) }, teacherCookie), env));
  if (!extend30.ok) return bad('Extend +30 min also succeeds', extend30);
  ok('"Extend +30 min" also succeeds on the same active grant');

  // Revoke, then confirm extend is rejected for a no-longer-active grant.
  await worker.fetch(req('https://x.test/api/class-access/requests/revoke', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: grant.id }) }, teacherCookie), env);
  const extendAfterRevoke = await jsonOf(await worker.fetch(req('https://x.test/api/class-access/requests/extend', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: grant.id, duration_minutes: 15 }) }, teacherCookie), env));
  if (extendAfterRevoke.ok !== false || extendAfterRevoke.error !== 'grant_not_active') return bad('extend must be rejected for a revoked grant', extendAfterRevoke);
  ok('extending an already-revoked grant is rejected (grant_not_active) -- extension can never "resurrect" a revoked/expired/denied request');
}

async function testExtendNeverExceedsCeilingEndToEnd() {
  const teacher = account({ username: 'mr_dune', role: 'teacher', teacher_id: 't_dune' });
  const env = makeEnv({ accounts: { mr_dune: teacher } });
  const teacherCookie = await pilotCookieFor(teacher);
  const grant = await createAndApproveRequest(env, teacherCookie, 30);

  let lastBody = null;
  for (let i = 0; i < 10; i++) {
    lastBody = await jsonOf(await worker.fetch(req('https://x.test/api/class-access/requests/extend', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: grant.id, duration_minutes: 30 }) }, teacherCookie), env));
    if (!lastBody.ok) return bad('extend call ' + i + ' failed unexpectedly', lastBody);
  }
  const remainingMinutes = (new Date(lastBody.grantExpiresAt).getTime() - Date.now()) / 60000;
  if (remainingMinutes > ACCESS_GRANT_MAX_TOTAL_MINUTES + 1) return bad('10x Extend +30 min (300 min total) must be clamped to the hard ceiling', { remainingMinutes });
  ok(`10 repeated "Extend +30 min" clicks end-to-end through the real route are clamped to the ${ACCESS_GRANT_MAX_TOTAL_MINUTES}-minute ceiling -- a temporary grant can never become de-facto permanent`);
}

async function testStateReportsEventOverrideInformationalOnly() {
  const env = makeEnv({});
  const before = await jsonOf(await worker.fetch(req('https://x.test/api/class-access/state', { method: 'GET' }), env));
  if (!before.eventOverride || before.eventOverride.qualifyingAccess !== false) return bad('with no override, eventOverride.qualifyingAccess is false', before);
  if (before.qualifyingAccess !== false) return bad('top-level qualifyingAccess is false with nothing active', before);
  ok('GET /api/class-access/state reports eventOverride.qualifyingAccess=false when no override is active (informational only, matches individualGrant/deviceGroupAccess shape)');

  const admin = account({ username: 'ms_diaz', role: 'admin', teacher_id: 't_diaz', display_name: 'Ms. Diaz' });
  const env2 = makeEnv({ accounts: { ms_diaz: admin } });
  const adminCookie = await pilotCookieFor(admin);
  await worker.fetch(req('https://x.test/api/class-access/override/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ duration_minutes: 30, reason: 'Assembly' }) }, adminCookie), env2);

  const afterRes = await worker.fetch(req('https://x.test/api/class-access/state', { method: 'GET' }), env2);
  const afterRaw = await afterRes.clone().text();
  const after = await jsonOf(afterRes);
  if (!after.eventOverride || after.eventOverride.qualifyingAccess !== true) return bad('with an active override, eventOverride.qualifyingAccess is true', after);
  if (after.qualifyingAccess !== true) return bad('top-level qualifyingAccess reflects the active override', after);
  if (/Ms\. Diaz/.test(afterRaw) || /startedByName/.test(afterRaw)) return bad('the PUBLIC state endpoint must never leak who started the override (staff-only via .../override/active)', afterRaw);
  ok('GET /api/class-access/state reports eventOverride.qualifyingAccess=true (and top-level qualifyingAccess=true) while an override is active, WITHOUT ever exposing the starting staff member\'s name on this public endpoint');
}

async function testOverrideStartRequiresAdminAndExplicitExpiration() {
  const env = makeEnv({});
  const noSession = await worker.fetch(req('https://x.test/api/class-access/override/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ duration_minutes: 15 }) }), env);
  if (noSession.status !== 401) return bad('override start requires an authenticated session', noSession.status);
  const noSessionEnd = await worker.fetch(req('https://x.test/api/class-access/override/end', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }), env);
  if (noSessionEnd.status !== 401) return bad('override end requires an authenticated session', noSessionEnd.status);
  const noSessionActive = await worker.fetch(req('https://x.test/api/class-access/override/active', { method: 'GET' }), env);
  if (noSessionActive.status !== 401) return bad('override active-status requires an authenticated staff session', noSessionActive.status);
  ok('POST .../override/start, POST .../override/end, and GET .../override/active all require authentication (401 otherwise)');

  const teacher = account({ username: 'mr_ellis', role: 'teacher', teacher_id: 't_ellis' });
  const teacherEnv = makeEnv({ accounts: { mr_ellis: teacher } });
  const teacherCookie = await pilotCookieFor(teacher);
  const teacherStart = await worker.fetch(req('https://x.test/api/class-access/override/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ duration_minutes: 15 }) }, teacherCookie), teacherEnv);
  if (teacherStart.status !== 403) return bad('ordinary teacher must be forbidden from override/start (403)', teacherStart.status);
  const teacherEnd = await worker.fetch(req('https://x.test/api/class-access/override/end', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }, teacherCookie), teacherEnv);
  if (teacherEnd.status !== 403) return bad('ordinary teacher must be forbidden from override/end (403)', teacherEnd.status);
  const teacherActive = await jsonOf(await worker.fetch(req('https://x.test/api/class-access/override/active', { method: 'GET' }, teacherCookie), teacherEnv));
  if (!teacherActive.ok) return bad('teachers may still read override/active status (staff session)', teacherActive);
  ok('Prompt #171 — override start/end are admin-only (teacher gets 403); override/active remains staff-readable');

  const admin = account({ username: 'admin_ellis', role: 'admin', teacher_id: 't_admin_ellis' });
  const adminEnv = makeEnv({ accounts: { admin_ellis: admin } });
  const adminCookie = await pilotCookieFor(admin);
  const noExpiry = await jsonOf(await worker.fetch(req('https://x.test/api/class-access/override/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }, adminCookie), adminEnv));
  if (noExpiry.ok !== false) return bad('starting an override with no duration_minutes/until_school_close/custom_minutes must be rejected -- there is no "Open Forever"', noExpiry);
  ok('POST .../override/start with none of duration_minutes/until_school_close/custom_minutes is rejected -- there is no code path that can create an override without an explicit, bounded expires_at');
}

async function testOverrideDurationsAndCustomBounds() {
  const admin = account({ username: 'mrs_kohl', role: 'admin', teacher_id: 't_kohl' });
  const env = makeEnv({ accounts: { mrs_kohl: admin } });
  const adminCookie = await pilotCookieFor(admin);

  for (const minutes of [15, 30, 60]) {
    const res = await jsonOf(await worker.fetch(req('https://x.test/api/class-access/override/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ duration_minutes: minutes }) }, adminCookie), env));
    if (!res.ok) return bad(`override start ${minutes} min succeeds`, res);
    const deltaMs = new Date(res.expiresAt).getTime() - Date.now();
    if (deltaMs < (minutes - 1) * 60 * 1000 || deltaMs > (minutes + 1) * 60 * 1000) return bad(`override ${minutes} min expires ~${minutes} minutes from now`, res);
  }
  ok('Schoolwide Access 15 / 30 / 60 minute buttons each set an expiry the correct number of minutes from now');

  const tooLong = await jsonOf(await worker.fetch(req('https://x.test/api/class-access/override/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ custom_minutes: 500 }) }, adminCookie), env));
  if (tooLong.ok !== false) return bad('custom_minutes above the max must be rejected', tooLong);
  const zero = await jsonOf(await worker.fetch(req('https://x.test/api/class-access/override/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ custom_minutes: 0 }) }, adminCookie), env));
  if (zero.ok !== false) return bad('custom_minutes of 0 must be rejected', zero);
  const custom = await jsonOf(await worker.fetch(req('https://x.test/api/class-access/override/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ custom_minutes: 45 }) }, adminCookie), env));
  if (!custom.ok) return bad('a valid custom_minutes (45) succeeds', custom);
  const deltaMs = new Date(custom.expiresAt).getTime() - Date.now();
  if (deltaMs < 44 * 60 * 1000 || deltaMs > 46 * 60 * 1000) return bad('custom 45-minute override expires ~45 minutes from now', custom);
  ok('Custom override duration is bounded (rejects 0 and values above the max) and a valid custom duration (45 min) sets the correct expiry -- every override always has an explicit, bounded expiration');
}

async function testOverrideSupersedesPriorAndEndNow() {
  const admin = account({ username: 'mr_song', role: 'admin', teacher_id: 't_song', display_name: 'Mr. Song' });
  const env = makeEnv({ accounts: { mr_song: admin } });
  const adminCookie = await pilotCookieFor(admin);

  await worker.fetch(req('https://x.test/api/class-access/override/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ duration_minutes: 15, reason: 'Pep rally' }) }, adminCookie), env);
  const secondStart = await jsonOf(await worker.fetch(req('https://x.test/api/class-access/override/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ duration_minutes: 60, reason: 'Extended rally' }) }, adminCookie), env));
  if (!secondStart.ok) return bad('a second override start succeeds', secondStart);

  const activeCount = env.DB.__overrides.filter((o) => o.is_active).length;
  if (activeCount !== 1) return bad('starting a new override must supersede (end) any prior active override -- exactly one active at a time', env.DB.__overrides);
  ok('starting a new override immediately supersedes (ends) any prior active override, so re-clicking a duration behaves as expected -- exactly one active override at a time');

  const activeStatus = await jsonOf(await worker.fetch(req('https://x.test/api/class-access/override/active', { method: 'GET' }, adminCookie), env));
  if (!activeStatus.active || activeStatus.reason !== 'Extended rally' || activeStatus.startedByName !== 'Mr. Song') return bad('staff-only active-status endpoint shows the full detail (reason + started-by)', activeStatus);
  ok('GET .../override/active (staff-readable) shows Schoolwide Access detail: reason, started-by name, and expiry');

  const endRes = await jsonOf(await worker.fetch(req('https://x.test/api/class-access/override/end', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }, adminCookie), env));
  if (!endRes.ok || !endRes.hadActiveOverride) return bad('END SCHOOLWIDE ACCESS NOW reports it ended an active override', endRes);
  const afterEnd = await jsonOf(await worker.fetch(req('https://x.test/api/class-access/override/active', { method: 'GET' }, adminCookie), env));
  if (afterEnd.active) return bad('after END SCHOOLWIDE ACCESS NOW, override/active must report inactive immediately (server time, no cleanup job)', afterEnd);
  ok('"END SCHOOLWIDE ACCESS NOW" ends the active override immediately server-side -- the very next status check reports it inactive, purely from current server time');

  const doubleEnd = await jsonOf(await worker.fetch(req('https://x.test/api/class-access/override/end', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }, adminCookie), env));
  if (doubleEnd.hadActiveOverride) return bad('ending an already-ended override should report hadActiveOverride:false, not double-process', doubleEnd);
  ok('ending an override when none is active reports hadActiveOverride:false rather than double-processing');
}

async function testAuditLogCoversCoreSecurityActionsWithoutSecrets() {
  const teacher = account({ username: 'ms_hale', role: 'teacher', teacher_id: 't_hale', display_name: 'Ms. Hale' });
  const admin = account({ username: 'admin_hale', role: 'admin', teacher_id: 't_admin_hale', display_name: 'Admin Hale' });
  const env = makeEnv({ accounts: { ms_hale: teacher, admin_hale: admin } });
  const teacherCookie = await pilotCookieFor(teacher);
  const adminCookie = await pilotCookieFor(admin);

  // request approved, extended, revoked
  const grant = await createAndApproveRequest(env, teacherCookie, 15);
  await worker.fetch(req('https://x.test/api/class-access/requests/extend', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: grant.id, duration_minutes: 15 }) }, teacherCookie), env);
  await worker.fetch(req('https://x.test/api/class-access/requests/revoke', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: grant.id }) }, teacherCookie), env);

  // a second request that gets denied
  const createRes2 = await worker.fetch(req('https://x.test/api/class-access/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proposed_name: 'Another Student' }) }), env);
  const createBody2 = await jsonOf(createRes2);
  const pendingBody2 = await jsonOf(await worker.fetch(req('https://x.test/api/class-access/requests/pending', { method: 'GET' }, teacherCookie), env));
  const row2 = pendingBody2.requests.find((r) => r.requestPhrase === createBody2.requestPhrase);
  await worker.fetch(req('https://x.test/api/class-access/requests/deny', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row2.id }) }, teacherCookie), env);

  // override started + ended (admin-only)
  await worker.fetch(req('https://x.test/api/class-access/override/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ duration_minutes: 15, reason: 'Fire drill' }) }, adminCookie), env);
  await worker.fetch(req('https://x.test/api/class-access/override/end', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }, adminCookie), env);

  const actions = env.DB.__auditLog.map((r) => r.action);
  const expected = ['request_approved', 'grant_extended', 'grant_revoked', 'request_denied', 'override_started', 'override_ended'];
  for (const a of expected) {
    if (!actions.includes(a)) return bad(`audit log must contain a "${a}" entry`, actions);
  }
  ok('lantern_access_audit_log records request_approved / grant_extended / grant_revoked / request_denied / override_started / override_ended for the security actions exercised in this test (#33 audit integration)');

  const allStaffNames = env.DB.__auditLog.map((r) => r.staff_name);
  if (!allStaffNames.every((n) => n === 'Ms. Hale' || n === 'Admin Hale' || n == null)) return bad('audit rows record the acting staff member by name', allStaffNames);
  ok('each audit row records the session-derived acting staff member\'s name (never a client-supplied identity)');

  const rawAudit = JSON.stringify(env.DB.__auditLog);
  if (rawAudit.includes(grant.secret)) return bad('audit log must NEVER contain a raw device secret', rawAudit);
  const auditDetailKeys = new Set();
  env.DB.__auditLog.forEach((r) => { if (r.detail) Object.keys(JSON.parse(r.detail)).forEach((k) => auditDetailKeys.add(k)); });
  const allowedDetailKeys = new Set(['durationMinutes', 'grantExpiresAt', 'deltaMinutes', 'reason', 'expiresAt', 'untilSchoolClose', 'label', 'groupId', 'unlockId']);
  for (const k of auditDetailKeys) {
    if (!allowedDetailKeys.has(k)) return bad('audit detail must only ever contain the specific known-safe fields wired up in index.js, never an unexpected/secret-shaped field', [...auditDetailKeys]);
  }
  ok('no audit log row contains a raw credential secret (device secret, pairing secret, or device token) -- detail objects only ever carry the specific known-safe fields (durations, expiries, labels, reasons) explicitly passed by each route');

  // Enroll + revoke a device, unlock + lock a group -- confirms Phase #32 route audit wiring too.
  const group = await jsonOf(await worker.fetch(req('https://x.test/api/class-access/device/groups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'TMS STEM Lab' }) }, teacherCookie), env));
  const pairRes = await worker.fetch(req('https://x.test/api/class-access/device/pairing/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }), env);
  const pairBody = await jsonOf(pairRes);
  const pendingPairings = await jsonOf(await worker.fetch(req('https://x.test/api/class-access/device/pairings/pending', { method: 'GET' }, teacherCookie), env));
  const pairingRow = pendingPairings.pairings.find((p) => p.pairingPhrase === pairBody.pairingPhrase);
  const approvePairing = await jsonOf(await worker.fetch(req('https://x.test/api/class-access/device/pairings/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: pairingRow.id, label: 'STEM-09', group_id: group.id }) }, teacherCookie), env));
  await worker.fetch(req('https://x.test/api/class-access/device/groups/unlock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ group_id: group.id, duration_minutes: 15 }) }, teacherCookie), env);
  await worker.fetch(req('https://x.test/api/class-access/device/groups/lock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ group_id: group.id }) }, teacherCookie), env);
  await worker.fetch(req('https://x.test/api/class-access/device/devices/revoke', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device_id: approvePairing.deviceId }) }, teacherCookie), env);

  const actions2 = env.DB.__auditLog.map((r) => r.action);
  for (const a of ['device_enrolled', 'group_unlocked', 'group_locked', 'device_revoked']) {
    if (!actions2.includes(a)) return bad(`audit log must also contain a "${a}" entry from the Phase #32 device/group routes`, actions2);
  }
  ok('the Phase #32 device-enrollment and group-unlock/lock routes also write device_enrolled / group_unlocked / group_locked / device_revoked audit entries using the same shared recordAccessAuditEvent helper');
}

// ---------------------------------------------------------------------------

testComputeExtendedGrantExpiresAtBasicAddition();
testComputeExtendedGrantExpiresAtElapsedGrantExtendsFromNow();
testComputeExtendedGrantExpiresAtNeverExceedsCeiling();
await testRecordAccessAuditEventInsertsExpectedRow();
await testRecordAccessAuditEventNeverThrowsOnDbFailure();

await testExtendHappyPathAndValidation();
await testExtendNeverExceedsCeilingEndToEnd();
await testStateReportsEventOverrideInformationalOnly();
await testOverrideStartRequiresAdminAndExplicitExpiration();
await testOverrideDurationsAndCustomBounds();
await testOverrideSupersedesPriorAndEndNow();
await testAuditLogCoversCoreSecurityActionsWithoutSecrets();

console.log('\nschool-access-control-center-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
