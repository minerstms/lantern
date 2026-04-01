/**
 * Live E2E against deployed Pages + production Worker (window.LANTERN_AVATAR_API in page).
 * Adopted character must exist in live D1 — uses zane_morrison from /api/games/characters.
 */
const { test, expect, request } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = process.env.STUDIO_BASE_URL || 'https://lantern-42i.pages.dev';
const WORKER_API = process.env.LANTERN_API_BASE || 'https://lantern-api.mrradle.workers.dev';
const CONTRIB_PATH = /127\.0\.0\.1|localhost/i.test(BASE) ? '/contribute.html' : '/contribute';

/** Fresh returned poll each suite run (test 09). */
let seededReturnedPollContribId = null;

const ADOPTED_JSON = JSON.stringify({
  name: 'zane_morrison',
  character_id: 'zane_morrison',
  display_name: 'Zane Morrison',
  avatar: '🌟',
});

const UNIQUE = () => `e2e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const PNG_FIXTURE = path.join(__dirname, 'fixture-1x1.png');

function ensurePngFixture() {
  if (fs.existsSync(PNG_FIXTURE)) return;
  // 1x1 transparent PNG
  const b64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  fs.writeFileSync(PNG_FIXTURE, Buffer.from(b64, 'base64'));
}

async function injectAdopted(page) {
  await page.addInitScript((s) => {
    localStorage.setItem('LANTERN_ADOPTED_CHARACTER', s);
  }, ADOPTED_JSON);
}

async function openContribute(page, type) {
  await injectAdopted(page);
  await page.goto(`${CONTRIB_PATH}?type=${encodeURIComponent(type)}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#contributeTypeSelect', { state: 'visible' });
  await page.waitForFunction(
    () =>
      typeof window.LanternCards !== 'undefined' &&
      (document.getElementById('studioRailTrack')?.innerHTML || '').length > 50,
    { timeout: 60000 }
  );
}

async function openContributePollResubmit(page, resubmitId) {
  await injectAdopted(page);
  const url = `${BASE}${CONTRIB_PATH}?type=poll&resubmit=${encodeURIComponent(resubmitId)}`;
  const contribGet = page.waitForResponse(
    (r) =>
      r.url().includes('/api/polls/contributions/') && r.request().method() === 'GET',
    { timeout: 60000 }
  );
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('#contributeTypeSelect', { state: 'visible' });
  await contribGet;
  await page.waitForFunction(
    () =>
      typeof window.LanternCards !== 'undefined' &&
      (document.getElementById('studioRailTrack')?.innerHTML || '').length > 50,
    { timeout: 60000 }
  );
}

async function dismissStudentCelebration(page) {
  const overlay = page.locator('.lscOverlay');
  const has = await overlay.count().catch(() => 0);
  if (!has) return;
  await page.getByRole('button', { name: 'Skip game' }).click({ timeout: 30000 });
  await page.getByRole('button', { name: 'Continue' }).click({ timeout: 30000 });
  await expect(overlay).toHaveCount(0, { timeout: 10000 });
}

async function waitToast(page, substr, timeout = 25000) {
  const toast = page.locator('#toast');
  await expect(toast).toBeVisible({ timeout });
  await expect(toast).toContainText(substr, { timeout });
}

test.beforeAll(async () => {
  ensurePngFixture();
  const req = await request.newContext({ baseURL: WORKER_API });
  const seedTag = `e2e_seed_${Date.now()}`;
  const postContrib = await req.post('/api/polls/contribute', {
    headers: { 'Content-Type': 'application/json' },
    data: {
      character_name: 'zane_morrison',
      question: `Resubmit E2E ${seedTag}?`,
      choices: ['Seed A', 'Seed B'],
      fallback_key: 'poll',
    },
  });
  if (!postContrib.ok()) {
    const t = await postContrib.text().catch(() => '');
    throw new Error(`poll contribute seed failed HTTP ${postContrib.status()} ${t}`);
  }
  const pj = await postContrib.json();
  seededReturnedPollContribId = pj.id;
  if (!seededReturnedPollContribId) throw new Error('poll contribute seed: missing id');

  const pend = await req.get('/api/approvals/pending?type=poll');
  const pendJ = await pend.json();
  const appr = (pendJ.pending || []).find((x) => x.item_id === seededReturnedPollContribId);
  if (!appr) throw new Error('poll seed: no pending approval row');

  const ret = await req.post('/api/approvals/return', {
    headers: { 'Content-Type': 'application/json' },
    data: {
      id: appr.id,
      decision_note: 'Playwright studio-live returned resubmit seed',
      reviewed_by_staff_name: 'E2E Playwright',
    },
  });
  if (!ret.ok()) {
    const t = await ret.text().catch(() => '');
    throw new Error(`approvals/return seed failed HTTP ${ret.status()} ${t}`);
  }
  await req.dispose();
});

test('01 Post — text only (student): previews + submit', async ({ page }) => {
  const u = UNIQUE();
  const title = `E2E post ${u}`;
  const body =
    'This is an automated end-to-end test submission from Playwright against the live Studio and API. It must be at least fifty characters long.';

  await openContribute(page, 'post');

  await page.locator('#newsCategorySelect').selectOption({ index: 1 });
  await page.locator('#newsTitle').fill(title);
  await page.locator('#newsBody').fill(body);

  await expect(page.locator('#studioRailTrack')).toContainText(title.slice(0, 24), { timeout: 15000 });
  await expect(page.locator('#studioOpenedPreviewInner')).toContainText(title.slice(0, 24), { timeout: 15000 });

  const resPromise = page.waitForResponse(
    (r) => r.url().includes('/api/news/create') && r.request().method() === 'POST',
    { timeout: 60000 }
  );
  await page.locator('#submitNewsBtn').click();
  const res = await resPromise;
  expect(res.ok(), `HTTP ${res.status()} ${await res.text().catch(() => '')}`).toBeTruthy();

  await dismissStudentCelebration(page);
  await waitToast(page, 'Submitted');
});

test('02 Post — with image upload: previews + cropper + submit', async ({ page }) => {
  const u = UNIQUE();
  const title = `E2E img ${u}`;
  const body =
    'Automated image post E2E. Body text for student reporter path with uploaded PNG after cropper confirm.';

  await openContribute(page, 'post');
  await page.locator('#newsCategorySelect').selectOption({ index: 1 });
  await page.locator('#newsTitle').fill(title);
  await page.locator('#newsBody').fill(body);

  const fileInput = page.locator('#newsUnifiedMediaMount input[type="file"]');
  await fileInput.setInputFiles(PNG_FIXTURE);

  await page.locator('#cropperModal').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('#cropperUseBtn').click();
  await page.locator('#cropperModal').waitFor({ state: 'hidden', timeout: 30000 });

  await expect(page.locator('#studioRailTrack')).toContainText(title.slice(0, 12), { timeout: 15000 });
  await expect(page.locator('#studioOpenedPreviewInner')).toContainText(title.slice(0, 12), { timeout: 15000 });

  const upPromise = page.waitForResponse(
    (r) => r.url().includes('/api/news/upload-image') && r.request().method() === 'POST',
    { timeout: 90000 }
  );
  const createPromise = page.waitForResponse(
    (r) => r.url().includes('/api/news/create') && r.request().method() === 'POST',
    { timeout: 90000 }
  );

  await page.locator('#submitNewsBtn').click();
  const up = await upPromise;
  expect(up.ok(), `upload-image HTTP ${up.status()}`).toBeTruthy();
  const cr = await createPromise;
  expect(cr.ok(), `create HTTP ${cr.status()}`).toBeTruthy();

  await dismissStudentCelebration(page);
  await waitToast(page, 'Submitted');
});

test('03 Shoutout: previews + submit', async ({ page }) => {
  const u = UNIQUE();
  await openContribute(page, 'shoutout');
  await page.locator('#contributeTypeSelect').selectOption('shoutout');
  await page.waitForTimeout(400);

  await page.locator('#shoutTypeSelect').selectOption({ index: 1 });
  await page.locator('#shoutRecipient').fill(`Pat ${u}`);
  await page.locator('#newsBody').fill(
    `Thank you for helping with the E2E test today. This shout-out must have enough text to pass validation checks. ${u}`
  );

  await expect(page.locator('#studioRailTrack')).toContainText('Shout', { timeout: 15000 });
  /* Opened preview uses raw #newsBody; “Recognizing: …” is only composed on submit, not in live preview. */
  await expect(page.locator('#studioOpenedPreviewInner')).toContainText('Thank you for helping', { timeout: 15000 });

  const resPromise = page.waitForResponse(
    (r) => r.url().includes('/api/news/create') && r.request().method() === 'POST',
    { timeout: 60000 }
  );
  await page.locator('#submitNewsBtn').click();
  const res = await resPromise;
  expect(res.ok(), `HTTP ${res.status()}`).toBeTruthy();

  await dismissStudentCelebration(page);
  await waitToast(page, 'Submitted');
});

test('04 Poll: previews + submit (fallback art)', async ({ page }) => {
  const u = UNIQUE();
  await openContribute(page, 'poll');
  await page.locator('#pollQuestion').fill(`Favorite test color ${u}?`);
  const opts = page.locator('#pollOptionsWrap .pollOptInput');
  await opts.nth(0).fill('Blue');
  await opts.nth(1).fill('Green');

  await expect(page.locator('#studioRailTrack')).toContainText('Favorite test', { timeout: 15000 });
  await expect(page.locator('#studioOpenedPreviewInner')).toContainText('Favorite test', { timeout: 15000 });

  const resPromise = page.waitForResponse(
    (r) => r.url().includes('/api/polls/contribute') && r.request().method() === 'POST',
    { timeout: 60000 }
  );
  await page.locator('#submitNewsBtn').click();
  const res = await resPromise;
  expect(res.ok(), `HTTP ${res.status()} ${await res.text().catch(() => '')}`).toBeTruthy();
  await waitToast(page, 'Submitted');
});

test('05 Profile post: previews + submit', async ({ page }) => {
  const u = UNIQUE();
  await openContribute(page, 'profile_post');
  await page.locator('#profilePostTitle').fill(`Locker highlight ${u}`);
  await page.locator('#profilePostCaption').fill('E2E profile post caption');
  await page
    .locator('#profilePostUrl')
    .fill('https://lantern-api.mrradle.workers.dev/api/avatar/image?key=avatars%2Fstudents%2Fzane_morrison.png');

  await expect(page.locator('#studioRailTrack')).toContainText('Locker highlight', { timeout: 15000 });
  await expect(page.locator('#studioOpenedPreviewInner')).toContainText('Locker highlight', { timeout: 15000 });

  await page.locator('#submitNewsBtn').click();
  await waitToast(page, 'saved', 60000);
});

test('06 Mission — text submission', async ({ page }) => {
  await openContribute(page, 'mission');
  await page.locator('button[data-mission-id="perm_shoutout_someone"]').click();
  await page.locator('#missionStudioFormPanel.missionStudioFormPanel--open').waitFor({ state: 'visible' });

  const text = `E2E mission text ${UNIQUE()}. ` + 'x'.repeat(40);
  await page.locator('#missionSubmitContent').fill(text);

  /* Rail cards use mission titles (e.g. “Shout-Out Someone”), not the word “Mission”. */
  await expect(page.locator('#studioRailTrack')).toContainText('Shout-Out', { timeout: 15000 });
  await expect(page.locator('#studioOpenedPreviewInner')).toContainText(text.slice(0, 20), { timeout: 15000 });

  const resPromise = page.waitForResponse(
    (r) => r.url().includes('/api/missions/submit') && r.request().method() === 'POST',
    { timeout: 60000 }
  );
  await page.locator('#missionSubmitBtn').click();
  const res = await resPromise;
  expect(res.ok(), `HTTP ${res.status()} ${await res.text().catch(() => '')}`).toBeTruthy();
  await waitToast(page, 'Submitted');
});

test('07 Mission — poll (Create a Poll)', async ({ page }) => {
  await openContribute(page, 'mission');
  await page.locator(`button[data-mission-id="perm_create_a_poll"]`).click();
  await page.locator('#missionSubmitPollWrap').waitFor({ state: 'visible' });

  const u = UNIQUE();
  await page.locator('#missionSubmitPollQuestion').fill(`School lunch ${u}?`);
  await page.locator('#missionSubmitPollChoice1').fill('Pizza');
  await page.locator('#missionSubmitPollChoice2').fill('Tacos');
  await page
    .locator('#missionSubmitPollImageUrl')
    .fill('https://lantern-api.mrradle.workers.dev/api/avatar/image?key=avatars%2Fstudents%2Fzane_morrison.png');

  await expect(page.locator('#studioRailTrack')).toContainText('School lunch', { timeout: 15000 });
  await expect(page.locator('#studioOpenedPreviewInner')).toContainText('School lunch', { timeout: 15000 });
  await expect(page.locator('#studioOpenedPreviewInner .pollChoiceBtn').filter({ hasText: 'Pizza' })).toHaveCount(1);

  const resPromise = page.waitForResponse(
    (r) => r.url().includes('/api/missions/submit') && r.request().method() === 'POST',
    { timeout: 60000 }
  );
  await page.locator('#missionSubmitBtn').click();
  const res = await resPromise;
  expect(res.ok(), `HTTP ${res.status()} ${await res.text().catch(() => '')}`).toBeTruthy();
  await waitToast(page, 'Submitted');
});

test('08 Mission — bug_report', async ({ page, request }) => {
  const j = await request.get(`${WORKER_API}/api/missions/active?character_name=zane_morrison`);
  const data = await j.json();
  const bugM = (data.missions || []).find((m) => m.submission_type === 'bug_report');
  if (!bugM) {
    test.skip(
      true,
      'Live API: no mission with submission_type=bug_report in /api/missions/active for zane_morrison.'
    );
  }
  await openContribute(page, 'mission');
  await page.locator(`button[data-mission-id="${bugM.id}"]`).click();
  await page.locator('#missionSubmitBugReportWrap').waitFor({ state: 'visible' });
  const bugText = `E2E bug report ${UNIQUE()}. Something looks wrong in the flow.`;
  await page.locator('#missionSubmitBugReportDesc').fill(bugText);

  await expect(page.locator('#studioRailTrack')).toContainText(
    String(bugM.title || 'Bug').slice(0, 18),
    { timeout: 15000 }
  );
  await expect(page.locator('#studioOpenedPreviewInner')).toContainText(bugText.slice(0, 24), { timeout: 15000 });

  const resPromise = page.waitForResponse(
    (r) => r.url().includes('/api/missions/submit') && r.request().method() === 'POST',
    { timeout: 60000 }
  );
  await page.locator('#missionSubmitBtn').click();
  const res = await resPromise;
  expect(res.ok(), `HTTP ${res.status()} ${await res.text().catch(() => '')}`).toBeTruthy();
  await waitToast(page, 'Submitted');
});

test('09 Returned poll resubmit', async ({ page }) => {
  expect(seededReturnedPollContribId, 'beforeAll should seed a returned poll').toBeTruthy();
  await openContributePollResubmit(page, seededReturnedPollContribId);

  await expect(page.locator('#pollQuestion')).toHaveValue(/Resubmit E2E e2e_seed_/, { timeout: 5000 });
  await expect(page.locator('#pollOptionsWrap .pollOptInput').nth(0)).toHaveValue('Seed A');
  await expect(page.locator('#submitNewsBtn')).toContainText('Resubmit');

  const qSnippet = (await page.locator('#pollQuestion').inputValue()).slice(0, 16);
  await expect(page.locator('#studioRailTrack')).toContainText(qSnippet, { timeout: 15000 });
  await expect(page.locator('#studioOpenedPreviewInner')).toContainText(qSnippet, { timeout: 15000 });

  await page.locator('#pollOptionsWrap .pollOptInput').nth(0).fill('Seed A resubmitted');
  await expect(page.locator('#studioOpenedPreviewInner')).toContainText('Seed A resubmitted', { timeout: 15000 });

  const resPromise = page.waitForResponse(
    (r) => r.url().includes('/api/polls/resubmit') && r.request().method() === 'POST',
    { timeout: 60000 }
  );
  await page.locator('#submitNewsBtn').click();
  const res = await resPromise;
  expect(res.ok(), `HTTP ${res.status()} ${await res.text().catch(() => '')}`).toBeTruthy();
  await waitToast(page, 'Resubmitted');
});
