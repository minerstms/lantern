/**
 * Full browser matrix: 10 pages × 4 viewports with measurements + screenshots.
 * Usage: node worker/scripts/card-browser-matrix.mjs [baseUrl]
 */
import fs from 'fs';
import path from 'path';
import { chromium } from '../../e2e/studio-contribute/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const base = (process.argv[2] || 'http://127.0.0.1:8765').replace(/\/$/, '');
const shotDir = path.join(root, '.card-verification-screenshots');

const ME = {
  ok: true,
  authenticated: true,
  role: 'student',
  username: 'matrix-student',
  must_change_password: false,
};

const FEED = {
  ok: true,
  items: [
    {
      id: 'mx1',
      type: 'news',
      title: 'Matrix card with a long title that should clamp to two lines without breaking geometry',
      body: 'Detail body only',
      authorDisplayName: 'Matrix Author',
      approvedAt: '2026-01-15T12:00:00Z',
      thumbnailUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      reactionCounts: { like: 1 },
      myReactions: [],
      teacherComments: [{ authorDisplayName: 'Teacher', body: 'Great' }],
    },
    {
      id: 'mx2',
      type: 'shout_out',
      title: 'Missing image fallback card',
      authorDisplayName: 'Sam',
      createdAt: '2026-01-01T00:00:00Z',
    },
  ],
};

const PAGES = [
  'home.html',
  'explore.html',
  'games.html',
  'missions.html',
  'contribute.html',
  'teacher.html',
  'locker.html',
  'store.html',
  'display.html',
];

const VIEWPORTS = [
  { w: 1440, h: 900, tag: '1440x900' },
  { w: 1024, h: 768, tag: '1024x768' },
  { w: 768, h: 900, tag: '768x900' },
  { w: 390, h: 844, tag: '390x844' },
];

fs.mkdirSync(shotDir, { recursive: true });

async function setupMocks(page) {
  await page.addInitScript(() => {
    window.LANTERN_DEBUG_CLASS_ACCESS = true;
  });
  await page.route('**/api/auth/me**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ME) })
  );
  await page.route('**/api/class-access/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, accessState: 'test', tokenValid: true }),
    })
  );
  await page.route('**/api/feed**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FEED) })
  );
}

async function checkOne(page, pagePath, vp) {
  await page.setViewportSize({ width: vp.w, height: vp.h });
  const url = `${base}/${pagePath}`;
  const consoleErrors = [];
  const failedRequests = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push({ text: msg.text(), loc: msg.location() });
  });
  page.on('requestfailed', (req) => {
    failedRequests.push({ url: req.url(), failure: req.failure()?.errorText || 'failed' });
  });

  let navError = null;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2200);
    await page.evaluate(() => {
      if (window.LanternCanonicalEnforce?.scanAllExploreCards) {
        window.LanternCanonicalEnforce.scanAllExploreCards(document);
      }
    });
  } catch (e) {
    navError = String(e.message || e);
  }

  const metrics = await page.evaluate(() => {
    const faces = Array.from(document.querySelectorAll('.exploreCard.lanternCanonicalCard[data-lantern-card-surface="face"]'))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return false;
        const st = getComputedStyle(el);
        return st.display !== 'none' && st.visibility !== 'hidden';
      });
    const dims = faces.map((el) => {
      const r = el.getBoundingClientRect();
      const ratio = r.height ? r.width / r.height : 0;
      const mismatch = Math.abs(r.width - 280) > 12 || Math.abs(ratio - 16 / 9) > 0.12;
      return {
        w: Math.round(r.width * 10) / 10,
        h: Math.round(r.height * 10) / 10,
        ratio: Math.round(ratio * 1000) / 1000,
        mismatch,
        contract: el.getAttribute('data-lantern-card-contract-version'),
        hasFrame: !!el.querySelector('.lanternCanonicalCardFrame'),
        hasOverlay: !!el.querySelector('.lanternCanonicalCardOverlay'),
        hasTitle: !!el.querySelector('.lanternCanonicalCardTitle'),
        belowFrame: !!el.querySelector(':scope > .lcRailRow, :scope > .feedCardInner, :scope > .exploreCardRailStack'),
      };
    });
    const grid = document.querySelector('.feedGrid, .exploreGrid, .archive-grid');
    let gridCols = null;
    if (grid) {
      const cs = getComputedStyle(grid);
      gridCols = cs.gridTemplateColumns;
    }
    const scroller = document.querySelector('.lanternScroller');
    let scrollerBasis = null;
    if (scroller && scroller.firstElementChild) {
      scrollerBasis = getComputedStyle(scroller.firstElementChild).flexBasis;
    }
    return {
      cardCount: faces.length,
      dimensionMismatches: dims.filter((d) => d.mismatch).length,
      feedCardRoots: document.querySelectorAll('.feedCard').length,
      railStacks: document.querySelectorAll('.exploreCardRailStack').length,
      lcRows: document.querySelectorAll('.lcRailRow').length,
      contractV1: document.querySelectorAll('[data-lantern-card-contract-version="1"]').length,
      missingFrames: dims.filter((d) => !d.hasFrame).length,
      missingOverlays: dims.filter((d) => !d.hasOverlay).length,
      belowFrameCount: dims.filter((d) => d.belowFrame).length,
      cancerCount: window.__lanternCancerReport ? window.__lanternCancerReport.length : 0,
      enforceLoaded: window.__lanternCanonicalEnforcementLoaded === true,
      dims,
      gridCols,
      scrollerBasis,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
    };
  });

  const applicable = metrics.cardCount > 0;
  const status = navError
    ? 'FAIL'
    : !applicable
      ? 'NOT_APPLICABLE'
      : metrics.feedCardRoots > 0 ||
          metrics.railStacks > 0 ||
          metrics.lcRows > 0 ||
          metrics.contractV1 > 0 ||
          metrics.dimensionMismatches > 0 ||
          metrics.missingFrames > 0 ||
          metrics.missingOverlays > 0 ||
          metrics.belowFrameCount > 0 ||
          metrics.cancerCount > 0
        ? 'FAIL'
        : 'PASS';

  const shotKey = `${pagePath.replace('.html', '')}_${vp.tag}`;
  if (
    (pagePath === 'home.html' && (vp.tag === '1440x900' || vp.tag === '390x844')) ||
    (pagePath === 'explore.html' && (vp.tag === '1440x900' || vp.tag === '390x844')) ||
    (pagePath === 'games.html' && vp.tag === '1440x900') ||
    shotKey.includes('explore_1440')
  ) {
    await page.screenshot({ path: path.join(shotDir, `${shotKey}.png`), fullPage: false });
  }

  return {
    page: pagePath,
    viewport: vp.tag,
    status,
    reason: !applicable ? 'No compact production cards rendered in mocked auth state' : navError || '',
    url,
    ...metrics,
    consoleErrors: consoleErrors.map((e) => e.text),
    failedRequests,
  };
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
await setupMocks(page);

const matrix = [];
for (const p of PAGES) {
  for (const vp of VIEWPORTS) {
    matrix.push(await checkOne(page, p, vp));
  }
}

await browser.close();

const summary = {
  total: matrix.length,
  pass: matrix.filter((m) => m.status === 'PASS').length,
  fail: matrix.filter((m) => m.status === 'FAIL').length,
  notApplicable: matrix.filter((m) => m.status === 'NOT_APPLICABLE').length,
  screenshotDir: shotDir,
};

console.log(JSON.stringify({ summary, matrix }, null, 2));
process.exit(summary.fail > 0 ? 1 : 0);
