import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { pathToFileURL } from 'url';

const appDir = path.resolve('../../apps/lantern-app');
const base = pathToFileURL(path.join(appDir, 'contribute.html')).href;
const png = path.join(process.cwd(), 'fixture-1x1.png');
if (!fs.existsSync(png)) {
  fs.writeFileSync(
    png,
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    )
  );
}

async function go(page, type) {
  await page.goto(`${base}?type=${type}`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(2500);
}

const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await p.addInitScript(() => {
  localStorage.setItem(
    'LANTERN_ADOPTED_CHARACTER',
    JSON.stringify({ name: 'zane_morrison', character_id: 'zane_morrison' })
  );
});

await go(p, 'profile_post');
await p.locator('#profilePostTitle').fill(`Prof ${Date.now()}`);
await p.locator('#profilePostCaption').fill('cap');
await p
  .locator('#profilePostUrl')
  .fill(
    'https://lantern-api.mrradle.workers.dev/api/avatar/image?key=avatars%2Fstudents%2Fzane_morrison.png'
  );
await p.locator('#submitNewsBtn').click();
await p.locator('#toast').filter({ hasText: /saved/i }).waitFor({ state: 'visible', timeout: 30000 });
const postsJson = await p.evaluate(() => localStorage.getItem('LANTERN_POSTS') || '');
console.log('profile toast OK; localStorage posts snippet:', (postsJson || '').slice(0, 120));

await go(p, 'mission');
await p.locator('button[data-mission-id="perm_shoutout_someone"]').click();
await p.waitForTimeout(500);
await p.locator('#missionSubmitContent').fill(`Mission e2e text. ${'z'.repeat(35)}`);
let resP = p.waitForResponse((r) => r.url().includes('/api/missions/submit'), { timeout: 90000 });
await p.locator('#missionSubmitBtn').click();
let res = await resP;
console.log('mission text', res.status(), (await res.text()).slice(0, 120));

await go(p, 'mission');
await p.locator('button[data-mission-id="perm_create_a_poll"]').click();
await p.waitForTimeout(500);
await p.locator('#missionSubmitPollQuestion').fill(`Q ${Date.now()}`);
await p.locator('#missionSubmitPollChoice1').fill('P1');
await p.locator('#missionSubmitPollChoice2').fill('P2');
await p
  .locator('#missionSubmitPollImageUrl')
  .fill(
    'https://lantern-api.mrradle.workers.dev/api/avatar/image?key=avatars%2Fstudents%2Fzane_morrison.png'
  );
resP = p.waitForResponse((r) => r.url().includes('/api/missions/submit'), { timeout: 90000 });
await p.locator('#missionSubmitBtn').click();
res = await resP;
console.log('mission poll', res.status(), (await res.text()).slice(0, 120));

await go(p, 'post');
await p.locator('#newsCategorySelect').selectOption({ index: 1 });
await p.locator('#newsTitle').fill(`Img ${Date.now()}`);
await p.locator('#newsBody').fill('Body '.repeat(15));
await p.locator('#newsUnifiedMediaMount input[type=file]').setInputFiles(png);
await p.locator('#cropperUseBtn').click({ timeout: 30000 });
await p.waitForTimeout(800);
const upP = p
  .waitForResponse((r) => r.url().includes('/api/news/upload-image'), { timeout: 120000 })
  .catch(() => null);
resP = p.waitForResponse((r) => r.url().includes('/api/news/create'), { timeout: 120000 });
await p.locator('#submitNewsBtn').click();
const up = await upP;
if (up) console.log('upload-image', up.status());
res = await resP;
console.log('post+img create', res.status(), (await res.text()).slice(0, 120));

await browser.close();
