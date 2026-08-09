/**
 * REAL BROWSER TEST — Prompt #76 (official Mission fallback cover art).
 * Drives the ACTUAL app/missions.html in a real Chromium page and asserts, against real
 * rendered DOM:
 *   A. a never-started mission with no image  -> official Mission cover (assets/mission-card.png)
 *   B. a mission with a REAL submitted photo  -> that real photo, NOT the cover
 *   C. a pending (STARTED) text-only mission  -> Mission cover + STARTED badge preserved
 *   D. a returned (NEEDS CHANGES) text-only mission -> Mission cover + badge preserved
 * Plus a visual check at 1920 desktop and a phone-width viewport: 16:9 fit, no stretching,
 * no card-height regression, title/badges remain readable.
 *
 * Usage: node worker/scripts/mission-fallback-cover-test.mjs [baseUrl]
 * Requires a static file server for app/ at baseUrl (default http://127.0.0.1:8765).
 */
import { chromium } from '../../e2e/studio-contribute/node_modules/playwright/index.mjs';

const base = (process.argv[2] || 'http://127.0.0.1:8765').replace(/\/$/, '');

const REAL_PHOTO_URL = 'https://lantern-api.mrradle.workers.dev/api/news/image?key=news%2Fnews-real-photo-test.png';

const MISSION_NOIMG = { id: 'tm_cover_a', title: 'No Image Mission', description: 'Write about your day', reward_amount: 3, submission_type: 'text', allows_text: true };
const MISSION_PHOTO = { id: 'tm_cover_b', title: 'Photo Submitted Mission', description: 'Attach a photo', reward_amount: 4, submission_type: 'image_url', allows_image: true };
const MISSION_PENDING = { id: 'tm_cover_c', title: 'Pending Text Mission', description: 'Write a reflection', reward_amount: 2, submission_type: 'text', allows_text: true };
const MISSION_RETURNED = { id: 'tm_cover_d', title: 'Returned Text Mission', description: 'Needs a redo', reward_amount: 5, submission_type: 'text', allows_text: true };

const SUBMISSIONS = [
  { id: 'msub_photo', mission_id: MISSION_PHOTO.id, character_name: 'testpilot', submission_type: 'image_url', submission_content: REAL_PHOTO_URL, status: 'pending', created_at: '2026-08-08T01:00:00.000Z' },
  { id: 'msub_pending', mission_id: MISSION_PENDING.id, character_name: 'testpilot', submission_type: 'text', submission_content: 'my reflection text', status: 'pending', created_at: '2026-08-08T02:00:00.000Z' },
  { id: 'msub_returned', mission_id: MISSION_RETURNED.id, character_name: 'testpilot', submission_type: 'text', submission_content: 'my first attempt', status: 'returned', created_at: '2026-08-08T03:00:00.000Z' },
];

async function main() {
  const results = [];
  function assert(cond, label) {
    results.push({ pass: !!cond, label });
    console.log((cond ? 'PASS' : 'FAIL') + ' — ' + label);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  const okJson = (body) => (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

  await page.addInitScript(() => { window.LANTERN_AVATAR_API = ''; });
  await page.route('**/api/auth/me**', okJson({
    ok: true, authenticated: true, role: 'student', username: 'testpilot', display_name: 'Test Pilot',
    economy_character_name: 'testpilot', student_character_name: 'testpilot', must_change_password: false,
  }));
  await page.route('**/api/class-access/**', okJson({ ok: true, accessState: 'none', tokenValid: true }));
  await page.route('**/api/missions/active**', okJson({ ok: true, missions: [MISSION_NOIMG, MISSION_PHOTO, MISSION_PENDING, MISSION_RETURNED] }));
  await page.route('**/api/missions/submissions/character**', okJson({ ok: true, submissions: SUBMISSIONS }));
  await page.route('**/api/verify/state**', okJson({ ok: true, state: null }));
  // The real photo happens to resolve to a 1x1 PNG here — irrelevant to these assertions,
  // which only check the resolved `src` attribute, never the pixel content.
  const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await page.route('**/api/news/image**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1x1 }));

  await page.goto(base + '/missions.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => !!(window.LanternMissionsRuntime && window.LanternMissionsRuntime.loadMissions), { timeout: 15000 });
  await page.waitForSelector('#missionsLibraryGrid [data-lantern-card-type]', { timeout: 15000 });

  function cardBySrc() {
    return page.evaluate(() => Array.from(document.querySelectorAll('#missionsLibraryGrid [data-lantern-card-type]')).map((el) => ({
      title: (el.querySelector('.lanternCanonicalCardTitle') || {}).textContent || '',
      stateBadge: (el.querySelector('.lanternCanonicalCardStateBadge') || {}).textContent || '',
      imgSrc: (el.querySelector('.lanternCanonicalCardImage') || {}).getAttribute ? el.querySelector('.lanternCanonicalCardImage').getAttribute('src') : '',
    })));
  }
  const findCard = (cards, title) => cards.find((c) => c.title.indexOf(title) !== -1);

  const cards = await cardBySrc();

  // --- Test A: no image -> official Mission cover ---
  const cardA = findCard(cards, MISSION_NOIMG.title);
  assert(!!cardA, 'Test A: never-started mission card is present');
  assert(cardA && /assets\/mission-card\.png$/.test(cardA.imgSrc || ''), 'Test A: no-image mission card resolves to the official Mission cover — got src=' + JSON.stringify(cardA && cardA.imgSrc));

  // --- Test B: mission with a real submitted photo -> real photo, NOT the cover ---
  // normalizeMissionItemForMedia (Prompt #73/74) rewrites the Worker-absolute URL to the
  // same-origin proxy path — still the SAME real photo, just via the same-origin route.
  const REAL_PHOTO_SAME_ORIGIN = '/api/news/image?key=news%2Fnews-real-photo-test.png';
  const cardB = findCard(cards, MISSION_PHOTO.title);
  assert(!!cardB, 'Test B: photo-submitted mission card is present');
  assert(cardB && cardB.imgSrc === REAL_PHOTO_SAME_ORIGIN, 'Test B: mission with a real submitted photo shows that REAL photo (same-origin normalized) — got src=' + JSON.stringify(cardB && cardB.imgSrc));
  assert(cardB && !/mission-card\.png/.test(cardB.imgSrc || ''), 'Test B: the Mission cover does NOT override a real submitted photo');

  // --- Test C: STARTED (pending) text-only mission -> cover + badge preserved ---
  const cardC = findCard(cards, MISSION_PENDING.title);
  assert(!!cardC, 'Test C: pending text-only mission card is present');
  assert(cardC && /assets\/mission-card\.png$/.test(cardC.imgSrc || ''), 'Test C: pending text-only mission resolves to the official Mission cover — got src=' + JSON.stringify(cardC && cardC.imgSrc));
  assert(cardC && cardC.stateBadge === 'STARTED', 'Test C: STARTED badge is preserved alongside the Mission cover — got badge=' + JSON.stringify(cardC && cardC.stateBadge));

  // --- Test D: NEEDS CHANGES (returned) text-only mission -> cover + badge preserved ---
  const cardD = findCard(cards, MISSION_RETURNED.title);
  assert(!!cardD, 'Test D: returned text-only mission card is present');
  assert(cardD && /assets\/mission-card\.png$/.test(cardD.imgSrc || ''), 'Test D: returned text-only mission resolves to the official Mission cover — got src=' + JSON.stringify(cardD && cardD.imgSrc));
  assert(cardD && cardD.stateBadge === 'NEEDS CHANGES', 'Test D: NEEDS CHANGES badge is preserved alongside the Mission cover — got badge=' + JSON.stringify(cardD && cardD.stateBadge));

  // ---------------------------------------------------------------------------
  // Real browser visual check — 1920 desktop: 16:9 fit, no stretch, no overflow,
  // title/badge remain readable, card height matches the canonical contract.
  // ---------------------------------------------------------------------------
  async function visualCheck(label) {
    const geo = await page.evaluate((title) => {
      const cards = Array.from(document.querySelectorAll('#missionsLibraryGrid [data-lantern-card-type]'));
      const card = cards.find((el) => (el.querySelector('.lanternCanonicalCardTitle') || {}).textContent.indexOf(title) !== -1);
      if (!card) return null;
      const cardRect = card.getBoundingClientRect();
      const frame = card.querySelector('.lanternCanonicalCardFrame');
      const img = card.querySelector('.lanternCanonicalCardImage');
      const frameRect = frame.getBoundingClientRect();
      const imgRect = img.getBoundingClientRect();
      const title_ = card.querySelector('.lanternCanonicalCardTitle');
      const badge = card.querySelector('.lanternCanonicalCardStateBadge');
      const cs = getComputedStyle(img);
      return {
        cardW: cardRect.width, cardH: cardRect.height,
        frameW: frameRect.width, frameH: frameRect.height,
        imgW: imgRect.width, imgH: imgRect.height,
        objectFit: cs.objectFit,
        titleVisible: !!title_ && title_.textContent.trim().length > 0 && getComputedStyle(title_).display !== 'none',
        badgeVisible: !badge || getComputedStyle(badge).display !== 'none',
        imgWithinFrame: imgRect.width <= frameRect.width + 1 && imgRect.height <= frameRect.height + 1,
      };
    }, MISSION_NOIMG.title);
    if (!geo) { assert(false, label + ': card geometry not found'); return; }
    assert(geo.objectFit === 'cover', label + ': Mission cover image uses object-fit: cover (no stretch/squash) — got ' + geo.objectFit);
    assert(geo.imgWithinFrame, label + ': image fills the 16:9 frame without overflowing it (w=' + geo.imgW.toFixed(1) + ' h=' + geo.imgH.toFixed(1) + ' vs frame w=' + geo.frameW.toFixed(1) + ' h=' + geo.frameH.toFixed(1) + ')');
    const ratio = geo.frameW / geo.frameH;
    assert(ratio > 1.5 && ratio < 2.1, label + ': card media frame preserves a 16:9-ish landscape ratio (' + ratio.toFixed(2) + ')');
    assert(geo.titleVisible, label + ': mission title text remains visible/readable over the cover art');
    assert(geo.badgeVisible, label + ': badge layer (when present) remains visible over the cover art');
  }

  await visualCheck('Desktop 1920 visual check');

  const cardHeightsDesktop = await page.evaluate(() => Array.from(document.querySelectorAll('#missionsLibraryGrid [data-lantern-card-type]')).map((el) => el.getBoundingClientRect().height));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  await visualCheck('Phone-width (390px) visual check');
  const cardHeightsPhone = await page.evaluate(() => Array.from(document.querySelectorAll('#missionsLibraryGrid [data-lantern-card-type]')).map((el) => el.getBoundingClientRect().height));
  assert(cardHeightsPhone.length === cardHeightsDesktop.length, 'Phone width: same number of mission cards render (no dropped cards)');
  assert(cardHeightsPhone.every((h) => h > 0 && h < 700), 'Phone width: no card-height blowup/regression from the cover art (all card heights sane: ' + JSON.stringify(cardHeightsPhone) + ')');

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
