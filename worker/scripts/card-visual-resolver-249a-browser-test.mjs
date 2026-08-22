/**
 * Prompt #249A — real Chromium rendering of Explore card faces.
 * Usage: node worker/scripts/card-visual-resolver-249a-browser-test.mjs
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from '../../e2e/studio-contribute/node_modules/playwright/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cardsJs = path.join(root, 'app/js/lantern-cards.js');
const cardsCss = path.join(root, 'app/css/lantern-cards.css');
const feedCardJs = path.join(root, 'app/js/lantern-feed-card.js');

const ITEMS = [
  { id: 'a1', type: 'article', title: 'Text-only article', authorDisplayName: 'Alex A.', approvedAt: '2026-08-22T12:00:00Z' },
  { id: 's1', type: 'shout_out', title: 'Shout-out: Riley', authorDisplayName: 'Sam S.', createdAt: '2026-08-22T12:00:00Z' },
  { id: 'p1', type: 'poll', title: 'Best lunch?', authorDisplayName: 'Pat P.', createdAt: '2026-08-22T12:00:00Z' },
  { id: 'v1', type: 'video', title: 'Video without still', authorDisplayName: 'Val V.', videoUrl: '/api/news/video?key=news/video/demo' },
  { id: 'l1', type: 'link', title: 'Link without image', authorDisplayName: 'Lee L.', url: 'https://example.com/story' },
  { id: 'm1', type: 'mission', title: 'Generic mission', missionId: 'tmission_custom_xyz', authorDisplayName: 'Mo M.' },
  { id: 'm2', type: 'mission', title: 'STEM Today', missionId: 'tmission_1773763739628_hhzqrr', authorDisplayName: 'Mo M.' },
  { id: 'c1', type: 'creation', title: 'Draw something', authorDisplayName: 'Drew D.' },
  { id: 'b1', type: 'news', title: 'Broken image', thumbnailUrl: 'assets/does-not-exist-249a.png', authorDisplayName: 'Bo B.' },
  { id: 'u1', type: 'mystery_widget', title: 'Unknown type', authorDisplayName: 'Una U.' },
  { id: 'r1', type: 'news', title: 'Real student photo', thumbnailUrl: 'assets/good-news.png', imageUrl: 'assets/create-something.png', authorDisplayName: 'Real R.' },
];

const VIEWPORTS = [
  { w: 1440, h: 900, tag: 'desktop-100', zoom: 1 },
  { w: 1440, h: 900, tag: 'desktop-150', zoom: 1.5 },
  { w: 390, h: 844, tag: 'phone-390', zoom: 1 },
  { w: 360, h: 800, tag: 'phone-360', zoom: 1 },
];

let pass = 0;
let fail = 0;
function assert(cond, m, d) {
  if (cond) {
    pass++;
    console.log('PASS', m);
  } else {
    fail++;
    console.error('FAIL', m, d != null ? d : '');
  }
}

async function paintGrid(page) {
  return page.evaluate((items) => {
    const LC = window.LanternCards;
    const FC = window.LANTERN_FEED_CARD;
    const host = document.getElementById('grid');
    host.innerHTML = '';
    items.forEach((item) => {
      let el = null;
      if (FC && typeof FC.buildCard === 'function') {
        try {
          el = FC.buildCard(item, {});
        } catch (e) {
          el = null;
        }
      }
      if (!el && LC && LC.createStudentCard && LC.normalizeFeedItemToFaceModel) {
        const model = LC.normalizeFeedItemToFaceModel(item);
        el = LC.createStudentCard(LC.compactFaceSpec(model, { lanternCardType: item.type, classNames: 'feedExploreCard' }));
      }
      if (el) host.appendChild(el);
    });
    return host.querySelectorAll('.lanternCanonicalCardImage').length;
  }, ITEMS);
}

async function inspectCards(page) {
  return page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('.lanternCanonicalCardImage'));
    return imgs.map((img) => {
      const src = img.getAttribute('src') || '';
      const t = img.getAttribute('data-lc-t') || '';
      const u = img.getAttribute('data-lc-u') || '';
      return {
        src,
        t,
        u,
        complete: img.complete,
        w: img.naturalWidth,
        h: img.naturalHeight,
        svg: /data:image\/svg/i.test(src) || /data:image\/svg/i.test(t) || /data:image\/svg/i.test(u),
        lanternLabel: /Lantern<\/text>|>Lantern</.test(src),
        box: img.getBoundingClientRect(),
      };
    });
  });
}

function startAppServer() {
  const appRoot = path.join(root, 'app');
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const raw = decodeURIComponent((req.url || '/').split('?')[0]);
      const rel = raw === '/' ? '/card-visual-249a.html' : raw;
      const file = path.normalize(path.join(appRoot, rel.replace(/^\//, '')));
      if (!file.startsWith(appRoot)) {
        res.statusCode = 403;
        res.end();
        return;
      }
      fs.readFile(file, (err, buf) => {
        if (err) {
          res.statusCode = 404;
          res.end('not found');
          return;
        }
        const ext = path.extname(file).toLowerCase();
        const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };
        res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
        res.end(buf);
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, origin: 'http://127.0.0.1:' + port });
    });
  });
}

async function main() {
  const { server, origin } = await startAppServer();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', (err) => console.error('PAGEERROR', String(err)));

  await page.addInitScript(() => {
    window.LANTERN_AVATAR_API = '';
  });
  await page.setContent(
    '<!doctype html><html><head><base href="' +
      origin +
      '/"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#0e1624;"><div id="grid" class="lanternScroller"></div></body></html>'
  );
  await page.addStyleTag({ path: cardsCss });
  await page.addScriptTag({ path: cardsJs });
  await page.addScriptTag({ path: feedCardJs });

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.evaluate((z) => {
      document.documentElement.style.zoom = String(z);
    }, vp.zoom);
    const painted = await paintGrid(page);
    assert(painted === ITEMS.length, vp.tag + ' painted all cards', painted);
    await page.waitForFunction(() => {
      const imgs = Array.from(document.querySelectorAll('.lanternCanonicalCardImage'));
      if (!imgs.length) return false;
      return imgs.every((img) => {
        const src = img.getAttribute('src') || '';
        if (/data:image\/svg/i.test(src)) return false;
        if (/does-not-exist/.test(src)) return img.complete;
        return img.complete && img.naturalWidth > 0;
      });
    }, null, { timeout: 8000 });
    await page.waitForFunction(() => {
      const imgs = Array.from(document.querySelectorAll('.lanternCanonicalCardImage'));
      const broken = imgs.find((img) => (img.getAttribute('alt') || '') === '') && imgs[8];
      const src = broken ? broken.getAttribute('src') || '' : '';
      return broken && !/does-not-exist/.test(src) && broken.naturalWidth > 0 && /assets\/.+\.png/.test(src);
    }, null, { timeout: 8000 });
    const rows = await inspectCards(page);
    assert(rows.length === ITEMS.length, vp.tag + ' image count', rows.length);
    rows.forEach((row, i) => {
      assert(!row.svg, vp.tag + ' card ' + ITEMS[i].id + ' has no SVG fallback', row.src);
      assert(!row.lanternLabel, vp.tag + ' card ' + ITEMS[i].id + ' is not gray Lantern text');
      assert(row.w > 0 && row.h > 0, vp.tag + ' card ' + ITEMS[i].id + ' artwork decoded', { src: row.src, w: row.w, h: row.h });
      assert(row.box.width > 80 && row.box.height > 40, vp.tag + ' card ' + ITEMS[i].id + ' fills face', row.box);
    });
    const real = rows[rows.length - 1];
    assert(/good-news\.png/.test(real.src), vp.tag + ' real student image wins (thumbnailUrl)', real.src);
    const broken = rows.find((_, i) => ITEMS[i].id === 'b1');
    assert(broken && !broken.svg, vp.tag + ' broken image recovered to approved PNG', broken && broken.src);
  }

  const clickable = await page.evaluate(() => {
    const card = document.querySelector('.exploreCard, .lanternCanonicalCard');
    return !!(card && (card.getAttribute('role') === 'button' || card.classList.contains('exploreCard')));
  });
  assert(clickable, 'rendered card remains a clickable Explore face');

  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
