/**
 * Prompt #249E — Chromium acceptance for bounded Run Batch on /thumb-backfill.html
 * Usage: node worker/scripts/thumb-bounded-batch-249e-browser-test.mjs
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from '../../e2e/studio-contribute/node_modules/playwright/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const appRoot = path.join(root, 'app');

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

function json(res, obj, status) {
  res.statusCode = status || 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj));
}

function startAppServer(opts) {
  opts = opts || {};
  const hits = { me: 0, candidates: 0, recognize: 0, thumbWrite: 0 };
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      const method = req.method || 'GET';
      if (url.pathname === '/api/auth/me') {
        hits.me += 1;
        if (opts.role === 'student') {
          json(res, { ok: true, authenticated: true, username: 'stu1', display_name: 'Student One', role: 'student', must_change_password: false });
          return;
        }
        json(res, { ok: true, authenticated: true, username: 'teacher1', display_name: 'Teacher One', role: 'teacher', must_change_password: false });
        return;
      }
      if (url.pathname === '/api/news/thumbs/candidates') {
        hits.candidates += 1;
        if (opts.role === 'student') {
          json(res, { ok: false, error: 'forbidden' }, 403);
          return;
        }
        const n = Math.min(25, Math.max(1, parseInt(url.searchParams.get('max_items') || '10', 10) || 10));
        const kind = url.searchParams.get('source_kind') || 'news';
        const candidates = [];
        for (let i = 1; i <= n; i++) {
          candidates.push({
            source_kind: kind || 'news',
            source_id: 'n' + i,
            has_thumbnail: false,
            has_sidecar: false,
            file_url: '/assets/make-poll.png',
            original_object_key: 'news/n' + i + '.png',
            image_version: 1,
          });
        }
        json(res, { ok: true, dry_run: url.searchParams.get('dry_run') === '1', count: candidates.length, candidates });
        return;
      }
      if (url.pathname === '/api/news/thumbs/recognize') {
        hits.recognize += 1;
        json(res, { ok: true, size_bytes: 12 });
        return;
      }
      if (url.pathname === '/api/news/thumb' && method !== 'GET') {
        hits.thumbWrite += 1;
        json(res, { ok: true, size_bytes: 12 });
        return;
      }
      if (url.pathname === '/api/settings/visible-watermark') {
        json(res, { ok: true, enabled: false });
        return;
      }
      if (url.pathname === '/api/protected/view-session') {
        json(res, { ok: true });
        return;
      }
      const raw = decodeURIComponent(url.pathname);
      const rel = raw === '/' ? '/thumb-backfill.html' : raw;
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
        const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
        res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
        res.end(buf);
      });
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, origin: 'http://127.0.0.1:' + server.address().port, hits });
    });
  });
}

async function openStaff(browser, origin, viewport) {
  const page = await browser.newPage({ viewport });
  await page.goto(origin + '/thumb-backfill.html', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !document.documentElement.classList.contains('lantern-pilot-auth-pending'));
  await page.waitForSelector('#staffPanel:not(.hidden)');
  return page;
}

async function main() {
  const browser = await chromium.launch();
  const teacher = await startAppServer({ role: 'teacher' });

  for (const vp of [
    { w: 1440, h: 900, tag: 'desktop-1440x900' },
    { w: 390, h: 844, tag: 'phone-390x844' },
  ]) {
    const page = await openStaff(browser, teacher.origin, { width: vp.w, height: vp.h });
    const writesBefore = teacher.hits.recognize + teacher.hits.thumbWrite;
    await page.fill('#maxItems', '10');
    await page.fill('#sourceKind', 'news');
    let batchDisabled = await page.locator('#batchBtn').isDisabled();
    assert(batchDisabled, vp.tag + ' Run Batch disabled before Dry Run');
    await page.click('#dryBtn');
    await page.waitForFunction(() => /Candidates found:/.test(document.getElementById('out').textContent || ''));
    batchDisabled = await page.locator('#batchBtn').isDisabled();
    assert(!batchDisabled, vp.tag + ' Run Batch enabled after matching Dry Run');
    await page.fill('#maxItems', '8');
    batchDisabled = await page.locator('#batchBtn').isDisabled();
    assert(batchDisabled, vp.tag + ' Run Batch disabled after Max Items change');
    await page.fill('#maxItems', '10');
    await page.click('#dryBtn');
    await page.waitForFunction(() => !document.getElementById('batchBtn').disabled);
    assert(!(await page.locator('#batchBtn').isDisabled()), vp.tag + ' Dry Run again re-enables Run Batch');
    await page.click('#batchBtn');
    await page.waitForSelector('#confirmPanel:not(.hidden)');
    const confirm = await page.locator('#confirmCopy').innerText();
    assert(/Generate thumbnails for up to 10 news items\?/.test(confirm), vp.tag + ' confirmation names up to 10', confirm);
    assert(/WILL write thumbnail objects to R2/.test(await page.locator('#confirmPanel').innerText()), vp.tag + ' confirmation mentions R2/D1 writes');
    const writesMid = teacher.hits.recognize + teacher.hits.thumbWrite;
    await page.click('#cancelBatchBtn');
    await page.waitForFunction(() => {
      var el = document.getElementById('confirmPanel');
      return !!(el && el.classList.contains('hidden'));
    });
    const writesAfterCancel = teacher.hits.recognize + teacher.hits.thumbWrite;
    assert(writesAfterCancel === writesMid, vp.tag + ' cancel confirmation writes ZERO', { writesMid, writesAfterCancel });
    await page.click('#batchBtn');
    await page.click('#confirmBatchBtn');
    await page.waitForFunction(() => {
      const t = document.getElementById('out').textContent || '';
      return /"dry_run": false/.test(t) && /"completed"/.test(t);
    });
    const progress = await page.locator('#progressPanel').innerText();
    assert(/Processing /.test(progress) || /Generated:/.test(progress), vp.tag + ' progress visible', progress);
    const out = await page.locator('#out').innerText();
    assert(/"ok": true/.test(out) && /"dry_run": false/.test(out), vp.tag + ' completion summary visible');
    assert(/"completed"/.test(out) && /"failed"/.test(out) && /"recognized"/.test(out), vp.tag + ' summary fields present');
    assert(await page.locator('#batchBtn').isDisabled(), vp.tag + ' no automatic next batch; gate resets');
    const writesAfter = teacher.hits.recognize + teacher.hits.thumbWrite;
    assert(writesAfter > writesBefore, vp.tag + ' confirmed batch used existing write machinery');
    assert(writesAfter - writesBefore <= 10, vp.tag + ' batch stayed within max 10', writesAfter - writesBefore);
    await page.fill('#maxItems', '26');
    await page.click('#dryBtn');
    await page.waitForFunction(() => /cannot exceed 25/.test(document.getElementById('errorPanel').textContent || ''));
    assert(/cannot exceed 25/.test(await page.locator('#errorPanel').innerText()), vp.tag + ' >25 rejected visibly');
    await page.close();
  }

  const student = await startAppServer({ role: 'student' });
  const stuPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await stuPage.goto(student.origin + '/thumb-backfill.html', { waitUntil: 'networkidle' });
  await stuPage.waitForFunction(() => !document.documentElement.classList.contains('lantern-pilot-auth-pending'));
  const stu = await stuPage.evaluate(() => {
    const staff = document.getElementById('staffPanel');
    const batch = document.getElementById('batchBtn');
    const denied = document.getElementById('deniedPanel');
    return {
      staffHidden: !staff || staff.classList.contains('hidden'),
      batchHidden: !batch || batch.offsetParent === null || getComputedStyle(batch).display === 'none' || staff.classList.contains('hidden'),
      denied: !!(denied && !denied.classList.contains('hidden')),
    };
  });
  assert(stu.denied && stu.staffHidden && stu.batchHidden, 'student cannot access Run Batch or other controls', stu);
  assert(student.hits.candidates === 0 && student.hits.recognize === 0, 'student caused no candidate/write calls', student.hits);
  await stuPage.close();

  await new Promise((r) => teacher.server.close(r));
  await new Promise((r) => student.server.close(r));
  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
