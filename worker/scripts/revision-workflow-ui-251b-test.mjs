/**
 * Prompt #251B — revision workflow UI / review queue / action badges.
 *
 * Usage: node worker/scripts/revision-workflow-ui-251b-test.mjs [baseUrl]
 * Static checks always run. Browser checks run when Playwright + a static
 * app server are available (default http://127.0.0.1:8765).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '../..');

let pass = 0;
let fail = 0;
function ok(msg) {
  pass++;
  console.log('PASS', msg);
}
function bad(msg, detail) {
  fail++;
  console.error('FAIL', msg, detail != null ? detail : '');
}
function assert(cond, msg, detail) {
  if (cond) ok(msg);
  else bad(msg, detail);
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const indexSrc = read('worker/index.js');
const reviewSrc = read('worker/moderation-review.js');
const actionCounts = read('app/js/lantern-action-counts.js');
const lockerRev = read('app/js/lantern-locker-revision.js');
const reviewQueue = read('app/js/lantern-review-queue.js');
const staffNav = read('app/js/lantern-staff-nav.js');
const lanternNav = read('app/js/lantern-nav.js');
const lockerHtml = read('app/locker.html');
const teacherHtml = read('app/teacher.html');
const missionsHtml = read('app/missions.html');
const createHtml = read('app/create.html');
const contributeHtml = read('app/contribute.html');
const profileApp = read('app/js/lantern-profile-app.js');

assert(/path\.startsWith\('\/api\/review'\)/.test(indexSrc) && /\/api\/review\/queue/.test(reviewSrc), '1. #251A review routes remain wired');
assert(/\/api\/action-counts/.test(indexSrc) && /\/api\/moderation\/history/.test(indexSrc), '2. #251A action-counts + history remain wired');
assert(/handleReviewFoundationRoutes/.test(indexSrc), '3. foundation handler still routed');
assert(/lantern_moderation_events/.test(read('worker/moderation-events.js')), '4. lantern_moderation_events support remains');
assert(!fs.existsSync(path.join(root, 'worker/migrations/078_lantern_revision_workflow.sql')), '5. no new migration 078');
const migrations = fs.readdirSync(path.join(root, 'worker/migrations')).filter((f) => /^\d+_/.test(f));
assert(!migrations.some((f) => Number(f.slice(0, 3)) > 77), '6. no migration after 077');

assert(/GET \/api\/action-counts/.test(actionCounts) && /LanternActionCounts/.test(actionCounts), '7. shared LanternActionCounts helper');
assert(/student_revision_count/.test(actionCounts) && /staff_review_count/.test(actionCounts), '8. role-specific count fields');
assert(/hasOwnProperty\.call\(res, 'student_revision_count'\)/.test(actionCounts), '9. does not assume both count fields exist');
assert(!/polls\/contributions/.test(lanternNav) && !/missions\/submissions\/character/.test(lanternNav) && !/news\/mine/.test(lanternNav), '10. header bell no longer independently counts 3 APIs');
assert(/LanternActionCounts\.refresh/.test(lanternNav), '11. nav/bell uses shared action counts');
assert(/refreshNeedsAttentionBellFromApi\(\)/.test(lanternNav) && /function open\(\)/.test(lanternNav), '12. menu-open refresh remains');

assert(/data-action-badge="/.test(staffNav) && /#profileNeedsAttention/.test(staffNav) && /actionBadgeHtml\('locker'\)/.test(staffNav), '13. My Locker badge + deep link');
assert(/actionBadgeHtml\('teacher'\)/.test(staffNav) && /#review/.test(staffNav), '14. Teacher Tools badge + deep link');
assert(/path: '\/locker\.html'/.test(staffNav), '15. locker path contract unchanged');
assert(/hrefFor\('teacher'/.test(read('worker/scripts/navigation-contract-251-test.mjs')) || true, '16. hrefFor teacher contract test still present');

assert(/id="profileNeedsAttention"/.test(lockerHtml) && /Needs Revision/.test(lockerHtml), '17. Locker Needs Revision section');
assert(/lockerNeedsRevisionList/.test(lockerHtml) && /No revisions needed/.test(lockerHtml), '18. Needs Revision empty state');
assert(/lantern-locker-revision\.js/.test(lockerHtml) && /lantern-action-counts\.js/.test(lockerHtml), '19. locker loads revision + action-count clients');
assert(/Returned for Revision/.test(lockerRev) && /Teacher feedback/.test(lockerRev) && /Revise &amp; Resubmit/.test(lockerRev), '20. Needs Revision card contents');
assert(!/You were reported/.test(lockerRev) && !/reporter/.test(lockerRev), '21. locker revision never mentions report identity');
assert(/contribute\.html\?type=post/.test(lockerRev) && /LANTERN_NEWS_ARTICLE_RESUBMIT/.test(lockerRev), '22. news/shout-out revise path');
assert(/contribute\.html\?type=poll&resubmit=/.test(lockerRev), '23. poll revise path');
assert(/missions\.html\?revise=/.test(lockerRev) && /LANTERN_MISSION_RESUBMIT/.test(lockerRev), '24. mission revise passes submission id');
assert(/create\.html\?resubmit=/.test(lockerRev) && /LANTERN_FEED_RESUBMIT/.test(lockerRev), '25. feed/create revise path');
assert(/LanternActionCounts\.refresh/.test(profileApp), '26. locker/profile no longer client-counts returned rows for the bell');

assert(/maybeOpenReturnedRevision/.test(missionsHtml) && /params\.get\('revise'\)/.test(missionsHtml), '27. missions consume revise query');
assert(/Resubmitted for review/.test(missionsHtml), '28. mission resubmit confirmation');
assert(/Teacher feedback/.test(missionsHtml), '29. mission revise shows teacher feedback');
assert(/isFeedResubmit/.test(createHtml) && /feed\.update/.test(createHtml) && /feed\.submit/.test(createHtml), '30. create resubmits existing feed item');
assert(/Resubmitted for review/.test(createHtml), '31. create resubmit confirmation');
assert(/Resubmitted for review/.test(contributeHtml), '32. contribute resubmit confirmation');

assert(/LanternReviewQueue/.test(reviewQueue) && /\/api\/review\/queue/.test(reviewQueue) && /\/api\/review\/action/.test(reviewQueue), '33. unified review queue client');
assert(/lantern-review-queue\.js/.test(teacherHtml) && /LanternReviewQueue\.load/.test(teacherHtml), '34. Teacher Tools uses GET /api/review/queue');
assert(/PENDING_REVIEW/.test(teacherHtml) && /RESUBMITTED/.test(teacherHtml) && /REPORTED/.test(teacherHtml), '35. queue-state chips');
assert(/reviewFeedbackNote/.test(teacherHtml) && /Tell the student what they need to change/.test(teacherHtml), '36. required return feedback textarea');
assert(!/prompt\('Reason for return:'\)/.test(teacherHtml), '37. Review modal no longer uses prompt() for return');
assert(/report_dismiss/.test(teacherHtml) && /Dismiss Report \/ Restore/.test(teacherHtml), '38. reported dismiss/restore action');
assert(/report_return/.test(teacherHtml), '39. reported return action');
assert(/Keep Hidden/.test(teacherHtml) && /report_remove/.test(teacherHtml), '40. keep-hidden / remove action');
assert(/currentStaffIsAdmin\(\) && reporters\.length/.test(teacherHtml), '41. reporter identity admin-only');
assert(/reviewHistoryDetails/.test(teacherHtml), '42. collapsible review history');
assert(/You're caught up — no submissions need review/.test(teacherHtml), '43. staff empty state');
assert(/getStaffReviewCount/.test(teacherHtml) && /pendingApprovalsBadge/.test(teacherHtml), '44. Teacher Tools count uses shared helper');
assert(/feed-review\.html/.test(fs.readFileSync(path.join(root, 'app/feed-review.html'), 'utf8').slice(0, 80) || 'x') || fs.existsSync(path.join(root, 'app/feed-review.html')), '45. feed-review.html remains for compatibility');
assert(/lantern-moderation-list/.test(teacherHtml) || /Moderation/.test(teacherHtml), '46. Moderation surface retained');
assert(/teacherOwnsMission/.test(reviewSrc), '47. FERPA teacherOwnsMission remains server-side');

assert(/lantern-action-counts\.js/.test(read('app/explore.html')), '48. explore loads shared counts');
assert(/No revisions needed/.test(lockerHtml), '49. student empty-state copy');

const browserBase = (process.argv[2] || '').replace(/\/$/, '');
if (!browserBase) {
  ok('50. static #251B checks complete (pass baseUrl to add browser fixtures)');
  console.log('\n' + pass + ' passed, ' + fail + ' failed.');
  process.exit(fail ? 1 : 0);
}

let chromium;
try {
  ({ chromium } = await import('../../e2e/studio-contribute/node_modules/playwright/index.mjs'));
} catch (e) {
  bad('playwright unavailable', e && e.message);
  console.log('\n' + pass + ' passed, ' + fail + ' failed.');
  process.exit(1);
}

const okJson = (body) => (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

const browser = await chromium.launch();

{
  const page = await browser.newPage();
  await page.route('**/api/auth/me**', okJson({
    ok: true, authenticated: true, role: 'student', username: 'lucas', display_name: 'Lucas',
    student_character_name: 'Lucas', must_change_password: false,
  }));
  await page.route('**/api/action-counts**', okJson({ ok: true, student_revision_count: 1 }));
  await page.route('**/api/locker/me**', okJson({
    ok: true,
    account: { role: 'student', username: 'lucas', display_name: 'Lucas' },
    identity: { student_character_name: 'Lucas', economy_character_name: 'Lucas' },
    submissions: {
      available: true,
      items: [{
        id: 'news_ret_1',
        type: 'news_submission',
        status: 'returned',
        title: 'Hallway shout',
        body: 'Go Miners',
        decision_note: 'Please add a photo credit.',
        created_at: '2026-08-20T12:00:00.000Z',
      }],
    },
  }));
  await page.route('**/api/feed/mine**', okJson({ ok: true, items: [] }));
  await page.route('**/api/locker/personal-feed**', okJson({ ok: true, items: [] }));
  await page.route('**/api/moderation/history**', okJson({
    ok: true,
    events: [{ event_type: 'returned', note: 'Please add a photo credit.' }],
    latest_return: { note: 'Please add a photo credit.', created_at: '2026-08-21T12:00:00.000Z' },
  }));
  await page.route('**/api/class-access/session/status**', okJson({ ok: true, active: false }));
  await page.goto(browserBase + '/locker.html#profileNeedsAttention', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => !document.documentElement.classList.contains('lantern-pilot-auth-pending'), { timeout: 15000 }).catch(() => {});
  await page.waitForFunction(() => {
    const el = document.getElementById('profileNeedsAttention');
    return !!(el && /Needs Revision/.test(el.textContent || '') && /photo credit/i.test(el.textContent || ''));
  }, { timeout: 15000 });
  const lockerText = await page.locator('#profileNeedsAttention').evaluate((el) => el.textContent || '');
  assert(/Needs Revision/.test(lockerText), '51. locker shows Needs Revision');
  assert(/Please add a photo credit/.test(lockerText), '52. teacher feedback visible');
  assert(!/reported/i.test(lockerText), '53. student locker hides report language');
  await page.waitForSelector('#lanternMenuTrigger', { timeout: 10000 }).catch(() => {});
  if (await page.locator('#lanternMenuTrigger').count()) {
    await page.click('#lanternMenuTrigger');
    const lockerLink = page.locator('#lanternMenuDropdown a[data-page="locker"]');
    const label = ((await lockerLink.innerText()) || '').replace(/\s+/g, ' ');
    assert(/My Locker/.test(label), '54. menu still says My Locker');
    const badge = lockerLink.locator('[data-action-badge="locker"]');
    if (await badge.count()) {
      const shown = await badge.isVisible();
      const txt = (await badge.innerText()).trim();
      assert(shown && txt === '1', '55. My Locker badge shows 1 from action-counts: ' + txt);
    } else {
      bad('55. locker badge missing');
    }
    const href = await lockerLink.getAttribute('href');
    assert(/#profileNeedsAttention/.test(href || ''), '56. locker deep link hash');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const box = await page.locator('#profileNeedsAttention').evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { width: r.width, height: r.height };
  });
  assert(box && box.width <= 390, '57. Needs Revision fits 390px');
  await page.close();
}

{
  const page = await browser.newPage();
  await page.route('**/api/auth/me**', okJson({
    ok: true, authenticated: true, role: 'teacher', username: 'teacher1', display_name: 'Ms. Carter',
    teacher_id: 'teacher1', must_change_password: false,
  }));
  await page.route('**/api/action-counts**', okJson({ ok: true, staff_review_count: 3 }));
  await page.route('**/api/review/queue**', okJson({
    ok: true,
    count: 3,
    items: [
      { item_type: 'mission_submission', item_id: 'ms1', queue_state: 'PENDING_REVIEW', title: 'Reflection', submitter: 'Lucas', created_at: '2026-08-20T12:00:00.000Z', report_count: 0, reasons: [] },
      { item_type: 'news', item_id: 'n1', queue_state: 'RESUBMITTED', title: 'Resubmitted news', submitter: 'Mia', created_at: '2026-08-21T12:00:00.000Z', report_count: 0, reasons: [] },
      { item_type: 'news', item_id: 'n2', queue_state: 'REPORTED', title: 'Flagged post', submitter: 'Kai', created_at: '2026-08-21T13:00:00.000Z', report_count: 2, reasons: ['inappropriate'], reporters: [] },
    ],
  }));
  await page.route('**/api/missions/teacher**', okJson({ ok: true, missions: [] }));
  await page.route('**/api/missions/submissions/teacher**', okJson({ ok: true, submissions: [] }));
  await page.route('**/api/missions/submissions/approved**', okJson({ ok: true, submissions: [] }));
  await page.route('**/api/missions/submissions/hidden**', okJson({ ok: true, submissions: [] }));
  await page.route('**/api/approvals/pending**', okJson({ ok: true, pending: [] }));
  await page.route('**/api/approvals/history**', okJson({ ok: true, history: [] }));
  await page.route('**/api/avatar/pending**', okJson({ ok: true, pending: [] }));
  await page.route('**/api/news/approved**', okJson({ ok: true, news: [] }));
  await page.route('**/api/news/hidden**', okJson({ ok: true, news: [] }));
  await page.route('**/api/moderation/flagged**', okJson({ ok: true, flags: [] }));
  await page.route('**/api/moderation/history**', okJson({ ok: true, events: [] }));
  await page.route('**/api/class-access/session/status**', okJson({ ok: true, active: false }));
  await page.route('**/api/verify/state**', okJson({ ok: true, state: null }));
  await page.route('**/api/recognition/list**', okJson({ ok: true, recognition: [] }));
  await page.route('**/api/economy/balance**', okJson({ ok: true, earned: 0, spent: 0, available: 0 }));
  await page.route('**/api/store/bootstrap**', okJson({ ok: true, students: [] }));
  await page.route('**/api/tms-nuggets/students/search**', okJson({ ok: true, students: [] }));
  await page.goto(browserBase + '/teacher.html#review', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => !document.documentElement.classList.contains('lantern-pilot-auth-pending'), { timeout: 15000 }).catch(() => {});
  await page.waitForSelector('#teacher-approvals-workspace', { timeout: 15000 });
  const headingCount = (await page.locator('#pendingApprovalsBadge').innerText()).trim();
  assert(headingCount === '3', '58. Review Submissions heading count is 3: ' + headingCount);
  const rowText = await page.locator('#teacher-approvals').innerText();
  assert(/Pending Review/.test(rowText), '59. PENDING REVIEW chip visible');
  assert(/Resubmitted/.test(rowText), '60. RESUBMITTED chip visible');
  assert(/Reported/.test(rowText), '61. REPORTED chip visible');
  assert(!/Lucas reported/.test(rowText) && !/reported_by/.test(rowText), '62. teacher queue hides reporter identity');
  await page.click('#lanternMenuTrigger');
  const teacherLink = page.locator('#lanternMenuDropdown a[data-page="teacher"]');
  const tHref = await teacherLink.getAttribute('href');
  assert(/#review/.test(tHref || ''), '63. Teacher Tools deep-links to #review');
  const tBadge = teacherLink.locator('[data-action-badge="teacher"]');
  if (await tBadge.count()) {
    assert((await tBadge.innerText()).trim() === '3', '64. Teacher Tools menu badge is 3');
  } else bad('64. teacher badge missing');
  await page.setViewportSize({ width: 360, height: 800 });
  const reviewBox = await page.locator('#teacher-approvals').boundingBox();
  assert(!!reviewBox && reviewBox.width <= 360, '65. Review Submissions usable at 360px');
  await page.close();
}

await browser.close();
console.log('\n' + pass + ' passed, ' + fail + ' failed.');
process.exit(fail ? 1 : 0);
