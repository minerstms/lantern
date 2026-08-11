/**
 * Runtime check: Home + Explore canonical v2 faces; zero legacy roots.
 * Usage: node worker/scripts/explore-canonical-check.mjs [baseUrl]
 */
import { chromium } from '../../e2e/studio-contribute/node_modules/playwright/index.mjs';

const base = (process.argv[2] || 'http://127.0.0.1:8765').replace(/\/$/, '');

const ME = {
  ok: true,
  authenticated: true,
  role: 'student',
  username: 'test-student',
  must_change_password: false,
};

const FEED = {
  ok: true,
  items: [
    {
      id: 't1',
      type: 'news',
      typeLabel: 'News',
      title: 'Thumb wins over full image for card face thumbnail priority check',
      body: 'Body',
      authorDisplayName: 'Ada Lovelace',
      approvedAt: '2026-01-15T12:00:00Z',
      thumbnailUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      imageUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      reactionCounts: { like: 2 },
      myReactions: [],
      teacherComments: [{ authorDisplayName: 'Teacher', body: 'Nice work' }],
    },
    {
      id: 't2',
      type: 'news',
      title: 'Image only item',
      authorDisplayName: 'Byron',
      createdAt: '2026-01-10T12:00:00Z',
      imageUrl: 'https://example.com/only.jpg',
    },
    {
      id: 't3',
      type: 'link',
      title: 'Link must not use generic project URL as image ' + 'x'.repeat(80),
      authorDisplayName: '',
      createdAt: '2026-01-05T12:00:00Z',
      url: 'https://example.com/project/page-not-image',
    },
    {
      id: 't4',
      type: 'photo',
      title: 'Photo may use url when image type',
      authorDisplayName: 'Cam',
      createdAt: '2026-01-01T12:00:00Z',
      url: 'https://example.com/photo.jpg',
    },
    {
      id: 't5',
      type: 'shout_out',
      title: 'Missing image uses fallback geometry',
      authorDisplayName: 'Sam',
      createdAt: '2025-12-01T12:00:00Z',
    },
    /* Prompt #76 — official Mission fallback cover. A text-only approved Mission submission
       (no real image at all) must resolve to the official Mission cover, never the generic
       "School" gradient placeholder or the broken topic-library chain. */
    {
      id: 'm1',
      type: 'mission',
      typeLabel: 'Mission',
      title: 'Approved text-only mission submission',
      body: 'I finished my reflection.',
      authorDisplayName: 'Text Only Student',
      approvedAt: '2026-02-01T12:00:00Z',
    },
    /* A Mission WITH a real submitted photo must show that real photo — the official cover
       must never override real student-submitted media. Uses a data: URI (like t1 above) so
       the image actually loads in-browser rather than 404ing against a real network host —
       an unreachable URL would correctly trigger the graceful onerror->cover fallback (Section
       6 of Prompt #76), which is NOT what this case is testing. */
    {
      id: 'm2',
      type: 'mission',
      typeLabel: 'Mission',
      title: 'Approved mission submission with a real photo',
      authorDisplayName: 'Photo Student',
      approvedAt: '2026-02-02T12:00:00Z',
      imageUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfz0AEYBxVSF+FAAhKGAZKgFrEAAAAAElFTkSuQmCC',
      thumbnailUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfz0AEYBxVSF+FAAhKGAZKgFrEAAAAAElFTkSuQmCC',
    },
  ],
};

async function setupPage(page) {
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

async function measureCards(page) {
  return page.evaluate(() => {
    const faces = Array.from(
      document.querySelectorAll('.exploreCard.lanternCanonicalCard[data-lantern-card-surface="face"]')
    );
    const dims = faces.map((el) => {
      const r = el.getBoundingClientRect();
      const img = el.querySelector('.lanternCanonicalCardImage');
      const imgSrc = img ? img.getAttribute('src') || '' : '';
      return {
        w: r.width,
        h: r.height,
        ratio: r.height ? r.width / r.height : 0,
        contract: el.getAttribute('data-lantern-card-contract-version'),
        hasFrame: !!el.querySelector('.lanternCanonicalCardFrame'),
        hasOverlay: !!el.querySelector('.lanternCanonicalCardOverlay'),
        hasTitle: el.querySelectorAll('.lanternCanonicalCardTitle').length,
        imgSrc,
        openBtn: !!el.querySelector('.feedDetailCloseBtn'),
      };
    });
    return {
      faceCount: faces.length,
      feedCardRoots: document.querySelectorAll('.feedCard').length,
      railStacks: document.querySelectorAll('.exploreCardRailStack').length,
      lcRows: document.querySelectorAll('.lcRailRow').length,
      killOverlay: !!document.getElementById('lanternCanonicalKillSwitchFatal'),
      brandKill: !!document.getElementById('lanternBrandKillerFatal'),
      enforceLoaded: window.__lanternCanonicalEnforcementLoaded === true,
      dims,
    };
  });
}

async function checkPath(page, path) {
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  await page.goto(base + path, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2500);
  const state = await measureCards(page);
  const canonicalConsole = consoleErrors.filter((m) => /canonical|LanternKillSwitch|LanternBrandKiller|CARD COUNTERFEIT/i.test(m));
  return { path, ...state, canonicalConsole };
}

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
await setupPage(page);

try {
  const results = [];
  for (const p of ['/home.html', '/explore.html', '/explore']) {
    results.push(await checkPath(page, p));
  }
  console.log(JSON.stringify(results, null, 2));

  const failed = results.some((r) => {
    if (r.killOverlay || r.brandKill || !r.enforceLoaded) return true;
    if (r.path.includes('home') && r.faceCount < 1) return true;
    if (r.path.includes('explore') && r.faceCount < 1) return true;
    if (r.feedCardRoots > 0 || r.railStacks > 0 || r.lcRows > 0) return true;
    if (r.dims.some((d) => d.contract !== '2')) return true;
    if (r.dims.some((d) => Math.abs(d.ratio - 16 / 9) > 0.12)) return true;
    if (r.dims.some((d) => Math.abs(d.w - 280) > 12)) return true;
    if (r.dims.some((d) => !d.hasFrame || !d.hasOverlay || d.hasTitle !== 1)) return true;
    if (r.dims.some((d) => d.openBtn)) return true;
    return false;
  });

  const thumb = results.find((r) => r.path.includes('explore'))?.dims?.[0];
  if (thumb && !String(thumb.imgSrc).includes('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')) {
    console.error('Expected thumbnailUrl to win on first explore item, got', thumb.imgSrc);
    process.exit(1);
  }
  const linkItem = results.find((r) => r.path.includes('explore'))?.dims?.[2];
  if (linkItem && String(linkItem.imgSrc).includes('project/page-not-image')) {
    console.error('Generic link URL must not load as card image');
    process.exit(1);
  }

  // Prompt #76 — Explore: text-only mission -> official Mission cover; mission with a real
  // photo -> that real photo (never the cover). Card index 5 = m1 (text-only), 6 = m2 (photo).
  const exploreHtmlDims = results.find((r) => r.path === '/explore.html')?.dims || [];
  const missionTextOnlyCard = exploreHtmlDims[5];
  const missionPhotoCard = exploreHtmlDims[6];
  if (!missionTextOnlyCard || !/assets\/mission-card\.png$/.test(String(missionTextOnlyCard.imgSrc))) {
    console.error('Prompt #76: approved text-only mission did not resolve to the official Mission cover, got', missionTextOnlyCard && missionTextOnlyCard.imgSrc);
    process.exit(1);
  }
  if (!missionPhotoCard || missionPhotoCard.imgSrc !== 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfz0AEYBxVSF+FAAhKGAZKgFrEAAAAAElFTkSuQmCC') {
    console.error('Prompt #76: approved mission WITH a real photo did not keep that real photo, got', missionPhotoCard && missionPhotoCard.imgSrc);
    process.exit(1);
  }
  // Prompt #76 — non-Mission item types (News/Link/Photo/Shout-out, indices 0-4) must be
  // completely unaffected: none of them should ever resolve to the Mission cover.
  const nonMissionDims = exploreHtmlDims.slice(0, 5);
  if (nonMissionDims.some((d) => /mission-card\.png/.test(String(d.imgSrc)))) {
    console.error('Prompt #76: a non-Mission Explore item incorrectly resolved to the Mission cover', nonMissionDims);
    process.exit(1);
  }

  process.exit(failed ? 1 : 0);
} finally {
  await browser.close();
}
