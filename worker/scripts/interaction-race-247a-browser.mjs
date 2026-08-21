/**
 * Prompt #247A — measure the real Explore overlay reaction DOM in a browser.
 * Usage: node worker/scripts/interaction-race-247a-browser.mjs
 */
import http from 'http';
import fs from 'fs';
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
      if (urlPath === '/') urlPath = '/dev/race-explore-247a.html';
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
  var candidates = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
  ].filter(Boolean);
  for (var i = 0; i < candidates.length; i++) {
    if (fs.existsSync(candidates[i])) return candidates[i];
  }
  return null;
}

async function measureWithPlaywright(url, viewport, zoom) {
  var playwright;
  try {
    playwright = await import('playwright');
  } catch (err) {
    return null;
  }
  var browser = await playwright.chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage'],
  });
  var context = await browser.newContext({
    viewport: viewport,
    deviceScaleFactor: 1,
  });
  var page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  if (zoom && zoom !== 1) {
    await page.evaluate(function (z) {
      document.body.style.zoom = String(z);
    }, zoom);
  }
  var result = await page.evaluate(function () {
    return window.__LANTERN_247A_RUN.runReactionRace();
  });
  var poll = await page.evaluate(function () {
    return window.__LANTERN_247A_RUN.runPollRace();
  });
  var scroll = await page.evaluate(function () {
    var overlay = document.getElementById('lanternCardDetailOverlay');
    if (!overlay) return { ok: false, reason: 'no overlay' };
    var before = overlay.scrollTop;
    overlay.scrollTop = 40;
    var mid = overlay.scrollTop;
    overlay.scrollTop = before;
    return { ok: mid >= 30, before: before, mid: mid };
  });
  await browser.close();
  return { result: result, poll: poll, scroll: scroll, via: 'playwright' };
}

function cdp(wsUrl, method, params, id) {
  return new Promise(function (resolve, reject) {
    import('ws').then(function (mod) {
      var WebSocket = mod.default || mod.WebSocket || mod;
      var ws = new WebSocket(wsUrl);
      ws.on('open', function () {
        ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
      });
      ws.on('message', function (raw) {
        var msg = JSON.parse(String(raw));
        if (msg.id === id) {
          ws.close();
          if (msg.error) reject(new Error(JSON.stringify(msg.error)));
          else resolve(msg.result);
        }
      });
      ws.on('error', reject);
    }).catch(reject);
  });
}

async function measureWithChrome(chromePath, url, viewport, zoom) {
  var userData = fs.mkdtempSync(path.join('/tmp', 'lantern-247a-'));
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
  var port = await new Promise(function (resolve, reject) {
    var buf = '';
    var timer = setTimeout(function () { reject(new Error('chrome debug port timeout')); }, 15000);
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
  var versionRes = await fetch('http://127.0.0.1:' + new URL(port).port + '/json/version');
  var version = await versionRes.json();
  var wsUrl = version.webSocketDebuggerUrl;
  try {
    var wsMod = await import('ws');
    var WebSocket = wsMod.default || wsMod.WebSocket || wsMod;
    var result = await new Promise(function (resolve, reject) {
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
      ws.on('message', function (raw) {
        var msg = JSON.parse(String(raw));
        if (msg.id && pending[msg.id]) {
          if (msg.error) pending[msg.id].rej(new Error(JSON.stringify(msg.error)));
          else pending[msg.id].res(msg.result);
          delete pending[msg.id];
        }
      });
      ws.on('error', reject);
      ws.on('open', async function () {
        try {
          await send('Target.createTarget', { url: 'about:blank' });
          var pages = await fetch('http://127.0.0.1:' + new URL(port).port + '/json/list').then(function (r) { return r.json(); });
          var page = pages.find(function (p) { return p.url && p.url.indexOf('about:blank') === 0 && p.type === 'page'; }) || pages[0];
          ws.close();
          var pageWs = new WebSocket(page.webSocketDebuggerUrl);
          var pNext = 1;
          var pPend = {};
          function pSend(method, params) {
            var id = pNext++;
            return new Promise(function (res, rej) {
              pPend[id] = { res: res, rej: rej };
              pageWs.send(JSON.stringify({ id: id, method: method, params: params || {} }));
            });
          }
          pageWs.on('message', function (raw) {
            var msg = JSON.parse(String(raw));
            if (msg.id && pPend[msg.id]) {
              if (msg.error) pPend[msg.id].rej(new Error(JSON.stringify(msg.error)));
              else pPend[msg.id].res(msg.result);
              delete pPend[msg.id];
            }
          });
          await new Promise(function (res, rej) {
            pageWs.on('open', res);
            pageWs.on('error', rej);
          });
          await pSend('Page.enable');
          await pSend('Runtime.enable');
          await pSend('Emulation.setDeviceMetricsOverride', {
            width: viewport.width,
            height: viewport.height,
            deviceScaleFactor: 1,
            mobile: viewport.width <= 430,
          });
          await pSend('Page.navigate', { url: url });
          await new Promise(function (res) { setTimeout(res, 900); });
          if (zoom && zoom !== 1) {
            await pSend('Runtime.evaluate', {
              expression: 'document.body.style.zoom=' + JSON.stringify(String(zoom)),
            });
          }
          var evalRes = await pSend('Runtime.evaluate', {
            expression: 'window.__LANTERN_247A_RUN.runReactionRace().then(function(r){window.__LANTERN_247A_LAST=r; return r;})',
            awaitPromise: true,
            returnByValue: true,
          });
          var pollRes = await pSend('Runtime.evaluate', {
            expression: 'window.__LANTERN_247A_RUN.runPollRace()',
            awaitPromise: true,
            returnByValue: true,
          });
          var scrollRes = await pSend('Runtime.evaluate', {
            expression: '(function(){var o=document.getElementById("lanternCardDetailOverlay"); if(!o) return {ok:false}; var b=o.scrollTop; o.scrollTop=40; var m=o.scrollTop; o.scrollTop=b; return {ok:m>=30,before:b,mid:m};})()',
            returnByValue: true,
          });
          pageWs.close();
          resolve({
            result: evalRes.result && evalRes.result.value,
            poll: pollRes.result && pollRes.result.value,
            scroll: scrollRes.result && scrollRes.result.value,
            via: 'chrome-cdp',
          });
        } catch (err) {
          reject(err);
        }
      });
    });
    return result;
  } finally {
    chrome.kill('SIGKILL');
  }
}

async function main() {
  var launched = await startServer();
  var url = 'http://127.0.0.1:' + launched.port + '/dev/race-explore-247a.html';
  var cases = [
    { name: 'desktop-100', viewport: { width: 1280, height: 800 }, zoom: 1 },
    { name: 'desktop-150', viewport: { width: 1280, height: 800 }, zoom: 1.5 },
    { name: 'desktop-200', viewport: { width: 1280, height: 800 }, zoom: 2 },
    { name: 'phone-390x844', viewport: { width: 390, height: 844 }, zoom: 1 },
    { name: 'phone-360x800', viewport: { width: 360, height: 800 }, zoom: 1 },
  ];
  var out = {};
  var fail = 0;
  try {
    for (var i = 0; i < cases.length; i++) {
      var c = cases[i];
      var measured = await measureWithPlaywright(url, c.viewport, c.zoom);
      if (!measured) {
        var chrome = findChrome();
        if (!chrome) throw new Error('No Playwright and no Chrome for ' + c.name);
        measured = await measureWithChrome(chrome, url, c.viewport, c.zoom);
      }
      out[c.name] = measured;
      var r = measured && measured.result;
      var ok = r && r.ok && measured.poll && measured.poll.ok && measured.scroll && measured.scroll.ok;
      console.log((ok ? 'PASS' : 'FAIL'), c.name, JSON.stringify({
        iconDrift: r && r.iconDrift,
        followDown: r && r.followDown,
        stageH: r && r.after && r.after.stageH,
        barInStage: r && r.after && r.after.barInStage,
        poll: measured.poll,
        scroll: measured.scroll,
        via: measured.via,
      }));
      if (!ok) fail += 1;
    }
  } finally {
    launched.server.close();
  }
  fs.writeFileSync(path.join(root, 'worker/scripts/interaction-race-247a-browser-last.json'), JSON.stringify(out, null, 2));
  if (fail) process.exit(1);
}

main().catch(function (err) {
  console.error('FAIL browser 247A', err && err.stack ? err.stack : err);
  process.exit(1);
});
