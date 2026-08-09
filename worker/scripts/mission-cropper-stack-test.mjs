/**
 * REAL BROWSER TEST — Prompt #73 Defect 3 (cropper opens under Mission modal).
 * Drives an actual Chromium page through: open Mission modal -> type text ->
 * choose a photo file -> real Cropper.js instantiates -> assert the cropper is
 * topologically/visually ABOVE the Mission modal -> Use Image -> assert the
 * Mission modal is still open with text preserved and an image preview visible.
 *
 * Usage: node worker/scripts/mission-cropper-stack-test.mjs [baseUrl]
 * Requires a static file server for app/ at baseUrl (default http://127.0.0.1:8765).
 */
import path from 'path';
import fs from 'fs';
import os from 'os';
import { chromium } from '../../e2e/studio-contribute/node_modules/playwright/index.mjs';

const base = (process.argv[2] || 'http://127.0.0.1:8765').replace(/\/$/, '');

const FIXTURE_MISSION = {
  id: 'tmission_test_cropper',
  title: 'Photo Reflection Test',
  description: 'Describe your day and attach a photo.',
  reward_amount: 5,
  submission_type: 'text',
  allows_text: true,
  allows_image: true,
  allows_video: false,
  allows_link: false,
  // Deliberately omitted (not 0): openMissionSubmitModal's min_characters parsing treats an
  // explicit 0 as falsy and falls back to a 200-char default, which is a separate pre-existing
  // quirk out of scope for the Defect 3 (cropper stacking) fix this test targets.
};

function makeTestPngPath() {
  // 1x1 red PNG
  const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const p = path.join(os.tmpdir(), 'lantern-cropper-test.png');
  fs.writeFileSync(p, Buffer.from(b64, 'base64'));
  return p;
}

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

  await page.addInitScript(() => {
    window.LANTERN_AVATAR_API = '';
  });

  // js/lantern-pilot-auth.js unconditionally overwrites window.LanternAuth on load, so the
  // real guard's network call (GET /api/auth/me) must be mocked at the network layer, not by
  // stubbing window.LanternAuth in an init script (which would be clobbered before it ever runs).
  await page.route('**/api/auth/me**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        authenticated: true,
        role: 'student',
        username: 'testpilot',
        display_name: 'Test Pilot',
        economy_character_name: 'testpilot',
        student_character_name: 'testpilot',
        must_change_password: false,
      }),
    })
  );
  await page.route('**/api/class-access/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, accessState: 'none', tokenValid: true }) })
  );
  await page.route('**/api/missions/active**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, missions: [] }) })
  );
  await page.route('**/api/missions/submissions/character**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, submissions: [] }) })
  );
  await page.route('**/api/verify/state**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, state: null }) })
  );
  await page.route('**/api/media/library**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, categories: {}, defaults: {} }) })
  );
  await page.route('**/api/news/upload-image**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, image_r2_key: 'news/test-cropper-key.png' }) })
  );

  await page.goto(base + '/missions.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => !!(window.LanternMissionsRuntime && window.LanternMissionsRuntime.openMissionSubmitModal), { timeout: 15000 });

  // Open the Mission Detail modal directly with our fixture (bypasses grid rendering — the
  // grid/tab bucketing has its own dedicated unit coverage; this test targets modal stacking).
  await page.evaluate((mission) => {
    window.LanternMissionsRuntime.openMissionSubmitModal(mission);
  }, FIXTURE_MISSION);

  await page.waitForSelector('#missionDetailOverlay.is-open', { timeout: 5000 });
  assert(true, 'Mission Detail modal opened');

  // page.fill() sets the whole string atomically, which the app's paste/burst anti-cheat guard
  // (handleMissionContentInput — delta >= 10 chars reverts the field) correctly rejects as a
  // suspicious bulk-input event. Type char-by-char like a real student to get a realistic delta=1.
  await page.locator('#missionSubmitContent').pressSequentially('photo test', { delay: 5 });
  assert((await page.inputValue('#missionSubmitContent')) === 'photo test', 'Typed text "photo test" into mission response field');

  const fileInputSelector = '#missionUnifiedMediaMount input[type=file]';
  await page.waitForSelector(fileInputSelector, { timeout: 5000, state: 'attached' });
  const testImgPath = makeTestPngPath();
  await page.setInputFiles(fileInputSelector, testImgPath);

  // Real Cropper.js (loaded from unpkg) instantiates asynchronously after the FileReader +
  // <img onload> fire; wait for its container to actually exist in the DOM.
  await page.waitForSelector('#missionCropperModal .cropper-container', { timeout: 15000 });
  await page.waitForFunction(() => {
    const m = document.getElementById('missionCropperModal');
    return m && getComputedStyle(m).display === 'flex';
  }, { timeout: 5000 });
  assert(true, 'Cropper modal opened with a real Cropper.js instance');

  // --- Core Defect 3 assertion: cropper must be topologically ABOVE the Mission modal ---
  const stack = await page.evaluate(() => {
    const missionOverlay = document.getElementById('missionDetailOverlay');
    const cropper = document.getElementById('missionCropperModal');
    const missionZ = parseInt(getComputedStyle(missionOverlay).zIndex, 10) || 0;
    const cropperZ = parseInt(getComputedStyle(cropper).zIndex, 10) || 0;
    const rect = cropper.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const topElAtCropperCenter = document.elementFromPoint(cx, cy);
    const hitInsideCropper = !!(topElAtCropperCenter && cropper.contains(topElAtCropperCenter));
    return {
      missionZ, cropperZ, hitInsideCropper,
      missionStillOpen: missionOverlay.classList.contains('is-open'),
      missionStillInDom: document.body.contains(missionOverlay),
    };
  });
  assert(stack.cropperZ > stack.missionZ, 'Cropper z-index (' + stack.cropperZ + ') > Mission modal z-index (' + stack.missionZ + ')');
  assert(stack.hitInsideCropper, 'A hit-test at the cropper\'s center resolves to an element INSIDE the cropper (not swallowed by the Mission modal)');
  assert(stack.missionStillOpen, 'Mission Detail modal remains mounted + open (.is-open) underneath the cropper');
  assert(stack.missionStillInDom, 'Mission Detail modal was not destroyed/recreated');

  // --- Use Image flow ---
  await page.click('#missionCropperUseBtn');
  await page.waitForFunction(() => {
    const m = document.getElementById('missionCropperModal');
    return m && getComputedStyle(m).display === 'none';
  }, { timeout: 10000 });
  assert(true, 'Cropper closed after Use Image');
  // finishMissionCropper() sets modal display:none synchronously, then awaits the (async) upload
  // request before populating missionSubmitImageUrl — wait for that to actually land.
  await page.waitForFunction(() => {
    const v = document.getElementById('missionSubmitImageUrl');
    return v && v.value;
  }, { timeout: 10000 });

  const afterUse = await page.evaluate(() => ({
    missionOpen: document.getElementById('missionDetailOverlay').classList.contains('is-open'),
    text: document.getElementById('missionSubmitContent').value,
    imageUrl: document.getElementById('missionSubmitImageUrl').value,
    previewVisible: getComputedStyle(document.getElementById('missionSubmitImagePreview')).display !== 'none',
    submitBtnDisabled: document.getElementById('missionSubmitBtn').disabled,
  }));
  assert(afterUse.missionOpen, 'Mission modal is STILL open after Use Image (same modal, not recreated)');
  assert(afterUse.text === 'photo test', 'Typed text "photo test" preserved through the crop flow');
  assert(!!afterUse.imageUrl, 'missionSubmitImageUrl populated after upload (' + afterUse.imageUrl + ')');
  assert(afterUse.previewVisible, 'Image preview is visible in the still-open Mission modal');
  assert(!afterUse.submitBtnDisabled, 'Submit button remains available');

  // --- Cancel Crop flow (separate run: re-open, type text, choose file, cancel) ---
  await page.evaluate((mission) => {
    window.LanternMissionsRuntime.openMissionSubmitModal(mission);
  }, FIXTURE_MISSION);
  await page.locator('#missionSubmitContent').pressSequentially('cancel test text', { delay: 5 });
  await page.setInputFiles(fileInputSelector, testImgPath);
  await page.waitForSelector('#missionCropperModal .cropper-container', { timeout: 15000 });
  await page.click('#missionCropperCancelBtn');
  await page.waitForFunction(() => {
    const m = document.getElementById('missionCropperModal');
    return m && getComputedStyle(m).display === 'none';
  }, { timeout: 5000 });
  const afterCancel = await page.evaluate(() => ({
    missionOpen: document.getElementById('missionDetailOverlay').classList.contains('is-open'),
    text: document.getElementById('missionSubmitContent').value,
    imageUrl: document.getElementById('missionSubmitImageUrl').value,
  }));
  assert(afterCancel.missionOpen, 'Cancel Crop: Mission modal remains open');
  assert(afterCancel.text === 'cancel test text', 'Cancel Crop: previously typed text is preserved');
  assert(!afterCancel.imageUrl, 'Cancel Crop: no fake image attached');

  fs.unlinkSync(testImgPath);
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
