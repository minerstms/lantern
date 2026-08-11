/**
 * REAL BROWSER TEST — Prompt #82 (teacher missions missing from student Active grid).
 * Drives the ACTUAL app/missions.html through a normal boot with the teacher-missions
 * endpoint mocked to prove:
 *   1. Quick (built-in) missions and eligible Teacher missions coexist in ONE Active grid —
 *      Active is additive (quick + teacher), never teacher-only or quick-only.
 *   2. The Active/Completed counts reflect the real combined dataset (no hardcoded "5").
 *   3. A genuine teacher-mission fetch FAILURE shows a visible, non-destructive warning
 *      instead of silently rendering as if the page fully loaded (Quick missions must still
 *      be usable underneath the warning).
 *   4. A genuine SUCCESS with zero eligible teacher missions must NOT show that warning —
 *      "no missions" and "fetch failed" are different states and must never be conflated.
 *
 * Usage: node worker/scripts/mission-active-quick-merge-test.mjs [baseUrl]
 * Requires a static file server for app/ at baseUrl (default http://127.0.0.1:8765).
 */
import { chromium } from '../../e2e/studio-contribute/node_modules/playwright/index.mjs';

const base = (process.argv[2] || 'http://127.0.0.1:8765').replace(/\/$/, '');

const UNSTARTED = { id: 'tm_merge_unstarted', title: 'Merge Unstarted Mission', description: 'Do a thing', reward_amount: 3, submission_type: 'text', allows_text: true, audience: 'school_mission' };
const PENDING = { id: 'tm_merge_pending', title: 'Merge Pending Mission', description: 'Already submitted', reward_amount: 4, submission_type: 'text', allows_text: true, audience: 'school_mission' };
const RETURNED = { id: 'tm_merge_returned', title: 'Merge Returned Mission', description: 'Needs a redo', reward_amount: 2, submission_type: 'text', allows_text: true, audience: 'school_mission' };
const COMPLETED = { id: 'tm_merge_completed', title: 'Merge Completed Mission', description: 'All done', reward_amount: 5, submission_type: 'text', allows_text: true, audience: 'school_mission' };

const SUBMISSIONS = [
  { id: 'msub_merge_pending', mission_id: PENDING.id, character_name: 'testpilot', submission_type: 'text', submission_content: 'my answer', status: 'pending', created_at: '2026-08-08T01:00:00.000Z' },
  { id: 'msub_merge_returned', mission_id: RETURNED.id, character_name: 'testpilot', submission_type: 'text', submission_content: 'my other answer', status: 'returned', created_at: '2026-08-08T02:00:00.000Z' },
  { id: 'msub_merge_completed', mission_id: COMPLETED.id, character_name: 'testpilot', submission_type: 'text', submission_content: 'done', status: 'accepted', created_at: '2026-08-08T03:00:00.000Z' },
];

async function main() {
  const results = [];
  function assert(cond, label) {
    results.push({ pass: !!cond, label });
    console.log((cond ? 'PASS' : 'FAIL') + ' — ' + label);
  }

  const browser = await chromium.launch();

  const okJson = (body) => (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

  async function bootPage(missionsRoute, opts) {
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));

    await page.addInitScript(() => { window.LANTERN_AVATAR_API = ''; });
    await page.route('**/api/auth/me**', okJson({
      ok: true, authenticated: true, role: 'student', username: 'testpilot', display_name: 'Test Pilot',
      economy_character_name: 'testpilot', student_character_name: 'testpilot', must_change_password: false,
    }));
    await page.route('**/api/class-access/**', okJson({ ok: true, accessState: 'none', tokenValid: true }));
    await page.route('**/api/missions/active**', missionsRoute);
    await page.route('**/api/missions/progress**', okJson({
      ok: true,
      daily_checkin: { completed_today: false },
      first_game: { completed: false },
      first_photo: { completed: false },
      create_poll: { completed: false },
      shoutout: { completed: false },
    }));
    await page.route('**/api/missions/submissions/character**', okJson({ ok: true, submissions: (opts && opts.submissions) || [] }));
    await page.route('**/api/verify/state**', okJson({ ok: true, state: null }));

    await page.goto(base + '/missions.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(() => !!(window.LanternMissionsRuntime && window.LanternMissionsRuntime.loadMissions), { timeout: 15000 });
    await page.waitForSelector('#missionsLibraryGrid [data-lantern-card-type]', { timeout: 15000 });
    // loadMissions() settles after all 3 parallel fetches resolve; give the (mocked, fast) retry
    // path room to finish for the failure-path pages before asserting on final state.
    await page.waitForTimeout(1200);
    return { page, consoleErrors };
  }

  function cardTitles(page) {
    return page.evaluate(() => Array.from(document.querySelectorAll('#missionsLibraryGrid [data-lantern-card-type]')).map((el) => ({
      title: (el.querySelector('.lanternCanonicalCardTitle') || {}).textContent || '',
      stateBadge: (el.querySelector('.lanternCanonicalCardStateBadge') || {}).textContent || '',
    })));
  }

  // ---------------------------------------------------------------------------
  // Scenario 1: Prompt #165 — deferred quick stubs (Thank-You + Hidden Nugget) + 3 eligible
  // teacher missions + 1 completed => Active = 5, Completed = 1.
  // ---------------------------------------------------------------------------
  {
    const { page, consoleErrors } = await bootPage(
      okJson({ ok: true, missions: [UNSTARTED, PENDING, RETURNED, COMPLETED] }),
      { submissions: SUBMISSIONS }
    );

    const activeCards = await cardTitles(page);
    const findCard = (title) => activeCards.find((c) => c.title.indexOf(title) !== -1);

    const quickTitles = ['Hidden Nugget'];
    const quickPresent = quickTitles.filter((t) => !!findCard(t));
    assert(quickPresent.length === 1, 'Hidden Nugget quick stub still present: ' + JSON.stringify(quickPresent));
    assert(!findCard('Thank-You Letter') || findCard('Thank a Teacher'), 'legacy Thank-You Letter stub not required');
    assert(!!findCard(UNSTARTED.title), 'Active grid shows the eligible unstarted teacher mission');
    assert(!!findCard(PENDING.title), 'Active grid shows the eligible pending (STARTED) teacher mission');
    assert(!!findCard(RETURNED.title), 'Active grid shows the eligible returned (NEEDS CHANGES) teacher mission');
    assert(!findCard(COMPLETED.title), 'Active grid does NOT show the completed teacher mission');

    const activeCountLabel = await page.evaluate(() => document.querySelector('#missionsStatusTabs [data-mission-status="active"]').textContent);
    const activeCountNum = parseInt((activeCountLabel.match(/(\d+)/) || [])[1], 10);
    assert(activeCountNum === 4, 'Active count is 1 quick stub + 3 eligible teacher missions: got "' + activeCountLabel + '"');
    assert(activeCountNum === activeCards.length, 'Active tab count label matches the actual number of rendered cards');

    await page.evaluate(() => document.querySelector('#missionsStatusTabs [data-mission-status="completed"]').click());
    await page.waitForFunction(() => document.querySelector('#missionsStatusTabs [data-mission-status="completed"]').classList.contains('is-active'), { timeout: 5000 });
    const completedCountLabel = await page.evaluate(() => document.querySelector('#missionsStatusTabs [data-mission-status="completed"]').textContent);
    const completedCountNum = parseInt((completedCountLabel.match(/(\d+)/) || [])[1], 10);
    assert(completedCountNum === 1, 'Completed count reflects exactly the 1 completed teacher mission: got "' + completedCountLabel + '"');

    const warningVisible = await page.evaluate(() => {
      const w = document.getElementById('missionsLibraryWarning');
      return w ? !w.hidden : null;
    });
    assert(warningVisible === false, 'No failure warning shown when the teacher-mission fetch genuinely succeeded');

    if (consoleErrors.length) {
      console.log('  (scenario 1 console errors: ' + consoleErrors.slice(0, 5).join(' | ') + ')');
    }
    await page.close();
  }

  // ---------------------------------------------------------------------------
  // Scenario 2: teacher-mission fetch FAILS (every attempt, including the retry) —
  // Quick missions must still render and stay usable, AND a visible warning must appear.
  // This is the exact failure mode that can make teacher missions silently vanish with
  // no sign anything went wrong (Prompt #82 root-cause class: silent catch-and-drop).
  // ---------------------------------------------------------------------------
  {
    let attempts = 0;
    const { page } = await bootPage((route) => {
      attempts++;
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'boom' }) });
    });

    const cards = await cardTitles(page);
    const quickTitles = ['Hidden Nugget'];
    const quickPresent = quickTitles.filter((t) => cards.some((c) => c.title.indexOf(t) !== -1));
    assert(quickPresent.length === 1, 'Hidden Nugget still renders/usable when the teacher-mission fetch fails: ' + JSON.stringify(quickPresent));
    assert(attempts >= 2, 'A failed teacher-mission fetch is retried at least once before giving up (got ' + attempts + ' attempt(s))');

    const warningVisible = await page.evaluate(() => {
      const w = document.getElementById('missionsLibraryWarning');
      return w ? !w.hidden : null;
    });
    assert(warningVisible === true, 'A visible warning is shown when the teacher-mission fetch genuinely fails (no silent fallback to quick-only)');
    const warningText = await page.evaluate(() => (document.getElementById('missionsLibraryWarning') || {}).textContent || '');
    assert(/couldn.?t be loaded|refresh/i.test(warningText), 'Warning text is a plain-language, non-destructive message: "' + warningText + '"');

    await page.close();
  }

  // ---------------------------------------------------------------------------
  // Scenario 3: teacher-mission fetch SUCCEEDS with a genuine empty result (this student
  // is legitimately eligible for zero teacher missions right now) — must NOT be treated
  // as a failure and must NOT show the warning.
  // ---------------------------------------------------------------------------
  {
    const { page } = await bootPage(okJson({ ok: true, missions: [] }));
    const warningVisible = await page.evaluate(() => {
      const w = document.getElementById('missionsLibraryWarning');
      return w ? !w.hidden : null;
    });
    assert(warningVisible === false, 'A genuine zero-result success does NOT show the failure warning (empty is not broken)');
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
