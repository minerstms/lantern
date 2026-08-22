/**
 * Prompt #249D — real Chromium Explore card renderer (LANTERN_FEED_CARD.buildCard).
 * Usage: node worker/scripts/card-fallback-reconcile-249d-browser-test.mjs
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from '../../e2e/studio-contribute/node_modules/playwright/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const appRoot = path.join(root, 'app');

const ITEMS = [
  { id: 'poll-plain', type: 'poll', title: 'Imageless poll', authorDisplayName: 'Pat P.', createdAt: '2026-08-22T12:00:00Z' },
  { id: 'poll-empty', type: 'poll', title: 'Empty image_url', imageUrl: '', authorDisplayName: 'Pat P.', createdAt: '2026-08-22T12:00:00Z' },
  { id: 'poll-legacy', type: 'poll', title: 'Legacy default poll', imageUrl: '/api/media/image?key=default/default_poll.png', fallback_key: 'poll', authorDisplayName: 'Pat P.', createdAt: '2026-08-22T12:00:00Z' },
  { id: 'poll-encoded', type: 'poll', title: 'Encoded default poll', thumbnailUrl: '/api/media/image?key=default%2Fdefault_poll.png', authorDisplayName: 'Pat P.', createdAt: '2026-08-22T12:00:00Z' },
  { id: 'poll-broken', type: 'poll', title: 'Broken poll image', thumbnailUrl: 'assets/does-not-exist-249d.png', authorDisplayName: 'Pat P.', createdAt: '2026-08-22T12:00:00Z' },
  { id: 'poll-thumb', type: 'poll', title: 'Stored thumb poll', storedThumbnailUrl: 'assets/make-poll.png', thumbnailUrl: '/api/news/thumb?source_kind=poll&source_id=p1', imageUrl: '/api/media/image?key=default/default_poll.png', authorDisplayName: 'Pat P.', createdAt: '2026-08-22T12:00:00Z' },
  { id: 'shout', type: 'shout_out', title: 'Shout-out: Riley', authorDisplayName: 'Sam S.', createdAt: '2026-08-22T12:00:00Z' },
  { id: 'article', type: 'article', title: 'Text-only article', authorDisplayName: 'Alex A.', approvedAt: '2026-08-22T12:00:00Z' },
  { id: 'link', type: 'link', title: 'Link without image', url: 'https://example.com/story', authorDisplayName: 'Lee L.', createdAt: '2026-08-22T12:00:00Z' },
  { id: 'video', type: 'video', title: 'Video without still', videoUrl: '/api/news/video?key=news/video/demo', authorDisplayName: 'Val V.', createdAt: '2026-08-22T12:00:00Z' },
  { id: 'mission-g', type: 'mission', title: 'Generic mission', missionId: 'tmission_custom_xyz', authorDisplayName: 'Mo M.', createdAt: '2026-08-22T12:00:00Z' },
  { id: 'stem', type: 'mission', title: 'STEM Today', missionId: 'tmission_1773763739628_hhzqrr', authorDisplayName: 'Mo M.', createdAt: '2026-08-22T12:00:00Z' },
  { id: 'create', type: 'creation', title: 'Draw something', authorDisplayName: 'Drew D.', createdAt: '2026-08-22T12:00:00Z' },
  { id: 'unknown', type: 'mystery_widget', title: 'Unknown type', authorDisplayName: 'Una U.', createdAt: '2026-08-22T12:00:00Z' },
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

function startAppServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      if (url.pathname === '/api/news/thumb') {
        const file = path.join(appRoot, 'assets/make-poll.png');
        fs.readFile(file, (err, buf) => {
          if (err) {
            res.statusCode = 404;
            res.end('missing');
            return;
          }
          res.setHeader('Content-Type', 'image/png');
          res.end(buf);
        });
        return;
      }
      if (url.pathname === '/api/media/image') {
        res.statusCode = 404;
        res.end('legacy default should not be requested for card faces');
        return;
      }
      const raw = decodeURIComponent(url.pathname);
      const file = path.normalize(path.join(appRoot, raw.replace(/^\//, '')));
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
        const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
        res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
        res.end(buf);
      });
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, origin: 'http://127.0.0.1:' + server.address().port });
    });
  });
}

async function main() {
  const { server, origin } = await startAppServer();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  const defaultPollGets = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  page.on('request', (req) => {
    if (/default\/default_poll|default%2Fdefault_poll/.test(req.url())) defaultPollGets.push(req.url());
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.setContent(
    '<!doctype html><html><head><base href="' +
      origin +
      '/"><meta charset="utf-8"><link rel="stylesheet" href="css/lantern-cards.css"></head>' +
      '<body style="margin:0;background:#0e1624;"><div id="feedGrid" class="feedGrid"></div></body></html>'
  );
  await page.addScriptTag({ path: path.join(appRoot, 'js/lantern-cards.js') });
  await page.addScriptTag({ path: path.join(appRoot, 'js/lantern-feed-card.js') });

  await page.evaluate((items) => {
    const host = document.getElementById('feedGrid');
    host.innerHTML = '';
    items.forEach((item) => {
      host.appendChild(window.LANTERN_FEED_CARD.buildCard(item, {}));
    });
  }, ITEMS);

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.evaluate((z) => {
      document.documentElement.style.zoom = String(z);
    }, vp.zoom);
    await page.waitForFunction(() => {
      const imgs = Array.from(document.querySelectorAll('.lanternCanonicalCardImage'));
      return imgs.length > 0 && imgs.every((img) => img.complete && img.naturalWidth > 0 && !/default\/default_/.test(img.getAttribute('src') || ''));
    }, null, { timeout: 8000 });

    const snap = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.exploreCard, .lanternCanonicalCard'));
      const imgs = Array.from(document.querySelectorAll('.lanternCanonicalCardImage'));
      return {
        html: document.getElementById('feedGrid').innerHTML,
        count: imgs.length,
        rows: imgs.map((img, i) => {
          const src = img.getAttribute('src') || '';
          const box = img.getBoundingClientRect();
          const card = cards[i];
          return {
            src,
            w: img.naturalWidth,
            h: img.naturalHeight,
            boxW: box.width,
            boxH: box.height,
            svg: /data:image\/svg/i.test(src),
            defaultPoll: /default_poll|DEFAULT POLL/i.test(src) || /DEFAULT POLL/.test(img.alt || ''),
            empty: !src,
            clickable: !!(card && (card.getAttribute('role') === 'button' || card.classList.contains('exploreCard'))),
            title: card ? ((card.querySelector('.lanternCanonicalCardTitle') || {}).textContent || '') : '',
          };
        }),
      };
    });

    assert(snap.count === ITEMS.length, vp.tag + ' painted all cards', snap.count);
    assert(!/DEFAULT POLL/.test(snap.html), vp.tag + ' no DEFAULT POLL in Explore HTML');
    assert(!/default\/default_poll/.test(snap.html), vp.tag + ' no default_poll URL in Explore HTML');
    snap.rows.forEach((row, i) => {
      assert(!row.svg, vp.tag + ' ' + ITEMS[i].id + ' no gray SVG');
      assert(!row.defaultPoll, vp.tag + ' ' + ITEMS[i].id + ' not DEFAULT POLL');
      assert(!row.empty, vp.tag + ' ' + ITEMS[i].id + ' has src');
      assert(row.w > 0 && row.h > 0, vp.tag + ' ' + ITEMS[i].id + ' decoded', row);
      assert(row.boxW > 80 && row.boxH > 40, vp.tag + ' ' + ITEMS[i].id + ' fills face', row);
      assert(row.clickable, vp.tag + ' ' + ITEMS[i].id + ' remains clickable');
      assert(row.title, vp.tag + ' ' + ITEMS[i].id + ' overlay title readable');
    });
    const polls = [0, 1, 2, 3, 4];
    polls.forEach((i) => {
      assert(/make-poll\.png/.test(snap.rows[i].src), vp.tag + ' ' + ITEMS[i].id + ' uses make-poll.png', snap.rows[i].src);
    });
    assert(/make-poll\.png/.test(snap.rows[5].src) || /\/api\/news\/thumb/.test(snap.rows[5].src), vp.tag + ' stored thumb poll visual', snap.rows[5].src);
    assert(/shout-out-card\.png/.test(snap.rows[6].src), vp.tag + ' shout-out art');
    assert(/good-news\.png/.test(snap.rows[7].src), vp.tag + ' article art');
    assert(/good-news\.png/.test(snap.rows[8].src), vp.tag + ' link art');
    assert(/create-something\.png/.test(snap.rows[9].src), vp.tag + ' video art');
    assert(/mission-card\.png/.test(snap.rows[10].src), vp.tag + ' generic mission art');
    assert(/stem-today\.png/.test(snap.rows[11].src), vp.tag + ' STEM Today art');
    assert(/create-something\.png/.test(snap.rows[12].src), vp.tag + ' create/draw art');
    assert(/mission-card\.png/.test(snap.rows[13].src), vp.tag + ' unknown-type approved fallback');
  }

  assert(pageErrors.length === 0, 'no page exceptions', pageErrors);
  assert(defaultPollGets.length === 0, 'browser never requested default_poll.png', defaultPollGets);

  await browser.close();
  await new Promise((r) => server.close(r));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
