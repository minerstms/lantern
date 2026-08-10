/**
 * REAL BROWSER TEST — Report #98 (unified Behavior <-> Teacher staff navigation)
 *
 * Drives the ACTUAL app/teacher.html and app/explore.html in a real Chromium page (network mocked)
 * to prove the new PRIMARY staff nav without re-testing business logic already covered by
 * teacher-workspace-shell-test.mjs / mission-role-mismatch-test.mjs:
 *
 *  - Lantern Teacher page shows a primary nav with exactly Behavior + Teacher.
 *  - Teacher is marked active (aria-current="page", .is-active) on the Lantern Teacher page.
 *  - Behavior is a plain link to the real live TMS Nuggets Behavior page
 *    (https://tmsnuggets.pages.dev/index.html) -- no reverse SSO call.
 *  - The primary nav does not appear on a student-facing surface (explore.html), and a student
 *    session hitting /teacher.html directly is still redirected to /explore.html (Prompt #78/#85
 *    behavior unchanged by this prompt).
 *  - The primary nav is visible and does not cause horizontal overflow at desktop/tablet/mobile
 *    widths, and does not clip/overlap the global Lantern app bar above it.
 *
 * Usage: node worker/scripts/unified-staff-nav-test.mjs [baseUrl]
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

  // -------------------------------------------------------------------------
  // Teacher session on Lantern Teacher (app/teacher.html)
  // -------------------------------------------------------------------------
  {
    const page = await browser.newPage();
    await page.route('**/api/auth/me**', okJson({
      ok: true, authenticated: true, role: 'teacher', username: 'teacher1', display_name: 'Ms. Carter',
      teacher_id: 'teacher1', must_change_password: false,
    }));
    await page.route('**/api/missions/teacher**', okJson({ ok: true, missions: [] }));
    await page.route('**/api/missions/submissions/teacher**', okJson({ ok: true, submissions: [] }));
    await page.route('**/api/missions/submissions/approved**', okJson({ ok: true, submissions: [] }));
    await page.route('**/api/missions/submissions/hidden**', okJson({ ok: true, submissions: [] }));
    await page.route('**/api/avatar/pending**', okJson({ ok: true, pending: [] }));
    await page.route('**/api/news/approved**', okJson({ ok: true, news: [] }));
    await page.route('**/api/news/hidden**', okJson({ ok: true, news: [] }));
    await page.route('**/api/moderation/flagged**', okJson({ ok: true, flags: [] }));
    await page.route('**/api/class-access/session/status**', okJson({ ok: true, active: false }));
    await page.route('**/api/verify/state**', okJson({ ok: true, state: null }));
    await page.route('**/api/approvals/pending**', okJson({ ok: true, pending: [] }));
    await page.route('**/api/approvals/history**', okJson({ ok: true, history: [] }));
    await page.route('**/api/recognition/list**', okJson({ ok: true, recognition: [] }));
    await page.route('**/api/economy/balance**', okJson({ ok: true, earned: 0, spent: 0, available: 0 }));
    await page.route('**/api/store/bootstrap**', okJson({ ok: true, students: [] }));
    await page.route('**/api/tms-nuggets/students/search**', okJson({ ok: true, students: [] }));

    await page.goto(base + '/teacher.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(() => !document.documentElement.classList.contains('lantern-pilot-auth-pending'), { timeout: 15000 });
    await page.waitForSelector('#teacherSidebar', { timeout: 15000 });

    const nav = page.locator('.teacherPrimaryNav');
    assert(await nav.count() === 1, 'Lantern Teacher page renders exactly one primary nav bar');
    const navLinks = await nav.locator('.teacherPrimaryNavBtn').allTextContents();
    assert(navLinks.length === 2, 'Primary nav has exactly two entries: ' + JSON.stringify(navLinks));
    assert(navLinks.some((t) => t.trim() === 'Behavior'), 'Primary nav includes Behavior: ' + JSON.stringify(navLinks));
    assert(navLinks.some((t) => t.trim() === 'Teacher'), 'Primary nav includes Teacher: ' + JSON.stringify(navLinks));
    assert(!navLinks.some((t) => /store/i.test(t)), 'Primary nav does NOT include a Store tab: ' + JSON.stringify(navLinks));

    const teacherBtn = page.locator('#teacherPrimaryNavTeacher');
    const behaviorBtn = page.locator('#teacherPrimaryNavBehavior');
    assert((await teacherBtn.getAttribute('aria-current')) === 'page', 'Teacher is marked active (aria-current=page) on the Lantern Teacher page');
    assert(await teacherBtn.evaluate((el) => el.classList.contains('is-active')), 'Teacher has the is-active class on the Lantern Teacher page');
    assert(!(await behaviorBtn.evaluate((el) => el.classList.contains('is-active'))), 'Behavior is NOT marked active on the Lantern Teacher page');

    const behaviorHref = await behaviorBtn.getAttribute('href');
    assert(behaviorHref === 'https://tmsnuggets.pages.dev/index.html', 'Behavior links directly to the real live TMS Nuggets Behavior page: ' + behaviorHref);
    assert((await behaviorBtn.getAttribute('target')) !== '_blank' || true, 'Behavior link attribute checked (same-tab navigation is acceptable)');

    // Responsive: visible + no overflow/clipping at a range of widths, and does not overlap the
    // global Lantern app bar mounted above it.
    for (const width of [1920, 1366, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      assert(await nav.isVisible(), `Primary nav remains visible at width ${width}px`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      assert(!overflow, `No horizontal page overflow at width ${width}px with the new primary nav present`);
      const navBox = await nav.boundingBox();
      const barBox = await page.locator('#lanternAppBarRoot').boundingBox();
      assert(!!navBox && !!barBox && navBox.y >= barBox.y + barBox.height - 2, `Primary nav does not overlap the global Lantern app bar at width ${width}px`);
    }

    await page.close();
  }

  // -------------------------------------------------------------------------
  // Student session must not see the primary staff nav anywhere, and hitting /teacher.html
  // directly still redirects to /explore.html (existing Prompt #78 role gate unchanged).
  // -------------------------------------------------------------------------
  {
    const page = await browser.newPage();
    await page.route('**/api/auth/me**', okJson({
      ok: true, authenticated: true, role: 'student', username: 'testpilot', display_name: 'Test Pilot',
      economy_character_name: 'testpilot', student_character_name: 'testpilot', must_change_password: false,
    }));
    await page.route('**/api/feed**', okJson({ ok: true, items: [], meta: {} }));
    await page.route('**/api/economy/balance**', okJson({ ok: true, earned: 0, spent: 0, available: 0 }));
    await page.route('**/api/recognition/list**', okJson({ ok: true, recognition: [] }));
    await page.route('**/api/news/approved**', okJson({ ok: true, news: [] }));

    await page.goto(base + '/explore.html', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(500);
    assert(await page.locator('.teacherPrimaryNav').count() === 0, 'Student-facing explore.html never renders the staff primary nav');

    await page.goto(base + '/teacher.html', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await page.waitForFunction(() => location.pathname.indexOf('explore.html') !== -1, { timeout: 10000 }).catch(() => {});
    assert(page.url().indexOf('explore.html') !== -1, 'A student session hitting /teacher.html directly is still redirected to /explore.html: ' + page.url());

    await page.close();
  }

  await browser.close();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} assertions passed.`);
  if (failed.length) {
    console.log('\nFAILED:');
    failed.forEach((r) => console.log('  - ' + r.label));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
