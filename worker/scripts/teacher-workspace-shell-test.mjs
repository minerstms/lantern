/**
 * REAL BROWSER TEST — Prompt #77 (Teacher workspace information-architecture redesign)
 *
 * Drives the ACTUAL app/teacher.html in a real Chromium page (every touched network endpoint
 * mocked) and proves the new sidebar + one-active-workspace shell without re-testing business
 * logic already covered by teacher-media-display-test.mjs / teacher-create-repair-test.mjs /
 * teacher-mission-pipeline-test.mjs / missions-identity-auth-test.mjs / teacher-manual-sale-test.mjs:
 *
 *  - Sidebar exists with the 7 expected workspace items; only ONE workspace is visible at a time.
 *  - Default workspace on a plain /teacher.html load is Nuggets (Prompt #91).
 *  - Sidebar clicks + hash routing (#review, #create, ...) both switch workspaces; unknown hash
 *    falls back to Nuggets (Prompt #91); browser back/forward works.
 *  - Review Queue: My Classroom / Schoolwide secondary tabs show one queue at a time; Filters
 *    panel is collapsed by default and toggles open; bulk action bar is compact/inactive until
 *    something is selected, then shows Approve/Reject + count.
 *  - Create Mission workspace: existing handler still wired (Creating…/Created ✓ flow) and the
 *    reward field defaults to 1 Nugget.
 *  - Moderation and Nuggets workspaces are reachable and retain their existing controls
 *    (Nugget Ledger redeem amount also defaults to 1; Prompt #95 swapped the underlying data
 *    source to the real TMS Nugget Ledger bridge without changing these DOM ids).
 *  - Mobile drawer: sidebar is off-canvas by default at phone width, opens via the menu button,
 *    and closes after choosing a workspace.
 *  - No horizontal page overflow at 1920/1366/1024/390 widths.
 *
 * Prompt #78 (visual polish + legacy option audit) additions:
 *  - Teacher-page-specific Sign out button is gone (global Lantern nav already provides logout);
 *    the global nav mount point is untouched.
 *  - Hallway TV is a real sidebar link (opens display.html in a new tab), not a header button.
 *  - Teacher identity header is compact (no giant centered hero block).
 *  - Create Mission form uses a sane desktop width (~700-850px) with standardized
 *    .teacherFieldGroup/.teacherField/.teacherInput/.teacherSelect/.teacherTextarea classes, and
 *    its two-column Audience & Reward row collapses to one column on mobile.
 *  - "Highlight-worthy / site-eligible" has been archived (removed) from Create Mission;
 *    "Pin as featured mission" is retained but relabeled "Feature this mission" with helper text.
 *  - Review Queue empty state is a compact placeholder, not a large blank bordered box.
 *
 * Prompt #91 (Nuggets first + default workspace) additions:
 *  - Sidebar order starts with Nuggets, then Overview/Review Queue/Create Mission/My
 *    Missions/Moderation/Hallway TV/Other Tools.
 *  - A plain /teacher.html load (no hash) opens Nuggets by default, not Overview.
 *  - Explicit deep links (#overview, #review, #create, ...) still open their requested
 *    workspace — Nuggets is the default, not a mandatory intermediate screen.
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
  // Prompt #95: Nuggets workspace now searches/reads/redeems through the real TMS Nugget Ledger
  // bridge instead of the old client-only demo-character economy path.
  await page.route('**/api/tms-nuggets/students/search**', okJson({ ok: true, students: [{ student_name: 'Real TMS Student', student_id: 'sid-1' }] }));
  await page.route('**/api/tms-nuggets/ledger**', okJson({ ok: true, student_name: 'Real TMS Student', student_id: 'sid-1', earned: 10, spent: 2, available: 8, recent_history: [] }));
  await page.route('**/api/tms-nuggets/redeem**', okJson({ ok: true, student_name: 'Real TMS Student', student_id: 'sid-1', redeemed_amount: 1, earned: 10, spent: 3, available: 7, recent_history: [] }));

  await page.goto(base + '/teacher.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => !document.documentElement.classList.contains('lantern-pilot-auth-pending'), { timeout: 15000 });
  await page.waitForSelector('#teacherSidebar', { timeout: 15000 });

  // ---------------------------------------------------------------------------
  // Sidebar + default workspace
  // ---------------------------------------------------------------------------
  const sidebarItems = await page.locator('.teacherSidebarItem').allTextContents();
  const expectedLabels = ['Nuggets', 'Overview', 'Review Queue', 'Create Mission', 'My Missions', 'Moderation', 'Other Tools'];
  assert(expectedLabels.every((l) => sidebarItems.some((t) => t.indexOf(l) !== -1)), 'Sidebar has all 7 expected workspace items: ' + JSON.stringify(sidebarItems));
  assert(sidebarItems[0].indexOf('Nuggets') !== -1, 'Nuggets is the first sidebar item: ' + JSON.stringify(sidebarItems));

  function activeWorkspaceIds() {
    return page.evaluate(() => Array.from(document.querySelectorAll('#teacherMain > [data-workspace].is-active-workspace')).map((el) => el.getAttribute('data-workspace')));
  }

  assert((await activeWorkspaceIds()).join(',') === 'economy', 'Default workspace on a plain /teacher.html load is Nuggets');
  const defaultWorkspaceVisibleCount = await page.locator('#teacherMain > [data-workspace].is-active-workspace').count();
  assert(defaultWorkspaceVisibleCount === 1, 'Exactly one workspace pane is visible at a time (Nuggets)');

  // Overview-specific stat elements live in the Overview pane, which is no longer the default
  // (Prompt #91); switch to it explicitly to check its content, same as any other workspace below.
  await page.evaluate(() => { location.hash = 'overview'; });
  await page.waitForFunction(() => document.getElementById('teacherWorkspace-overview').classList.contains('is-active-workspace'), { timeout: 5000 });
  const pendingCountText = await page.locator('#teacherOverviewPendingCount').innerText();
  assert(pendingCountText === '2', 'Overview Pending Review count reflects real queue data (1 classroom + 1 schoolwide): ' + pendingCountText);
  const activeMissionsText = await page.locator('#teacherOverviewActiveMissionsCount').innerText();
  assert(activeMissionsText === '1', 'Overview Active Missions count reflects real mission data: ' + activeMissionsText);

  // ---------------------------------------------------------------------------
  // Prompt #78 — compact header, no redundant Sign out, Hallway TV moved to sidebar
  // ---------------------------------------------------------------------------
  assert(await page.locator('#teacherLogoutBtn').count() === 0, 'Teacher-page-specific Sign out button has been removed (global Lantern nav already provides logout)');
  assert(await page.locator('#lanternAppBarRoot').count() === 1, 'Global Lantern nav mount point is still present and unaffected');
  assert(await page.locator('.teacherActionRow').count() === 0, 'Old centered header action row (Hallway TV + Sign out buttons) no longer exists');
  const headerBox = await page.locator('#teacherPageTop').boundingBox();
  assert(!!headerBox && headerBox.height < 70, 'Teacher identity header is compact (< 70px tall): ' + (headerBox && headerBox.height));
  const hallwayTvLink = page.locator('a.teacherSidebarItem[href="display.html"]');
  assert(await hallwayTvLink.count() === 1, 'Hallway TV is available as a sidebar destination/link');
  assert(((await hallwayTvLink.innerText()) || '').indexOf('Hallway TV') !== -1, 'Hallway TV sidebar item is labeled correctly');
  assert((await hallwayTvLink.getAttribute('target')) === '_blank', 'Hallway TV sidebar link still opens display.html in a new tab (existing behavior retained)');

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
  assert((await activeWorkspaceIds()).join(',') === 'economy', 'An unknown hash falls back to the Nuggets workspace');

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

  // Prompt #78 — desktop width, standardized form classes, and the two archived/relabeled options.
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.waitForTimeout(120);
  const formCardBox = await page.locator('#teacher-create-mission .teacherFormCard').boundingBox();
  assert(!!formCardBox && formCardBox.width >= 650 && formCardBox.width <= 900, 'Create Mission form uses a sane desktop width (650-900px) at 1920, not full-bleed or phone-narrow: ' + (formCardBox && formCardBox.width));
  assert((await page.locator('#teacher-create-mission .teacherFieldGroup').count()) >= 4, 'Create Mission form uses standardized section-group classes (Mission/Submission/Audience & reward/Advanced)');
  assert((await page.locator('#teacher-create-mission .teacherInput, #teacher-create-mission .teacherSelect, #teacher-create-mission .teacherTextarea').count()) >= 5, 'Create Mission inputs/selects/textarea use standardized shared Teacher form classes');
  assert(await page.locator('#missionSiteEligible').count() === 0, 'Legacy "Highlight-worthy / site-eligible" control has been archived (removed) from Create Mission');
  const featuredLabelText = (await page.locator('#missionFeatured').locator('xpath=following-sibling::span[1]').innerText()).trim();
  assert(featuredLabelText === 'Feature this mission', 'Pin-as-featured control has been relabeled in plain language: ' + featuredLabelText);
  assert((await page.locator('#teacher-create-mission .teacherCheckboxHint').count()) >= 1, '"Feature this mission" has a one-sentence plain-language helper explanation');

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
  // Nuggets workspace (formerly "Nuggets & Sales") — retained; Prompt #95 replaced the backing
  // data source with the real TMS Nugget Ledger bridge, redeem amount still defaults to 1
  // ---------------------------------------------------------------------------
  await page.evaluate(() => { location.hash = 'economy'; });
  await page.waitForFunction(() => document.getElementById('teacher-rewards').classList.contains('is-active-workspace'), { timeout: 5000 });
  assert(await page.locator('#teacherRewardManualSalePanel').isVisible(), 'Nuggets workspace shows the TMS Nugget Ledger panel');
  const saleAmountDefault = await page.locator('#teacherRewardSaleAmount').inputValue();
  assert(saleAmountDefault === '1', 'Redeem amount defaults to 1 Nugget: ' + saleAmountDefault);
  assert(await page.locator('#teacherRewardRecordSaleBtn').isVisible(), 'Redeem Nugget button is retained and reachable');

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

  const mobileRowColumns = await page.locator('.teacherFieldRow--2').first().evaluate((el) => getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length);
  assert(mobileRowColumns === 1, 'Create Mission Audience & Reward two-column row collapses to a single column at phone width');

  const widths = [1920, 1366, 1024, 390];
  for (const w of widths) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(120);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    assert(!overflow, 'No horizontal page overflow at width ' + w + 'px');
  }

  // ---------------------------------------------------------------------------
  // Prompt #78 — Review Queue empty state is a compact placeholder, not a giant blank box
  // ---------------------------------------------------------------------------
  const emptyPage = await browser.newPage();
  await emptyPage.route('**/api/auth/me**', okJson({
    ok: true, authenticated: true, role: 'teacher', username: 'teacher1', display_name: 'Ms. Carter',
    teacher_id: 'teacher1', must_change_password: false,
  }));
  await emptyPage.route('**/api/missions/teacher**', okJson({ ok: true, missions: [] }));
  await emptyPage.route('**/api/missions/submissions/teacher**', okJson({ ok: true, submissions: [] }));
  await emptyPage.route('**/api/missions/submissions/approved**', okJson({ ok: true, submissions: [] }));
  await emptyPage.route('**/api/missions/submissions/hidden**', okJson({ ok: true, submissions: [] }));
  await emptyPage.route('**/api/avatar/pending**', okJson({ ok: true, pending: [] }));
  await emptyPage.route('**/api/news/approved**', okJson({ ok: true, news: [] }));
  await emptyPage.route('**/api/news/hidden**', okJson({ ok: true, news: [] }));
  await emptyPage.route('**/api/moderation/flagged**', okJson({ ok: true, flags: [] }));
  await emptyPage.route('**/api/class-access/session/status**', okJson({ ok: true, active: false }));
  await emptyPage.route('**/api/verify/state**', okJson({ ok: true, state: null }));
  await emptyPage.route('**/api/approvals/pending**', okJson({ ok: true, pending: [] }));
  await emptyPage.route('**/api/approvals/history**', okJson({ ok: true, history: [] }));
  await emptyPage.route('**/api/recognition/list**', okJson({ ok: true, recognition: [] }));
  await emptyPage.route('**/api/economy/balance**', okJson({ ok: true, earned: 0, spent: 0, available: 0 }));
  await emptyPage.route('**/api/store/bootstrap**', okJson({ ok: true, students: [] }));
  await emptyPage.goto(base + '/teacher.html#review', { waitUntil: 'domcontentloaded' });
  await emptyPage.waitForFunction(() => !document.documentElement.classList.contains('lantern-pilot-auth-pending'), { timeout: 15000 });
  await emptyPage.waitForFunction(() => document.getElementById('teacher-approvals').classList.contains('is-active-workspace'), { timeout: 5000 });
  await emptyPage.waitForSelector('#myClassroomBody .placeholderRow', { timeout: 10000 });
  const emptyStateText = await emptyPage.locator('#myClassroomBody .placeholderRow').innerText();
  assert(emptyStateText.toLowerCase().indexOf('no classroom submissions waiting') !== -1, 'Empty Review Queue shows a compact "No … waiting" placeholder message: ' + emptyStateText);
  const emptyBoxBox = await emptyPage.locator('#myClassroomBody').boundingBox();
  assert(!!emptyBoxBox && emptyBoxBox.height < 120, 'Empty Review Queue placeholder is compact, not a giant blank bordered box (< 120px tall): ' + (emptyBoxBox && emptyBoxBox.height));
  await emptyPage.close();

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
