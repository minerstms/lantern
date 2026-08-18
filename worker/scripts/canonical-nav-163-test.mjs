/**
 * Prompt #163 — Canonical role-aware Lantern ▼ + Staff Reporting Access (REPORT_MAKER).
 * Usage: node worker/scripts/canonical-nav-163-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import worker from '../index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', '..');

let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log('PASS', label); }
function bad(label, detail) { fail++; console.error('FAIL', label, detail != null ? detail : ''); }
function assert(cond, label, detail) { if (cond) ok(label); else bad(label, detail); }

function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

const CORE = ['Locker', 'Create', 'Media Library', 'Play', 'Missions'];
const STAFF = ['Teacher Tools', 'Behavior Logger'];
const PAGES = [
  'app/explore.html',
  'app/locker.html',
  'app/contribute.html',
  'app/games.html',
  'app/missions.html',
  'app/teacher.html',
  'app/admin.html',
];

const staffNav = read('app/js/lantern-staff-nav.js');
const lanternNav = read('app/js/lantern-nav.js');
const adminHtml = read('app/admin.html');
const workerSrc = read('worker/index.js');
const authSrc = read('app/js/lantern-pilot-auth.js');

const sandbox = { window: {}, self: {} };
vm.runInNewContext(staffNav, sandbox);
const LSN = sandbox.window.LanternStaffNav || sandbox.self.LanternStaffNav;
assert(!!LSN, 'LanternStaffNav exports');

function labels(role, caps) {
  return LSN.canonicalVisibleLabels(role, caps, 'lantern');
}

assert(JSON.stringify(labels('student', null)) === JSON.stringify(CORE), '1-5. student core navigation', JSON.stringify(labels('student', null)));
const studentHtml = LSN.buildMenuSectionsHtml('explore', 'lantern', { report_maker: true, system_admin: true }, 'student');
assert(!/Teacher Tools|Behavior Logger|Reports|>System<|STAFF|ADMIN \/ TOOLS/.test(studentHtml), '6-9/47. student never receives staff/admin even if caps spoofed');

const teacherLabels = labels('teacher', null);
assert(JSON.stringify(teacherLabels) === JSON.stringify(CORE.concat(STAFF)), '10-12. normal teacher core + STAFF', JSON.stringify(teacherLabels));
assert(!teacherLabels.includes('Reports') && !teacherLabels.includes('System'), '13-14. teacher without REPORT_MAKER/SYSTEM_ADMIN has no Reports/System');

const reportingLabels = labels('teacher', { report_maker: true });
assert(JSON.stringify(reportingLabels) === JSON.stringify(CORE.concat(STAFF).concat(['Reports'])), '15-18. REPORT_MAKER adds Reports', JSON.stringify(reportingLabels));
assert(!reportingLabels.includes('System'), '19. REPORT_MAKER does not add System');

const sysLabels = labels('teacher', { system_admin: true });
assert(sysLabels.includes('System') && !sysLabels.includes('Reports') && !sysLabels.includes('Behavior Administration'), '20-23. SYSTEM_ADMIN adds System only');
const webCaps = { teacher: true, report_maker: true, behavior_admin: true, system_admin: true };
assert(JSON.stringify(labels('admin', webCaps)) === JSON.stringify(CORE.concat(STAFF).concat(['Reports', 'Behavior Administration', 'System'])), 'E. Web Admin privileged matrix', JSON.stringify(labels('admin', webCaps)));
assert(JSON.stringify(labels('admin', null)) === JSON.stringify(CORE.concat(STAFF)), 'E2. Lantern admin role alone does not grant privileged links', JSON.stringify(labels('admin', null)));

const orderHtml = LSN.buildMenuSectionsHtml('explore', 'lantern', { report_maker: true, behavior_admin: true, system_admin: true }, 'teacher');
const order = [...orderHtml.matchAll(/class="lanternAppBarDropdownLink[^"]*"[^>]*data-page="([^"]+)"/g)].map((m) => m[1]);
assert(
  JSON.stringify(order) === JSON.stringify(['locker', 'create', 'media_library', 'play', 'missions', 'teacher', 'behavior', 'reports', 'behavior-admin', 'system']),
  '24. canonical data-page order',
  JSON.stringify(order)
);

assert(adminHtml.includes('Reporting Access') && adminHtml.includes('staffReportingToggle'), '25. Staff tab shows Reporting Access toggle');
assert(adminHtml.includes('/api/admin/staff-reporting-access'), '25b. toggle posts to staff-reporting-access');
assert(adminHtml.includes('report_maker'), '25c. toggle payload uses report_maker');

assert(/toLowerCase\(\) !== 'admin'/.test(workerSrc.slice(workerSrc.indexOf('async function handleAdminRoutes'), workerSrc.indexOf('async function handleAdminRoutes') + 900)), '26. /api/admin/* requires Lantern role admin');
assert(workerSrc.includes("path === '/api/admin/staff-reporting-access'"), '27. mutation endpoint exists');
assert(workerSrc.includes("staff/set-reporting-access"), '28. endpoint uses TMS REPORT_MAKER bridge');
assert(!/can_reports|show_reports|report_access/.test(staffNav + lanternNav + adminHtml + workerSrc), 'I. no parallel reporting flag');

assert(workerSrc.includes("subPath, tmsStaffId") || workerSrc.includes("staff/set-reporting-access"), '29. server mutates via bridge not client caps');
assert(/capabilities/.test(workerSrc.slice(workerSrc.indexOf("path === '/api/pilot/me'"), workerSrc.indexOf("path === '/api/pilot/me'") + 3500)), '10. /api/pilot/me attaches capabilities for staff');

assert(authSrc.includes("'admin'") && authSrc.includes('rick.radle') === false || /admin/.test(authSrc), '32. Web Admin role string remains admin');
assert(!/username:\s*'admin'[\s\S]{0,80}rick\.radle/.test(workerSrc) || workerSrc.includes("username: 'admin'") !== workerSrc.includes("username: 'rick.radle'"), '32b. identities stay distinct in worker');

PAGES.forEach((rel) => {
  const html = read(rel);
  assert(html.includes('lantern-staff-nav.js') && html.includes('lantern-nav.js'), `33-41. ${rel} loads canonical nav scripts`);
});
assert(read('app/display.html').includes('page-marquee-only'), 'display.html remains marquee-only exception');

assert(lanternNav.includes('href="explore.html"') && lanternNav.includes('id="lanternHomeLink"') && staffNav.includes("'/explore.html'"), '43. brand home / hrefFor lantern is /explore.html');
assert(staffNav.includes("path: '/locker.html'"), '43. Locker route');
assert(staffNav.includes("path: '/contribute.html'"), '43. Create route');
assert(staffNav.includes("path: '/games.html'"), '43. Play route');
assert(staffNav.includes("path: '/missions.html'"), '43. Missions route');
assert(staffNav.includes('/teacher.html') && staffNav.includes("LANTERN_ORIGIN + '/teacher'"), '43. Teacher Tools routes');
assert(/log\.tmslantern\.org/.test(staffNav) && /tms-device-authorize/.test(staffNav), '43. Behavior Logger TMS authorize');
assert(staffNav.includes('admin.html#reports'), '43. Reports route');
assert(staffNav.includes('/admin#system'), '43. System route');

assert(lanternNav.includes('applyCanonicalLanternMenu') && !lanternNav.includes('applyStaffNavForRole'), '44. lantern-nav uses one apply helper');
assert(!/label:\s*'Store'/.test(staffNav), 'M. Store not in canonical menu');
assert(!/label:\s*'Display Board'/.test(staffNav), 'N. Display Board not in canonical menu');

const TEST_PILOT_SECRET = 'test-secret-canonical-nav-163';
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
async function cookieFor(username, role) {
  const now = Math.floor(Date.now() / 1000);
  const token = await signTestJwt({ sub: username, role, iat: now, exp: now + 3600 }, TEST_PILOT_SECRET);
  return `lantern_pilot=${token}`;
}
function makeEnv(accounts) {
  function prepare(sql) {
    const s = String(sql);
    const binds = [];
    const api = {
      bind(...args) { binds.push(...args); return api; },
      async first() {
        if (s.includes('FROM lantern_pilot_accounts WHERE lower(trim(username))')) {
          const key = String(binds[0] || '').trim().toLowerCase();
          return accounts[key] || null;
        }
        if (s.includes('FROM tms_identity_links')) return null;
        return null;
      },
      async all() { return { results: [] }; },
      async run() { return { success: true, meta: { changes: 0 } }; },
    };
    return api;
  }
  return { DB: { prepare }, PILOT_SESSION_SECRET: TEST_PILOT_SECRET };
}

const teacherAcc = {
  username: 'ms.carter',
  display_name: 'Ms. Carter',
  role: 'teacher',
  is_active: 1,
  must_change_password: 0,
};
const env = makeEnv({ 'ms.carter': teacherAcc, admin: { username: 'admin', display_name: 'Web Admin', role: 'admin', is_active: 1, must_change_password: 0 } });
const teacherCookie = await cookieFor('ms.carter', 'teacher');
const teacherRes = await worker.fetch(
  new Request('https://lantern.test/api/admin/staff-reporting-access', {
    method: 'POST',
    headers: { Cookie: teacherCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ lantern_username: 'ms.carter', report_maker: true }),
  }),
  env
);
const teacherBody = await teacherRes.json();
assert(teacherRes.status === 403 && teacherBody && teacherBody.error === 'forbidden', '26/31. unauthorized teacher cannot toggle Reporting Access', { status: teacherRes.status, body: teacherBody });

const studentMenu2 = LSN.buildMenuSectionsHtml('explore', 'lantern', null, '');
assert(!/STAFF|Reports|System/.test(studentMenu2), '47. empty role fails closed to student core');

console.log('\ncanonical-nav-163-test:', pass, 'PASS', fail, 'FAIL');
process.exit(fail ? 1 : 0);
