/**
 * Prompt #254B1 — Chromium browser smoke for Feed / Mission / Poll media revision.
 * Usage: node worker/scripts/media-revision-254b-browser.mjs
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
  '.png': 'image/png',
};

function startServer() {
  return new Promise(function (resolve, reject) {
    const server = http.createServer(function (req, res) {
      var urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      if (urlPath === '/') urlPath = '/dev/media-revision-254b-harness.html';
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
  var userData = fs.mkdtempSync(path.join(os.tmpdir(), 'lantern-254b-'));
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
  var consoleErrors = [];
  try {
    var version = await fetch('http://127.0.0.1:' + port + '/json/version').then(function (r) { return r.json(); });
    var browser = await wsCall(version.webSocketDebuggerUrl);
    await browser.send('Target.createTarget', { url: 'about:blank' });
    var pages = await fetch('http://127.0.0.1:' + port + '/json/list').then(function (r) { return r.json(); });
    var pageMeta = pages.find(function (p) { return p.type === 'page'; });
    var page = await wsCall(pageMeta.webSocketDebuggerUrl);
    await page.send('Runtime.enable');
    await page.send('Log.enable');
    await page.send('Page.enable');
    page.send('Runtime.addBinding', { name: 'cdpLogError' }).catch(function () {});
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: viewport.width <= 430,
    });
    var result = await fn(page, function (entry) { consoleErrors.push(entry); });
    page.close();
    browser.close();
    return { result: result, consoleErrors: consoleErrors };
  } finally {
    chrome.kill();
  }
}

async function runViewport(chromePath, url, viewport, name) {
  return withPage(chromePath, viewport, async function (page, logErr) {
    await page.send('Runtime.enable');
    await page.send('Log.enable');
    await page.send('Page.navigate', { url: url });
    await new Promise(function (res) { setTimeout(res, 900); });
    var ready = await page.send('Runtime.evaluate', {
      expression: '!!(window.__LANTERN_MEDIA_254B && window.__LANTERN_MEDIA_254B.ready && window.LanternMediaEdit)',
      returnByValue: true,
    });
    if (!ready.result || !ready.result.value) {
      throw new Error(name + ': harness did not initialize');
    }
    var evalRes = await page.send('Runtime.evaluate', {
      expression: 'window.__LANTERN_MEDIA_254B.runAll()',
      returnByValue: true,
    });
    var data = evalRes.result && evalRes.result.value;
    if (!data) throw new Error(name + ': runAll returned nothing');

    var exRes = await page.send('Runtime.evaluate', {
      expression: '(function(){ try { return window.__coverage__ || null; } catch(e){ return null; } })()',
      returnByValue: true,
    });

    var exceptions = await page.send('Runtime.evaluate', {
      expression: 'window.__254bEx = window.__254bEx || []; window.__254bEx.length',
      returnByValue: true,
    });

    return {
      name: name,
      viewport: viewport,
      data: data,
      exceptions: exceptions.result && exceptions.result.value,
    };
  });
}

async function main() {
  var launched = await startServer();
  var url = 'http://127.0.0.1:' + launched.port + '/dev/media-revision-254b-harness.html';
  var chrome = findChrome();
  if (!chrome) throw new Error('Chrome/Edge required for #254B1 browser smoke');

  var viewports = [
    { name: 'desktop-1366x720', viewport: { width: 1366, height: 720 } },
    { name: 'phone-390x844', viewport: { width: 390, height: 844 } },
    { name: 'phone-360x800', viewport: { width: 360, height: 800 } },
    { name: 'phone-320x568', viewport: { width: 320, height: 568 } },
  ];

  var results = {};
  var fail = 0;
  try {
    for (var i = 0; i < viewports.length; i++) {
      var c = viewports[i];
      var ran = await runViewport(chrome, url, c.viewport, c.name);
      results[c.name] = ran;
      var d = ran.result.data;
      var checks = ['feedCreate', 'feedRevision', 'missionOptional', 'missionRequireImage', 'pollRevision'];
      var ok = true;
      var details = {};
      for (var j = 0; j < checks.length; j++) {
        var k = checks[j];
        var part = d[k];
        details[k] = part && part.ok;
        if (!part || !part.ok) {
          ok = false;
          details[k + '_errors'] = part && part.errors;
        }
      }
      if (d.layout && d.layout.overflowX) {
        ok = false;
        details.overflowX = true;
      }
      if (ran.consoleErrors && ran.consoleErrors.length) {
        ok = false;
        details.consoleErrors = ran.consoleErrors;
      }
      console.log((ok ? 'PASS' : 'FAIL'), c.name, JSON.stringify(details));
      if (!ok) fail += 1;
    }
  } finally {
    launched.server.close();
  }

  fs.writeFileSync(
    path.join(root, 'worker/scripts/media-revision-254b-browser-last.json'),
    JSON.stringify(results, null, 2)
  );

  console.log('\n--- media-revision-254b-browser: ' + (viewports.length - fail) + ' PASS ' + fail + ' FAIL ---');
  if (fail) process.exit(1);
}

main().catch(function (err) {
  console.error('FAIL browser 254B1', err && err.stack ? err.stack : err);
  process.exit(1);
});
