/**
 * Prompt #256 — Chromium measurements for compact Needs Revision rows.
 * Usage: node worker/scripts/compact-needs-revision-256-browser.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const appRoot = path.join(root, 'app');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
};

function startServer() {
  return new Promise(function (resolve, reject) {
    const server = http.createServer(function (req, res) {
      var urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      if (urlPath === '/') urlPath = '/dev/compact-needs-revision-256-harness.html';
      var filePath = path.join(appRoot, urlPath.replace(/^\//, ''));
      if (!filePath.startsWith(appRoot)) {
        res.statusCode = 403;
        res.end('forbidden');
        return;
      }
      fs.readFile(filePath, function (err, buf) {
        if (err) {
          res.statusCode = 404;
          res.end('not found ' + urlPath);
          return;
        }
        res.setHeader('Content-Type', MIME[path.extname(filePath)] || 'application/octet-stream');
        res.end(buf);
      });
    });
    server.listen(0, '127.0.0.1', function () {
      resolve({ server: server, port: server.address().port });
    });
    server.on('error', reject);
  });
}

function findChrome() {
  var home = process.env.LOCALAPPDATA || '';
  var candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    home && path.join(home, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/local/bin/google-chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);
  for (var i = 0; i < candidates.length; i++) {
    if (fs.existsSync(candidates[i])) return candidates[i];
  }
  return null;
}

function wsCall(wsUrl) {
  return new Promise(function (resolve, reject) {
    var ws = new WebSocket(wsUrl);
    var nextId = 1;
    var pending = {};
    function send(method, params) {
      var id = nextId++;
      return new Promise(function (res, rej) {
        pending[id] = { res: res, rej: rej };
        ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
      });
    }
    ws.addEventListener('message', function (ev) {
      var msg = JSON.parse(String(ev.data));
      if (msg.id && pending[msg.id]) {
        if (msg.error) pending[msg.id].rej(new Error(JSON.stringify(msg.error)));
        else pending[msg.id].res(msg.result);
        delete pending[msg.id];
      }
    });
    ws.addEventListener('error', reject);
    ws.addEventListener('open', function () {
      resolve({ send: send, close: function () { ws.close(); } });
    });
  });
}

async function runViewport(chromePath, url, viewport) {
  var userData = fs.mkdtempSync(path.join(os.tmpdir(), 'lantern-256-'));
  var chrome = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    '--user-data-dir=' + userData,
    '--remote-debugging-port=0',
    '--window-size=' + viewport.width + ',' + viewport.height,
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  var debugUrl = await new Promise(function (resolve, reject) {
    var buf = '';
    var timer = setTimeout(function () { reject(new Error('chrome debug port timeout')); }, 20000);
    function onData(chunk) {
      buf += String(chunk);
      var m = buf.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    }
    chrome.stderr.on('data', onData);
    chrome.stdout.on('data', onData);
    chrome.on('error', reject);
  });
  var port = new URL(debugUrl).port;
  try {
    var version = await fetch('http://127.0.0.1:' + port + '/json/version').then(function (r) { return r.json(); });
    var browser = await wsCall(version.webSocketDebuggerUrl);
    await browser.send('Target.createTarget', { url: 'about:blank' });
    var pages = await fetch('http://127.0.0.1:' + port + '/json/list').then(function (r) { return r.json(); });
    var pageMeta = pages.find(function (p) { return p.type === 'page'; });
    if (!pageMeta) throw new Error('no chrome page target');
    var page = await wsCall(pageMeta.webSocketDebuggerUrl);
    await page.send('Page.enable');
    await page.send('Runtime.enable');
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: viewport.width <= 430,
    });
    await page.send('Page.navigate', { url: url });
    await new Promise(function (res) { setTimeout(res, 900); });
    var ready = await page.send('Runtime.evaluate', {
      expression: '!!(window.__LANTERN_256_RUN && document.querySelectorAll(".lockerNeedsCard").length===4)',
      returnByValue: true,
    });
    if (!ready.result || ready.result.value !== true) throw new Error('harness did not render 4 cards');
    var measure = await page.send('Runtime.evaluate', {
      expression: 'window.__LANTERN_256_RUN.measureCollapsed()',
      returnByValue: true,
    });
    var toggle = await page.send('Runtime.evaluate', {
      expression: 'window.__LANTERN_256_RUN.toggleFirstMore()',
      returnByValue: true,
    });
    var scroll = await page.send('Runtime.evaluate', {
      expression: 'window.__LANTERN_256_RUN.naturalScrollCheck()',
      returnByValue: true,
    });
    page.close();
    browser.close();
    return {
      measure: measure.result && measure.result.value,
      toggle: toggle.result && toggle.result.value,
      scroll: scroll.result && scroll.result.value,
    };
  } finally {
    chrome.kill('SIGKILL');
  }
}

function desktopPass(m, scroll) {
  if (!m) return false;
  return (
    m.count === 4 &&
    m.maxHeight >= 85 &&
    m.maxHeight <= 112 &&
    m.avgHeight >= 85 &&
    m.avgHeight <= 110 &&
    m.visibleInViewport >= 4 &&
    !m.horizontalOverflow &&
    (scroll.ok || scroll.fitsViewport || m.visibleInViewport >= 4)
  );
}

function phonePass(m, toggle, scroll) {
  if (!m || !toggle || !scroll) return false;
  return m.count === 4 && !m.horizontalOverflow && toggle.ok && (scroll.ok || scroll.fitsViewport);
}

async function main() {
  var launched = await startServer();
  var url = 'http://127.0.0.1:' + launched.port + '/dev/compact-needs-revision-256-harness.html';
  var chrome = findChrome();
  if (!chrome) throw new Error('Chrome is required for #256 browser measurements');
  var cases = [
    { name: 'desktop-1366x768', viewport: { width: 1366, height: 768 }, kind: 'desktop' },
    { name: 'phone-390x844', viewport: { width: 390, height: 844 }, kind: 'phone' },
    { name: 'phone-360x800', viewport: { width: 360, height: 800 }, kind: 'phone' },
    { name: 'phone-320x568', viewport: { width: 320, height: 568 }, kind: 'phone' },
  ];
  var out = {};
  var fail = 0;
  try {
    for (var i = 0; i < cases.length; i++) {
      var c = cases[i];
      var res = await runViewport(chrome, url, c.viewport);
      out[c.name] = res;
      var ok =
        c.kind === 'desktop'
          ? desktopPass(res.measure, res.scroll) && res.toggle && res.toggle.ok
          : phonePass(res.measure, res.toggle, res.scroll);
      console.log((ok ? 'PASS' : 'FAIL'), c.name, JSON.stringify(res));
      if (!ok) fail += 1;
    }
  } finally {
    launched.server.close();
  }
  fs.writeFileSync(path.join(root, 'worker/scripts/compact-needs-revision-256-browser-last.json'), JSON.stringify(out, null, 2));
  if (fail) process.exit(1);
}

main().catch(function (err) {
  console.error('FAIL browser #256', err && err.stack ? err.stack : err);
  process.exit(1);
});
