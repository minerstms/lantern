/**
 * Locker Featured Post (LanternCards) browser QA.
 * Run: cd e2e/studio-contribute && node locker-featured-post-qa.mjs
 * Requires: http-server on apps/lantern-app (script starts it on 8898).
 */
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(__dirname, '../../apps/lantern-app');
const PORT = 8898;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT_DIR = path.resolve(__dirname, 'test-results/locker-featured-qa');

function waitForServer(ms = 20000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function ping() {
      const req = http.get(`${BASE}/locker.html`, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - start > ms) reject(new Error('Server did not start'));
        else setTimeout(ping, 250);
      });
    }
    ping();
  });
}

function startHttpServer() {
  return spawn('npx', ['http-server', '-p', String(PORT), '-c-1', '.'], {
    cwd: APP_DIR,
    shell: true,
    stdio: 'ignore',
  });
}

async function routeClassAccess(page) {
  await page.route(/\/api\/class-access\/state/, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, tokenValid: true, accessState: 'live_ok' }),
    });
  });
}

/** Store / modals can block clicks (e.g. Store fetch mocked in QA); not Featured slice scope. */
/** Clicks the visible tab button (Overview vs Items/Store panels each have their own tab strip). */
async function clickVisibleLockerTab(page, tab) {
  await page.evaluate((t) => {
    var sel = '.lockerTabBtn[data-locker-tab="' + t + '"]';
    var nodes = document.querySelectorAll(sel);
    for (var i = 0; i < nodes.length; i++) {
      var btn = nodes[i];
      var r = btn.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0) {
        btn.click();
        return;
      }
    }
  }, tab);
}

async function dismissBlockingOverlays(page) {
  await page.evaluate(() => {
    ['storePurchaseOverlay', 'editProfileOverlay', 'avatarCropOverlay', 'betaReportOverlay'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        el.innerHTML = '';
        el.style.cssText = 'display:none!important;pointer-events:none!important;visibility:hidden!important';
      }
    });
    var chev = document.getElementById('lanternMenuTrigger');
    if (chev && chev.getAttribute('aria-expanded') === 'true') chev.click();
  });
}

function saveProfileFeatured(page, characterName, featuredPostId) {
  return page.evaluate(
    ({ characterName, featuredPostId }) =>
      new Promise((resolve) => {
        if (!window.LANTERN_API || !window.LANTERN_API.createRun) {
          resolve({ ok: false, err: 'no API' });
          return;
        }
        var run = window.LANTERN_API.createRun();
        run
          .withSuccessHandler(function (r) {
            resolve({ ok: true, r: r });
          })
          .withFailureHandler(function (e) {
            resolve({ ok: false, err: String(e) });
          })
          .saveProfile({
            character_name: characterName,
            updates: { featured_post_id: featuredPostId },
          });
      }),
    { characterName, featuredPostId }
  );
}

async function seedAdoptReload(page, char, featuredId) {
  await page.goto(`${BASE}/locker.html`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    if (window.LANTERN_DATA && window.LANTERN_DATA.seedDemoWorld) window.LANTERN_DATA.seedDemoWorld();
  });
  await page.evaluate((c) => {
    localStorage.setItem('LANTERN_ADOPTED_CHARACTER', JSON.stringify(c));
  }, char);
  await saveProfileFeatured(page, char.name, featuredId);
  await page.waitForTimeout(400);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2800);
}

async function waitFeaturedVisible(page, timeout = 20000) {
  await page.waitForFunction(
    () => {
      const el = document.getElementById('featuredPostEl');
      if (!el || el.style.display === 'none') return false;
      return !!el.querySelector('.exploreCard.lockerFeaturedPostExplore');
    },
    null,
    { timeout }
  );
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const server = startHttpServer();
  await waitForServer();

  const report = {
    items: {},
    reportControl: null,
    consoleErrors: [],
    pageErrors: [],
  };

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') report.consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    report.pageErrors.push(String(err.message || err));
  });

  await routeClassAccess(page);
  await page.route('**/api/**', (route) => {
    if (route.request().url().includes('class-access/state')) return route.continue();
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  const alex = { character_id: 'char1', name: 'Alex Adventure', avatar: '🌟' };
  const riley = { character_id: 'char5', name: 'Riley Rise', avatar: '🚀' };

  // --- 1) Featured visible when set (Alex + dp1 image) ---
  let item1 = 'PASS';
  try {
    await seedAdoptReload(page, alex, 'dp1');
    await waitFeaturedVisible(page);
    const t1 = await page.locator('#featuredPostEl .exploreTitle').textContent();
    const cap = await page.locator('#featuredPostEl .exploreCaption').first().textContent();
    if (!t1 || t1.indexOf('Featured') < 0) item1 = 'FAIL: title missing Featured';
    if (!cap || cap.indexOf('weekend') < 0) item1 = 'FAIL: caption mismatch';
    if (!item1.startsWith('FAIL')) {
      const hasImg = await page.locator('#featuredPostEl .exploreCardVisual img').count();
      if (hasImg < 1) item1 = 'FAIL: expected image media';
    }
  } catch (e) {
    item1 = 'FAIL: ' + e.message;
    await page.screenshot({ path: path.join(OUT_DIR, 'fail-item1.png'), fullPage: true });
  }
  report.items['1_featured_visible'] = item1;

  // --- 2) Hidden when none ---
  let item2 = 'PASS';
  try {
    await saveProfileFeatured(page, alex.name, '');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    const ok = await page.evaluate(() => {
      const el = document.getElementById('featuredPostEl');
      return el && el.style.display === 'none' && String(el.innerHTML || '').trim() === '';
    });
    if (!ok) item2 = 'FAIL: shell not clean or still visible';
  } catch (e) {
    item2 = 'FAIL: ' + e.message;
    await page.screenshot({ path: path.join(OUT_DIR, 'fail-item2.png'), fullPage: true });
  }
  report.items['2_hidden_none'] = item2;

  // --- 3) Media: image, link, webapp, project (Alex), video (Riley + dp5) ---
  let item3 = 'PASS';
  try {
    await saveProfileFeatured(page, alex.name, 'dp11');
    await page.waitForTimeout(500);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    await dismissBlockingOverlays(page);
    await waitFeaturedVisible(page);
    var rid11b = await page.locator('#featuredPostEl .exploreCard').getAttribute('data-report-id');
    if (rid11b !== 'dp11') item3 = 'FAIL: link post id want dp11 got ' + rid11b;

    await saveProfileFeatured(page, alex.name, 'dp6');
    await page.waitForTimeout(500);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    await dismissBlockingOverlays(page);
    await waitFeaturedVisible(page);
    var rid6b = await page.locator('#featuredPostEl .exploreCard').getAttribute('data-report-id');
    if (rid6b !== 'dp6') item3 = 'FAIL: webapp post id want dp6 got ' + rid6b;

    await saveProfileFeatured(page, alex.name, 'dp21');
    await page.waitForTimeout(500);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2800);
    await dismissBlockingOverlays(page);
    await waitFeaturedVisible(page);
    var rid21b = await page.locator('#featuredPostEl .exploreCard').getAttribute('data-report-id');
    if (rid21b !== 'dp21') item3 = 'FAIL: project post id want dp21 got ' + rid21b;

    await page.evaluate((c) => {
      localStorage.setItem('LANTERN_ADOPTED_CHARACTER', JSON.stringify(c));
    }, riley);
    await saveProfileFeatured(page, riley.name, 'dp5');
    await page.waitForTimeout(500);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2800);
    await dismissBlockingOverlays(page);
    await waitFeaturedVisible(page);
    var rid5 = await page.locator('#featuredPostEl .exploreCard').getAttribute('data-report-id');
    if (rid5 !== 'dp5') item3 = 'FAIL: video post id want dp5 got ' + rid5;
    const vidVisual = await page.locator('#featuredPostEl .exploreCardVisual').count();
    if (vidVisual < 1) item3 = 'FAIL: video visual block';

    const w = await page.evaluate(() => {
      const card = document.querySelector('#featuredPostEl .exploreCard');
      return card ? card.getBoundingClientRect().width : 0;
    });
    if (w < 200) item3 = 'FAIL: card width collapse ' + w;

    await page.evaluate((c) => {
      localStorage.setItem('LANTERN_ADOPTED_CHARACTER', JSON.stringify(c));
    }, alex);
    await saveProfileFeatured(page, alex.name, 'dp1');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
  } catch (e) {
    item3 = 'FAIL: ' + e.message;
    await page.screenshot({ path: path.join(OUT_DIR, 'fail-item3.png'), fullPage: true });
  }
  report.items['3_media'] = item3;

  // --- 4) Interaction ---
  let item4 = 'PASS';
  try {
    await dismissBlockingOverlays(page);
    await waitFeaturedVisible(page);
    const urlBefore = page.url();
    const card = page.locator('#featuredPostEl .exploreCard').first();
    await card.click({ position: { x: 80, y: 80 }, force: true });
    await page.waitForTimeout(400);
    if (page.url() !== urlBefore) item4 = 'FAIL: navigated on card click';
    const reportBtn = await page.locator('#featuredPostEl .exploreCardReportBtn').count();
    report.reportControl = reportBtn > 0 ? 'present' : 'absent';
    if (reportBtn > 0) {
      await page.locator('#featuredPostEl .exploreCardReportBtn').click({ force: true }).catch(() => {});
      await page.waitForTimeout(300);
    }
    await dismissBlockingOverlays(page);
  } catch (e) {
    item4 = 'FAIL: ' + e.message;
    await page.screenshot({ path: path.join(OUT_DIR, 'fail-item4.png'), fullPage: true });
  }
  report.items['4_interaction'] = item4;

  // --- 5) Save/reload ---
  let item5 = 'PASS';
  try {
    await page.evaluate((c) => {
      localStorage.setItem('LANTERN_ADOPTED_CHARACTER', JSON.stringify(c));
    }, alex);
    await dismissBlockingOverlays(page);
    await saveProfileFeatured(page, alex.name, 'dp11');
    await page.waitForTimeout(400);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    await dismissBlockingOverlays(page);
    await waitFeaturedVisible(page);
    var ridA = await page.locator('#featuredPostEl .exploreCard').getAttribute('data-report-id');
    if (ridA !== 'dp11') item5 = 'FAIL: first featured want dp11 got ' + ridA;

    await saveProfileFeatured(page, alex.name, 'dp6');
    await page.waitForTimeout(500);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    await dismissBlockingOverlays(page);
    await waitFeaturedVisible(page);
    var ridB = await page.locator('#featuredPostEl .exploreCard').getAttribute('data-report-id');
    if (ridB !== 'dp6') item5 = 'FAIL: second featured want dp6 got ' + ridB;
  } catch (e) {
    item5 = 'FAIL: ' + e.message;
    await page.screenshot({ path: path.join(OUT_DIR, 'fail-item5.png'), fullPage: true });
  }
  report.items['5_save_reload'] = item5;

  // --- 6) Console + tabs ---
  let item6 = 'PASS';
  try {
    await page.goto(`${BASE}/locker.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    await dismissBlockingOverlays(page);
    await page.waitForSelector('#profileHeroEl', { timeout: 20000 });
    const badConsole = report.consoleErrors.filter(
      (t) =>
        !t.includes('favicon') &&
        !t.includes('404') &&
        !t.includes('Failed to load resource') &&
        !t.includes('net::ERR')
    );
    var pageErrFiltered = report.pageErrors.filter(function (m) {
      return m.indexOf('HUNT_ZONES') < 0;
    });
    if (pageErrFiltered.length) item6 = 'FAIL pageerrors: ' + JSON.stringify(pageErrFiltered.slice(0, 5));
    else if (badConsole.length) item6 = 'FAIL console: ' + badConsole.slice(0, 3).join(' | ');
    report.huntZonesPageErrors = report.pageErrors.filter(function (m) {
      return m.indexOf('HUNT_ZONES') >= 0;
    }).length;

    await dismissBlockingOverlays(page);
    await clickVisibleLockerTab(page, 'items');
    await page.waitForTimeout(500);
    const itemsHidden = await page.locator('#lockerPanelItems').getAttribute('hidden');
    if (itemsHidden !== null) item6 = 'FAIL: Items tab not shown';

    await dismissBlockingOverlays(page);
    await clickVisibleLockerTab(page, 'store');
    await page.waitForTimeout(500);
    const storeHidden = await page.locator('#lockerPanelStore').getAttribute('hidden');
    if (storeHidden !== null) item6 = 'FAIL: Store tab not shown';

    await dismissBlockingOverlays(page);
    await clickVisibleLockerTab(page, 'overview');
    await page.waitForTimeout(500);
    const ovHidden = await page.locator('#lockerPanelOverview').getAttribute('hidden');
    if (ovHidden !== null) item6 = 'FAIL: Overview tab not shown';

    const mc = await page.locator('#postFeedEl').count();
    if (mc < 1) item6 = 'FAIL: My Creations rail missing';
  } catch (e) {
    item6 = 'FAIL: ' + e.message;
    await page.screenshot({ path: path.join(OUT_DIR, 'fail-item6.png'), fullPage: true });
  }
  report.items['6_console_regression'] = item6;

  await browser.close();
  server.kill();

  console.log('\n=== Locker Featured Post QA ===\n');
  Object.entries(report.items).forEach(([k, v]) => console.log(k + ':', v));
  console.log('\nReport control on featured card:', report.reportControl);
  console.log('Page errors:', report.pageErrors.length ? report.pageErrors : '(none)');
  console.log('Console errors (raw count):', report.consoleErrors.length);

  const allPass = Object.values(report.items).every((v) => String(v).startsWith('PASS'));
  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
