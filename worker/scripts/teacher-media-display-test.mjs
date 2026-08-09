/**
 * REAL BROWSER TEST — Prompt #73 Defect 4 (Rick receives media reference but image is broken)
 * + Defect 1 (Create Mission success UX), section 23/24.
 *
 * Drives the ACTUAL app/teacher.html in a real Chromium page (not vm-only) through a normal
 * guardPilotPage()->refresh() boot with every touched network endpoint mocked, then asserts on
 * real DOM/CSS/img rendering:
 *  - the Teacher pending queue row shows a real thumbnail image for a text+image mission
 *    submission, the caption text is visible, and the raw media URL string never appears in the
 *    row's visible text.
 *  - clicking Review opens the real review modal (openReviewModal) with the full-size photo
 *    (.reviewLargeImg, real <img> going through LanternMedia.renderMedia) and the caption text.
 *  - the Create Mission button shows the Creating…/Created ✓ inline success flow end-to-end
 *    against a real (mocked) POST /api/missions, and the failure path leaves the form intact.
 *
 * Usage: node worker/scripts/teacher-media-display-test.mjs [baseUrl]
 * Requires a static file server for app/ at baseUrl (default http://127.0.0.1:8765).
 */
import { chromium } from '../../e2e/studio-contribute/node_modules/playwright/index.mjs';

const base = (process.argv[2] || 'http://127.0.0.1:8765').replace(/\/$/, '');

const MEDIA_KEY = 'missions/photo-test-abc123.png';
// The exact live-shaped Worker-domain URL from the Prompt #73 bug report — normalizeMissionItemForMedia
// (app/js/lantern-media.js) must rewrite this to a same-origin /api/media/image?key=... path.
const WORKER_IMAGE_URL = 'https://lantern-api.mrradle.workers.dev/api/media/image?key=' + encodeURIComponent(MEDIA_KEY);
const SUBMISSION_TEXT = 'photo test';
const ENVELOPE_CONTENT = JSON.stringify({ text: SUBMISSION_TEXT, image_url: WORKER_IMAGE_URL });

const FIXTURE_SUBMISSION = {
  id: 'msub_teacher_media_test',
  mission_id: 'tmission_media_test',
  mission_title: 'Photo Reflection Mission',
  mission_reward: 5,
  character_name: 'testpilot',
  submission_type: 'text',
  submission_content: ENVELOPE_CONTENT,
  status: 'pending',
  created_by_teacher_name: 'Teacher',
  created_at: '2026-08-08T12:00:00.000Z',
};

// Prompt #76, Test H — a plain TEXT-ONLY submission with NO image at all. The official Mission
// cover (assets/mission-card.png) is presentation artwork for public Mission cards ONLY — Teacher
// Review must never disguise a missing photo by showing it here as if the student submitted one.
const FIXTURE_NO_PHOTO_SUBMISSION = {
  id: 'msub_teacher_no_photo_test',
  mission_id: 'tmission_no_photo_test',
  mission_title: 'No Photo Mission',
  mission_reward: 3,
  character_name: 'otherpilot',
  submission_type: 'text',
  submission_content: 'just a written reflection, no photo attached',
  status: 'pending',
  created_by_teacher_name: 'Teacher',
  created_at: '2026-08-08T13:00:00.000Z',
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
  await page.route('**/api/missions/teacher**', okJson({ ok: true, missions: [{ id: 'tmission_media_test', title: 'Photo Reflection Mission', reward_amount: 5, teacher_id: 'teacher1', teacher_name: 'Ms. Carter' }] }));
  await page.route('**/api/missions/submissions/teacher**', okJson({ ok: true, submissions: [FIXTURE_SUBMISSION, FIXTURE_NO_PHOTO_SUBMISSION] }));
  await page.route('**/api/missions/submissions/approved**', okJson({ ok: true, submissions: [] }));
  await page.route('**/api/avatar/pending**', okJson({ ok: true, pending: [] }));
  await page.route('**/api/news/approved**', okJson({ ok: true, news: [] }));
  await page.route('**/api/moderation/flagged**', okJson({ ok: true, flags: [] }));
  await page.route('**/api/class-access/session/status**', okJson({ ok: true, active: false }));
  await page.route('**/api/verify/state**', okJson({ ok: true, state: null }));
  await page.route('**/api/approvals/pending**', okJson({ ok: true, pending: [] }));
  await page.route('**/api/approvals/history**', okJson({ ok: true, history: [] }));
  await page.route('**/api/recognition/list**', okJson({ ok: true, recognition: [] }));
  // The rewritten same-origin thumbnail/photo request itself — respond with a real tiny PNG so
  // the <img> actually loads (proves the row/modal src is a live, fetchable, same-origin URL).
  const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  await page.route('**/api/media/image**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1PX }));
  await page.route('**/api/news/image**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1PX }));
  // Mission create POST for the Defect 1 create-feedback assertions later in this test.
  let createCallCount = 0;
  await page.route('**/api/missions', (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    createCallCount++;
    if (createCallCount === 1) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'tmission_new', mission: { id: 'tmission_new', title: 'New Test Mission' } }) });
    }
    return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'Missing title' }) });
  });

  await page.goto(base + '/teacher.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => !document.documentElement.classList.contains('lantern-pilot-auth-pending'), { timeout: 15000 });
  // Prompt #77 — Teacher is now a sidebar + one-active-workspace shell; the pending queue lives
  // in the Review Queue workspace and is not visible from the default Overview workspace.
  await page.evaluate(() => { location.hash = 'review'; });
  await page.waitForFunction(() => {
    const el = document.getElementById('teacher-approvals');
    return el && el.classList.contains('is-active-workspace');
  }, { timeout: 5000 });
  await page.waitForSelector('#myClassroomBody .teacherApprovalPendingRow', { timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll('#myClassroomBody .teacherApprovalPendingRow').length >= 2, { timeout: 15000 });

  // ---------------------------------------------------------------------------
  // Section 24 — TEACHER MEDIA TEST: pending row (list) assertions
  // ---------------------------------------------------------------------------
  // Located by content, not position — row ORDER between the two fixture submissions is not
  // this test's concern and must not make these assertions flaky.
  const row = page.locator('#myClassroomBody .teacherApprovalPendingRow').filter({ hasText: 'testpilot' }).first();
  assert(await row.count() === 1, 'Teacher pending queue row rendered for the text+image mission submission');

  const rowText = (await row.locator('.approvalQueueTitle, .approvalQueueMeta').allInnerTexts()).join(' ');
  assert(rowText.indexOf(SUBMISSION_TEXT) !== -1, 'Teacher list: student\'s caption text ("photo test") is visible in the row');
  assert(rowText.indexOf(WORKER_IMAGE_URL) === -1 && rowText.indexOf('http') === -1, 'Teacher list: the raw media URL is NOT visible anywhere in the row\'s text (Defect 4 — no more URL-as-card-body)');

  const rowThumb = row.locator('.approvalQueueMid img');
  assert(await rowThumb.count() === 1, 'Teacher list: a real <img> thumbnail element is rendered in the row (not a broken-image placeholder)');
  const rowThumbSrc = await rowThumb.getAttribute('src');
  assert(!!rowThumbSrc && rowThumbSrc.indexOf('workers.dev') === -1 && /^\/api\/(media|news)\/image\?key=/.test(rowThumbSrc), 'Teacher list thumbnail src is normalized to a same-origin /api/.../image?key=... path (not the raw workers.dev Worker URL): ' + rowThumbSrc);
  await page.waitForFunction(() => {
    const img = document.querySelector('#myClassroomBody .teacherApprovalPendingRow .approvalQueueMid img');
    return img && img.complete && img.naturalWidth > 0;
  }, { timeout: 10000 });
  assert(true, 'Teacher list thumbnail actually LOADS as a real image (naturalWidth > 0) through the same-origin route — proves the request succeeds, not just that an <img> tag exists');

  // ---------------------------------------------------------------------------
  // Section 24 — TEACHER MEDIA TEST: Review modal assertions
  // ---------------------------------------------------------------------------
  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#myClassroomBody .teacherApprovalPendingRow'));
    const r = rows.find((x) => x.textContent.indexOf('testpilot') !== -1 && x.textContent.indexOf('otherpilot') === -1);
    r.querySelector('.approvalRowReviewBtn').click();
  });
  await page.waitForSelector('#reviewOverlay.is-open', { timeout: 5000 });
  assert(true, 'Review modal (openReviewModal) opened for the mission submission');

  const modalText = await page.locator('#reviewPanelBd').innerText();
  assert(modalText.indexOf(SUBMISSION_TEXT) !== -1, 'Review modal: student\'s caption text ("photo test") is visible');
  assert(modalText.indexOf(WORKER_IMAGE_URL) === -1, 'Review modal: the raw media URL is not shown as visible body text');

  const modalImg = page.locator('#reviewPanelBd .reviewLargeImg');
  assert(await modalImg.count() === 1, 'Review modal: a full-size <img class="reviewLargeImg"> is rendered (real LanternMedia.renderMedia output)');
  const modalImgSrc = await modalImg.getAttribute('src');
  assert(!!modalImgSrc && modalImgSrc.indexOf('workers.dev') === -1 && /^\/api\/(media|news)\/image\?key=/.test(modalImgSrc), 'Review modal full photo src is same-origin normalized (not raw workers.dev URL): ' + modalImgSrc);
  await page.waitForFunction(() => {
    const img = document.querySelector('#reviewPanelBd .reviewLargeImg');
    return img && img.complete && img.naturalWidth > 0;
  }, { timeout: 10000 });
  assert(true, 'Review modal full photo actually LOADS (naturalWidth > 0) — the photo does not "disappear between row and modal" (section 17)');

  // The sticky app header overlaps this button's real click point at some viewport sizes;
  // dispatch a real DOM click (still exercises the exact onclick handler) rather than fighting
  // Playwright's pointer-interception guard for an incidental teardown step.
  await page.evaluate(() => document.getElementById('reviewPanelClose').click());
  await page.waitForFunction(() => !document.getElementById('reviewOverlay').classList.contains('is-open'), { timeout: 5000 });

  // ---------------------------------------------------------------------------
  // Prompt #76, Test H — Teacher Review safety: a text-only submission with NO photo at all
  // must NEVER show the official Mission cover (assets/mission-card.png) as though it were the
  // student's submitted evidence. No image anywhere in the DOM should ever reference it.
  // ---------------------------------------------------------------------------
  const noPhotoRow = page.locator('#myClassroomBody .teacherApprovalPendingRow').filter({ hasText: 'otherpilot' }).first();
  assert(await noPhotoRow.count() === 1, 'Teacher pending queue also shows the no-photo text-only submission row');
  const noPhotoRowImgCount = await noPhotoRow.locator('.approvalQueueMid img').count();
  assert(noPhotoRowImgCount === 0, 'Teacher list: a text-only submission with NO real photo renders NO <img> in the row at all (no fabricated Mission cover standing in for a submitted photo)');
  const anyMissionCoverInList = await page.evaluate(() => Array.from(document.querySelectorAll('#myClassroomBody img')).some((img) => /mission-card\.png/.test(img.getAttribute('src') || '')));
  assert(!anyMissionCoverInList, 'Teacher list: the official Mission cover asset never appears anywhere in the pending queue list');

  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#myClassroomBody .teacherApprovalPendingRow'));
    const row = rows.find((r) => r.textContent.indexOf('otherpilot') !== -1);
    row.querySelector('.approvalRowReviewBtn').click();
  });
  await page.waitForSelector('#reviewOverlay.is-open', { timeout: 5000 });
  const noPhotoModalImgCount = await page.locator('#reviewPanelBd img').count();
  assert(noPhotoModalImgCount === 0, 'Review modal: opening the no-photo submission shows NO <img> at all (not the Mission cover, not any other image standing in for a missing student photo)');
  const noPhotoModalText = await page.locator('#reviewPanelBd').innerText();
  assert(noPhotoModalText.indexOf('just a written reflection, no photo attached') !== -1, 'Review modal: the no-photo submission still shows its real written text');
  const anyMissionCoverInModal = await page.evaluate(() => Array.from(document.querySelectorAll('#reviewPanelBd img')).some((img) => /mission-card\.png/.test(img.getAttribute('src') || '')));
  assert(!anyMissionCoverInModal, 'Review modal: the official Mission cover asset never appears in the review modal either');
  await page.evaluate(() => document.getElementById('reviewPanelClose').click());
  await page.waitForFunction(() => !document.getElementById('reviewOverlay').classList.contains('is-open'), { timeout: 5000 });

  // ---------------------------------------------------------------------------
  // Section 23 — REAL BROWSER TEST: CREATE FEEDBACK (Defect 1)
  // ---------------------------------------------------------------------------
  // Prompt #77 — Create Mission is its own workspace now; switch to it before touching the form.
  await page.evaluate(() => { location.hash = 'create'; });
  await page.waitForFunction(() => {
    const el = document.getElementById('teacher-create-mission');
    return el && el.classList.contains('is-active-workspace');
  }, { timeout: 5000 });
  await page.fill('#missionTitle', 'New Test Mission');
  await page.fill('#missionDesc', 'Test description');
  await page.evaluate(() => document.getElementById('createMissionBtn').click());
  await page.waitForFunction(() => document.getElementById('createMissionBtn').textContent.indexOf('Creating') !== -1, { timeout: 3000 }).catch(() => {});
  await page.waitForFunction(() => document.getElementById('createMissionBtn').textContent.indexOf('Created') !== -1, { timeout: 8000 });
  assert(true, 'Create Mission button visibly transitioned to "Created \u2713" after a successful POST');
  const successState = await page.evaluate(() => ({
    statusText: document.getElementById('createMissionStatus').textContent,
    statusVisible: getComputedStyle(document.getElementById('createMissionStatus')).display !== 'none',
    statusIsSuccess: document.getElementById('createMissionStatus').classList.contains('is-success'),
    titleValue: document.getElementById('missionTitle').value,
  }));
  assert(successState.statusVisible && successState.statusIsSuccess && /mission created/i.test(successState.statusText), 'Inline "Mission created." success status is visible beside the controls (non-toast)');
  assert(successState.titleValue === '', 'Mission title field reset after confirmed success');
  await page.waitForFunction(() => document.getElementById('createMissionBtn').disabled === false, { timeout: 3000 });
  assert(true, 'Create Mission button restores to a usable (non-disabled) state after the success flash');

  // Failure case: button returns usable, form preserved, inline error shown.
  await page.fill('#missionTitle', 'Will Fail Mission');
  await page.fill('#missionDesc', 'Failure case description');
  await page.evaluate(() => document.getElementById('createMissionBtn').click());
  await page.waitForFunction(() => {
    const el = document.getElementById('createMissionStatus');
    return el && el.classList.contains('is-error');
  }, { timeout: 8000 });
  const failureState = await page.evaluate(() => ({
    statusText: document.getElementById('createMissionStatus').textContent,
    titleValue: document.getElementById('missionTitle').value,
    descValue: document.getElementById('missionDesc').value,
    btnDisabled: document.getElementById('createMissionBtn').disabled,
    btnText: document.getElementById('createMissionBtn').textContent,
  }));
  assert(/Missing title/.test(failureState.statusText), 'Inline error message surfaces the real server error text on failure');
  assert(failureState.titleValue === 'Will Fail Mission' && failureState.descValue === 'Failure case description', 'Failure case: form contents are preserved (not cleared) on failure');
  assert(failureState.btnDisabled === false && failureState.btnText === 'Create Mission', 'Failure case: Create Mission button returns to a normal, usable, correctly-labeled state');

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
