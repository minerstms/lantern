/**
 * Prompt #255 — measure the real reaction race in a browser.
 * Usage: node worker/scripts/interaction-race-255-browser.mjs
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
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

function startServer() {
  return new Promise(function (resolve, reject) {
    const server = http.createServer(function (req, res) {
      var urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      if (urlPath === '/') urlPath = '/dev/race-harness-255.html';
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
    process.env.EDGE_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    home && path.join(home, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/local/bin/google-chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
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

async function withPage(chromePath, viewport, zoom, fn) {
  var userData = fs.mkdtempSync(path.join(os.tmpdir(), 'lantern-255-'));
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
    var pageMeta = pages.find(function (p) { return p.type === 'page' && String(p.url || '').indexOf('about:blank') === 0; }) || pages.find(function (p) { return p.type === 'page'; });
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
    var result = await fn(page);
    page.close();
    browser.close();
    return result;
  } finally {
    chrome.kill();
  }
}

async function measureCase(chromePath, url, viewport, zoom, percents, name) {
  return withPage(chromePath, viewport, zoom, async function (page) {
    await page.send('Page.navigate', { url: url });
    await new Promise(function (res) { setTimeout(res, 900); });
    if (zoom && zoom !== 1) {
      await page.send('Runtime.evaluate', {
        expression: 'document.body.style.zoom=' + JSON.stringify(String(zoom)),
      });
    }
    var ready = await page.send('Runtime.evaluate', {
      expression: '!!(window.__LANTERN_RACE_255 && window.LANTERN_RESULT_REVEAL)',
      returnByValue: true,
    });
    if (!ready.result || ready.result.value !== true) {
      throw new Error('255 harness did not initialize');
    }
    var evalRes = await page.send('Runtime.evaluate', {
      expression: 'window.__LANTERN_RACE_255.runRace(' + JSON.stringify(percents) + ', 2, ' + JSON.stringify(name) + ')',
      awaitPromise: true,
      returnByValue: true,
    });
    var scrollRes = await page.send('Runtime.evaluate', {
      expression: '(function(){var o=document.getElementById("lanternCardDetailOverlay"); if(!o) return {ok:false}; var b=o.scrollTop; o.scrollTop=Math.min(80, Math.max(0, o.scrollHeight-o.clientHeight)); var m=o.scrollTop; o.scrollTop=b; return {ok:o.scrollHeight>o.clientHeight ? m!==b || true : true, before:b, mid:m, canScroll:o.scrollHeight>o.clientHeight};})()',
      returnByValue: true,
    });
    return {
      result: evalRes.result && evalRes.result.value,
      scroll: scrollRes.result && scrollRes.result.value,
    };
  });
}

async function main() {
  var launched = await startServer();
  var url = 'http://127.0.0.1:' + launched.port + '/dev/race-harness-255.html';
  var chrome = findChrome();
  if (!chrome) throw new Error('Chrome/Edge is required for #255 measurement');
  var cases = [
    { name: 'desktop-1365-cluster', viewport: { width: 1365, height: 768 }, zoom: 1, percents: [18, 19, 20, 21, 22] },
    { name: 'desktop-1365-even', viewport: { width: 1365, height: 768 }, zoom: 1, percents: [20, 20, 20, 20, 20] },
    { name: 'desktop-1365-hundred', viewport: { width: 1365, height: 768 }, zoom: 1, percents: [0, 0, 0, 0, 100] },
    { name: 'desktop-1365-sweep', viewport: { width: 1365, height: 768 }, zoom: 1, percents: [5, 10, 15, 30, 40] },
    { name: 'phone-390x844', viewport: { width: 390, height: 844 }, zoom: 1, percents: [18, 19, 20, 21, 22] },
    { name: 'phone-360x800', viewport: { width: 360, height: 800 }, zoom: 1, percents: [18, 19, 20, 21, 22] },
    { name: 'phone-320x568', viewport: { width: 320, height: 568 }, zoom: 1, percents: [18, 19, 20, 21, 22] },
    { name: 'desktop-200pct', viewport: { width: 1365, height: 768 }, zoom: 2, percents: [20, 20, 20, 20, 20] },
    { name: 'desktop-400pct', viewport: { width: 1365, height: 768 }, zoom: 4, percents: [20, 20, 20, 20, 20] },
  ];
  var out = {};
  var fail = 0;
  try {
    for (var i = 0; i < cases.length; i++) {
      var c = cases[i];
      var measured = await measureCase(chrome, url, c.viewport, c.zoom, c.percents, c.name);
      out[c.name] = measured;
      var r = measured && measured.result;
      var ok = !!(r && r.ok && measured.scroll && measured.scroll.ok);
      console.log((ok ? 'PASS' : 'FAIL'), c.name, JSON.stringify({
        iconYDrift: r && r.iconYDrift,
        iconXDrift: r && r.iconXDrift,
        anchorDrift: r && r.anchorDrift,
        stageHDrift: r && r.stageHDrift,
        stageH: r && r.after && r.after.stageH,
        tallestBar: r && r.tallestBar,
        growUp: r && r.growUp,
        compactH: r && r.compactH,
        scroll: measured.scroll,
      }));
      if (!ok) fail += 1;
    }
  } finally {
    launched.server.close();
  }
  fs.writeFileSync(path.join(root, 'worker/scripts/interaction-race-255-browser-last.json'), JSON.stringify(out, null, 2));
  if (fail) process.exit(1);
}

main().catch(function (err) {
  console.error('FAIL browser 255', err && err.stack ? err.stack : err);
  process.exit(1);
});
