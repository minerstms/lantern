/**
 * Lantern nav logout + Verify page archive tests.
 * Usage: node worker/scripts/lantern-nav-logout-test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const navJs = fs.readFileSync(path.join(root, 'app/js/lantern-nav.js'), 'utf8');
const pilotAuthJs = fs.readFileSync(path.join(root, 'app/js/lantern-pilot-auth.js'), 'utf8');
const workerIndex = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');

let pass = 0;
let fail = 0;
function ok(msg) {
  pass++;
  console.log('PASS ' + msg);
}
function bad(msg, detail) {
  fail++;
  console.log('FAIL ' + msg + (detail ? ' — ' + detail : ''));
}

if (!fs.existsSync(path.join(root, 'app/verify.html'))) ok('verify.html removed from deployed app');
else bad('verify.html still in app');

if (fs.existsSync(path.join(root, 'archive/verify-page/verify.html'))) ok('verify.html archived');
else bad('verify archive missing');

if (fs.readFileSync(path.join(root, 'archive/verify-page/README.md'), 'utf8').includes('Former route')) {
  ok('verify archive README');
} else bad('verify README');

if (!/verify\.html/.test(navJs)) ok('nav no longer links to verify.html');
else bad('verify link still in nav');

if (/lanternNavLogoutBtn/.test(navJs) && /Log out/.test(navJs)) ok('Log out control in Lantern dropdown');
else bad('logout button missing');

if (/lanternAppBarDropdownSection--logout[\s\S]*lanternNavLogoutBtn/.test(navJs)) {
  ok('Logout is final dropdown section');
} else bad('logout placement');

if (/wireLogoutButton/.test(navJs) && navJs.indexOf("wireLogoutButton(document.getElementById('lanternNavLogoutBtn')") >= 0) {
  ok('shared nav logout wiring');
} else bad('shared logout wiring');

if (/performLogout/.test(pilotAuthJs) && /clearClientIdentityCaches/.test(pilotAuthJs)) {
  ok('performLogout clears client auth cache');
} else bad('performLogout helper');

if (/\/api\/auth\/logout/.test(pilotAuthJs) && /credentials:\s*'include'/.test(pilotAuthJs)) {
  ok('logout POST uses session credentials');
} else bad('logout fetch');

if (/location\.replace\('\/login\.html'\)/.test(pilotAuthJs)) ok('logout redirects to login');
else bad('logout redirect');

if (/pilotClearCookieHeader/.test(workerIndex) && /Max-Age=0/.test(workerIndex)) {
  ok('worker clears lantern_pilot cookie on logout');
} else bad('worker cookie clear');

if (/path === '\/api\/pilot\/logout'/.test(workerIndex)) ok('pilot logout endpoint exists');
else bad('pilot logout endpoint');

if (/id="lanternNavLogoutSection" hidden/.test(navJs)) ok('logout hidden until authenticated');
else bad('logout auth gating');

if (/showAuthenticatedLogoutControls/.test(navJs)) ok('authenticated logout visibility helper');
else bad('logout visibility');

if (/applySignedInHeaderIdentity/.test(navJs) && /studentFriendlyDisplayNameFromAdopted/.test(navJs) && /lanternAppBarContextGlow/.test(navJs)) {
  ok('Prompt #121: shared header hydrates signed-in display_name into #lanternAppBarContext');
} else bad('shared header identity hydration missing');

if (/page-marquee-only/.test(navJs) && /Prompt #116/.test(navJs)) {
  ok('Display page-marquee-only still skips mounting the app bar (no signed-in name row)');
} else bad('Display marquee-only exception missing');

if (/global\.LanternNav\s*=\s*global\.LANTERN_NAV/.test(navJs) && /onHeaderSearch:\s*onHeaderSearch/.test(navJs)) {
  ok('LanternNav alias exports onHeaderSearch for Missions/Games');
} else bad('LanternNav.onHeaderSearch export');

const sandbox = {
  location: { replace: function () {} },
  localStorage: { removeItem() {} },
  fetch(url, opts) {
    sandbox._lastFetch = { url, opts };
    return Promise.resolve({
      ok: true,
      text() {
        return Promise.resolve(JSON.stringify({ ok: true }));
      },
    });
  },
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(pilotAuthJs, sandbox);
const auth = sandbox.LanternAuth || sandbox.LanternPilotAuth;
if (auth && typeof auth.performLogout === 'function') {
  auth.performLogout().then(function (res) {
    if (res && res.ok) ok('sandbox performLogout succeeds');
    else bad('sandbox performLogout', JSON.stringify(res));
    if (sandbox._lastFetch && sandbox._lastFetch.url === '/api/auth/logout') ok('sandbox calls /api/auth/logout');
    else bad('sandbox logout url', sandbox._lastFetch && sandbox._lastFetch.url);
    if (sandbox._lastFetch && sandbox._lastFetch.opts && sandbox._lastFetch.opts.method === 'POST') {
      ok('sandbox logout uses POST');
    } else bad('sandbox logout method');
    try {
      if (sandbox.LANTERN_PILOT_ME === undefined) ok('sandbox clears LANTERN_PILOT_ME');
      else bad('sandbox pilot me cache');
    } catch (e) {
      ok('sandbox clears LANTERN_PILOT_ME');
    }
    console.log('\n--- lantern-nav-logout-test: ' + pass + ' passed, ' + fail + ' failed ---');
    process.exit(fail ? 1 : 0);
  });
} else {
  bad('LanternAuth sandbox load');
  console.log('\n--- lantern-nav-logout-test: ' + pass + ' passed, ' + fail + ' failed ---');
  process.exit(1);
}
