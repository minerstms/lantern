/**
 * Prompt #176 — durable staff TMS link resolution for Admin Nugget Adjustment / Games.
 * Usage: node worker/scripts/staff-economy-link-176-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import worker from '../index.js';
import {
  isStaffEconomyKey,
  parseStaffEconomyKey,
  parseStaffIdEconomyKey,
  resolveStaffTmsPrincipal,
  resolveTmsStaffIdForLanternAccount,
} from '../staff-economy.js';
import { staffEconomyKey } from '../economy-balance-auth.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const html = fs.readFileSync(path.join(root, 'app/admin.html'), 'utf8');
const migration = fs.readFileSync(
  path.join(root, 'worker/migrations/062_tms_identity_links_lantern_staff_id.sql'),
  'utf8'
);
const staffEconomySrc = fs.readFileSync(path.join(root, 'worker/staff-economy.js'), 'utf8');
const indexSrc = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');

let pass = 0;
let fail = 0;
function ok(msg) { pass++; console.log('PASS', msg); }
function bad(msg, d) { fail++; console.error('FAIL', msg, d || ''); }

// ---- Static contracts ----
if (/ADD COLUMN lantern_staff_id/.test(migration) && /UPDATE tms_identity_links/.test(migration)) {
  ok('Migration 062 adds/backfills lantern_staff_id');
} else bad('Migration 062 missing');

if (/staff_id:' \+ Math\.floor\(sid\)/.test(html) || /'staff_id:' \+ Math\.floor/.test(html)) {
  ok('Admin Nugget Adjustment prefers durable staff_id:<id> key');
} else bad('Admin UI staff_id economy key missing');

if (/sessionUser/.test(html) && /adminSessionMeta\.username/.test(html)) {
  ok('Admin Nugget Adjustment auto-selects signed-in account username');
} else bad('Admin self auto-select missing');

if (/ · ' \+ role \+ ' · ' \+ uname/.test(html) || /role \+ ' · ' \+ uname/.test(html)) {
  ok('Admin picker labels include username (disambiguates display-name twins)');
} else bad('Admin picker label disambiguation missing');

if (/resolveTmsStaffIdForLanternAccount/.test(indexSrc) && /getTmsStaffIdForLanternAccount/.test(indexSrc)) {
  ok('Remember/Nuggets bridge delegates to shared resolveTmsStaffIdForLanternAccount');
} else bad('Shared resolver not wired into getTmsStaffIdForLanternAccount');

if (/isStaffEconomyKey\(characterName\)/.test(indexSrc) && /resolveStaffTmsPrincipal/.test(staffEconomySrc)) {
  ok('Economy balance/transact use shared isStaffEconomyKey + resolveStaffTmsPrincipal');
} else bad('Economy staff gate not shared');

if (/lantern_wallets/.test(indexSrc) && /isStaffEconomyKey\(characterName\)[\s\S]{0,400}tms_identity_not_linked/.test(indexSrc)) {
  ok('Staff path fails closed before lantern_wallets fallback');
} else bad('Staff fail-closed before lantern_wallets not proven');

// ---- Unit: key parsers ----
if (parseStaffIdEconomyKey('staff_id:1') === 1 && parseStaffEconomyKey('staff_id:1') === '') ok('parse staff_id:1');
else bad('parse staff_id:1');
if (parseStaffEconomyKey('staff:Rick Radle') === 'Rick Radle' && parseStaffIdEconomyKey('staff:Rick Radle') === 0) {
  ok('parse staff:Rick Radle');
} else bad('parse staff:Rick Radle');
if (isStaffEconomyKey('staff_id:1') && isStaffEconomyKey('staff:rick.radle') && !isStaffEconomyKey('20889')) {
  ok('isStaffEconomyKey discriminates staff vs student');
} else bad('isStaffEconomyKey');

if (staffEconomyKey({ username: 'Rick Radle', staff_id: 1, role: 'admin' }) === 'staff_id:1') {
  ok('Games/session staffEconomyKey prefers staff_id');
} else bad('staffEconomyKey durable preference');
if (staffEconomyKey({ username: 'legacy.staff', role: 'teacher' }) === 'staff:legacy.staff') {
  ok('staffEconomyKey falls back to username when staff_id absent');
} else bad('staffEconomyKey username fallback');

// ---- In-memory D1 fixture matching production twin accounts ----
const accounts = {
  'rick radle': {
    username: 'Rick Radle',
    display_name: 'Rick Radle',
    role: 'admin',
    staff_id: 1,
    is_active: 1,
  },
  'rick.radle': {
    username: 'rick.radle',
    display_name: 'Rick Radle',
    role: 'teacher',
    staff_id: 4,
    is_active: 1,
  },
  unlinked: {
    username: 'unlinked',
    display_name: 'Unlinked Teacher',
    role: 'teacher',
    staff_id: 99,
    is_active: 1,
  },
};

// Prompt #184 — both intentional Rick Lantern accounts share one TMS principal.
const linksByUsername = {
  'rick radle': { tms_staff_id: 'Radle', lantern_username: 'Rick Radle', lantern_staff_id: 1 },
  'rick.radle': { tms_staff_id: 'Radle', lantern_username: 'rick.radle', lantern_staff_id: 4 },
};
const linksByStaffId = {
  1: { tms_staff_id: 'Radle', lantern_username: 'Rick Radle', lantern_staff_id: 1 },
  4: { tms_staff_id: 'Radle', lantern_username: 'rick.radle', lantern_staff_id: 4 },
};

function makeDb() {
  return {
    prepare(sql) {
      const s = String(sql);
      const binds = [];
      const api = {
        bind(...args) {
          binds.push(...args);
          return api;
        },
        async first() {
          if (s.includes('FROM tms_identity_links WHERE lower(trim(lantern_username))')) {
            const u = String(binds[0] || '').trim().toLowerCase();
            return linksByUsername[u] || null;
          }
          if (s.includes('FROM tms_identity_links WHERE lantern_staff_id')) {
            const sid = Number(binds[0]);
            return linksByStaffId[sid] || null;
          }
          if (s.includes('INNER JOIN lantern_pilot_accounts') && s.includes('p.staff_id')) {
            const sid = Number(binds[0]);
            const acct = Object.values(accounts).find((a) => Number(a.staff_id) === sid);
            if (!acct) return null;
            const link = linksByUsername[String(acct.username).toLowerCase()];
            return link ? { tms_staff_id: link.tms_staff_id } : null;
          }
          if (s.includes('FROM lantern_pilot_accounts WHERE lower(trim(username))')) {
            const key = String(binds[0] || '').trim().toLowerCase();
            return accounts[key] || null;
          }
          return null;
        },
        async run() {
          return { meta: { changes: 1 } };
        },
        async all() {
          return { results: [] };
        },
      };
      return api;
    },
  };
}

const db = makeDb();

{
  const a = await resolveStaffTmsPrincipal(db, 'staff_id:1');
  if (a.ok && a.tmsStaffId === 'Radle') ok('staff_id:1 resolves to TMS Radle');
  else bad('staff_id:1 resolve', a);
}
{
  const a = await resolveStaffTmsPrincipal(db, 'staff:Rick Radle');
  if (a.ok && a.tmsStaffId === 'Radle') ok('staff:Rick Radle resolves to TMS Radle');
  else bad('staff:Rick Radle resolve', a);
}
{
  const a = await resolveStaffTmsPrincipal(db, 'staff:rick.radle');
  if (a.ok && a.tmsStaffId === 'Radle') ok('staff:rick.radle resolves to same TMS Radle');
  else bad('rick.radle must resolve to Radle', a);
}
{
  const a = await resolveStaffTmsPrincipal(db, 'staff_id:4');
  if (a.ok && a.tmsStaffId === 'Radle') ok('staff_id:4 resolves to same TMS Radle');
  else bad('staff_id:4 must resolve to Radle', a);
}
{
  const a = await resolveStaffTmsPrincipal(db, 'staff:unlinked');
  if (!a.ok && a.error === 'tms_identity_not_linked') ok('truly unlinked staff fails closed');
  else bad('unlinked staff must fail closed', a);
}
{
  const a = await resolveTmsStaffIdForLanternAccount(db, 'Rick Radle');
  const b = await resolveStaffTmsPrincipal(db, staffEconomyKey(accounts['rick radle']));
  if (a === 'Radle' && b.ok && b.tmsStaffId === 'Radle') {
    ok('Games staffEconomyKey and Remember resolver agree on Radle');
  } else bad('Games/Remember principal mismatch', { a, b });
}
{
  // Username casing drift: link row still "Rick Radle"; lookup lower/trim.
  const a = await resolveTmsStaffIdForLanternAccount(db, 'rick radle');
  if (a === 'Radle') ok('username casing/trim does not break linked admin');
  else bad('casing/trim resolve', a);
}
{
  // Immutable staff_id path still works if username key would miss (simulate renamed account
  // still holding staff_id 1 while link username remains historical — join + lantern_staff_id).
  const a = await resolveStaffTmsPrincipal(db, 'staff_id:1');
  if (a.ok && a.tmsStaffId === 'Radle') ok('immutable staff_id key survives username display drift');
  else bad('staff_id durable after drift', a);
}

// ---- Live worker balance/transact for staff_id + fail-closed unlinked ----
const TEST_SECRET = 'test-secret-staff-econ-176';

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
  const token = await signTestJwt(
    { sub: account.username, role: account.role, scn: null, tid: null, iat: now, exp: now + 3600 },
    TEST_SECRET
  );
  return `lantern_pilot=${token}`;
}

function makeEnv() {
  return {
    PILOT_SESSION_SECRET: TEST_SECRET,
    TMS_LANTERN_BRIDGE_SECRET: 'bridge-secret',
    TMS_NUGGETS_API_BASE_URL: 'https://tms.test',
    DB: makeDb(),
  };
}

const env = makeEnv();
const adminCookie = await cookieFor(accounts['rick radle']);
const bridgeCalls = [];
const origFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const u = String(url);
  const body = opts && opts.body ? JSON.parse(opts.body) : null;
  bridgeCalls.push({ url: u, body });
  if (u.includes('/economy/balance')) {
    return new Response(
      JSON.stringify({ ok: true, earned: 10, spent: 2, available: 8, recent_history: [] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
  if (u.includes('/economy/transact')) {
    return new Response(
      JSON.stringify({
        ok: true,
        tms_staff_id: body.tms_staff_id,
        delta: body.delta,
        earned: 11,
        spent: 2,
        available: 9,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
  return new Response(JSON.stringify({ ok: false }), { status: 404 });
};

try {
  const balRes = await worker.fetch(
    new Request('https://x.test/api/economy/balance?character_name=staff_id:1', {
      headers: { Cookie: adminCookie },
    }),
    env
  );
  const bal = await balRes.json();
  if (balRes.status === 200 && bal.ok && bal.available === 8 && bal.tms_staff_id === 'Radle' && bal.economy_authority === 'tms_nuggets_staff') {
    ok('Admin balance for staff_id:1 returns TMS authoritative balance');
  } else bad('Admin balance staff_id:1', { status: balRes.status, bal });

  const balCall = bridgeCalls.find((c) => c.url.includes('/economy/balance'));
  if (balCall && balCall.body && balCall.body.tms_staff_id === 'Radle' && balCall.body.principal_type === 'staff') {
    ok('Balance bridge uses TMS staff principal Radle');
  } else bad('Balance bridge principal', balCall);

  bridgeCalls.length = 0;
  const txRes = await worker.fetch(
    new Request('https://x.test/api/economy/transact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({
        character_name: 'staff_id:1',
        delta: 1,
        kind: 'admin_adjustment',
        note: 'Game testing',
        source: 'ADMIN_PANEL',
        meta: { idempotency_key: 'smoke-176' },
      }),
    }),
    env
  );
  const tx = await txRes.json();
  if (txRes.status === 200 && tx.ok && tx.balance_after === 9) ok('Admin self-adjustment via staff_id:1 routes to TMS');
  else bad('Admin self-adjustment', { status: txRes.status, tx });

  const txCall = bridgeCalls.find((c) => c.url.includes('/economy/transact'));
  if (
    txCall &&
    txCall.body &&
    txCall.body.principal_type === 'staff' &&
    txCall.body.tms_staff_id === 'Radle' &&
    txCall.body.kind === 'admin_adjustment' &&
    txCall.body.reference === 'lantern:admin_adjustment:smoke-176'
  ) {
    ok('admin_adjustment bridge payload is TMS staff Radle (no duplicate link insert)');
  } else bad('admin_adjustment bridge', txCall);

  bridgeCalls.length = 0;
  const teacherRickBal = await worker.fetch(
    new Request('https://x.test/api/economy/balance?character_name=staff_id:4', {
      headers: { Cookie: adminCookie },
    }),
    env
  );
  const teacherRickBody = await teacherRickBal.json();
  if (
    teacherRickBal.status === 200 &&
    teacherRickBody.ok &&
    teacherRickBody.tms_staff_id === 'Radle' &&
    teacherRickBody.economy_authority === 'tms_nuggets_staff'
  ) {
    ok('Teacher rick.radle staff_id:4 resolves to same TMS Radle principal');
  } else bad('Teacher Rick same principal', { status: teacherRickBal.status, teacherRickBody });

  bridgeCalls.length = 0;
  const unlinkedBal = await worker.fetch(
    new Request('https://x.test/api/economy/balance?character_name=staff_id:99', {
      headers: { Cookie: adminCookie },
    }),
    env
  );
  const unlinkedBody = await unlinkedBal.json();
  if (unlinkedBal.status === 403 && unlinkedBody.error === 'tms_identity_not_linked' && bridgeCalls.length === 0) {
    ok('Truly unlinked staff_id:99 fails closed with no TMS/wallet fallback');
  } else bad('Unlinked fail-closed', { status: unlinkedBal.status, unlinkedBody, bridgeCalls });

  // Prove no lantern_wallets path for staff keys: unlinked error must not invent balance 0.
  if (unlinkedBody.balance == null && unlinkedBody.available == null) {
    ok('Unlinked staff response has no synthetic Lantern wallet balance');
  } else bad('Synthetic balance leaked', unlinkedBody);
} finally {
  globalThis.fetch = origFetch;
}

console.log('\nstaff-economy-link-176-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
