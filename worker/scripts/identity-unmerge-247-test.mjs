/**
 * Prompt #247 — Unmerge Lantern admin / Web Admin from TMS Radle.
 * Proves rick.radle → Radle, admin → WebAdmin, deana.pachelli → Pachelli.
 *
 * Usage: node worker/scripts/identity-unmerge-247-test.mjs
 */
import worker from '../index.js';
import {
  resolveTmsStaffIdForLanternAccount,
  resolvePrimaryLanternUsernameForTmsStaff,
  resolveStaffTmsPrincipal,
} from '../staff-economy.js';

let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }

const TEST_PILOT_SECRET = 'test-secret-not-a-real-pilot-session-secret';
const TEST_BRIDGE_SECRET = 'test-bridge-secret-not-real';

const ACCOUNTS = {
  admin: {
    username: 'admin',
    display_name: 'Web Admin',
    first_name: 'Web',
    last_name: 'Admin',
    role: 'admin',
    staff_id: 1,
    teacher_id: null,
    is_active: 1,
    must_change_password: 0,
    password_hash: 'x',
    password_salt: 'y',
  },
  'rick.radle': {
    username: 'rick.radle',
    display_name: 'Rick Radle',
    first_name: 'Rick',
    last_name: 'Radle',
    role: 'teacher',
    staff_id: 4,
    teacher_id: null,
    is_active: 1,
    must_change_password: 0,
    password_hash: 'x',
    password_salt: 'y',
  },
  'deana.pachelli': {
    username: 'deana.pachelli',
    display_name: 'Deana Pachelli',
    first_name: 'Deana',
    last_name: 'Pachelli',
    role: 'teacher',
    staff_id: 12,
    teacher_id: null,
    email: 'deana.pachelli@trinidad.k12.co.us',
    is_active: 1,
    must_change_password: 0,
    password_hash: 'x',
    password_salt: 'y',
  },
};

const LINKS = [
  { id: 20, tms_staff_id: 'Radle', lantern_username: 'rick.radle', lantern_staff_id: 4, is_primary: 1 },
  { id: 1, tms_staff_id: 'WebAdmin', lantern_username: 'admin', lantern_staff_id: 1, is_primary: 1 },
  { id: 4, tms_staff_id: 'Pachelli', lantern_username: 'deana.pachelli', lantern_staff_id: 12, is_primary: 1 },
];

function makeDb() {
  function prepare(sql) {
    const s = String(sql);
    const binds = [];
    const api = {
      bind(...args) { binds.push(...args); return api; },
      async first() {
        if (s.includes('FROM lantern_pilot_accounts WHERE lower(trim(username))')) {
          const key = String(binds[0] || '').trim().toLowerCase();
          return ACCOUNTS[key] || null;
        }
        if (s.includes('FROM tms_identity_links WHERE lower(trim(lantern_username))')) {
          const u = String(binds[0] || '').trim().toLowerCase();
          return LINKS.find((l) => l.lantern_username.toLowerCase() === u) || null;
        }
        if (s.includes('FROM tms_identity_links WHERE lantern_staff_id')) {
          const sid = Number(binds[0]);
          return LINKS.find((l) => Number(l.lantern_staff_id) === sid) || null;
        }
        if (s.includes('FROM tms_identity_links') && s.includes('is_primary = 1')) {
          const tms = String(binds[0] || '').trim();
          return LINKS.find((l) => l.tms_staff_id === tms && Number(l.is_primary) === 1) || null;
        }
        if (s.includes('SELECT COUNT(*) AS n FROM tms_identity_links WHERE tms_staff_id')) {
          const tms = String(binds[0] || '').trim();
          return { n: LINKS.filter((l) => l.tms_staff_id === tms).length };
        }
        if (s.includes('INNER JOIN lantern_pilot_accounts')) {
          const sid = Number(binds[0]);
          const acct = Object.values(ACCOUNTS).find((a) => Number(a.staff_id) === sid);
          if (!acct) return null;
          const link = LINKS.find((l) => l.lantern_username === acct.username);
          return link ? { tms_staff_id: link.tms_staff_id } : null;
        }
        return null;
      },
      async all() { return { results: [] }; },
      async run() { return { success: true, meta: { changes: 1 } }; },
    };
    return api;
  }
  return { prepare };
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
  const token = await signTestJwt({
    sub: account.username,
    role: account.role,
    scn: null,
    tid: account.teacher_id || null,
    iat: now,
    exp: now + 3600,
  }, TEST_PILOT_SECRET);
  return `lantern_pilot=${token}`;
}

function env() {
  return {
    DB: makeDb(),
    PILOT_SESSION_SECRET: TEST_PILOT_SECRET,
    TMS_LANTERN_BRIDGE_SECRET: TEST_BRIDGE_SECRET,
    TMS_NUGGETS_API_BASE_URL: 'https://mtss-behavior-log.mrradle.workers.dev',
  };
}

async function jsonOf(res) {
  const text = await res.text();
  try { return JSON.parse(text); } catch (_) { return { raw: text }; }
}

async function testResolvers() {
  const db = makeDb();
  const rick = await resolveTmsStaffIdForLanternAccount(db, 'rick.radle');
  const admin = await resolveTmsStaffIdForLanternAccount(db, 'admin');
  const deana = await resolveTmsStaffIdForLanternAccount(db, 'deana.pachelli');
  if (rick === 'Radle') ok('1. rick.radle resolves to Radle');
  else bad('rick.radle resolver', rick);
  if (admin === 'WebAdmin') ok('3. admin resolves to WebAdmin');
  else bad('admin resolver', admin);
  if (deana === 'Pachelli') ok('5. deana.pachelli resolves to Pachelli');
  else bad('deana resolver', deana);
  if (ACCOUNTS['deana.pachelli'].email === 'deana.pachelli@trinidad.k12.co.us'
    && ACCOUNTS['deana.pachelli'].email !== 'mrradle@gmail.com') {
    ok('Deana Lantern email is deana.pachelli@trinidad.k12.co.us, not Rick personal gmail');
  } else bad('Deana Lantern email wrong', ACCOUNTS['deana.pachelli'].email);
  if (rick !== admin) ok('rick.radle and admin resolve to different TMS principals');
  else bad('still merged', { rick, admin });

  const rickPrimary = await resolvePrimaryLanternUsernameForTmsStaff(db, 'Radle');
  const webPrimary = await resolvePrimaryLanternUsernameForTmsStaff(db, 'WebAdmin');
  const deanaPrimary = await resolvePrimaryLanternUsernameForTmsStaff(db, 'Pachelli');
  if (rickPrimary.ok && rickPrimary.lantern_username === 'rick.radle') ok('Radle reverse SSO primary is rick.radle');
  else bad('Radle primary', rickPrimary);
  if (webPrimary.ok && webPrimary.lantern_username === 'admin') ok('WebAdmin reverse SSO primary is admin');
  else bad('WebAdmin primary', webPrimary);
  if (deanaPrimary.ok && deanaPrimary.lantern_username === 'deana.pachelli') ok('Pachelli reverse SSO primary is deana.pachelli');
  else bad('Pachelli primary', deanaPrimary);

  const rickEcon = await resolveStaffTmsPrincipal(db, 'staff:rick.radle');
  const adminEcon = await resolveStaffTmsPrincipal(db, 'staff:admin');
  if (rickEcon.ok && rickEcon.tmsStaffId === 'Radle' && adminEcon.ok && adminEcon.tmsStaffId === 'WebAdmin') {
    ok('Nugget/economy staff keys resolve to distinct principals');
  } else bad('economy principals', { rickEcon, adminEcon });
}

async function testLinkStatus() {
  async function statusFor(username) {
    const account = ACCOUNTS[username];
    const cookie = await cookieFor(account);
    const res = await worker.fetch(new Request('https://tmslantern.org/api/auth/tms-link-status', {
      method: 'GET',
      headers: { Cookie: cookie },
    }), env());
    return jsonOf(res);
  }
  const rick = await statusFor('rick.radle');
  const admin = await statusFor('admin');
  const deana = await statusFor('deana.pachelli');
  if (rick.ok && rick.linked && rick.tms_staff_id === 'Radle') ok('tms-link-status rick.radle → Radle');
  else bad('link-status rick', rick);
  if (admin.ok && admin.linked && admin.tms_staff_id === 'WebAdmin') ok('tms-link-status admin → WebAdmin');
  else bad('link-status admin', admin);
  if (deana.ok && deana.linked && deana.tms_staff_id === 'Pachelli') ok('tms-link-status deana.pachelli → Pachelli');
  else bad('link-status deana', deana);
  if (rick.tms_staff_id !== admin.tms_staff_id) ok('link-status principals are distinct');
  else bad('link-status still merged', { rick, admin });
}

async function withMockedMint(handler, fn) {
  const orig = globalThis.fetch;
  let last = null;
  globalThis.fetch = async (url, opts) => {
    last = { url: String(url), opts: opts || {} };
    const out = handler(last);
    return {
      ok: true,
      status: 200,
      json: async () => out.body,
      text: async () => JSON.stringify(out.body),
    };
  };
  try {
    await fn(() => last);
  } finally {
    globalThis.fetch = orig;
  }
}

async function testDeviceAuthorizeDistinct() {
  const e = env();
  await withMockedMint((call) => {
    const body = JSON.parse(call.opts.body);
    if (body.lantern_username === 'admin' && body.tms_staff_id !== 'WebAdmin') {
      throw new Error('admin mint must target WebAdmin: ' + JSON.stringify(body));
    }
    if (body.lantern_username === 'rick.radle' && body.tms_staff_id !== 'Radle') {
      throw new Error('rick.radle mint must target Radle: ' + JSON.stringify(body));
    }
    return { body: { ok: true, code: 'code-' + body.lantern_username, tms_staff_id: body.tms_staff_id } };
  }, async () => {
    const adminRes = await worker.fetch(new Request('https://tmslantern.org/api/auth/tms-device-authorize?return=' + encodeURIComponent('https://tmsnuggets.pages.dev/index.html'), {
      method: 'GET',
      headers: { Cookie: await cookieFor(ACCOUNTS.admin) },
    }), e);
    const rickRes = await worker.fetch(new Request('https://tmslantern.org/api/auth/tms-device-authorize?return=' + encodeURIComponent('https://tmsnuggets.pages.dev/index.html'), {
      method: 'GET',
      headers: { Cookie: await cookieFor(ACCOUNTS['rick.radle']) },
    }), e);
    const adminLoc = adminRes.headers.get('Location') || '';
    const rickLoc = rickRes.headers.get('Location') || '';
    if (adminRes.status === 302 && adminLoc.includes('lantern_staff_code=code-admin')) {
      ok('admin device authorize mints WebAdmin, not Radle');
    } else bad('admin authorize', { status: adminRes.status, adminLoc });
    if (rickRes.status === 302 && rickLoc.includes('lantern_staff_code=code-rick.radle')) {
      ok('rick.radle device authorize mints Radle');
    } else bad('rick authorize', { status: rickRes.status, rickLoc });
  });
}

async function main() {
  await testResolvers();
  await testLinkStatus();
  await testDeviceAuthorizeDistinct();
  console.log('\nidentity-unmerge-247-test:', pass, 'PASS', fail, 'FAIL');
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
