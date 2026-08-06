/**
 * E2E card contract audit — v2 compact faces vs detail surfaces.
 * Run: node e2e/studio-contribute/card-cancer-audit.mjs
 * Requires local app server on BASE (default http://127.0.0.1:8765).
 */
import { chromium } from '../../e2e/studio-contribute/node_modules/playwright/index.mjs';

const BASE = (process.env.LANTERN_SERVE_URL || 'http://127.0.0.1:8765').replace(/\/$/, '');

const ME = {
  ok: true,
  authenticated: true,
  role: 'student',
  username: 'audit-student',
  must_change_password: false,
};

const FEED = {
  ok: true,
  items: [
    {
      id: 'audit1',
      type: 'news',
      title: 'Audit card with thumbnail precedence',
      body: 'Full body for detail only',
      authorDisplayName: 'Auditor',
      approvedAt: '2026-01-15T12:00:00Z',
      thumbnailUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      imageUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      reactionCounts: {},
      myReactions: [],
      teacherComments: [],
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
  'verify.html',
];

const VIEWPORTS = [
  { w: 1440, h: 900 },
  { w: 1024, h: 768 },
  { w: 768, h: 900 },
  { w: 390, h: 844 },
];

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

function inspectCompactFace(el) {
  const reasons = [];
  if (el.classList.contains('feedCard')) reasons.push('FEED_CARD_ROOT');
  if (el.querySelector('.exploreCardRailStack')) reasons.push('LEGACY_RAIL_STACK');
  if (el.querySelector('.lcRailRow')) reasons.push('LEGACY_LC_RAIL_ROW');
  const ver = el.getAttribute('data-lantern-card-contract-version');
  if (ver === '1') reasons.push('CONTRACT_V1');
  if (ver && ver !== '2') reasons.push('CONTRACT_NOT_V2');
  const surface = el.getAttribute('data-lantern-card-surface');
  if (surface === 'face' && !el.classList.contains('lanternCanonicalCard')) {
    reasons.push('FACE_WITHOUT_CANONICAL_CLASS');
  }
  if (surface === 'face') {
    if (!el.querySelector('.lanternCanonicalCardFrame')) reasons.push('MISSING_FRAME');
    if (!el.querySelector('.lanternCanonicalCardOverlay')) reasons.push('MISSING_OVERLAY');
    if (!el.querySelector('.lanternCanonicalCardTitle')) reasons.push('MISSING_TITLE');
    const below = el.querySelector(':scope > .lcRailRow, :scope > .feedCardInner, :scope > .exploreCardRailStack');
    if (below) reasons.push('NORMAL_FLOW_BELOW_FRAME');
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      const ratio = r.width / r.height;
      if (Math.abs(ratio - 16 / 9) > 0.15) reasons.push('NON_16_9_GEOMETRY');
      if (Math.abs(r.width - 280) > 15 && r.width > 50) reasons.push('VARIABLE_WIDTH');
    }
  }
  return reasons;
}

async function auditPageViewport(page, pagePath, vp) {
  await page.setViewportSize({ width: vp.w, height: vp.h });
  const url = `${BASE}/${pagePath}`;
  const consoleErrors = [];
  const failedRequests = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('requestfailed', (req) => {
    failedRequests.push({ url: req.url(), failure: req.failure()?.errorText || 'failed' });
  });

  let navError = null;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2000);
    await page.evaluate(() => {
      if (window.LanternCanonicalEnforce?.scanAllExploreCards) {
        window.LanternCanonicalEnforce.scanAllExploreCards(document);
      }
    });
  } catch (e) {
    navError = String(e.message || e);
  }

  const data = await page.evaluate(() => {
    const faces = Array.from(document.querySelectorAll('.exploreCard[data-lantern-card-surface="face"], .exploreCard.lanternCanonicalCard'));
    const compact = faces.filter((el) => el.getAttribute('data-lantern-card-surface') === 'face' || el.classList.contains('lanternCanonicalCard'));
    return {
      totalExploreCards: document.querySelectorAll('.exploreCard').length,
      compactFaceCount: compact.length,
      feedCardRoots: document.querySelectorAll('.feedCard').length,
      railStacks: document.querySelectorAll('.exploreCardRailStack').length,
      lcRows: document.querySelectorAll('.lcRailRow').length,
      contractV1: document.querySelectorAll('[data-lantern-card-contract-version="1"]').length,
      cancerReport: window.__lanternCancerReport ? window.__lanternCancerReport.slice() : [],
      enforceLoaded: window.__lanternCanonicalEnforcementLoaded === true,
      detailOverlay: !!document.getElementById('feedDetailOverlay') || !!document.querySelector('.feedDetailOverlay'),
    };
  });

  const faceViolations = await page.evaluate(() => {
    const faces = Array.from(document.querySelectorAll('.exploreCard.lanternCanonicalCard[data-lantern-card-surface="face"]'));
    return faces.map((el) => {
      const reasons = [];
      if (el.classList.contains('feedCard')) reasons.push('FEED_CARD_ROOT');
      if (el.querySelector('.exploreCardRailStack')) reasons.push('LEGACY_RAIL_STACK');
      if (el.querySelector('.lcRailRow')) reasons.push('LEGACY_LC_RAIL_ROW');
      const ver = el.getAttribute('data-lantern-card-contract-version');
      if (ver === '1') reasons.push('CONTRACT_V1');
      if (!el.querySelector('.lanternCanonicalCardFrame')) reasons.push('MISSING_FRAME');
      if (!el.querySelector('.lanternCanonicalCardOverlay')) reasons.push('MISSING_OVERLAY');
      if (!el.querySelector('.lanternCanonicalCardTitle')) reasons.push('MISSING_TITLE');
      const below = el.querySelector(':scope > .lcRailRow, :scope > .feedCardInner, :scope > .exploreCardRailStack');
      if (below) reasons.push('NORMAL_FLOW_BELOW_FRAME');
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        const ratio = r.width / r.height;
        if (Math.abs(ratio - 16 / 9) > 0.15) reasons.push('NON_16_9_GEOMETRY');
      }
      return { id: el.id || el.getAttribute('data-report-id') || '', reasons };
    }).filter((x) => x.reasons.length);
  });

  const applicable = data.compactFaceCount > 0 || data.totalExploreCards > 0;
  const status = navError
    ? 'FAIL'
    : !applicable
      ? 'NOT_APPLICABLE'
      : data.feedCardRoots > 0 ||
          data.railStacks > 0 ||
          data.lcRows > 0 ||
          data.contractV1 > 0 ||
          faceViolations.length > 0 ||
          (data.cancerReport && data.cancerReport.length > 0)
        ? 'FAIL'
        : 'PASS';

  return {
    page: pagePath,
    viewport: `${vp.w}x${vp.h}`,
    status,
    navError,
    ...data,
    faceViolations,
    consoleErrors,
    failedRequests,
  };
}

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext();
const page = await context.newPage();
await setupMocks(page);

const matrix = [];
for (const p of PAGES) {
  for (const vp of VIEWPORTS) {
    matrix.push(await auditPageViewport(page, p, vp));
  }
}

await browser.close();

const summary = {
  totalChecks: matrix.length,
  pass: matrix.filter((m) => m.status === 'PASS').length,
  fail: matrix.filter((m) => m.status === 'FAIL').length,
  notApplicable: matrix.filter((m) => m.status === 'NOT_APPLICABLE').length,
};

const out = { summary, matrix };
console.log(JSON.stringify(out, null, 2));
process.exit(summary.fail > 0 ? 1 : 0);
