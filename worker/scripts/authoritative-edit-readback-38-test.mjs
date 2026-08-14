/**
 * Prompt #38 — Lantern Admin identified-student edit read-back (no false success).
 * Usage: node worker/scripts/authoritative-edit-readback-38-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import worker from '../index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
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

async function adminCookie() {
  const now = Math.floor(Date.now() / 1000);
  const token = await signTestJwt({
    sub: 'admin',
    role: 'admin',
    scn: null,
    tid: null,
    iat: now,
    exp: now + 3600,
  }, TEST_PILOT_SECRET);
  return `lantern_pilot=${token}`;
}

function makeEnv() {
  const accounts = {
    admin: {
      username: 'admin',
      display_name: 'Web Admin',
      role: 'admin',
      is_active: 1,
      must_change_password: 0,
      password_hash: 'HASH_SHOULD_NEVER_APPEAR',
      password_salt: 'SALT_SHOULD_NEVER_APPEAR',
    },
  };
  function prepare(sql) {
    const s = String(sql);
    const binds = [];
    const api = {
      bind(...args) { binds.push(...args); return api; },
      async first() {
        if (s.includes('FROM lantern_pilot_accounts WHERE lower(trim(username))')) {
          return accounts[String(binds[0] || '').trim().toLowerCase()] || null;
        }
        return null;
      },
      async all() { return { results: [] }; },
      async run() { return { success: true, meta: { changes: 0 } }; },
    };
    return api;
  }
  return {
    DB: { prepare },
    PILOT_SESSION_SECRET: TEST_PILOT_SECRET,
    TMS_LANTERN_BRIDGE_SECRET: TEST_BRIDGE_SECRET,
    TMS_NUGGETS_API_BASE_URL: 'https://tms.test',
  };
}

function req(cookie, body) {
  return new Request('https://lantern.test/api/admin/tms-roster/update', {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const originalFetch = globalThis.fetch;

async function withBridge(handler, fn) {
  globalThis.fetch = async (url, init) => {
    const parsed = JSON.parse(init && init.body ? init.body : '{}');
    const result = await handler(String(url), parsed);
    const status = result && result._httpStatus ? result._httpStatus : (result && result.ok === false ? 400 : 200);
    const body = { ...(result || {}) };
    delete body._httpStatus;
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    return await fn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

const adminHtml = fs.readFileSync(path.join(root, 'app/admin.html'), 'utf8');
const indexSrc = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');

if (adminHtml.includes('authoritative_update_not_applied') && adminHtml.includes('The editor is still open') && adminHtml.includes('res.body.verified')) {
  ok('19. UI cannot show success on mismatch');
} else bad('UI mismatch gate');
if (indexSrc.includes('bridge.verified') && indexSrc.includes('authoritative_update_not_applied')) {
  ok('Lantern refuses unverified TMS update responses');
} else bad('Lantern gate');

const payload = {
  previous_student_name: 'Phay Son Khuu',
  previous_student_id: '21004',
  first_name: 'Phayson',
  last_name: 'Khuu',
  student_id: '21004',
  grade: '7',
};

async function run() {
  const cookie = await adminCookie();

  await withBridge(async (_url, body) => ({
    ok: true,
    verified: true,
    student_name: [body.first_name, body.last_name].filter(Boolean).join(' '),
    student_id: body.student_id,
    first_name: body.first_name,
    last_name: body.last_name,
    previous_student_name: 'Phay Son Khuu',
    previous_student_id: '21004',
    grade: '7',
    grade_slug: 'grade-7',
    identity_changed: true,
  }), async () => {
    const good = await worker.fetch(req(cookie, payload), makeEnv());
    const goodBody = await good.json();
    if (good.status === 200 && goodBody.ok && goodBody.verified && goodBody.student_name === 'Phayson Khuu' && goodBody.student_id === '21004') {
      ok('16. returned success uses reread/verified data');
    } else bad('verified success', { status: good.status, body: goodBody });
  });

  await withBridge(async () => ({
    ok: true,
    verified: false,
    student_name: 'Phay Son Khuu',
    student_id: '21004',
  }), async () => {
    const badRes = await worker.fetch(req(cookie, payload), makeEnv());
    const badBody = await badRes.json();
    if (badRes.status === 409 && badBody.error === 'authoritative_update_not_applied' && badBody.ok !== true) {
      ok('18. mismatch / unverified TMS response RETURNS FAILURE');
    } else bad('unverified', { status: badRes.status, body: badBody });
  });

  await withBridge(async () => ({
    ok: true,
    verified: true,
    student_name: 'Phay Son Khuu',
    student_id: '21004',
  }), async () => {
    const mm = await worker.fetch(req(cookie, payload), makeEnv());
    const mmBody = await mm.json();
    if (mm.status === 409 && mmBody.code === 'authoritative_update_not_applied') {
      ok('requested name vs reread name mismatch fails');
    } else bad('name mismatch', { status: mm.status, body: mmBody });
  });

  console.log('\nauthoritative-edit-readback-38-test:', pass, 'PASS', fail, 'FAIL');
  if (fail) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
