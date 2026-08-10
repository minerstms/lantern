/**
 * REAL BROWSER TEST — Prompt #97 (session-collision / role-mismatch on /missions).
 *
 * Proves the fix for the observed production bug: a TMS→Lantern staff SSO sign-in completed in
 * another tab shares the same `lantern_pilot` cookie name/path as the student session, so the
 * browser's single cookie jar entry gets overwritten. An already-open student Missions tab's
 * next request then carries the STAFF/ADMIN identity, and the real server-side missions
 * endpoints (see worker/missions-auth.js resolveStudentMissionIdentity) correctly reject that
 * with 403 forbidden (role check), not a network/server error.
 *
 * Drives the ACTUAL app/missions.html through a normal boot with:
 *   - /api/auth/me mocked to report an AUTHENTICATED session with a non-student role (admin or
 *     teacher) — simulating the overwritten cookie.
 *   - /api/missions/active (and /submissions/character) mocked to return the real 403 shape
 *     ({ ok:false, error:'forbidden' }) a student-only route returns for that role.
 *
 * Asserts:
 *   1. The generic "Some missions couldn't be loaded" warning does NOT appear (this is not a
 *      loading glitch).
 *   2. The Quick-missions fallback grid is NOT rendered as though student data merely failed to
 *      load (no fake partial student experience).
 *   3. An explicit, unmistakable role-mismatch banner appears with role-aware copy and a "Go to
 *      Teacher workspace" action for staff roles.
 *   4. A genuinely expired/absent session (unauthenticated) still redirects to login (Prompt #85
 *      behavior), unchanged by this fix.
 *   5. A genuine transient failure with a still-valid student session still shows the original
 *      generic warning + Quick missions fallback (unchanged regression baseline).
 *
 * Usage: node worker/scripts/mission-role-mismatch-test.mjs [baseUrl]
 * Requires a static file server for app/ at baseUrl (default http://127.0.0.1:8765).
 */
import { chromium } from '../../e2e/studio-contribute/node_modules/playwright/index.mjs';

const base = (process.argv[2] || 'http://127.0.0.1:8765').replace(/\/$/, '');

async function main() {
  const results = [];
  function assert(cond, label) {
    results.push({ pass: !!cond, label });
    console.log((cond ? 'PASS' : 'FAIL') + ' — ' + label);
  }

  const browser = await chromium.launch();
  const okJson = (body) => (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  const forbiddenJson = (route) => route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'forbidden' }) });

  async function bootPage(authMeBody, missionsRoute, submissionsRoute) {
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));

    await page.addInitScript(() => { window.LANTERN_AVATAR_API = ''; });
    // First /api/auth/me call is the page's own boot guard (must report authenticated so the
    // page actually boots as a "student" session at load time) — the SECOND call (from the
    // mission-fetch-failure recheck) is what simulates the cookie having been overwritten mid-
    // session. Route handler swaps after the first call to model that sequence precisely.
    let authCalls = 0;
    await page.route('**/api/auth/me**', (route) => {
      authCalls++;
      if (authCalls === 1) {
        return route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ ok: true, authenticated: true, role: 'student', username: 'testpilot', display_name: 'Test Pilot', economy_character_name: 'testpilot', student_character_name: 'testpilot', must_change_password: false }),
        });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(authMeBody) });
    });
    await page.route('**/api/class-access/**', okJson({ ok: true, accessState: 'none', tokenValid: true }));
    await page.route('**/api/missions/active**', missionsRoute);
    await page.route('**/api/missions/submissions/character**', submissionsRoute || okJson({ ok: true, submissions: [] }));
    await page.route('**/api/verify/state**', okJson({ ok: true, state: null }));

    await page.goto(base + '/missions.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(() => !!(window.LanternMissionsRuntime && window.LanternMissionsRuntime.loadMissions), { timeout: 15000 });
    await page.waitForTimeout(1500);
    return { page, consoleErrors };
  }

  async function bannerState(page) {
    return page.evaluate(() => {
      const warn = document.getElementById('missionsLibraryWarning');
      const banner = document.getElementById('missionsRoleMismatchBanner');
      const grid = document.getElementById('missionsLibraryGrid');
      const teacherLink = document.getElementById('missionsRoleMismatchTeacherLink');
      return {
        warningVisible: warn ? !warn.hidden : null,
        bannerVisible: banner ? !banner.hidden : null,
        bannerText: (document.getElementById('missionsRoleMismatchMessage') || {}).textContent || '',
        teacherLinkVisible: teacherLink ? !teacherLink.hidden : null,
        gridCardCount: grid ? grid.querySelectorAll('[data-lantern-card-type]').length : -1,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Scenario 1: cookie overwritten by an admin staff SSO sign-in — /api/auth/me now reports
  // authenticated:true, role:'admin'; the real missions endpoints correctly 403 that role.
  // ---------------------------------------------------------------------------
  {
    const { page } = await bootPage(
      { ok: true, authenticated: true, role: 'admin', username: 'rick_radle', display_name: 'Rick Radle' },
      forbiddenJson,
      forbiddenJson
    );
    const state = await bannerState(page);
    assert(state.warningVisible === false, 'Scenario 1 (admin cookie collision): generic "couldn\'t be loaded" warning does NOT appear');
    assert(state.bannerVisible === true, 'Scenario 1: explicit role-mismatch banner IS shown');
    assert(state.gridCardCount === 0, 'Scenario 1: Quick-missions fallback grid is NOT rendered (no fake partial student experience): got ' + state.gridCardCount + ' cards');
    assert(/admin/i.test(state.bannerText), 'Scenario 1: banner copy names the actual current role: "' + state.bannerText + '"');
    assert(state.teacherLinkVisible === true, 'Scenario 1: "Go to Teacher workspace" action is offered for a staff role');
    await page.close();
  }

  // ---------------------------------------------------------------------------
  // Scenario 2: cookie overwritten by a teacher (non-admin) staff SSO sign-in.
  // ---------------------------------------------------------------------------
  {
    const { page } = await bootPage(
      { ok: true, authenticated: true, role: 'teacher', username: 'mr_lee', display_name: 'Mr. Lee' },
      forbiddenJson,
      forbiddenJson
    );
    const state = await bannerState(page);
    assert(state.bannerVisible === true, 'Scenario 2 (teacher cookie collision): explicit role-mismatch banner IS shown');
    assert(/teacher/i.test(state.bannerText), 'Scenario 2: banner copy names "teacher": "' + state.bannerText + '"');
    assert(state.teacherLinkVisible === true, 'Scenario 2: "Go to Teacher workspace" action is offered');
    await page.close();
  }

  // ---------------------------------------------------------------------------
  // Scenario 3: session is genuinely expired/absent (Prompt #85 behavior) — must still redirect
  // to login, NOT show the role-mismatch banner (there is no "role" for an unauthenticated
  // session — this must remain a distinct code path from role-mismatch).
  // ---------------------------------------------------------------------------
  {
    const { page } = await bootPage(
      { ok: true, authenticated: false },
      forbiddenJson,
      forbiddenJson
    );
    await page.waitForTimeout(500);
    const url = page.url();
    assert(/login\.html/i.test(url), 'Scenario 3 (expired session): redirected to login.html (Prompt #85 behavior preserved), got: ' + url);
    await page.close();
  }

  // ---------------------------------------------------------------------------
  // Scenario 4: genuine transient failure (student session still valid) — unchanged baseline:
  // generic warning + Quick missions fallback, NOT the role-mismatch banner.
  // ---------------------------------------------------------------------------
  {
    const { page } = await bootPage(
      { ok: true, authenticated: true, role: 'student', username: 'testpilot', display_name: 'Test Pilot' },
      (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'boom' }) }),
      okJson({ ok: true, submissions: [] })
    );
    const state = await bannerState(page);
    assert(state.warningVisible === true, 'Scenario 4 (transient failure, still a student): generic warning IS shown (unchanged baseline)');
    assert(state.bannerVisible === false, 'Scenario 4: role-mismatch banner is NOT shown (session role is still student)');
    assert(state.gridCardCount > 0, 'Scenario 4: Quick missions fallback still renders for a genuine transient failure: got ' + state.gridCardCount + ' cards');
    await page.close();
  }

  await browser.close();

  const failed = results.filter((r) => !r.pass);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' assertions passed.');
  if (failed.length) {
    console.log('\nFAILED:');
    failed.forEach((f) => console.log('  - ' + f.label));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error('Test crashed:', e);
  process.exit(1);
});
