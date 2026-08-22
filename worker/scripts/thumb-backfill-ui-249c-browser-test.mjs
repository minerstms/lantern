/**
 * Prompt #249C — real Chromium acceptance for /thumb-backfill.html
 * Usage: node worker/scripts/thumb-backfill-ui-249c-browser-test.mjs
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
  const hits = { me: 0, candidates: 0, recognize: 0, thumbWrite: 0, otherWrite: 0 };
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      const method = req.method || 'GET';
      if (url.pathname === '/api/auth/me') {
        hits.me += 1;
        if (opts.meError === 'network') {
          res.destroy();
          return;
        }
        if (opts.role === 'none') {
          json(res, { ok: false, authenticated: false }, 401);
          return;
        }
        json(res, {
          ok: true,
          authenticated: true,
          username: opts.role === 'student' ? 'stu1' : 'teacher1',
          display_name: opts.role === 'student' ? 'Student One' : 'Teacher One',
          role: opts.role || 'teacher',
          must_change_password: false,
        });
        return;
      }
      if (url.pathname === '/api/news/thumbs/candidates') {
        hits.candidates += 1;
        if (opts.role === 'student') {
          json(res, { ok: false, error: 'forbidden' }, 403);
          return;
        }
        if (opts.candidatesFail) {
          json(res, { ok: false, error: 'candidates_unavailable' }, 503);
          return;
        }
        json(res, {
          ok: true,
          dry_run: url.searchParams.get('dry_run') === '1',
          count: 2,
          supported_source_kinds: ['news', 'poll'],
          candidates: [
            { source_kind: 'news', source_id: 'n1', has_thumbnail: false, has_sidecar: false, file_url: '/x' },
            { source_kind: 'poll', source_id: 'p1', has_thumbnail: true, has_sidecar: true, file_url: '/y' },
          ],
        });
        return;
      }
      if (url.pathname === '/api/news/thumbs/recognize') {
        hits.recognize += 1;
        json(res, { ok: false, error: 'blocked_in_test' }, 403);
        return;
      }
      if (url.pathname === '/api/news/thumb' && method !== 'GET') {
        hits.thumbWrite += 1;
        json(res, { ok: false, error: 'blocked_in_test' }, 403);
        return;
      }
      if (method !== 'GET' && method !== 'HEAD') hits.otherWrite += 1;
      if (url.pathname === '/api/settings/visible-watermark') {
        json(res, { ok: true, enabled: false });
        return;
      }
      if (url.pathname === '/api/protected/view-session') {
        json(res, { ok: true });
        return;
      }
      if (url.pathname === '/login.html') {
        res.setHeader('Content-Type', 'text/html');
        res.end('<!doctype html><title>Login</title><h1>Lantern login</h1>');
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
          res.end('not found ' + rel);
          return;
        }
        const ext = path.extname(file).toLowerCase();
        const types = {
          '.html': 'text/html',
          '.js': 'text/javascript',
          '.css': 'text/css',
          '.png': 'image/png',
          '.ico': 'image/x-icon',
        };
        res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
        res.end(buf);
      });
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, origin: 'http://127.0.0.1:' + server.address().port, hits });
    });
  });
}

async function openPage(browser, origin, viewport) {
  const page = await browser.newPage({ viewport });
  const consoleMsgs = [];
  const pageErrors = [];
  const missing = [];
  page.on('console', (msg) => consoleMsgs.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  page.on('response', (res) => {
    const u = res.url();
    if (res.status() >= 400 && /\.(js|css)(\?|$)/.test(u)) missing.push({ url: u, status: res.status() });
  });
  await page.goto(origin + '/thumb-backfill.html', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !document.documentElement.classList.contains('lantern-pilot-auth-pending'), null, { timeout: 5000 });
  return { page, consoleMsgs, pageErrors, missing };
}

async function inspectVisible(page) {
  return page.evaluate(() => {
    function vis(el) {
      if (!el) return { exists: false, visible: false };
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        exists: true,
        visible: cs.visibility !== 'hidden' && cs.display !== 'none' && r.width > 0 && r.height > 0,
        text: (el.innerText || el.textContent || '').trim(),
        font: parseFloat(cs.fontSize) || 0,
        top: r.top,
        width: r.width,
      };
    }
    const body = getComputedStyle(document.body);
    return {
      pending: document.documentElement.classList.contains('lantern-pilot-auth-pending'),
      bodyVisibility: body.visibility,
      heading: vis(document.querySelector('h1')),
      auth: vis(document.getElementById('authStatus')),
      dry: vis(document.getElementById('dryBtn')),
      one: vis(document.getElementById('oneBtn')),
      max: vis(document.getElementById('maxItems')),
      kind: vis(document.getElementById('sourceKind')),
      sid: vis(document.getElementById('sourceId')),
      out: vis(document.getElementById('out')),
      warn: vis(document.querySelector('#staffPanel .warn')),
      error: vis(document.getElementById('errorPanel')),
      denied: vis(document.getElementById('deniedPanel')),
      staff: vis(document.getElementById('staffPanel')),
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 2,
    };
  });
}

async function main() {
  const browser = await chromium.launch();

  const teacher = await startAppServer({ role: 'teacher' });
  for (const vp of [
    { w: 1440, h: 900, tag: 'desktop-1440x900' },
    { w: 390, h: 844, tag: 'phone-390x844' },
  ]) {
    const { page, consoleMsgs, pageErrors, missing } = await openPage(browser, teacher.origin, { width: vp.w, height: vp.h });
    const snap = await inspectVisible(page);
    assert(!snap.pending, vp.tag + ' auth-pending class removed');
    assert(snap.bodyVisibility === 'visible', vp.tag + ' body visible', snap.bodyVisibility);
    assert(snap.heading.visible && /THUMBNAIL BACKFILL/.test(snap.heading.text), vp.tag + ' heading visible');
    assert(snap.auth.visible && /authorized/.test(snap.auth.text), vp.tag + ' staff status visible', snap.auth.text);
    assert(snap.dry.visible, vp.tag + ' Dry Run visible');
    assert(snap.one.visible && /Run One Item/.test(snap.one.text), vp.tag + ' Run One Item visible');
    assert(snap.max.visible && snap.kind.visible && snap.sid.visible, vp.tag + ' inputs visible');
    assert(snap.out.visible, vp.tag + ' result log visible');
    assert(snap.warn.visible && /NO D1 WRITES/.test(snap.warn.text) && /NO R2 WRITES/.test(snap.warn.text), vp.tag + ' dry-run warning visible');
    assert(!snap.denied.visible, vp.tag + ' student denial hidden for staff');
    assert(snap.heading.font >= 22 && snap.heading.font <= 36, vp.tag + ' heading font 22–36', snap.heading.font);
    assert(snap.dry.font >= 22 && snap.dry.font <= 36, vp.tag + ' button font 22–36', snap.dry.font);
    assert(!snap.overflowX, vp.tag + ' single-column no horizontal overflow');
    assert(teacher.hits.candidates === 0, vp.tag + ' no candidate fetch on load', teacher.hits);
    assert(teacher.hits.recognize === 0 && teacher.hits.thumbWrite === 0, vp.tag + ' no writes on load', teacher.hits);
    assert(pageErrors.length === 0, vp.tag + ' no page exceptions', pageErrors);
    assert(missing.length === 0, vp.tag + ' no missing JS/CSS', missing);
    const hardConsole = consoleMsgs.filter((m) => m.type === 'error' && !/favicon/.test(m.text));
    assert(hardConsole.length === 0, vp.tag + ' no console errors', hardConsole);
    await page.close();
  }

  const { page: dryPage, pageErrors: dryErrs } = await openPage(browser, teacher.origin, { width: 1440, height: 900 });
  await dryPage.click('#dryBtn');
  await dryPage.waitForFunction(() => /NO D1 WRITES/.test(document.getElementById('out').textContent || '') && /Candidates found:/.test(document.getElementById('out').textContent || ''));
  const dryText = await dryPage.locator('#out').innerText();
  assert(/DRY RUN/.test(dryText), 'dry-run heading in log');
  assert(/NO D1 WRITES/.test(dryText) && /NO R2 WRITES/.test(dryText), 'dry-run states no writes');
  assert(/Candidates found: 2/.test(dryText), 'dry-run candidate count', dryText);
  assert(/Already thumbnailed \/ skipped: 1/.test(dryText), 'dry-run skipped/already');
  assert(/news=1/.test(dryText) && /poll=1/.test(dryText), 'dry-run source kinds');
  assert(/Max items applied: 1/.test(dryText), 'dry-run max items');
  assert(teacher.hits.recognize === 0 && teacher.hits.thumbWrite === 0, 'dry-run issued no writes', teacher.hits);
  assert(teacher.hits.candidates >= 1, 'dry-run fetched candidates');
  assert(dryErrs.length === 0, 'dry-run no exceptions', dryErrs);
  await dryPage.close();

  const failSrv = await startAppServer({ role: 'teacher', candidatesFail: true });
  const { page: failPage } = await openPage(browser, failSrv.origin, { width: 1440, height: 900 });
  await failPage.click('#dryBtn');
  await failPage.waitForFunction(() => {
    const err = document.getElementById('errorPanel');
    const cs = err ? getComputedStyle(err) : null;
    return !!(cs && cs.display !== 'none' && /Dry Run failed/.test(err.textContent || ''));
  });
  const errVis = await failPage.evaluate(() => {
    const err = document.getElementById('errorPanel');
    const cs = getComputedStyle(err);
    return { visible: cs.display !== 'none', text: err.textContent };
  });
  assert(errVis.visible && /Dry Run failed/.test(errVis.text), 'API failure is visible, not a blank page', errVis);
  await failPage.close();
  await new Promise((r) => failSrv.server.close(r));

  const student = await startAppServer({ role: 'student' });
  const { page: stuPage, pageErrors: stuErr } = await openPage(browser, student.origin, { width: 390, height: 844 });
  const stu = await inspectVisible(stuPage);
  assert(stu.denied.visible, 'student sees denial', stu.denied);
  assert(!stu.staff.visible && !stu.dry.visible && !stu.one.visible, 'student does not see controls');
  assert(/denied/.test(stu.auth.text), 'student status denied', stu.auth.text);
  assert(student.hits.candidates === 0, 'student never received candidate list', student.hits);
  assert(student.hits.recognize === 0 && student.hits.thumbWrite === 0, 'student caused no writes');
  assert(stuErr.length === 0, 'student denial has no exceptions', stuErr);
  await stuPage.close();
  await new Promise((r) => student.server.close(r));

  const unauth = await startAppServer({ role: 'none' });
  const unauthPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await unauthPage.goto(unauth.origin + '/thumb-backfill.html', { waitUntil: 'networkidle' });
  await unauthPage.waitForURL(/login\.html/, { timeout: 5000 });
  assert(/login\.html/.test(unauthPage.url()), 'unauthenticated redirects to login', unauthPage.url());
  await unauthPage.close();
  await new Promise((r) => unauth.server.close(r));

  await new Promise((r) => teacher.server.close(r));
  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
