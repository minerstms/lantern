/**
 * Prompt #172 — Admin Nugget Adjustment (restore/extend Wallet Adjustment on TMS ledger).
 * Static contracts + worker auth gates for admin_adjustment.
 * Usage: node worker/scripts/admin-nugget-adjustment-172-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import worker from '../index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const html = fs.readFileSync(path.join(root, 'app/admin.html'), 'utf8');
const workerSrc = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
const teacherHtml = fs.readFileSync(path.join(root, 'app/teacher.html'), 'utf8');

let pass = 0;
let fail = 0;
function ok(msg) { pass++; console.log('PASS', msg); }
function bad(msg, d) { fail++; console.error('FAIL', msg, d || ''); }

// ---- UI ----
if (/Nugget Adjustment/.test(html) && /id="walletAdjustmentCard"/.test(html)) {
  ok('Admin panel titled Nugget Adjustment (legacy card id retained)');
} else bad('Nugget Adjustment panel missing');

if (!/>\s*Wallet Adjustment\s*</.test(html) && !/<div class="h">Wallet Adjustment<\/div>/.test(html)) {
  ok('Visible Wallet Adjustment label removed');
} else bad('Wallet Adjustment label still visible');

if (/id="walletAdjSearch"/.test(html) && /\+1/.test(html) && /\+5/.test(html) && /\+10/.test(html) && /\+25/.test(html)) {
  ok('Search + quick amounts present');
} else bad('search/quick amounts missing');

if (/walletAdjDirection/.test(html) && /Add/.test(html) && /Remove/.test(html)) {
  ok('Add/Remove direction controls present');
} else bad('direction controls missing');

if (/staff:<username>|staff:' \+ un|staff:'\s*\+\s*un/.test(html) || /'staff:' \+ un/.test(html) || /"staff:" \+ un/.test(html) || /staff:' \+ un/.test(html)) {
  ok('Staff targets resolve to staff:<username> economy key');
} else if (/staff:' \+/.test(html) || /'staff:'\s*\+/.test(html)) {
  ok('Staff targets resolve to staff:<username> economy key');
} else bad('staff economy key wiring missing');

if (/kind:\s*'admin_adjustment'/.test(html) && /idempotency_key/.test(html)) {
  ok('UI posts admin_adjustment with idempotency_key');
} else bad('admin_adjustment / idempotency missing in UI');

if (/id="walletAdjustmentCard"[^>]*open/.test(html) === false ||
    /<details class="card teacherCollapsibleList" id="walletAdjustmentCard"(?![^>]*\sopen)/.test(html)) {
  ok('Nugget Adjustment defaults collapsed');
} else bad('Nugget Adjustment should default closed');

if (!/walletAdjustmentCard/.test(teacherHtml) && !/admin_adjustment/.test(teacherHtml)) {
  ok('Teacher Tools has no Nugget Adjustment / admin_adjustment UI');
} else bad('Teacher page must not expose admin adjustment UI');

// ---- Worker source gates ----
if (/kind === 'admin_adjustment'/.test(workerSrc) && /reason_required/.test(workerSrc)) {
  ok('Worker enforces admin_adjustment reason_required');
} else bad('Worker reason gate missing');

if (/kind === 'admin_adjustment'[\s\S]{0,500}role !== 'admin'/.test(workerSrc)) {
  ok('Worker admin_adjustment is admin-only (unless economy secret)');
} else bad('Worker admin-only gate missing');

if (/meta\.initiated_by = actorUsername/.test(workerSrc) || /initiated_by = actorUsername/.test(workerSrc)) {
  ok('Worker overwrites actor metadata from session');
} else bad('Worker actor metadata overwrite missing');

// ---- Live worker auth integration ----
const TEST_SECRET = 'test-secret-nugget-adj-172';

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
    sub: account.username, role: account.role, scn: null, tid: account.teacher_id || null,
    iat: now, exp: now + 3600,
  }, TEST_SECRET);
  return `lantern_pilot=${token}`;
}

function makeEnv(accounts) {
  return {
    PILOT_SESSION_SECRET: TEST_SECRET,
    TMS_LANTERN_BRIDGE_SECRET: 'bridge-secret',
    TMS_NUGGETS_API_BASE_URL: 'https://tms.test',
    DB: {
      prepare(sql) {
        const s = String(sql);
        const binds = [];
        const api = {
          bind(...args) { binds.push(...args); return api; },
          async first() {
            if (s.includes('FROM lantern_pilot_accounts WHERE lower(trim(username))')) {
              const key = String(binds[0] || '').trim().toLowerCase();
              return accounts[key] || null;
            }
            if (s.includes('FROM tms_identity_links')) {
              const u = String(binds[0] || '').trim().toLowerCase();
              if (u === 'rradle') return { tms_staff_id: 'tms_staff_rick' };
              return null;
            }
            return null;
          },
          async run() { return { meta: { changes: 1 } }; },
          async all() { return { results: [] }; },
        };
        return api;
      },
    },
  };
}

function req(body, cookie) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  return new Request('https://x.test/api/economy/transact', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

async function jsonOf(res) {
  const t = await res.text();
  try { return { status: res.status, body: JSON.parse(t) }; } catch (_) { return { status: res.status, body: t }; }
}

const accounts = {
  teacher1: {
    username: 'teacher1', display_name: 'Ms Carter', role: 'teacher', teacher_id: 't1',
    password_hash: 'x', password_salt: 'y', is_active: 1, must_change_password: 0,
  },
  '20889': {
    username: '20889', display_name: 'Lucas', role: 'student', mtss_student_id: '20889',
    password_hash: 'x', password_salt: 'y', is_active: 1, must_change_password: 0,
  },
  rradle: {
    username: 'rradle', display_name: 'Rick Radle', role: 'admin', teacher_id: 'admin1',
    password_hash: 'x', password_salt: 'y', is_active: 1, must_change_password: 0,
  },
};

const env = makeEnv(accounts);
const teacherCookie = await cookieFor(accounts.teacher1);
const studentCookie = await cookieFor(accounts['20889']);
const adminCookie = await cookieFor(accounts.rradle);

{
  const res = await jsonOf(await worker.fetch(req({
    character_name: '20889', delta: 5, kind: 'admin_adjustment', note: 'Game testing', source: 'ADMIN_PANEL',
    meta: { idempotency_key: 't1' },
  }, teacherCookie), env));
  if (res.status === 403 && res.body && res.body.error === 'forbidden') ok('Teacher cannot call admin_adjustment');
  else bad('Teacher admin_adjustment must 403', res);
}

{
  const res = await jsonOf(await worker.fetch(req({
    character_name: '20889', delta: 5, kind: 'admin_adjustment', note: 'Game testing',
    meta: { idempotency_key: 's1' },
  }, studentCookie), env));
  if (res.status === 403 && res.body && (res.body.error === 'forbidden')) ok('Student cannot call admin_adjustment');
  else bad('Student admin_adjustment must 403', res);
}

{
  const res = await jsonOf(await worker.fetch(req({
    character_name: 'staff:rradle', delta: 5, kind: 'admin_adjustment', note: '   ',
    meta: { idempotency_key: 'a0' },
  }, adminCookie), env));
  if (res.status === 400 && res.body && res.body.error === 'reason_required') ok('Admin empty reason rejected');
  else bad('Empty reason must be reason_required', res);
}

const origFetch = globalThis.fetch;
const bridgeCalls = [];
globalThis.fetch = async (url, opts) => {
  const u = String(url);
  bridgeCalls.push({ url: u, body: opts && opts.body ? JSON.parse(opts.body) : null });
  if (u.includes('/api/lantern-bridge/economy/transact')) {
    const body = opts && opts.body ? JSON.parse(opts.body) : {};
    return new Response(JSON.stringify({
      ok: true,
      idempotent: body.reference === 'lantern:admin_adjustment:dup-key',
      tms_staff_id: body.tms_staff_id,
      student_id: body.student_id,
      delta: body.delta,
      earned: 25,
      spent: 0,
      available: body.reference === 'lantern:admin_adjustment:dup-key' ? 25 : (Number(body.delta) > 0 ? 25 : 20),
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify({ ok: false }), { status: 404 });
};

try {
  const first = await jsonOf(await worker.fetch(req({
    character_name: 'staff:rradle',
    delta: 25,
    kind: 'admin_adjustment',
    source: 'ADMIN_PANEL',
    note: 'Game testing',
    meta: { idempotency_key: 'self-adj-1', initiated_by: 'spoofed_attacker' },
  }, adminCookie), env));
  if (first.status === 200 && first.body && first.body.ok && first.body.balance_after === 25) {
    ok('Admin can self-adjust staff:rradle via TMS staff ledger');
  } else bad('Admin self-adjust failed', first);

  const call = bridgeCalls.find((c) => c.url.includes('/economy/transact'));
  if (call && call.body && call.body.principal_type === 'staff' && call.body.tms_staff_id === 'tms_staff_rick'
      && call.body.kind === 'admin_adjustment' && /Game testing/.test(call.body.note || '')
      && /Rick Radle/.test(call.body.note || '') && call.body.reference === 'lantern:admin_adjustment:self-adj-1') {
    ok('TMS bridge receives staff principal, reason+actor note, stable reference');
  } else bad('TMS bridge payload incorrect', call);

  bridgeCalls.length = 0;
  const dup1 = await jsonOf(await worker.fetch(req({
    character_name: 'staff:rradle', delta: 5, kind: 'admin_adjustment', note: 'Game testing',
    meta: { idempotency_key: 'dup-key' },
  }, adminCookie), env));
  const dup2 = await jsonOf(await worker.fetch(req({
    character_name: 'staff:rradle', delta: 5, kind: 'admin_adjustment', note: 'Game testing',
    meta: { idempotency_key: 'dup-key' },
  }, adminCookie), env));
  if (dup1.body && dup1.body.ok && dup2.body && dup2.body.ok && dup2.body.idempotent === true) {
    ok('Retry with same idempotency_key reports idempotent (no double credit)');
  } else bad('Idempotent retry behavior', { dup1, dup2 });

  bridgeCalls.length = 0;
  const studentAdj = await jsonOf(await worker.fetch(req({
    character_name: '20889', delta: 1, kind: 'admin_adjustment', note: 'Student reward correction',
    meta: { idempotency_key: 'stu-1' },
  }, adminCookie), env));
  if (studentAdj.status === 200 && studentAdj.body && studentAdj.body.ok) ok('Admin can adjust student TMS ledger target');
  else bad('Student target adjustment failed', studentAdj);
  const stuCall = bridgeCalls.find((c) => c.url.includes('/economy/transact'));
  if (stuCall && stuCall.body && stuCall.body.student_id === '20889' && !stuCall.body.principal_type) {
    ok('Student adjustment uses student_id TMS path');
  } else bad('Student TMS path wrong', stuCall);
} finally {
  globalThis.fetch = origFetch;
}

console.log('\nadmin-nugget-adjustment-172-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
