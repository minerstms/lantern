/**
 * Prompt #255A — measure compact→reserved icon anchoring in a browser.
 * Usage: node worker/scripts/interaction-race-255a-browser.mjs
 */
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const appRoot = path.join(root, 'app');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

function startServer() {
  return new Promise(function (resolve, reject) {
    const server = http.createServer(function (req, res) {
      var urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      if (urlPath === '/') urlPath = '/dev/race-harness-255a.html';
      var filePath = path.join(appRoot, urlPath.replace(/^\//, ''));
      if (!filePath.startsWith(appRoot)) {
        res.statusCode = 403;
        res.end('forbidden');
        return;
      }
      fs.readFile(filePath, function (err, buf) {
        if (err) {
          res.statusCode = 404;
          res.end('not found');
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
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
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

async function withPage(chromePath, viewport, fn) {
  var userData = fs.mkdtempSync(path.join(os.tmpdir(), 'lantern-255a-'));
  var chrome = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-first-run',
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
    var pageMeta = pages.find(function (p) { return p.type === 'page' && String(p.url || '').indexOf('about:blank') === 0; }) || pages.find(function (p) { return p.type === 'page'; });
    var page = await wsCall(pageMeta.webSocketDebuggerUrl);
    await page.send('Page.enable');
    await page.send('Runtime.enable');
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: viewport.width <= 430,
    });
    var result = await fn(page);
    page.close();
    browser.close();
    return result;
  } finally {
    chrome.kill();
  }
}

async function measureCase(chromePath, url, viewport, zoom, name) {
  return withPage(chromePath, viewport, async function (page) {
    await page.send('Page.navigate', { url: url });
    await new Promise(function (res) { setTimeout(res, 800); });
    if (zoom && zoom !== 1) {
      await page.send('Runtime.evaluate', {
        expression: 'document.body.style.zoom=' + JSON.stringify(String(zoom)),
      });
    }
    var ready = await page.send('Runtime.evaluate', {
      expression: '!!(window.__LANTERN_RACE_255A && window.LANTERN_RESULT_REVEAL)',
      returnByValue: true,
    });
    if (!ready.result || ready.result.value !== true) throw new Error('255A harness did not initialize');
    var entry = await page.send('Runtime.evaluate', {
      expression: 'window.__LANTERN_RACE_255A.runEntry(' + JSON.stringify(name) + ')',
      awaitPromise: true,
      returnByValue: true,
    });
    var reveal = await page.send('Runtime.evaluate', {
      expression: 'window.__LANTERN_RACE_255A.runRevealPath()',
      awaitPromise: true,
      returnByValue: true,
    });
    var scroll = await page.send('Runtime.evaluate', {
      expression: '(function(){var o=document.getElementById("lanternCardDetailOverlay");var b=o.scrollTop;o.scrollTop=Math.min(120,Math.max(0,o.scrollHeight-o.clientHeight));var m=o.scrollTop;o.scrollTop=b;return {ok:true,canScroll:o.scrollHeight>o.clientHeight,before:b,mid:m};})()',
      returnByValue: true,
    });
    return {
      result: entry.result && entry.result.value,
      reveal: reveal.result && reveal.result.value,
      scroll: scroll.result && scroll.result.value,
    };
  });
}

async function main() {
  var launched = await startServer();
  var url = 'http://127.0.0.1:' + launched.port + '/dev/race-harness-255a.html';
  var chrome = findChrome();
  if (!chrome) throw new Error('Chrome/Edge is required for #255A measurement');
  var cases = [
    { name: 'desktop-1366-100', viewport: { width: 1366, height: 720 }, zoom: 1 },
    { name: 'desktop-1366-80', viewport: { width: 1366, height: 720 }, zoom: 0.8 },
    { name: 'desktop-1366-67', viewport: { width: 1366, height: 720 }, zoom: 0.67 },
    { name: 'phone-390x844', viewport: { width: 390, height: 844 }, zoom: 1 },
    { name: 'phone-360x800', viewport: { width: 360, height: 800 }, zoom: 1 },
    { name: 'phone-320x568', viewport: { width: 320, height: 568 }, zoom: 1 },
    { name: 'desktop-200pct', viewport: { width: 1366, height: 720 }, zoom: 2 },
    { name: 'desktop-400pct', viewport: { width: 1366, height: 720 }, zoom: 4 },
  ];
  var out = {};
  var fail = 0;
  try {
    for (var i = 0; i < cases.length; i++) {
      var c = cases[i];
      var measured = await measureCase(chrome, url, c.viewport, c.zoom, c.name);
      out[c.name] = measured;
      var r = measured && measured.result;
      var ok = !!(r && r.ok && measured.reveal && measured.reveal.ok && measured.scroll && measured.scroll.ok);
      var s = r && r.samples || {};
      console.log((ok ? 'PASS' : 'FAIL'), c.name, JSON.stringify({
        entryIconDrift: r && r.entryIconDrift,
        raceIconDrift: r && r.raceIconDrift,
        T0: s.T0 && { iconY: s.T0.iconY, scrollTop: s.T0.scrollTop, stageH: s.T0.stageH },
        T1: s.T1 && { iconY: s.T1.iconY, scrollTop: s.T1.scrollTop, stageH: s.T1.stageH },
        T2: s.T2 && { iconY: s.T2.iconY, scrollTop: s.T2.scrollTop, stageH: s.T2.stageH },
        T3: s.T3 && { iconY: s.T3.iconY, scrollTop: s.T3.scrollTop, stageH: s.T3.stageH },
        T4: s.T4 && { iconY: s.T4.iconY, scrollTop: s.T4.scrollTop, stageH: s.T4.stageH, entry: s.T4.entry },
        reveal: measured.reveal && { ok: measured.reveal.ok, isReplay: measured.reveal.reveal && measured.reveal.reveal.isReplay },
        canScroll: measured.scroll && measured.scroll.canScroll,
      }));
      if (!ok) fail += 1;
    }
  } finally {
    launched.server.close();
  }
  fs.writeFileSync(path.join(root, 'worker/scripts/interaction-race-255a-browser-last.json'), JSON.stringify(out, null, 2));
  if (fail) process.exit(1);
}

main().catch(function (err) {
  console.error('FAIL browser 255A', err && err.stack ? err.stack : err);
  process.exit(1);
});
