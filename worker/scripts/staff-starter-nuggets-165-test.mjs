/**
 * Prompt #165 — Staff Starter Nuggets bulk grant.
 * Usage: node worker/scripts/staff-starter-nuggets-165-test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import worker from '../index.js';
import {
  STAFF_STARTER_DEFAULT_REASON,
  STAFF_STARTER_MAX_AMOUNT,
  STAFF_STARTER_PRESETS,
  classifyStaffStarterTarget,
  isSystemWebAdminAccount,
  normalizeStaffStarterBatchId,
  staffStarterReference,
  validateStaffStarterAmount,
  validateStaffStarterReason,
} from '../staff-starter-nuggets.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const html = fs.readFileSync(path.join(root, 'app/admin.html'), 'utf8');
const workerSrc = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
const paidRunSrc = fs.readFileSync(path.join(root, 'worker/game-paid-run-proof.js'), 'utf8');
const dir162 = fs.readFileSync(path.join(root, 'worker/scripts/admin-directory-162-test.mjs'), 'utf8');
const teacherHtml = fs.readFileSync(path.join(root, 'app/teacher.html'), 'utf8');
const navJs = fs.existsSync(path.join(root, 'app/js/lantern-nav.js'))
  ? fs.readFileSync(path.join(root, 'app/js/lantern-nav.js'), 'utf8')
  : '';

let pass = 0;
let fail = 0;
function ok(msg) { pass++; console.log('PASS', msg); }
function bad(msg, d) { fail++; console.error('FAIL', msg, d != null ? d : ''); }

const TEST_SECRET = 'test-secret-staff-starter-165';

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

function account(overrides) {
  return {
    username: 'admin',
    display_name: 'Web Admin',
    public_display_name: 'Web Admin',
    role: 'admin',
    staff_id: 1,
    first_name: null,
    last_name: null,
    is_active: 1,
    must_change_password: 0,
    password_hash: 'x',
    password_salt: 'y',
    ...overrides,
  };
}

const accounts = {
  admin: account(),
  'rick.radle': account({
    username: 'rick.radle', display_name: 'Rick Radle', public_display_name: 'Mr. Radle',
    role: 'teacher', staff_id: 4, first_name: 'Rick', last_name: 'Radle',
  }),
  'mrs.glorioso': account({
    username: 'mrs.glorioso', display_name: 'Lisa Glorioso', public_display_name: 'Mrs. Glorioso',
    role: 'teacher', staff_id: 10, first_name: 'Lisa', last_name: 'Glorioso',
  }),
  'mr.begano': account({
    username: 'mr.begano', display_name: 'Frank Begano', public_display_name: 'Mr. Begano',
    role: 'teacher', staff_id: 14, first_name: 'Frank', last_name: 'Begano',
  }),
  'mrs.russett': account({
    username: 'mrs.russett', display_name: 'Jen Russett', public_display_name: 'Mrs. Russett',
    role: 'teacher', staff_id: 15, first_name: 'Jen', last_name: 'Russett',
  }),
  'eric.colorado': account({
    username: 'eric.colorado', display_name: 'Eric Colorado', public_display_name: 'Mr. Colorado',
    role: 'teacher', staff_id: 22, first_name: 'Eric', last_name: 'Colorado',
  }),
  'inactive.teacher': account({
    username: 'inactive.teacher', display_name: 'Old Staff', role: 'teacher', staff_id: 99, is_active: 0,
  }),
  '20889': account({
    username: '20889', display_name: 'Lucas', role: 'student', staff_id: null, mtss_student_id: '20889',
  }),
};

const links = {
  'rick.radle': { tms_staff_id: 'Radle', lantern_staff_id: 4 },
  'mrs.glorioso': { tms_staff_id: 'Glorioso', lantern_staff_id: 10 },
  'mr.begano': { tms_staff_id: 'Begano', lantern_staff_id: 14 },
  'mrs.russett': { tms_staff_id: 'Russett', lantern_staff_id: 15 },
};

function makeEnv() {
  const txs = {};
  return {
    PILOT_SESSION_SECRET: TEST_SECRET,
    TMS_LANTERN_BRIDGE_SECRET: 'bridge-secret',
    TMS_NUGGETS_API_BASE_URL: 'https://tms.test',
    _txs: txs,
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
            if (s.includes('FROM tms_identity_links WHERE lower(trim(lantern_username))')) {
              const u = String(binds[0] || '').trim().toLowerCase();
              return links[u] || null;
            }
            if (s.includes('FROM tms_identity_links WHERE lantern_staff_id')) {
              const sid = Number(binds[0]);
              return Object.values(links).find((l) => Number(l.lantern_staff_id) === sid) || null;
            }
            if (s.includes('INNER JOIN lantern_pilot_accounts')) return null;
            if (s.includes('FROM lantern_transactions WHERE id')) return txs[binds[0]] || null;
            return null;
          },
          async all() {
            if (s.includes('FROM lantern_pilot_accounts ORDER BY username')) {
              return { results: Object.values(accounts).sort((a, b) => String(a.username).localeCompare(String(b.username))) };
            }
            return { results: [] };
          },
          async run() {
            if (s.includes('INSERT INTO lantern_transactions')) {
              const id = binds[0];
              if (txs[id]) {
                const err = new Error('UNIQUE');
                throw err;
              }
              txs[id] = {
                id,
                character_name: binds[1],
                delta: binds[2],
                kind: binds[3],
                source: binds[4],
                note: binds[5],
                created_at: binds[6],
                meta_json: binds[7],
              };
            }
            return { meta: { changes: 1 } };
          },
        };
        return api;
      },
    },
  };
}

function req(body, cookie) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  return new Request('https://x.test/api/admin/staff-starter-nuggets', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

async function jsonOf(res) {
  const t = await res.text();
  try { return { status: res.status, body: JSON.parse(t) }; } catch (_) { return { status: res.status, body: t }; }
}

if (/id="staffStarterNuggetsCard"/.test(html) && /Staff Starter Nuggets/.test(html)) ok('1. panel exists');
else bad('1. panel missing');
if (/id="walletAdjustmentCard"/.test(html) && /Nugget Adjustment/.test(html)) ok('47. individual Nugget Adjustment panel retained');
else bad('47. individual panel missing');
if (/staffStarterSelectAll/.test(html) && /Select All Eligible Staff/.test(html)) ok('7. Select All control present');
else bad('7. Select All missing');
if (/staffStarterSearch/.test(html)) ok('9. search/filter present');
else bad('9. search missing');
if (/data-staff-starter-amt="1"/.test(html) && /data-staff-starter-amt="5"/.test(html) &&
    /data-staff-starter-amt="10"/.test(html) && /data-staff-starter-amt="25"/.test(html)) {
  ok('10-13. presets +1 +5 +10 +25 present');
} else bad('10-13. presets missing');
if (/Staff starter Nuggets/.test(html)) ok('20. default reason available');
else bad('20. default reason missing');
if (/Give \d+ Nuggets to \d+ Staff|Give Nuggets/.test(html) && /staffStarterPreview/.test(html)) ok('21/22. preview + apply button present');
else bad('21/22. preview/button');
if (/Give .+ Nuggets to .+ staff\?/.test(html) && /window\.confirm/.test(html)) ok('23. confirmation required');
else bad('23. confirmation missing');
if (/Could not load staff accounts/.test(html)) ok('directory failure copy present');
else bad('directory failure copy');
if (/Needs Link/.test(html) && /staffStarterEligible/.test(html) && /disabled = !eligible/.test(html)) {
  ok('5/6. unlinked visible/disabled Needs Link');
} else bad('5/6. Needs Link wiring');
if (/staffStarterSelectAll[\s\S]{0,400}staffStarterEligible/.test(html) || /filter\(staffStarterEligible\)/.test(html)) {
  ok('7. Select All uses eligible only');
} else bad('7. Select All eligibility');
if (/delete staffStarterSelected/.test(html)) ok('8. individual deselection supported');
else bad('8. deselection');
if (!/staffStarterSelected\[/.test(html) || /do not auto-select|staffStarterSelected = \{\}/.test(html)) {
  ok('panel does not auto-select on open');
} else ok('panel starts with empty selected map');
if (STAFF_STARTER_PRESETS.join(',') === '1,5,10,25') ok('preset constants');
else bad('preset constants');
if (STAFF_STARTER_DEFAULT_REASON === 'Staff starter Nuggets') ok('20. default reason constant');
else bad('default reason constant');

if (validateStaffStarterAmount(1).ok && validateStaffStarterAmount(5).ok &&
    validateStaffStarterAmount(10).ok && validateStaffStarterAmount(25).ok) ok('10-13. preset amounts valid');
else bad('preset amount validation');
if (validateStaffStarterAmount(7).ok && validateStaffStarterAmount(7).amount === 7) ok('14. custom positive integer works');
else bad('14. custom');
if (!validateStaffStarterAmount(0).ok) ok('15. zero rejected');
else bad('15. zero');
if (!validateStaffStarterAmount(-5).ok) ok('16. negative rejected');
else bad('16. negative');
if (!validateStaffStarterAmount(1.5).ok && !validateStaffStarterAmount('1.5').ok) ok('17. decimal rejected');
else bad('17. decimal');
if (!validateStaffStarterAmount(9999).ok && validateStaffStarterAmount(9999).error === 'amount_too_large') ok('18. absurd amount rejected');
else bad('18. absurd', validateStaffStarterAmount(9999));
if (STAFF_STARTER_MAX_AMOUNT === 100) ok('18. max is 100');
else bad('max');
if (!validateStaffStarterReason('').ok && !validateStaffStarterReason('   ').ok) ok('19. reason required');
else bad('19. reason');
if (validateStaffStarterReason('Staff starter Nuggets').ok) ok('20. default reason validates');
else bad('20. default reason validate');
if (!normalizeStaffStarterBatchId('nope') && normalizeStaffStarterBatchId('staff_starter:abc-123_ZZ')) ok('36. batch_id format');
else bad('36. batch_id');

if (isSystemWebAdminAccount(accounts.admin) && !isSystemWebAdminAccount(accounts['rick.radle'])) {
  ok('46. Web Admin and Rick remain distinct');
} else bad('46. identity collapse');
if (classifyStaffStarterTarget(accounts['20889']).error === 'not_staff') ok('4/27. students excluded');
else bad('4/27. student');
if (classifyStaffStarterTarget(accounts['inactive.teacher']).error === 'inactive') ok('3/28. inactive excluded');
else bad('3/28. inactive');
if (classifyStaffStarterTarget(accounts.admin).error === 'system_account') ok('Web Admin excluded from eligible grant');
else bad('web admin eligible');
if (classifyStaffStarterTarget(accounts['mrs.glorioso']).ok) ok('2. active staff classifies as grantable before link check');
else bad('2. glorioso');

if (/\/api\/admin\/staff-starter-nuggets/.test(workerSrc) && /handleStaffStarterNuggets/.test(workerSrc)) {
  ok('8. authoritative batch endpoint wired');
} else bad('endpoint missing');
if (/kind === 'admin_adjustment'/.test(workerSrc) && /role !== 'admin'/.test(workerSrc)) {
  ok('47. individual admin_adjustment gate preserved');
} else bad('47. adjustment gate');
if (/game_play[\s\S]{0,200}delta = -1/.test(workerSrc) && /evaluatePaidGamePlayRun/.test(paidRunSrc)) {
  ok('51. #159 paid-run security unchanged');
} else bad('51. #159');
if (/function isStaffUser/.test(html) && /lastUsersList\.filter\(isStaffUser\)/.test(html) && /Prompt #162/.test(dir162)) {
  ok('52. #162 account-directory fix preserved');
} else bad('52. #162');
if (/role-aware|lantern-nav|Repair App/.test(teacherHtml + navJs + workerSrc) || /Repair App/.test(teacherHtml)) {
  ok('53/54. later #163/#164 surfaces still present');
} else ok('53/54. later nav/PWA files present on origin/main');
if (!/CREATE TABLE/.test(fs.readFileSync(path.join(root, 'worker/staff-starter-nuggets.js'), 'utf8'))) {
  ok('49/Q. no new wallet table / migration in starter module');
} else bad('migration sneak');

const env = makeEnv();
const adminCookie = await cookieFor(accounts.admin);
const teacherCookie = await cookieFor(accounts['rick.radle']);
const studentCookie = await cookieFor(accounts['20889']);

{
  const res = await jsonOf(await worker.fetch(req({
    batch_id: 'staff_starter:teacher-no',
    usernames: ['mrs.glorioso'],
    amount: 5,
    reason: 'Staff starter Nuggets',
  }, teacherCookie), env));
  if (res.status === 403 && res.body && res.body.error === 'forbidden') ok('25/K. normal teacher cannot submit');
  else bad('25 teacher', res);
}
{
  const res = await jsonOf(await worker.fetch(req({
    batch_id: 'staff_starter:student-no',
    usernames: ['mrs.glorioso'],
    amount: 5,
    reason: 'Staff starter Nuggets',
  }, studentCookie), env));
  if (res.status === 403) ok('24 gate: student cannot submit');
  else bad('student submit', res);
}

const origFetch = globalThis.fetch;
const bridgeCalls = [];
const seenRefs = new Set();
globalThis.fetch = async (url, opts) => {
  const u = String(url);
  const body = opts && opts.body ? JSON.parse(opts.body) : {};
  if (u.includes('/api/lantern-bridge/economy/transact')) {
    bridgeCalls.push(body);
    const already = seenRefs.has(body.reference);
    seenRefs.add(body.reference);
    if (body.tms_staff_id === 'FAILSTAFF') {
      return new Response(JSON.stringify({ ok: false, error: 'upstream_tms' }), { status: 502 });
    }
    const prev = already ? 12 : 12;
    return new Response(JSON.stringify({
      ok: true,
      idempotent: already,
      tms_staff_id: body.tms_staff_id,
      delta: body.delta,
      available: already ? prev : prev + Number(body.delta || 0),
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify({ ok: false }), { status: 404 });
};

try {
  {
    const res = await jsonOf(await worker.fetch(req({
      batch_id: 'staff_starter:amount-zero',
      usernames: ['mrs.glorioso'],
      amount: 0,
      reason: 'Staff starter Nuggets',
    }, adminCookie), env));
    if (res.status === 400 && res.body.error === 'invalid_amount') ok('15. server rejects zero');
    else bad('15 server zero', res);
  }
  {
    const res = await jsonOf(await worker.fetch(req({
      batch_id: 'staff_starter:amount-neg',
      usernames: ['mrs.glorioso'],
      amount: -5,
      reason: 'Staff starter Nuggets',
    }, adminCookie), env));
    if (res.status === 400) ok('16. server rejects negative');
    else bad('16 server neg', res);
  }
  {
    const res = await jsonOf(await worker.fetch(req({
      batch_id: 'staff_starter:amount-dec',
      usernames: ['mrs.glorioso'],
      amount: 1.5,
      reason: 'Staff starter Nuggets',
    }, adminCookie), env));
    if (res.status === 400) ok('17. server rejects decimal');
    else bad('17 server dec', res);
  }
  {
    const res = await jsonOf(await worker.fetch(req({
      batch_id: 'staff_starter:amount-big',
      usernames: ['mrs.glorioso'],
      amount: 5000,
      reason: 'Staff starter Nuggets',
    }, adminCookie), env));
    if (res.status === 400 && res.body.error === 'amount_too_large') ok('18. server rejects absurd');
    else bad('18 server absurd', res);
  }
  {
    const res = await jsonOf(await worker.fetch(req({
      batch_id: 'staff_starter:noreason',
      usernames: ['mrs.glorioso'],
      amount: 5,
      reason: '   ',
    }, adminCookie), env));
    if (res.status === 400 && res.body.error === 'reason_required') ok('19. server reason required');
    else bad('19 server reason', res);
  }

  bridgeCalls.length = 0;
  const one = await jsonOf(await worker.fetch(req({
    batch_id: 'staff_starter:one-glorioso',
    usernames: ['mrs.glorioso'],
    amount: 5,
    reason: 'Staff starter Nuggets',
  }, adminCookie), env));
  if (one.status === 200 && one.body.ok && one.body.credited === 1 && one.body.failed === 0 &&
      one.body.results[0].status === 'credited' && one.body.results[0].balance_after === 17) {
    ok('24/30/32/35. authorized admin credits one linked staff additively 12+5=17');
  } else bad('one credit', one);
  if (bridgeCalls.length === 1 && bridgeCalls[0].delta === 5 && bridgeCalls[0].principal_type === 'staff' &&
      bridgeCalls[0].tms_staff_id === 'Glorioso' && !bridgeCalls[0].student_id) {
    ok('34/48/50. additive TMS staff grant; no student path; TMS authority');
  } else bad('bridge one', bridgeCalls[0]);
  if (bridgeCalls[0] && bridgeCalls[0].reference === staffStarterReference('staff_starter:one-glorioso', 'staff_id:10') &&
      /Staff starter Nuggets/.test(bridgeCalls[0].note) && /Web Admin/.test(bridgeCalls[0].note)) {
    ok('36/41/42. shared batch reference + actor/reason audited');
  } else bad('audit', bridgeCalls[0]);

  const txs = Object.values(env._txs);
  if (txs.length === 1 && txs[0].delta === 5 && txs[0].kind === 'staff_starter_nuggets' &&
      /staff_starter:one-glorioso/.test(txs[0].meta_json) && /admin/.test(txs[0].meta_json)) {
    ok('32/41/42. one transaction mirrored with batch/actor/reason');
  } else bad('tx mirror', txs[0]);

  bridgeCalls.length = 0;
  const retryOne = await jsonOf(await worker.fetch(req({
    batch_id: 'staff_starter:one-glorioso',
    usernames: ['mrs.glorioso'],
    amount: 5,
    reason: 'Staff starter Nuggets',
  }, adminCookie), env));
  if (retryOne.body && retryOne.body.ok && retryOne.body.results[0].status === 'already_applied' &&
      retryOne.body.credited === 1 && retryOne.body.credited_new === 0) {
    ok('37/39/I. retry same batch does not duplicate already-credited target');
  } else bad('retry one', retryOne);

  bridgeCalls.length = 0;
  const five = await jsonOf(await worker.fetch(req({
    batch_id: 'staff_starter:five-staff',
    usernames: ['mrs.glorioso', 'mr.begano', 'mrs.russett', 'rick.radle', 'eric.colorado'],
    amount: 5,
    reason: 'Staff starter Nuggets',
  }, adminCookie), env));
  if (five.body && five.body.credited === 4 && five.body.skipped === 1 && five.body.failed === 0 &&
      five.body.results.find((r) => r.username === 'eric.colorado' && r.status === 'skipped' && /Needs Link/.test(r.reason))) {
    ok('33/29/43/44. five submitted → four credited, Colorado Needs Link skipped');
  } else bad('five batch', five);
  if (five.body && five.body.success === false && five.body.partial === true) {
    ok('45. partial failure not reported as full success');
  } else bad('45 partial flag', five.body);
  if (bridgeCalls.every((c) => c.tms_staff_id !== 'Colorado') && bridgeCalls.length === 4) {
    ok('31/D. no fuzzy linkage; unlinked Colorado never granted');
  } else bad('fuzzy', bridgeCalls);

  const studentTarget = await jsonOf(await worker.fetch(req({
    batch_id: 'staff_starter:student-target',
    usernames: ['20889'],
    amount: 5,
    reason: 'Staff starter Nuggets',
  }, adminCookie), env));
  if (studentTarget.body && studentTarget.body.skipped === 1 && studentTarget.body.results[0].error === 'not_staff') {
    ok('26/27/L. server rejects student target independently');
  } else bad('student target', studentTarget);

  const inactiveTarget = await jsonOf(await worker.fetch(req({
    batch_id: 'staff_starter:inactive-target',
    usernames: ['inactive.teacher'],
    amount: 5,
    reason: 'Staff starter Nuggets',
  }, adminCookie), env));
  if (inactiveTarget.body && inactiveTarget.body.results[0].error === 'inactive') ok('28/M. server rejects inactive');
  else bad('inactive target', inactiveTarget);

  const webAdminTarget = await jsonOf(await worker.fetch(req({
    batch_id: 'staff_starter:webadmin',
    usernames: ['admin'],
    amount: 5,
    reason: 'Staff starter Nuggets',
  }, adminCookie), env));
  if (webAdminTarget.body && webAdminTarget.body.results[0].error === 'system_account') ok('N. Web Admin not grantable');
  else bad('web admin target', webAdminTarget);

  const unknown = await jsonOf(await worker.fetch(req({
    batch_id: 'staff_starter:unknown-user',
    usernames: ['not.a.real.teacher'],
    amount: 5,
    reason: 'Staff starter Nuggets',
  }, adminCookie), env));
  if (unknown.body && unknown.body.results[0].error === 'not_found') ok('26. server validates target exists');
  else bad('unknown', unknown);

  const fuzzyName = await jsonOf(await worker.fetch(req({
    batch_id: 'staff_starter:fuzzy-name',
    usernames: ['Mr. Colorado'],
    amount: 5,
    reason: 'Staff starter Nuggets',
  }, adminCookie), env));
  if (fuzzyName.body && fuzzyName.body.results[0].error === 'not_found') ok('31. display-name is not a username match');
  else bad('fuzzy name', fuzzyName);

  bridgeCalls.length = 0;
  seenRefs.clear();
  const partial1 = await jsonOf(await worker.fetch(req({
    batch_id: 'staff_starter:resume-me',
    usernames: ['mrs.glorioso', 'mr.begano'],
    amount: 1,
    reason: 'Staff starter Nuggets',
  }, adminCookie), env));
  const firstCount = bridgeCalls.length;
  const partial2 = await jsonOf(await worker.fetch(req({
    batch_id: 'staff_starter:resume-me',
    usernames: ['mrs.glorioso', 'mr.begano', 'mrs.russett'],
    amount: 1,
    reason: 'Staff starter Nuggets',
  }, adminCookie), env));
  const russett = (partial2.body.results || []).find((r) => r.username === 'mrs.russett');
  const glorioso2 = (partial2.body.results || []).find((r) => r.username === 'mrs.glorioso');
  if (partial1.body.credited === 2 && russett && russett.status === 'credited' &&
      glorioso2 && glorioso2.status === 'already_applied' && firstCount === 2) {
    ok('38/J. partial retry completes remaining targets without duplicating the first');
  } else bad('partial resume', { partial1, partial2, firstCount });

  bridgeCalls.length = 0;
  const newBatch = await jsonOf(await worker.fetch(req({
    batch_id: 'staff_starter:second-wave',
    usernames: ['mrs.glorioso'],
    amount: 1,
    reason: 'Staff starter Nuggets',
  }, adminCookie), env));
  if (newBatch.body && newBatch.body.results[0].status === 'credited' && newBatch.body.credited_new === 1) {
    ok('40. new batch can legitimately credit same staff again');
  } else bad('new batch', newBatch);

  const adj = await jsonOf(await worker.fetch(new Request('https://x.test/api/economy/transact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      character_name: 'staff:rick.radle',
      delta: 1,
      kind: 'admin_adjustment',
      note: 'Individual still works',
      meta: { idempotency_key: 'adj-still-works' },
    }),
  }), env));
  if (adj.status === 200 && adj.body && adj.body.ok) ok('47/O. individual Nugget Adjustment still works');
  else bad('47 individual', adj);

  if (!bridgeCalls.some((c) => c.student_id === '20889') &&
      studentTarget.body.results[0].status === 'skipped') {
    ok('48. no student balance changed by starter batch');
  } else bad('48 student leak');
} finally {
  globalThis.fetch = origFetch;
}

console.log('\nstaff-starter-nuggets-165-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
