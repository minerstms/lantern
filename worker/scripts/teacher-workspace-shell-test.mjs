/**
 * REAL BROWSER TEST — Prompt #77 (Teacher workspace information-architecture redesign)
 *
 * Drives the ACTUAL app/teacher.html in a real Chromium page (every touched network endpoint
 * mocked) and proves the new sidebar + one-active-workspace shell without re-testing business
 * logic already covered by teacher-media-display-test.mjs / teacher-create-repair-test.mjs /
 * teacher-mission-pipeline-test.mjs / missions-identity-auth-test.mjs / teacher-manual-sale-test.mjs:
 *
 *  - Sidebar exists with the 6 expected workspace items; only ONE workspace is visible at a time.
 *  - Default workspace on a plain /teacher.html load is Nuggets (Prompt #91).
 *  - Sidebar clicks + hash routing (#review, #missions, ...) both switch workspaces; unknown hash
 *    falls back to Nuggets (Prompt #91); browser back/forward works.
 *  - Review Queue: My Classroom / Schoolwide secondary tabs show one queue at a time; Filters
 *    panel is collapsed by default and toggles open; bulk action bar is compact/inactive until
 *    something is selected, then shows Approve/Reject + count.
 *  - Moderation and Nuggets workspaces are reachable and retain their existing controls
 *    (Nugget Ledger redeem amount also defaults to 1; Prompt #95 swapped the underlying data
 *    source to the real TMS Nugget Ledger bridge without changing these DOM ids).
 *  - Mobile drawer: sidebar is off-canvas by default at phone width, opens via the menu button,
 *    and closes after choosing a workspace.
 *  - No horizontal page overflow at 1920/1366/1024/390 widths.
 *
 * Prompt #103 (Missions consolidation + mission management) additions:
 *  - Create Mission and My Missions are ONE sidebar destination ("Missions") — there is no
 *    separate visible Create Mission sidebar item anymore.
 *  - #create (preserved deep link) opens the Missions workspace with Create New Mission
 *    auto-expanded; #missions opens Missions with it collapsed.
 *  - Prompt #119 / #143 — My Missions / Review Queue (and other qualifying list panels) use the shared
 *    teacherCollapsibleList pattern; Prompt #143 opens each destination's PRIMARY panel by default
 *    (nested lists/records stay collapsed).
 *  - My Missions has [All]/[Active]/[Paused]/[Archived] filter chips + a title search box, and
 *    each mission row exposes Edit/Pause-Resume/Promote-Unpromote/Archive-Restore (+Delete only
 *    when unused).
 *  - The old "Mission submissions" panel (duplicating Review Queue) is gone.
 *  - "Character Totals"/"Character" column header in Other Tools now read "Student Totals"/"Student".
 *  - Follow-up: the legacy "Reviewed & approved" curate panel and the generic Recognition
 *    composer (Spotlight/Feature/Teacher Pick/Praise) are removed entirely from Missions — both
 *    were wired to app/js/lantern-api.js, a localStorage-only mock API, and were surfacing stale
 *    browser-local demo-persona rows in production, never real D1/Worker data.
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
 *  - Sidebar order starts with Nuggets, then Overview/Review Queue/School Access/Missions/
 *    Shout-Out!/Moderation/Hallway TV (Prompt #103 removed the separate Create Mission item;
 *    Prompt #143 archives Other Tools from the sidebar — DOM retained, #other → Overview).
 *  - A plain /teacher.html load (no hash) opens Nuggets by default, not Overview.
 *  - Explicit deep links (#overview, #review, #missions, ...) still open their requested
 *    workspace — Nuggets is the default, not a mandatory intermediate screen.
 *  - Prompt #143 — destination primary panels default OPEN (Missions: My Missions open / Create
 *    closed; School Access: Status open / other three closed; Review/Shout-Out/Moderation open).
 *
 * Usage: node worker/scripts/teacher-workspace-shell-test.mjs [baseUrl]
 * Requires a static file server for app/ at baseUrl (default http://127.0.0.1:8765).
 */
import { chromium } from '../../e2e/studio-contribute/node_modules/playwright/index.mjs';

const base = (process.argv[2] || 'http://127.0.0.1:8765').replace(/\/$/, '');

// Prompt #103 — titles are deliberately non-overlapping substrings (Alpha/Beta/Gamma) so the
// title-search assertions below can isolate exactly one fixture at a time.
const FIXTURE_MISSION = { id: 'tmission_shell_test', title: 'Shell Test Alpha', reward_amount: 2, active: 1, archived: 0, submission_count: 1, teacher_id: 'teacher1', teacher_name: 'Ms. Carter', created_at: '2026-08-08T12:00:00.000Z' };
const FIXTURE_MISSION_UNUSED = { id: 'tmission_shell_unused', title: 'Shell Test Beta', reward_amount: 1, active: 0, archived: 0, submission_count: 0, teacher_id: 'teacher1', teacher_name: 'Ms. Carter', created_at: '2026-08-08T12:00:00.000Z' };
const FIXTURE_MISSION_ARCHIVED = { id: 'tmission_shell_archived', title: 'Shell Test Gamma', reward_amount: 1, active: 0, archived: 1, submission_count: 3, teacher_id: 'teacher1', teacher_name: 'Ms. Carter', created_at: '2026-08-07T12:00:00.000Z' };

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
  await page.route('**/api/missions/teacher**', okJson({ ok: true, missions: [FIXTURE_MISSION, FIXTURE_MISSION_UNUSED, FIXTURE_MISSION_ARCHIVED] }));
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
  const expectedLabels = ['Nuggets', 'Overview', 'Review Submissions', 'Lantern Access', 'Missions', 'Shout-Out!', 'Moderation', 'Hallway TV'];
  assert(expectedLabels.every((l) => sidebarItems.some((t) => t.indexOf(l) !== -1)), 'Sidebar has all expected workspace items including Lantern Access + Shout-Out!: ' + JSON.stringify(sidebarItems));
  assert(!sidebarItems.some((t) => t.indexOf('Other Tools') !== -1), 'Prompt #143 — Other Tools is archived from the Teacher sidebar: ' + JSON.stringify(sidebarItems));
  assert((await page.locator('.teacherSidebarItem[data-workspace-link="other"]').count()) === 0, 'No sidebar item links to archived "other" workspace');
  assert(await page.locator('#teacher-utilities').count() === 1, 'Other Tools implementation DOM is retained (nav-only archive)');
  assert(sidebarItems.some((t) => t.indexOf('Shout-Out!') !== -1), 'Shout-Out! sidebar destination is present');
  assert(await page.locator('#teacher-shoutout').count() === 1, 'Shout-Out! workspace pane exists');
  assert((await page.locator('#teacher-shoutout .note-tight').first().innerText()).trim() === 'Recognize anyone, now.', 'Shout-Out supporting copy is exact');
  assert(await page.locator('#shoutOutStudentSelect option', { hasText: 'Select student' }).count() >= 1, 'Shout-Out uses Student terminology');
  assert(await page.locator('#shoutOutPostBtn').count() === 1, 'Post Shout-Out! button exists');
  assert(sidebarItems[0].indexOf('Nuggets') !== -1, 'Nuggets is the first sidebar item: ' + JSON.stringify(sidebarItems));
  assert(!sidebarItems.some((t) => t.indexOf('Create Mission') !== -1), 'Prompt #103 — Create Mission is no longer a separate visible sidebar destination: ' + JSON.stringify(sidebarItems));
  assert((await page.locator('.teacherSidebarItem[data-workspace-link="create"]').count()) === 0, 'No sidebar item links to a standalone "create" workspace');
  assert(await page.locator('#teacher-rewards').evaluate((el) => !!el.open), 'Prompt #143 — Nuggets primary Rewards panel defaults open on destination load');

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
  // Prompt #78/#195/#198 — no redundant identity banner; shell is sidebar + main only
  // ---------------------------------------------------------------------------
  assert(await page.locator('#teacherLogoutBtn').count() === 0, 'Teacher-page-specific Sign out button has been removed (global Lantern nav already provides logout)');
  assert(await page.locator('#lanternAppBarRoot').count() === 1, 'Global Lantern nav mount point is still present and unaffected');
  assert(await page.locator('.teacherActionRow').count() === 0, 'Old centered header action row (Hallway TV + Sign out buttons) no longer exists');
  assert(await page.locator('.teacherIdentityRow').count() === 0, 'Redundant Teacher identity banner remains absent');
  const pageTopInsideShell = await page.evaluate(() => {
    const top = document.getElementById('teacherPageTop');
    const shell = document.getElementById('teacherAppShell');
    return !!(top && shell && shell.contains(top));
  });
  assert(!pageTopInsideShell, '#teacherPageTop is not nested inside #teacherAppShell (Prompt #198 grid regression guard)');
  const shellBox = await page.locator('#teacherAppShell').boundingBox();
  const sidebarBox = await page.locator('#teacherSidebar').boundingBox();
  const mainBox = await page.locator('#teacherMain').boundingBox();
  assert(!!shellBox && !!sidebarBox && !!mainBox, 'Teacher shell, sidebar, and main all have layout boxes');
  assert(sidebarBox.width >= 180 && sidebarBox.width <= 320, 'Desktop sidebar is compact (~240px), not full page width: ' + sidebarBox.width);
  assert(mainBox.x >= sidebarBox.x + sidebarBox.width - 4, 'Main content sits to the right of the sidebar');
  assert(mainBox.width > sidebarBox.width * 1.5, 'Main content uses remaining width (not the 240px grid cell): ' + mainBox.width);
  const hallwayTvLink = page.locator('a.teacherSidebarItem[href="display.html"]');
  assert(await hallwayTvLink.count() === 1, 'Hallway TV is available as a sidebar destination/link');
  assert(((await hallwayTvLink.innerText()) || '').indexOf('Hallway TV') !== -1, 'Hallway TV sidebar item is labeled correctly');
  assert((await hallwayTvLink.getAttribute('target')) === '_blank', 'Hallway TV sidebar link still opens display.html in a new tab (existing behavior retained)');

  // ---------------------------------------------------------------------------
  // Sidebar navigation + hash routing
  // ---------------------------------------------------------------------------
  await page.click('.teacherSidebarItem[data-workspace-link="review"]');
  await page.waitForFunction(() => document.getElementById('teacher-approvals-workspace').classList.contains('is-active-workspace'), { timeout: 5000 });
  assert(page.url().indexOf('#review') !== -1, 'Clicking the Review Queue sidebar item updates the URL hash');
  assert((await activeWorkspaceIds()).join(',') === 'review', 'Clicking the Review Queue sidebar item opens the review workspace');
  assert(await page.locator('.teacherSidebarItem[data-workspace-link="review"]').evaluate((el) => el.classList.contains('is-active')), 'Review Queue sidebar item is marked active');

  // Prompt #103 — #create is a preserved deep-link ALIAS into the consolidated Missions
  // workspace; it is not a separate workspace/pane, and it auto-expands Create New Mission.
  await page.goto(base + '/teacher.html#create', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.documentElement.classList.contains('lantern-pilot-auth-pending'), { timeout: 15000 });
  await page.waitForFunction(() => {
    const el = document.getElementById('teacher-missions');
    return el && el.classList.contains('is-active-workspace');
  }, { timeout: 5000 });
  assert(true, 'Direct navigation to /teacher.html#create opens the Missions workspace on load (no separate Create workspace)');
  assert(await page.locator('#teacherCreateMissionDetails').evaluate((el) => el.open), '#create auto-expands the Create New Mission details');
  assert(await page.locator('#teacherMyMissionsCard').evaluate((el) => !el.open), '#create leaves My Missions collapsed while Create is expanded');
  assert(await page.locator('.teacherSidebarItem[data-workspace-link="missions"]').evaluate((el) => el.classList.contains('is-active')), '#create marks the single Missions sidebar item active (not a phantom "create" item)');

  // Prompt #143 — stale Other Tools hashes fall back to Overview (implementation retained).
  await page.goto(base + '/teacher.html#other', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.documentElement.classList.contains('lantern-pilot-auth-pending'), { timeout: 15000 });
  await page.waitForFunction(() => document.getElementById('teacherWorkspace-overview')?.classList.contains('is-active-workspace'), { timeout: 5000 });
  assert((await activeWorkspaceIds()).join(',') === 'overview', 'Stale #other falls back to Overview (Other Tools archived from nav)');
  assert(!(await page.locator('#teacher-utilities').evaluate((el) => el.classList.contains('is-active-workspace'))), 'Stale #other does not activate archived Other Tools pane');

  await page.goto(base + '/teacher.html#other-tools', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.documentElement.classList.contains('lantern-pilot-auth-pending'), { timeout: 15000 });
  await page.waitForFunction(() => document.getElementById('teacherWorkspace-overview')?.classList.contains('is-active-workspace'), { timeout: 5000 });
  assert((await activeWorkspaceIds()).join(',') === 'overview', 'Stale #other-tools falls back to Overview');

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
  await page.waitForFunction(() => document.getElementById('teacher-approvals-workspace').classList.contains('is-active-workspace'), { timeout: 5000 });
  /* Prompt #119 / #143 — Review Queue shared collapsible; primary panel defaults OPEN. */
  assert(await page.locator('#teacher-approvals').evaluate((el) => el.tagName === 'DETAILS' && el.classList.contains('teacherCollapsibleList')), 'Review Queue uses the shared teacherCollapsibleList pattern');
  assert(await page.locator('#teacher-approvals').evaluate((el) => !!el.open), 'Prompt #143 — Review Queue primary panel defaults open on destination activation');
  assert(await page.locator('#pendingApprovalsBadge').isVisible(), 'Open Review Queue still shows the pending count badge');
  assert(await page.locator('#refreshBtn').isVisible(), 'Refresh control is available inside the expanded Review Queue body without a second click');
  await page.locator('#refreshBtn').click();
  await page.waitForFunction(() => document.querySelectorAll('#myClassroomBody .teacherApprovalPendingRow').length > 0, { timeout: 15000 });
  await page.waitForSelector('#myClassroomBody .teacherApprovalPendingRow', { state: 'visible', timeout: 10000 });
  assert(await page.locator('#myClassroomBody .teacherApprovalPendingRow').evaluate((el) => el.tagName !== 'DETAILS' || !el.open), 'Review Queue submission rows remain compact (not auto-expanded)');

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
  // Create New Mission (now inside the Missions workspace) — handler retained + reward
  // defaults to 1; collapsed by default via #missions, expanded via #create (Prompt #103).
  // ---------------------------------------------------------------------------
  await page.evaluate(() => { location.hash = 'missions'; });
  await page.waitForFunction(() => document.getElementById('teacher-missions').classList.contains('is-active-workspace'), { timeout: 5000 });
  assert(await page.locator('#teacherCreateMissionDetails').evaluate((el) => !el.open), '#missions leaves Create New Mission collapsed by default');
  assert(await page.locator('#teacherMyMissionsCard').evaluate((el) => !!el.open), '#missions opens My Missions by default (Prompt #143)');
  const missionsOrder = await page.evaluate(() => {
    const my = document.getElementById('teacherMyMissionsCard');
    const create = document.getElementById('teacherCreateMissionDetails');
    if (!my || !create || !my.compareDocumentPosition) return 'missing';
    return (my.compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING) ? 'my-then-create' : 'create-then-my';
  });
  assert(missionsOrder === 'my-then-create', 'Prompt #143 — Missions visual order is My Missions then Create New Mission: ' + missionsOrder);
  await page.evaluate(() => { location.hash = 'create'; });
  await page.waitForFunction(() => document.getElementById('teacherCreateMissionDetails').open === true, { timeout: 5000 });
  const rewardDefault = await page.locator('#missionReward').inputValue();
  assert(rewardDefault === '1', 'Create Mission reward field defaults to 1 Nugget for new missions: ' + rewardDefault);
  assert(await page.locator('#createMissionBtn').isVisible(), 'Create Mission button is visible and reachable once the details are expanded');

  // Prompt #78 — desktop width, standardized form classes, and the two archived/relabeled options.
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.waitForTimeout(120);
  // Prompt #106 — outer Create New Mission card/header is full Missions width (matches My Missions);
  // the expanded form body keeps the Prompt #78 readable max-width (~800px).
  const createDetailsBox = await page.locator('#teacherCreateMissionDetails').boundingBox();
  const myMissionsBox = await page.locator('#teacherMyMissionsCard').boundingBox();
  assert(!!createDetailsBox && !!myMissionsBox && Math.abs(createDetailsBox.width - myMissionsBox.width) <= 2,
    'Create New Mission header/card width matches My Missions full content width: create=' + (createDetailsBox && createDetailsBox.width) + ' my=' + (myMissionsBox && myMissionsBox.width));
  const formBodyBox = await page.locator('#teacherCreateMissionDetails > .cardBd').boundingBox();
  assert(!!formBodyBox && formBodyBox.width >= 650 && formBodyBox.width <= 900, 'Create Mission form body uses a sane desktop width (650-900px) at 1920, not full-bleed or phone-narrow: ' + (formBodyBox && formBodyBox.width));
  assert((await page.locator('#teacherCreateMissionDetails .teacherFieldGroup').count()) >= 4, 'Create Mission form uses standardized section-group classes (Mission/Submission/Audience & reward/Advanced)');
  assert((await page.locator('#teacherCreateMissionDetails .teacherInput, #teacherCreateMissionDetails .teacherSelect, #teacherCreateMissionDetails .teacherTextarea').count()) >= 5, 'Create Mission inputs/selects/textarea use standardized shared Teacher form classes');
  assert(await page.locator('#missionSiteEligible').count() === 0, 'Legacy "Highlight-worthy / site-eligible" control has been archived (removed) from Create Mission');
  const featuredLabelText = (await page.locator('#missionFeatured').locator('xpath=following-sibling::span[1]').innerText()).trim();
  assert(featuredLabelText === 'Promote this mission', 'Prompt #103 relabeled the feature checkbox from "Feature this mission" to "Promote this mission": ' + featuredLabelText);
  assert((await page.locator('#teacherCreateMissionDetails .teacherCheckboxHint').count()) >= 1, '"Promote this mission" has a one-sentence plain-language helper explanation');

  // ---------------------------------------------------------------------------
  // School Access — Prompt #171 hierarchy (status always open; action panels closed)
  // ---------------------------------------------------------------------------
  await page.evaluate(() => { location.hash = 'schoolaccess'; });
  await page.waitForFunction(() => document.getElementById('teacherWorkspace-schoolaccess')?.classList.contains('is-active-workspace'), { timeout: 5000 });
  assert(await page.locator('#schoolAccessStatusCard').evaluate((el) => el.tagName === 'SECTION' && el.classList.contains('schoolAccessStatusDashboard')), 'Prompt #171 — Current Access Status is always-open dashboard section');
  assert((await page.locator('#schoolAccessStatusCard .h').first().innerText()).trim() === 'Current Access Status', 'Prompt #171 — Current Access Status title');
  assert(await page.locator('#individualAccessCard').evaluate((el) => !el.open), 'Prompt #171 — Individual Access defaults closed');
  assert(await page.locator('#classAccessCard').evaluate((el) => !el.open), 'Prompt #171 — Class Access defaults closed');
  assert(await page.locator('#classroomDevicesCard').evaluate((el) => !el.open), 'Prompt #171 — Device Enrollment defaults closed');
  assert(await page.locator('#schoolAccessOverrideCard').evaluate((el) => !!el.hidden), 'Prompt #171 — Schoolwide Access hidden for ordinary teacher');
  assert(await page.locator('#classAccessSimDetails').evaluate((el) => !!el.hidden), 'Prompt #171 — Access control (testing) hidden for ordinary teacher');
  assert((await page.locator('#classroomDevicesCard .h').first().innerText()).trim() === 'Device Enrollment', 'Prompt #171 — Device Enrollment label');

  // ---------------------------------------------------------------------------
  // Moderation workspace — retained, isolated from Review Queue
  // ---------------------------------------------------------------------------
  await page.evaluate(() => { location.hash = 'moderation'; });
  await page.waitForFunction(() => document.getElementById('teacher-moderation').classList.contains('is-active-workspace'), { timeout: 5000 });
  assert(await page.locator('#teacher-moderation').evaluate((el) => !!el.open), 'Prompt #143 — Moderation primary panel defaults open');
  assert(await page.locator('#moderationRefreshBtn').isVisible(), 'Moderation Refresh control is retained without a second disclosure click');
  /* Prompt #119 — nested moderation sub-lists stay collapsed. */
  assert(await page.locator('#moderationLivePanel').evaluate((el) => !el.open), 'Moderation live nested list starts collapsed');
  await page.locator('#moderationLivePanel > summary').click();
  assert(await page.locator('#moderationLivePanel').evaluate((el) => el.open), 'Moderation live list expands on header click');
  assert(await page.locator('#moderationLiveEl').isVisible(), 'Moderation workspace shows the existing live-content moderation controls once expanded');
  const approvalsVisibleDuringModeration = await page.locator('#teacher-approvals-workspace').evaluate((el) => el.classList.contains('is-active-workspace'));
  assert(!approvalsVisibleDuringModeration, 'Review Queue is not shown while Moderation workspace is active (isolated from everyday review work)');

  // ---------------------------------------------------------------------------
  // Shout-Out! — Prompt #212 plain card (workspace title + form; no inner header)
  // ---------------------------------------------------------------------------
  await page.evaluate(() => { location.hash = 'shoutout'; });
  await page.waitForFunction(() => document.getElementById('teacher-shoutout')?.classList.contains('is-active-workspace'), { timeout: 5000 });
  assert(await page.locator('#teacher-shoutout-card').evaluate((el) => el.tagName === 'DIV'), 'Prompt #212 — Shout-Out form is a plain card');
  assert(await page.locator('#shoutOutPostBtn').isVisible(), 'Shout-Out Post control is reachable without a second disclosure click');
  assert(await page.locator('#teacher-shoutout .note-tight').isVisible(), 'Recognize anyone, now. is visible under workspace title');
  const recognizingLabels = await page.locator('#teacher-shoutout label').evaluateAll((nodes) =>
    nodes.map((n) => (n.textContent || '').trim()).filter((t) => t === 'Recognizing')
  );
  assert(recognizingLabels.length === 1, 'Prompt #212 — exactly one Recognizing label: ' + JSON.stringify(recognizingLabels));
  const innerShoutHeaders = await page.locator('#teacher-shoutout-card .h, #teacher-shoutout-card summary').evaluateAll((nodes) =>
    nodes.map((n) => (n.textContent || '').trim()).filter((t) => t === 'Shout-Out!')
  );
  assert(innerShoutHeaders.length === 0, 'Prompt #212 — no redundant inner Shout-Out! header in the form card');

  // ---------------------------------------------------------------------------
  // Nuggets workspace (formerly "Nuggets & Sales") — retained; Prompt #95 replaced the backing
  // data source with the real TMS Nugget Ledger bridge, redeem amount still defaults to 1
  // ---------------------------------------------------------------------------
  await page.evaluate(() => { location.hash = 'economy'; });
  await page.waitForFunction(() => document.getElementById('teacher-rewards').classList.contains('is-active-workspace'), { timeout: 5000 });
  assert(await page.locator('#teacherRewardManualSalePanel').isVisible(), 'Nuggets workspace shows the TMS Nugget Ledger panel');
  const saleAmountDefault = await page.locator('#teacherRewardSaleAmount').inputValue();
  assert(saleAmountDefault === '1', 'Redeem amount defaults to 1 Nugget: ' + saleAmountDefault);
  assert(await page.locator('#teacherRewardRecordSaleBtn').isVisible(), 'Nuggets primary transaction button is retained and reachable');
  assert(await page.locator('#teacherRewardDashWrap').count() === 1, 'Student Nugget Dashboard wrap present');
  assert(await page.locator('#teacherRewardTxnWrap').count() === 1, 'This Transaction wrap present');

  // ---------------------------------------------------------------------------
  // Missions workspace (Create + My Missions consolidated, Prompt #103 / #143):
  // My Missions first + OPEN; Create second + CLOSED; mission rows stay compact.
  // ---------------------------------------------------------------------------
  await page.evaluate(() => { location.hash = 'missions'; });
  await page.waitForFunction(() => document.getElementById('teacher-missions').classList.contains('is-active-workspace'), { timeout: 5000 });
  assert(await page.locator('#teacherCreateMissionDetails').evaluate((el) => !el.open), 'Create New Mission is collapsed again under plain #missions (not sticky-open from #create)');
  assert(await page.locator('#teacherMyMissionsCard').evaluate((el) => el.tagName === 'DETAILS' && el.classList.contains('teacherCollapsibleList')), 'My Missions uses the shared teacherCollapsibleList pattern');
  assert(await page.locator('#teacherMyMissionsCard').evaluate((el) => !!el.open), 'Prompt #143 — My Missions defaults open on #missions (ready to work)');
  assert(await page.locator('#teacherMissionsCount').isVisible(), 'Open My Missions still shows the count badge');
  await page.waitForSelector('#teacherMissionsEl .teacherMissionRow', { timeout: 10000 });
  assert(await page.locator('#teacherMissionsEl .teacherMissionRow').evaluateAll((rows) => rows.every((r) => r.tagName !== 'DETAILS' || !r.open)), 'Mission record rows remain compact/collapsed by default');
  const allRowTitles = () => page.locator('#teacherMissionsEl .teacherMissionRow .teacherMissionRowTitle').allTextContents();
  assert((await allRowTitles()).length === 3, 'Expanded My Missions lists all 3 fixture missions with no filter applied');
  assert(await page.locator('.teacherMissionsFilterChip[data-mission-filter="all"]').evaluate((el) => el.classList.contains('is-active')), '"All" filter chip is active by default');
  const missionsScrollMax = await page.locator('#teacherMissionsEl').evaluate((el) => getComputedStyle(el).maxHeight);
  assert(/px|vh|clamp/.test(missionsScrollMax) && missionsScrollMax !== 'none', 'Expanded My Missions list body uses bounded max-height for internal scroll: ' + missionsScrollMax);
  await page.click('.teacherMissionsFilterChip[data-mission-filter="active"]');
  await page.waitForFunction(() => document.querySelectorAll('#teacherMissionsEl .teacherMissionRow').length === 1, { timeout: 5000 });
  assert((await allRowTitles())[0] === 'Shell Test Alpha', '"Active" filter shows only the active mission');

  await page.click('.teacherMissionsFilterChip[data-mission-filter="paused"]');
  await page.waitForFunction(() => document.querySelectorAll('#teacherMissionsEl .teacherMissionRow').length === 1, { timeout: 5000 });
  assert((await allRowTitles())[0] === 'Shell Test Beta', '"Paused" filter shows only the paused mission');

  await page.click('.teacherMissionsFilterChip[data-mission-filter="archived"]');
  await page.waitForFunction(() => document.querySelectorAll('#teacherMissionsEl .teacherMissionRow').length === 1, { timeout: 5000 });
  assert((await allRowTitles())[0] === 'Shell Test Gamma', '"Archived" filter shows only the archived mission');
  const archivedRowMeta = await page.locator('#teacherMissionsEl .teacherMissionRow .teacherMissionRowMeta').innerText();
  assert(archivedRowMeta.indexOf('Archived') !== -1, 'Archived mission compact row shows Archived status: ' + archivedRowMeta);
  const archivedSubs = await page.locator('#teacherMissionsEl .teacherMissionRow .lanternMgmtRecordCol--muted').innerText();
  assert(archivedSubs.indexOf('3 submission') !== -1, 'Archived mission compact row shows submission count: ' + archivedSubs);
  await page.locator('#teacherMissionsEl .teacherMissionRow summary').click();
  assert(await page.locator('#teacherMissionsEl .teacherMissionRow button:has-text("Restore")').count() === 1, 'Archived mission expanded actions show Restore instead of Archive');
  assert(await page.locator('#teacherMissionsEl .teacherMissionRow button:has-text("Resume")').evaluate((el) => el.disabled), 'Archived mission cannot Resume directly — must Restore first');
  assert(await page.locator('#teacherMissionsEl .teacherMissionRow button:has-text("Delete")').count() === 0, 'Archived (used) mission has no Delete action — history exists');
  await page.locator('#teacherMissionsEl .teacherMissionRow summary').click();

  await page.click('.teacherMissionsFilterChip[data-mission-filter="all"]');
  await page.waitForFunction(() => document.querySelectorAll('#teacherMissionsEl .teacherMissionRow').length === 3, { timeout: 5000 });

  await page.fill('#teacherMissionsSearchInput', 'Beta');
  await page.waitForFunction(() => document.querySelectorAll('#teacherMissionsEl .teacherMissionRow').length === 1, { timeout: 5000 });
  assert((await allRowTitles())[0] === 'Shell Test Beta', 'Title search narrows My Missions to the matching mission');
  const unusedRow = page.locator('#teacherMissionsEl .teacherMissionRow', { hasText: 'Shell Test Beta' });
  await unusedRow.locator('summary').click();
  assert(await unusedRow.locator('button:has-text("Delete")').count() === 1, 'Unused mission (0 submissions) exposes a Delete action');
  assert(await unusedRow.locator('button:has-text("Resume")').count() === 1, 'Paused mission shows Resume (not Activate)');
  assert(await unusedRow.locator('button:has-text("Promote")').count() === 1, 'Unpromoted mission shows Promote (not Feature)');

  // Edit form: safe fields always shown; audience/requirements only shown pre-first-submission.
  await unusedRow.locator('button:has-text("Edit")').click();
  await page.waitForSelector('.teacherMissionEditForm', { timeout: 5000 });
  assert(await page.locator('.teacherMissionEditForm [data-edit="title"]').count() === 1, 'Edit form exposes the Title field for an unused mission');
  assert(await page.locator('.teacherMissionEditForm [data-edit="audience"]').count() === 1, 'Edit form exposes Audience for a mission with zero submissions (safe to change pre-first-submission)');
  await page.click('.teacherMissionEditForm .teacherMissionEditCancelBtn');
  assert(await page.locator('.teacherMissionEditForm').count() === 0, 'Cancel closes the inline edit form without saving');
  await unusedRow.locator('summary').click();

  await page.fill('#teacherMissionsSearchInput', 'Alpha');
  await page.waitForFunction(() => document.querySelectorAll('#teacherMissionsEl .teacherMissionRow').length === 1, { timeout: 5000 });
  const usedRow = page.locator('#teacherMissionsEl .teacherMissionRow', { hasText: 'Shell Test Alpha' });
  await usedRow.locator('summary').click();
  await usedRow.locator('button:has-text("Edit")').click();
  await page.waitForSelector('.teacherMissionEditForm', { timeout: 5000 });
  assert(await page.locator('.teacherMissionEditForm [data-edit="audience"]').count() === 0, 'Edit form hides Audience once a mission has a submission (server-enforced lock)');
  assert(await page.locator('.teacherMissionEditForm .teacherMissionLockedNote').count() === 1, 'Edit form explains the audience/requirements lock once submissions exist');
  assert(await page.locator('.teacherMissionEditForm .teacherMissionRewardWarning').count() === 1, 'Edit form shows a reward-change warning (future approvals only, past payouts immutable)');
  await page.click('.teacherMissionEditForm .teacherMissionEditCancelBtn');
  await page.fill('#teacherMissionsSearchInput', '');
  await page.waitForFunction(() => document.querySelectorAll('#teacherMissionsEl .teacherMissionRow').length === 3, { timeout: 5000 });

  assert(await page.locator('#missionSubmissionsCount').count() === 0, 'Prompt #103 — the old duplicative "Mission submissions" panel is gone');
  // Prompt #103 (follow-up): the legacy "Reviewed & approved" curate panel and the generic
  // Recognition composer (Spotlight/Feature/Teacher Pick/Praise) were both wired to
  // app/js/lantern-api.js — a localStorage-only mock API ("No fetch, no Worker, no production
  // data") — never the real D1/Worker system. They were surfacing stale, browser-local demo
  // rows in production and have been removed entirely from the Missions workspace.
  assert(await page.locator('#recognitionListEl').count() === 0, 'Recognition composer (Spotlight/Feature/Teacher Pick/Praise) removed entirely from Missions');
  assert(await page.locator('#curatePostsEl').count() === 0, 'Legacy "Reviewed & approved" localStorage-curation panel removed entirely from Missions');
  assert(await page.locator('#reviewedSearchInput').count() === 0, 'Legacy character/curation search input removed along with the panel');
  assert(await page.locator('#recCharacterName').count() === 0, 'Recognition\u2019s demo-persona "Select student" dropdown removed along with the composer');
  const missionSearchPlaceholder = await page.locator('#teacherMissionsSearchInput').getAttribute('placeholder');
  assert(missionSearchPlaceholder === 'Search missions\u2026', 'My Missions title search remains in place after the Recognition/curate panel removal: ' + missionSearchPlaceholder);

  // ---------------------------------------------------------------------------
  // Other Tools — Prompt #143 archived from sidebar; DOM retained; Class Access lives under School Access
  // ---------------------------------------------------------------------------
  assert((await page.locator('.teacherSidebarItem[data-workspace-link="other"]').count()) === 0, 'Other Tools has no sidebar nav entry');
  assert(await page.locator('#teacher-utilities').count() === 1, 'Archived Other Tools pane remains in DOM for future restoration');
  assert(await page.locator('#classAccessStartBtn, #classAccessEndBtn').first().count() >= 1, 'Class Access controls remain reachable under School Access (not deleted with Other Tools archive)');
  assert((await page.locator('#teacher-utilities .h', { hasText: 'Student Totals' }).count()) === 1, 'Legacy "Character Totals" heading renamed to "Student Totals" (implementation preserved)');
  assert((await page.locator('#teacher-utilities th.cellStudentName').innerText()) === 'Student', 'Legacy "Character" column header renamed to "Student"');

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
  await page.click('.teacherSidebarItem[data-workspace-link="missions"]');
  await page.waitForFunction(() => !document.getElementById('teacherSidebar').classList.contains('is-open'), { timeout: 5000 });
  assert(true, 'Choosing a workspace from the mobile drawer closes the drawer');
  assert((await activeWorkspaceIds()).join(',') === 'missions', 'Mobile drawer navigation actually switched to the chosen workspace');
  assert(await page.locator('#teacherMyMissionsCard').evaluate((el) => !!el.open), 'Mobile Missions navigation opens My Missions ready to work');

  await page.click('#teacherCreateMissionDetails summary');
  await page.waitForFunction(() => document.getElementById('teacherCreateMissionDetails').open === true, { timeout: 5000 });
  const mobileRowColumns = await page.locator('#teacherCreateMissionDetails .teacherFieldRow--2').first().evaluate((el) => getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length);
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
  await emptyPage.waitForFunction(() => document.getElementById('teacher-approvals-workspace').classList.contains('is-active-workspace'), { timeout: 5000 });
  assert(await emptyPage.locator('#teacher-approvals').evaluate((el) => !!el.open), 'Empty Review Queue still defaults primary panel open on direct #review hash');
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
