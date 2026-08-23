/**
 * Prompt #258A — Writing Integrity browser QA (Chromium CDP).
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
};

function startServer() {
  return new Promise(function (resolve, reject) {
    const server = http.createServer(function (req, res) {
      var urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      if (urlPath === '/') urlPath = '/dev/writing-integrity-258-harness.html';
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

async function evalPage(page, expression) {
  var res = await page.send('Runtime.evaluate', { expression: expression, returnByValue: true });
  return res.result && res.result.value;
}

async function runViewport(chromePath, url, viewport) {
  var userData = fs.mkdtempSync(path.join(os.tmpdir(), 'lantern-258-'));
  var chrome = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--user-data-dir=' + userData,
    '--remote-debugging-port=0',
    '--window-size=' + viewport.width + ',' + viewport.height,
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  var debugUrl = await new Promise(function (resolve, reject) {
    var buf = '';
    var timer = setTimeout(function () { reject(new Error('chrome debug timeout')); }, 20000);
    function onData(chunk) {
      buf += String(chunk);
      var m = buf.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (m) { clearTimeout(timer); resolve(m[1]); }
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
    var ready = false;
    for (var w = 0; w < 20 && !ready; w++) {
      await new Promise(function (r) { setTimeout(r, 200); });
      ready = await evalPage(page, '!!(window.__LANTERN_258_RUN && window.__LANTERN_258_READY)');
    }
    if (!ready) throw new Error('harness not ready');
    var admin = await evalPage(page, 'window.__LANTERN_258_RUN.measureAdminCard()');
    var scroll = await evalPage(page, 'window.__LANTERN_258_RUN.naturalScrollCheck()');
    var polish = await evalPage(page, 'window.__LANTERN_258_RUN.runPolishCases()');
    var paste = await evalPage(page, '(function(){ var t=document.getElementById("newsBody"); var ev=new Event("paste",{bubbles:true,cancelable:true}); t.dispatchEvent(ev); return {defaultPrevented:ev.defaultPrevented}; })()');
    var burst = await evalPage(page, 'window.__LANTERN_258_RUN.testBurstInsertAllowed()');
    var comp = await evalPage(page, 'window.__LANTERN_258_RUN.testCompositionPreserved()');
    var attrs = await evalPage(page, 'window.__LANTERN_258_RUN.testAuthorshipAttrs()');
    page.close();
    browser.close();
    return { admin: admin, scroll: scroll, polish: polish, paste: paste, burst: burst, comp: comp, attrs: attrs };
  } finally {
    chrome.kill('SIGKILL');
  }
}

function passViewport(name, res) {
  if (!res || !res.admin || !res.polish) return false;
  if (res.admin.horizontalOverflow) return false;
  if (!res.polish.allOk) return false;
  if (!res.paste || !res.paste.defaultPrevented) return false;
  if (!res.burst || !res.burst.allowed) return false;
  if (!res.comp || !res.comp.ok) return false;
  if (!res.attrs || !res.attrs.spellcheck || !res.attrs.autocomplete || !res.attrs.writingsuggestions) return false;
  return true;
}

async function main() {
  var launched = await startServer();
  var url = 'http://127.0.0.1:' + launched.port + '/dev/writing-integrity-258-harness.html';
  var chrome = findChrome();
  if (!chrome) throw new Error('Chrome required');
  var cases = [
    { name: '1366x768', viewport: { width: 1366, height: 768 } },
    { name: '390x844', viewport: { width: 390, height: 844 } },
    { name: '360x800', viewport: { width: 360, height: 800 } },
    { name: '320x568', viewport: { width: 320, height: 568 } },
  ];
  var out = {};
  var fail = 0;
  try {
    for (var i = 0; i < cases.length; i++) {
      var c = cases[i];
      var res = await runViewport(chrome, url, c.viewport);
      out[c.name] = res;
      var ok = passViewport(c.name, res);
      console.log((ok ? 'PASS' : 'FAIL'), c.name, JSON.stringify({ polish: res.polish && res.polish.allOk, overflow: res.admin && res.admin.horizontalOverflow, paste: res.paste, burst: res.burst }));
      if (!ok) fail += 1;
    }
  } finally {
    launched.server.close();
  }
  fs.writeFileSync(path.join(root, 'worker/scripts/writing-integrity-258a-browser-last.json'), JSON.stringify(out, null, 2));
  if (fail) process.exit(1);
  console.log('writing-integrity-258a-browser: PASS (' + cases.length + ' viewports)');
}

main().catch(function (err) {
  console.error('FAIL', err && err.stack ? err.stack : err);
  process.exit(1);
});
