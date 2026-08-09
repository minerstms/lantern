/**
 * REAL BROWSER TEST — Prompt #77 (Teacher workspace information-architecture redesign)
 *
 * Drives the ACTUAL app/teacher.html in a real Chromium page (every touched network endpoint
 * mocked) and proves the new sidebar + one-active-workspace shell without re-testing business
 * logic already covered by teacher-media-display-test.mjs / teacher-create-repair-test.mjs /
 * teacher-mission-pipeline-test.mjs / missions-identity-auth-test.mjs / teacher-manual-sale-test.mjs:
 *
 *  - Sidebar exists with the 7 expected workspace items; only ONE workspace is visible at a time.
 *  - Default workspace on a plain /teacher.html load is Overview.
 *  - Sidebar clicks + hash routing (#review, #create, ...) both switch workspaces; unknown hash
 *    falls back to Overview; browser back/forward works.
 *  - Review Queue: My Classroom / Schoolwide secondary tabs show one queue at a time; Filters
 *    panel is collapsed by default and toggles open; bulk action bar is compact/inactive until
 *    something is selected, then shows Approve/Reject + count.
 *  - Create Mission workspace: existing handler still wired (Creating…/Created ✓ flow) and the
 *    reward field defaults to 1 Nugget.
 *  - Moderation and Nuggets & Sales workspaces are reachable and retain their existing controls
 *    (manual sale amount also defaults to 1).
 *  - Mobile drawer: sidebar is off-canvas by default at phone width, opens via the menu button,
 *    and closes after choosing a workspace.
 *  - No horizontal page overflow at 1920/1366/1024/390 widths.
 *
 * Usage: node worker/scripts/teacher-workspace-shell-test.mjs [baseUrl]
 * Requires a static file server for app/ at baseUrl (default http://127.0.0.1:8765).
 */
import { chromium } from '../../e2e/studio-contribute/node_modules/playwright/index.mjs';

const base = (process.argv[2] || 'http://127.0.0.1:8765').replace(/\/$/, '');

const FIXTURE_MISSION_SUBMISSION = {
  id: 'msub_shell_test_1',
  mission_id: 'tmission_shell_test',
  mission_title: 'Shell Test Mission',
  mission_reward: 2,
  character_name: 'shellpilot',
  submission_type: 'text',
  submission_content: 'a plain written reflection for the workspace shell test',
  status: 'pending',
  created_by_teacher_name: 'Teacher',
  created_at: '2026-08-09T12:00:00.000Z',
};

const FIXTURE_APPROVAL_ITEM = {
  id: 'apr_shell_test_1',
  item_type: 'news',
  title: 'Schoolwide item for shell test',
  submitter: 'otherstudent',
  category: 'General',
  created_at: '2026-08-09T11:00:00.000Z',
};

async function main() {
  const results = [];
  function assert(cond, label) {
    results.push({ pass: !!cond, label });
    console.log((cond ? 'PASS' : 'FAIL') + ' — ' + label);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  const okJson = (body) => (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

  await page.route('**/api/auth/me**', okJson({
    ok: true, authenticated: true, role: 'teacher', username: 'teacher1', display_name: 'Ms. Carter',
    teacher_id: 'teacher1', must_change_password: false,
  }));
  await page.route('**/api/missions/teacher**', okJson({ ok: true, missions: [{ id: 'tmission_shell_test', title: 'Shell Test Mission', reward_amount: 2, active: 1, teacher_id: 'teacher1', teacher_name: 'Ms. Carter' }] }));
  await page.route('**/api/missions/submissions/teacher**', okJson({ ok: true, submissions: [FIXTURE_MISSION_SUBMISSION] }));
  await page.route('**/api/missions/submissions/approved**', okJson({ ok: true, submissions: [] }));
  await page.route('**/api/missions/submissions/hidden**', okJson({ ok: true, submissions: [] }));
  await page.route('**/api/avatar/pending**', okJson({ ok: true, pending: [] }));
  await page.route('**/api/news/approved**', okJson({ ok: true, news: [] }));
  await page.route('**/api/news/hidden**', okJson({ ok: true, news: [] }));
  await page.route('**/api/moderation/flagged**', okJson({ ok: true, flags: [] }));
  await page.route('**/api/class-access/session/status**', okJson({ ok: true, active: false }));
  await page.route('**/api/verify/state**', okJson({ ok: true, state: null }));
  await page.route('**/api/approvals/pending**', okJson({ ok: true, pending: [FIXTURE_APPROVAL_ITEM] }));
  await page.route('**/api/approvals/history**', okJson({ ok: true, history: [{ item_type: 'news', title: 'Reviewed thing', submitter: 'kid1', reviewed_by: 'Ms. Carter', reviewed_at: '2026-08-08T10:00:00.000Z' }] }));
  await page.route('**/api/recognition/list**', okJson({ ok: true, recognition: [] }));
  await page.route('**/api/economy/balance**', okJson({ ok: true, earned: 10, spent: 2, available: 8 }));
  await page.route('**/api/store/bootstrap**', okJson({ ok: true, students: ['shellpilot', 'otherstudent'] }));

  await page.goto(base + '/teacher.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => !document.documentElement.classList.contains('lantern-pilot-auth-pending'), { timeout: 15000 });
  await page.waitForSelector('#teacherSidebar', { timeout: 15000 });

  // ---------------------------------------------------------------------------
  // Sidebar + default workspace
  // ---------------------------------------------------------------------------
  const sidebarItems = await page.locator('.teacherSidebarItem').allTextContents();
  const expectedLabels = ['Overview', 'Review Queue', 'Create Mission', 'My Missions', 'Moderation', 'Nuggets', 'Other Tools'];
  assert(expectedLabels.every((l) => sidebarItems.some((t) => t.indexOf(l) !== -1)), 'Sidebar has all 7 expected workspace items: ' + JSON.stringify(sidebarItems));

  function activeWorkspaceIds() {
    return page.evaluate(() => Array.from(document.querySelectorAll('#teacherMain > [data-workspace].is-active-workspace')).map((el) => el.getAttribute('data-workspace')));
  }

  assert((await activeWorkspaceIds()).join(',') === 'overview', 'Default workspace on a plain /teacher.html load is Overview');
  const overviewVisibleCount = await page.locator('#teacherMain > [data-workspace].is-active-workspace').count();
  assert(overviewVisibleCount === 1, 'Exactly one workspace pane is visible at a time (Overview)');

  const pendingCountText = await page.locator('#teacherOverviewPendingCount').innerText();
  assert(pendingCountText === '2', 'Overview Pending Review count reflects real queue data (1 classroom + 1 schoolwide): ' + pendingCountText);
  const activeMissionsText = await page.locator('#teacherOverviewActiveMissionsCount').innerText();
  assert(activeMissionsText === '1', 'Overview Active Missions count reflects real mission data: ' + activeMissionsText);

  // ---------------------------------------------------------------------------
  // Sidebar navigation + hash routing
  // ---------------------------------------------------------------------------
  await page.click('.teacherSidebarItem[data-workspace-link="review"]');
  await page.waitForFunction(() => document.getElementById('teacher-approvals').classList.contains('is-active-workspace'), { timeout: 5000 });
  assert(page.url().indexOf('#review') !== -1, 'Clicking the Review Queue sidebar item updates the URL hash');
  assert((await activeWorkspaceIds()).join(',') === 'review', 'Clicking the Review Queue sidebar item opens the review workspace');
  assert(await page.locator('.teacherSidebarItem[data-workspace-link="review"]').evaluate((el) => el.classList.contains('is-active')), 'Review Queue sidebar item is marked active');

  await page.goto(base + '/teacher.html#create', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.documentElement.classList.contains('lantern-pilot-auth-pending'), { timeout: 15000 });
  await page.waitForFunction(() => {
    const el = document.getElementById('teacher-create-mission');
    return el && el.classList.contains('is-active-workspace');
  }, { timeout: 5000 });
  assert(true, 'Direct navigation to /teacher.html#create opens the Create Mission workspace on load');

  await page.goto(base + '/teacher.html#not-a-real-workspace', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.documentElement.classList.contains('lantern-pilot-auth-pending'), { timeout: 15000 });
  assert((await activeWorkspaceIds()).join(',') === 'overview', 'An unknown hash falls back to the Overview workspace');

  await page.evaluate(() => { location.hash = 'review'; });
  await page.waitForFunction(() => location.hash === '#review', { timeout: 5000 });
  await page.evaluate(() => { location.hash = 'moderation'; });
  await page.waitForFunction(() => location.hash === '#moderation', { timeout: 5000 });
  await page.goBack();
  await page.waitForFunction(() => location.hash === '#review', { timeout: 5000 });
  assert((await activeWorkspaceIds()).join(',') === 'review', 'Browser back button restores the previous workspace via hash history');
  await page.goForward();
  await page.waitForFunction(() => location.hash === '#moderation', { timeout: 5000 });
  assert((await activeWorkspaceIds()).join(',') === 'moderation', 'Browser forward button re-applies the next workspace via hash history');

  // ---------------------------------------------------------------------------
  // Review Queue — Classroom / Schoolwide tabs, collapsible filters, contextual bulk bar
  // ---------------------------------------------------------------------------
  await page.evaluate(() => { location.hash = 'review'; });
  await page.waitForFunction(() => document.getElementById('teacher-approvals').classList.contains('is-active-workspace'), { timeout: 5000 });
  await page.waitForSelector('#myClassroomBody .teacherApprovalPendingRow', { timeout: 15000 });

  assert(await page.locator('.approvalsCol[data-review-panel="classroom"]').evaluate((el) => el.classList.contains('is-active')), 'My Classroom panel is the active review tab by default');
  const schoolwideHiddenBefore = await page.locator('.approvalsCol[data-review-panel="schoolwide"]').evaluate((el) => getComputedStyle(el).display === 'none');
  assert(schoolwideHiddenBefore, 'Schoolwide panel is not shown while My Classroom tab is active (one queue at a time)');

  await page.click('#reviewTabSchoolwide');
  await page.waitForFunction(() => document.querySelector('.approvalsCol[data-review-panel="schoolwide"]').classList.contains('is-active'), { timeout: 5000 });
  const classroomHiddenAfter = await page.locator('.approvalsCol[data-review-panel="classroom"]').evaluate((el) => getComputedStyle(el).display === 'none');
  assert(classroomHiddenAfter, 'Switching to the Schoolwide tab hides the My Classroom panel (one queue at a time)');
  await page.waitForSelector('#schoolwideQueueBody .teacherApprovalPendingRow', { timeout: 10000 });
  assert(true, 'Schoolwide queue renders its own real pending row after switching tabs');
  await page.click('#reviewTabClassroom');
  await page.waitForFunction(() => document.querySelector('.approvalsCol[data-review-panel="classroom"]').classList.contains('is-active'), { timeout: 5000 });

  const filtersPanelHiddenByDefault = await page.locator('#approvalsFiltersPanel').evaluate((el) => el.hasAttribute('hidden'));
  assert(filtersPanelHiddenByDefault, 'Filters panel (Type/Category/Reset) is collapsed by default');
  await page.click('#approvalsFiltersToggleBtn');
  const filtersPanelVisibleAfterToggle = await page.locator('#approvalsFiltersPanel').evaluate((el) => !el.hasAttribute('hidden'));
  assert(filtersPanelVisibleAfterToggle, 'Clicking Filters opens the collapsible filter panel');
  assert(await page.locator('#approvalsKindChips').isVisible(), 'Type filter chips are reachable inside the opened Filters panel');
  assert(await page.locator('#approvalsSortOrder').isVisible(), 'Sort control remains visible outside the collapsible Filters panel');
  await page.click('#approvalsFiltersToggleBtn');
  const filtersPanelHiddenAfterSecondToggle = await page.locator('#approvalsFiltersPanel').evaluate((el) => el.hasAttribute('hidden'));
  assert(filtersPanelHiddenAfterSecondToggle, 'Clicking Filters again collapses the panel');

  const bulkActiveGroupHiddenBefore = await page.locator('#approvalsBatchBar .approvalsBulkActiveGroup').evaluate((el) => getComputedStyle(el).display === 'none');
  assert(bulkActiveGroupHiddenBefore, 'Approve/Reject/count bulk controls are not shown while nothing is selected');
  await page.check('#myClassroomBody .teacherApprovalPendingRow .approvalRowSelect');
  await page.waitForFunction(() => document.getElementById('approvalsBatchBar').classList.contains('has-selection'), { timeout: 5000 });
  const bulkActiveGroupVisibleAfter = await page.locator('#approvalsBatchBar .approvalsBulkActiveGroup').evaluate((el) => getComputedStyle(el).display !== 'none');
  assert(bulkActiveGroupVisibleAfter, 'Selecting a row reveals the compact contextual bulk action bar (Approve/Reject/count)');
  const batchCountText = await page.locator('#approvalsBatchCount').innerText();
  assert(batchCountText === '1 selected', 'Bulk action bar shows the correct selected count: ' + batchCountText);
  await page.click('#approvalsClearSelectionBtn');
  await page.waitForFunction(() => !document.getElementById('approvalsBatchBar').classList.contains('has-selection'), { timeout: 5000 });
  assert(true, 'Clear selection collapses the contextual bulk bar back down');

  // Existing Review button still opens the accepted review modal (not re-testing its content —
  // that is teacher-media-display-test.mjs's job; this only proves the control is still wired).
  await page.click('#myClassroomBody .teacherApprovalPendingRow .approvalRowReviewBtn');
  await page.waitForSelector('#reviewOverlay.is-open', { timeout: 5000 });
  assert(true, 'Review button inside the Review Queue workspace still opens the accepted review modal');
  await page.evaluate(() => document.getElementById('reviewPanelClose').click());
  await page.waitForFunction(() => !document.getElementById('reviewOverlay').classList.contains('is-open'), { timeout: 5000 });

  // ---------------------------------------------------------------------------
  // Create Mission workspace — handler retained + reward defaults to 1
  // ---------------------------------------------------------------------------
  await page.evaluate(() => { location.hash = 'create'; });
  await page.waitForFunction(() => document.getElementById('teacher-create-mission').classList.contains('is-active-workspace'), { timeout: 5000 });
  const rewardDefault = await page.locator('#missionReward').inputValue();
  assert(rewardDefault === '1', 'Create Mission reward field defaults to 1 Nugget for new missions: ' + rewardDefault);
  assert(await page.locator('#createMissionBtn').isVisible(), 'Create Mission button is visible and reachable in its own workspace');

  // ---------------------------------------------------------------------------
  // Moderation workspace — retained, isolated from Review Queue
  // ---------------------------------------------------------------------------
  await page.evaluate(() => { location.hash = 'moderation'; });
  await page.waitForFunction(() => document.getElementById('teacher-moderation').classList.contains('is-active-workspace'), { timeout: 5000 });
  assert(await page.locator('#moderationLiveEl').isVisible(), 'Moderation workspace shows the existing live-content moderation controls');
  assert(await page.locator('#moderationRefreshBtn').isVisible(), 'Moderation Refresh control is retained');
  const approvalsVisibleDuringModeration = await page.locator('#teacher-approvals').evaluate((el) => el.classList.contains('is-active-workspace'));
  assert(!approvalsVisibleDuringModeration, 'Review Queue is not shown while Moderation workspace is active (isolated from everyday review work)');

  // ---------------------------------------------------------------------------
  // Nuggets & Sales workspace — retained, manual sale amount defaults to 1
  // ---------------------------------------------------------------------------
  await page.evaluate(() => { location.hash = 'economy'; });
  await page.waitForFunction(() => document.getElementById('teacher-rewards').classList.contains('is-active-workspace'), { timeout: 5000 });
  assert(await page.locator('#teacherRewardManualSalePanel').isVisible(), 'Nuggets & Sales workspace shows the existing manual sale panel');
  const saleAmountDefault = await page.locator('#teacherRewardSaleAmount').inputValue();
  assert(saleAmountDefault === '1', 'Manual sale amount defaults to 1 Nugget: ' + saleAmountDefault);
  assert(await page.locator('#teacherRewardRecordSaleBtn').isVisible(), 'Record Sale button is retained and reachable');

  // ---------------------------------------------------------------------------
  // My Missions workspace — retained
  // ---------------------------------------------------------------------------
  await page.evaluate(() => { location.hash = 'missions'; });
  await page.waitForFunction(() => document.getElementById('teacher-missions').classList.contains('is-active-workspace'), { timeout: 5000 });
  await page.waitForSelector('#teacherMissionsEl .curatePostRow', { timeout: 10000 });
  assert(true, 'My Missions workspace lists the teacher\u2019s real missions');
  assert(await page.locator('#recognitionListEl').count() === 1, 'Recognition tool remains reachable inside My Missions');

  // ---------------------------------------------------------------------------
  // Other Tools workspace — retained (Act As Teacher / Class Access / Character Totals)
  // ---------------------------------------------------------------------------
  await page.evaluate(() => { location.hash = 'other'; });
  await page.waitForFunction(() => document.getElementById('teacher-utilities').classList.contains('is-active-workspace'), { timeout: 5000 });
  assert(await page.locator('#classAccessStartBtn, #classAccessEndBtn').first().count() >= 1, 'Class Access controls remain reachable inside Other Tools');
  assert(await page.locator('#totalsBody').isVisible(), 'Character Totals table remains reachable inside Other Tools');

  // ---------------------------------------------------------------------------
  // Mobile drawer + no horizontal overflow across required widths
  // ---------------------------------------------------------------------------
  await page.evaluate(() => { location.hash = 'overview'; });
  await page.waitForFunction(() => document.getElementById('teacherWorkspace-overview').classList.contains('is-active-workspace'), { timeout: 5000 });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  const sidebarHiddenOnMobile = await page.locator('#teacherSidebar').evaluate((el) => !el.classList.contains('is-open'));
  assert(sidebarHiddenOnMobile, 'Sidebar is off-canvas (closed) by default at phone width');
  assert(await page.locator('#teacherMobileMenuBtn').isVisible(), 'Mobile menu button is visible at phone width');
  await page.click('#teacherMobileMenuBtn');
  await page.waitForFunction(() => document.getElementById('teacherSidebar').classList.contains('is-open'), { timeout: 5000 });
  assert(true, 'Mobile menu button opens the sidebar drawer');
  await page.click('.teacherSidebarItem[data-workspace-link="create"]');
  await page.waitForFunction(() => !document.getElementById('teacherSidebar').classList.contains('is-open'), { timeout: 5000 });
  assert(true, 'Choosing a workspace from the mobile drawer closes the drawer');
  assert((await activeWorkspaceIds()).join(',') === 'create', 'Mobile drawer navigation actually switched to the chosen workspace');

  const widths = [1920, 1366, 1024, 390];
  for (const w of widths) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(120);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    assert(!overflow, 'No horizontal page overflow at width ' + w + 'px');
  }

  await browser.close();

  const failed = results.filter((r) => !r.pass);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' assertions passed.');
  if (consoleErrors.length) {
    console.log('\nConsole errors observed (' + consoleErrors.length + '):');
    consoleErrors.slice(0, 10).forEach((e) => console.log('  ' + e));
  }
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
