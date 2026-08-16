/**
 * REAL BROWSER TEST — Prompt #145/#146 (canonical STAFF nav: Teacher Tools / Behavior Logger)
 *
 * Proves:
 *  - Lantern Teacher page no longer has the giant Behavior|Teacher primary button row.
 *  - Shared LanternStaffNav labels/order appear in the Lantern ▼ STAFF dropdown (no Display Board).
 *  - Behavior Logger still uses the authorize handoff to TMS Nuggets.
 *  - Hallway TV remains in the Teacher Tools sidebar.
 *  - Student explore never gets a staff primary nav bar; student→teacher redirect unchanged.
 *
 * Usage: node worker/scripts/unified-staff-nav-test.mjs [baseUrl]
 * Requires a static file server for app/ at baseUrl (default http://127.0.0.1:8765).
 */
import { chromium } from '../../e2e/studio-contribute/node_modules/playwright/index.mjs';

const base = (process.argv[2] || 'http://127.0.0.1:8765').replace(/\/$/, '');
const EXPECTED_STAFF = ['Teacher Tools', 'Behavior Logger'];
const EXPECTED_NAV = ['Lantern', 'Locker', 'Create', 'Media Library', 'Play', 'Missions'];
const EXPECTED_FULL = EXPECTED_NAV.concat(EXPECTED_STAFF);

async function main() {
  const results = [];
  function assert(cond, label) {
    results.push({ pass: !!cond, label });
    console.log((cond ? 'PASS' : 'FAIL') + ' — ' + label);
  }

  const browser = await chromium.launch();
  const okJson = (body) => (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

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

    assert(await page.locator('.teacherPrimaryNav').count() === 0, 'Lantern Teacher page has no giant Behavior|Teacher primary nav row');
    assert(await page.locator('#teacherPrimaryNavBehavior').count() === 0, 'Giant Behavior button id removed');
    assert(await page.locator('#teacherPrimaryNavTeacher').count() === 0, 'Giant Teacher button id removed');

    await page.waitForSelector('#lanternMenuTrigger', { timeout: 15000 });
    await page.click('#lanternMenuTrigger');
    await page.waitForSelector('#lanternMenuDropdown.is-open, #lanternMenuDropdown:not([hidden])', { timeout: 5000 }).catch(() => {});

    const staffSection = page.locator('#lanternMenuDropdown .lanternAppBarDropdownSection').filter({ hasText: 'STAFF' });
    const staffLabels = await staffSection.locator('a.lanternAppBarDropdownLink').allTextContents();
    const trimmed = staffLabels.map((t) => t.trim());
    assert(JSON.stringify(trimmed) === JSON.stringify(EXPECTED_STAFF), 'STAFF menu order/labels exact: ' + JSON.stringify(trimmed));
    assert(!trimmed.some((t) => /display|hallway/i.test(t)), 'Global STAFF dropdown has no Display / Display Board / Hallway TV: ' + JSON.stringify(trimmed));

    const navSection = page.locator('#lanternMenuDropdown .lanternAppBarDropdownSection').filter({ hasText: 'NAVIGATION' });
    const navLabels = (await navSection.locator('a.lanternAppBarDropdownLink').allTextContents()).map((t) =>
      t.replace(/\s+\d+\s*$/, '').trim()
    );
    assert(JSON.stringify(navLabels) === JSON.stringify(EXPECTED_NAV), 'NAVIGATION menu order/labels exact: ' + JSON.stringify(navLabels));

    const allLinkLabels = (await page.locator('#lanternMenuDropdown a.lanternAppBarDropdownLink').allTextContents()).map((t) =>
      t.replace(/\s+\d+\s*$/, '').trim()
    );
    assert(JSON.stringify(allLinkLabels) === JSON.stringify(EXPECTED_FULL), 'Full Explore-canonical menu order: ' + JSON.stringify(allLinkLabels));
    assert(await page.locator('#lanternMenuDropdown a[data-page="display"]').count() === 0, 'Global dropdown has no data-page=display link');
    assert(!(await page.locator('#lanternMenuDropdown').innerText()).match(/Display Board|Hallway TV/i), 'Display Board / Hallway TV absent from global menu text');

    // Prompt #152 — shared text inset aligns dropdown item text under L in Lantern
    const align = await page.evaluate(() => {
      const home = document.getElementById('lanternHomeLink');
      const locker = document.querySelector('#lanternMenuDropdown a[data-page="locker"]');
      if (!home || !locker) return { ok: false, reason: 'missing nodes' };
      const homeL = home.getBoundingClientRect().left;
      // Approximate glyph start: padding-box left (getBoundingClientRect is border-box; padding via computed)
      const hs = getComputedStyle(home);
      const homeTextX = homeL + (parseFloat(hs.paddingLeft) || 0) + (parseFloat(hs.borderLeftWidth) || 0);
      const lr = locker.getBoundingClientRect().left;
      const ls = getComputedStyle(locker);
      const lockerTextX = lr + (parseFloat(ls.paddingLeft) || 0) + (parseFloat(ls.borderLeftWidth) || 0);
      return {
        ok: Math.abs(homeTextX - lockerTextX) <= 1.5,
        homeTextX,
        lockerTextX,
        inset: getComputedStyle(document.documentElement).getPropertyValue('--lantern-nav-text-inset').trim(),
      };
    });
    assert(align.ok, 'Dropdown item text aligns under L in Lantern (±1.5px): ' + JSON.stringify(align));
    assert(align.inset === '14px', 'Shared --lantern-nav-text-inset is 14px: ' + align.inset);

    const teacherLink = page.locator('#lanternMenuDropdown a[data-page="teacher"]');
    const behaviorLink = page.locator('#lanternMenuDropdown a[data-page="behavior"]');
    assert(await teacherLink.evaluate((el) => el.classList.contains('is-active')), 'Teacher Tools marked current on Teacher page');
    assert(!(await behaviorLink.evaluate((el) => el.classList.contains('is-active'))), 'Behavior Logger not marked current on Teacher page');

    const behaviorHref = await behaviorLink.getAttribute('href');
    assert(
      /tms-device-authorize/.test(behaviorHref || '') && /log\.tmslantern\.org/.test(decodeURIComponent(behaviorHref || '')),
      'Behavior Logger uses authorize handoff to TMS: ' + behaviorHref
    );
    assert(/teacher\.html/.test(await teacherLink.getAttribute('href') || ''), 'Teacher Tools points at teacher.html');

    const hallwayTvLink = page.locator('a.teacherSidebarItem[href="display.html"]');
    assert(await hallwayTvLink.count() === 1, 'Hallway TV remains in Teacher Tools sidebar');
    assert(((await hallwayTvLink.innerText()) || '').indexOf('Hallway TV') !== -1, 'Hallway TV sidebar item is labeled correctly');

    for (const width of [1920, 1366, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      assert(!overflow, `No horizontal page overflow at width ${width}px`);
    }

    await page.close();
  }

  {
    // Prompt #251 — Web Admin privileged links require TMS capabilities, not role===admin.
    const page = await browser.newPage();
    await page.route('**/api/auth/me**', okJson({
      ok: true, authenticated: true, role: 'admin', username: 'admin', display_name: 'Web Admin',
      teacher_id: null, must_change_password: false,
      capabilities: { teacher: true, report_maker: true, behavior_admin: true, system_admin: true, secretary: false },
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
    await page.waitForSelector('#lanternMenuTrigger', { timeout: 15000 });
    await page.click('#lanternMenuTrigger');
    await page.waitForSelector('#lanternMenuDropdown.is-open, #lanternMenuDropdown:not([hidden])', { timeout: 5000 }).catch(() => {});
    await page.waitForFunction(() => {
      const a = document.querySelector('#lanternMenuDropdown a[data-page="system"]');
      return !!(a && /System/.test(a.textContent || ''));
    }, { timeout: 8000 }).catch(() => {});

    const staffSection = page.locator('#lanternMenuDropdown .lanternAppBarDropdownSection').filter({ hasText: 'STAFF' });
    const staffLabels = (await staffSection.locator('a.lanternAppBarDropdownLink').allTextContents()).map((t) => t.trim());
    assert(JSON.stringify(staffLabels) === JSON.stringify(['Teacher Tools', 'Behavior Logger']), 'Web Admin STAFF order: ' + JSON.stringify(staffLabels));
    const systemLink = page.locator('#lanternMenuDropdown a[data-page="system"]');
    assert(await systemLink.count() === 1, 'System menuitem present for Web Admin capabilities');
    assert((await systemLink.getAttribute('href')) === '/admin#system', 'System points to /admin#system');
    const reportsLink = page.locator('#lanternMenuDropdown a[data-page="reports"]');
    assert(await reportsLink.count() === 1, 'Reports menuitem present for Web Admin capabilities');
    assert(!(await page.locator('#lanternMenuDropdown').innerText()).match(/Display Board|Hallway TV/i), 'Admin menu still omits Hallway TV / Display Board');
    await page.close();
  }

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
