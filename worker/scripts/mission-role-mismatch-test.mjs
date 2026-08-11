/**
 * REAL BROWSER TEST — Prompt #97 / #107 / #211 (session collision + staff catalog on /missions).
 *
 * Prompt #107 made teacher/admin valid Missions participants. Prompt #211 requires staff to
 * SEE the school mission catalog. A mid-session cookie overwrite to staff is therefore NOT a
 * "sign in as a student" role wall — staff load the catalog (or a genuine fetch warning).
 *
 * Still asserts:
 *   - Unauthenticated sessions redirect to login (Prompt #85).
 *   - Genuine student transient failure still shows the generic warning + Hidden Nugget fallback.
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

  const SAMPLE_CATALOG = [
    {
      id: 'perm_thank_you',
      title: 'Thank a Teacher',
      description: 'Send a thank-you.',
      reward_amount: 1,
      submission_type: 'text',
      audience: 'school_mission',
      participant_scope: 'students',
      featured: 0,
      active: true,
      archived: false,
      allows_text: 1,
      allows_image: 0,
      allows_video: 0,
      allows_link: 0,
      min_characters: 20,
      created_at: '2026-08-01T00:00:00.000Z',
    },
    {
      id: 'perm_daily_checkin',
      title: 'Daily Check-In',
      description: 'How are you today?',
      reward_amount: 1,
      submission_type: 'confirmation',
      audience: 'school_mission',
      participant_scope: 'students',
      featured: 0,
      active: true,
      archived: false,
      allows_text: 0,
      allows_image: 0,
      allows_video: 0,
      allows_link: 0,
      min_characters: 0,
      created_at: '2026-08-01T00:00:00.000Z',
    },
  ];

  async function bootPage(authMeBody, missionsRoute, submissionsRoute) {
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));

    await page.addInitScript(() => { window.LANTERN_AVATAR_API = ''; });
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
    await page.route('**/api/missions/progress**', okJson({ ok: true, daily_checkin: { completed_today: false }, thank_you: { completed_today: false }, first_game: { completed: false } }));
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
      const titles = grid
        ? Array.from(grid.querySelectorAll('[data-lantern-card-type]')).map((el) => {
            const t = el.querySelector('.lanternCardTitle, .lc-title, h3, h2');
            return (t && t.textContent) || el.textContent || '';
          })
        : [];
      return {
        warningVisible: warn ? !warn.hidden : null,
        bannerVisible: banner ? !banner.hidden : null,
        bannerText: (document.getElementById('missionsRoleMismatchMessage') || {}).textContent || '',
        gridCardCount: grid ? grid.querySelectorAll('[data-lantern-card-type]').length : -1,
        titles: titles.map((t) => String(t).trim().slice(0, 80)),
      };
    });
  }

  // Scenario 1: cookie overwritten by admin — staff are valid participants and see catalog (#211).
  {
    const { page } = await bootPage(
      { ok: true, authenticated: true, role: 'admin', username: 'admin', display_name: 'Web Admin' },
      okJson({ ok: true, missions: SAMPLE_CATALOG }),
      okJson({ ok: true, submissions: [] })
    );
    const state = await bannerState(page);
    assert(state.bannerVisible === false, 'Scenario 1 (admin): role-mismatch banner is NOT shown for staff participants');
    assert(state.warningVisible === false, 'Scenario 1: no false load-failure warning when catalog succeeds');
    assert(state.gridCardCount >= 2, 'Scenario 1: admin sees full catalog cards (not Hidden Nugget alone): got ' + state.gridCardCount);
    assert(state.titles.some((t) => /Thank a Teacher/i.test(t)), 'Scenario 1: Thank a Teacher visible to admin');
    await page.close();
  }

  // Scenario 2: cookie overwritten by teacher — same catalog visibility.
  {
    const { page } = await bootPage(
      { ok: true, authenticated: true, role: 'teacher', username: 'rick.radle', display_name: 'Rick Radle' },
      okJson({ ok: true, missions: SAMPLE_CATALOG }),
      okJson({ ok: true, submissions: [] })
    );
    const state = await bannerState(page);
    assert(state.bannerVisible === false, 'Scenario 2 (teacher): role-mismatch banner is NOT shown');
    assert(state.gridCardCount >= 2, 'Scenario 2: teacher sees catalog cards: got ' + state.gridCardCount);
    assert(state.titles.some((t) => /Daily Check-In|Thank a Teacher/i.test(t)), 'Scenario 2: representative missions visible to teacher');
    await page.close();
  }

  // Scenario 3: expired session still redirects to login (triggered via failed mission fetch recheck).
  {
    const { page } = await bootPage(
      { ok: true, authenticated: false },
      (route) => route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'forbidden' }) }),
      (route) => route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'forbidden' }) })
    );
    await page.waitForTimeout(500);
    const url = page.url();
    assert(/login\.html/i.test(url), 'Scenario 3 (expired session): redirected to login.html (Prompt #85 behavior preserved), got: ' + url);
    await page.close();
  }

  // Scenario 4: genuine transient failure with a still-valid student session.
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
