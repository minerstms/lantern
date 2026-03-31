/**
 * news.html stub QA — run from repo root or this folder.
 * Static server: use `npx http-server` on apps/lantern-app (not `serve`, which may strip ?nostub=1 on redirect).
 *
 *   cd apps/lantern-app && npx http-server -p 8898 -c-1
 *   cd e2e/studio-contribute && node news-stub-qa.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(__dirname, '../../apps/lantern-app');
const PORT = 8898;
const BASE = `http://127.0.0.1:${PORT}`;

function waitForServer(ms = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function ping() {
      const req = http.get(`${BASE}/news.html`, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - start > ms) reject(new Error('Server did not start'));
        else setTimeout(ping, 200);
      });
    }
    ping();
  });
}

function startHttpServer() {
  const proc = spawn(
    'npx',
    ['http-server', '-p', String(PORT), '-c-1', '.'],
    { cwd: APP_DIR, shell: true, stdio: 'ignore' }
  );
  return proc;
}

async function main() {
  const server = startHttpServer();
  try {
    await waitForServer();
  } catch (e) {
    server.kill();
    console.error('Start http-server first, or install: cd apps/lantern-app && npx http-server -p', PORT, '-c-1');
    throw e;
  }

  const results = {};

  // --- 1) Valid access redirect ---
  {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.route(/\/api\/class-access\/state/, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          tokenValid: true,
          accessState: 'live_ok',
        }),
      });
    });
    await page.goto(`${BASE}/news.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/explore\.html/, { timeout: 8000 });
    results.redirect = 'PASS';
    await browser.close();
  }

  // --- 2) ?nostub=1 ---
  {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.route(/\/api\/class-access\/state/, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, tokenValid: true, accessState: 'live_ok' }),
      });
    });
    await page.goto(`${BASE}/news.html?nostub=1`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    const u = page.url();
    results.nostub = /news\.html/.test(u) && !/explore\.html/.test(u) ? 'PASS' : `FAIL url=${u}`;
    await browser.close();
  }

  // --- 3) Gated flow ---
  {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.route(/\/api\/class-access\/state/, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          tokenValid: false,
          accessState: 'live_locked_no_session',
        }),
      });
    });
    await page.goto(`${BASE}/news.html`, { waitUntil: 'networkidle' });
    const gate = page.locator('#classAccessGateWrap');
    const gateVisible = await gate.evaluate((el) => {
      const s = window.getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden';
    });
    const input = page.locator('#classAccessCodeInput');
    results.gated = gateVisible && (await input.count()) > 0 ? 'PASS' : 'FAIL gate or input missing';
    await browser.close();
  }

  // --- 4) No-JS usability ---
  {
    const browser = await chromium.launch();
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(`${BASE}/news.html`, { waitUntil: 'domcontentloaded' });
    const h1 = page.locator('.newsStubCard h1');
    const explore = page.locator('a[href="explore.html"]');
    const visible = (await h1.isVisible()) && (await explore.isVisible());
    const wrapHidden = await page.locator('#classAccessContentWrap').evaluate((el) => {
      return el.style.visibility === 'hidden' || el.style.opacity === '0';
    });
    results.noJs = visible && !wrapHidden ? 'PASS' : `FAIL visible=${visible} wrapHidden=${wrapHidden}`;
    await context.close();
    await browser.close();
  }

  // --- 5) Console cleanliness (no ReferenceErrors from old news stack) ---
  {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const pageErrors = [];
    const badConsole = [];
    page.on('pageerror', (err) => pageErrors.push(String(err && err.message ? err.message : err)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') badConsole.push(msg.text());
    });
    await page.route(/\/api\/class-access\/state/, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, tokenValid: true, accessState: 'live_ok' }),
      });
    });
    // Stub other worker calls from lantern-nav so we don't get red network noise as console errors (if any)
    await page.route('**/api/**', (route) => {
      if (route.request().url().includes('class-access/state')) return route.continue();
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    await page.goto(`${BASE}/news.html?nostub=1`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const bad =
      pageErrors.filter(
        (m) =>
          /HUNT_ZONES|getEventLabel|is not defined/i.test(m) ||
          /ReferenceError/i.test(m)
      );
    results.console = bad.length === 0 ? 'PASS' : `FAIL pageErrors: ${JSON.stringify(bad)}`;
    await browser.close();
  }

  server.kill();

  console.log('\n=== news.html stub QA ===\n');
  const rows = [
    ['Valid access redirect', results.redirect],
    ['?nostub=1', results.nostub],
    ['Gated flow', results.gated],
    ['No-JS usability', results.noJs],
    ['Console cleanliness (stub)', results.console],
  ];
  console.table(rows.map(([check, r]) => ({ check, result: r })));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
