/**
 * Prompt #249G — local browser decode of the two failed mission originals (fixtures, not production).
 * Usage: node worker/scripts/thumb-mission-parser-249g-browser-test.mjs
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from '../../e2e/studio-contribute/node_modules/playwright/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
const CLEAN_1 = 'news/news-aa3f2624-c22e-4198-8cfa-0d8b6207756a';
const CLEAN_2 = 'news/news-65c5dfca-7bc8-46ff-9a54-160b7d1d845b';

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

function startServer() {
  const thumbJs = fs.readFileSync(path.join(root, 'app/js/lantern-thumbnail.js'), 'utf8');
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      if (url.pathname === '/js/lantern-thumbnail.js') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
        res.end(thumbJs);
        return;
      }
      if (url.pathname === '/api/news/image') {
        const key = url.searchParams.get('key') || '';
        if (key === CLEAN_1 || key === CLEAN_2) {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'image/png');
          res.end(PNG);
          return;
        }
        res.statusCode = 404;
        res.end('Not Found');
        return;
      }
      if (url.pathname === '/gen.html') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(`<!doctype html><html><body>
<script src="/js/lantern-thumbnail.js"></script>
<script>
window.run = function(url) {
  return window.LanternThumbnail.generateThumbnailFromImageUrl(url).then(function (t) {
    return { ok: true, type: t.blob && t.blob.type, size: t.size, width: t.width, height: t.height };
  }).catch(function (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  });
};
</script></body></html>`);
        return;
      }
      res.statusCode = 404;
      res.end('not found');
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, origin: 'http://127.0.0.1:' + port });
    });
  });
}

async function main() {
  const srv = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(srv.origin + '/gen.html', { waitUntil: 'networkidle' });
  const a = await page.evaluate((url) => window.run(url), srv.origin + '/api/news/image?key=' + encodeURIComponent(CLEAN_1));
  const b = await page.evaluate((url) => window.run(url), srv.origin + '/api/news/image?key=' + encodeURIComponent(CLEAN_2));
  assert(a.ok && a.type === 'image/jpeg' && a.size > 0, 'fixture 1 browser thumbnail decodes and generates', a);
  assert(b.ok && b.type === 'image/jpeg' && b.size > 0, 'fixture 2 browser thumbnail decodes and generates', b);
  const dirty = await page.evaluate((url) => window.run(url), srv.origin + '/api/news/image?key=' + encodeURIComponent(CLEAN_1 + '"}'));
  assert(!dirty.ok, 'polluted key does not decode as an image', dirty);
  await page.close();
  await browser.close();
  await new Promise((r) => srv.server.close(r));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
