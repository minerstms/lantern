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
    await page.send('Page.navigate', { url: url });
    await new Promise(function (res) { setTimeout(res, 1200); });
    if (zoom && zoom !== 1) {
      await page.send('Runtime.evaluate', {
        expression: 'document.body.style.zoom=' + JSON.stringify(String(zoom)),
      });
    }
    var ready = await page.send('Runtime.evaluate', {
      expression: '!!(window.__LANTERN_247A_RUN && window.LanternCardUI && window.LANTERN_RESULT_REVEAL)',
      returnByValue: true,
    });
    if (!ready.result || ready.result.value !== true) {
      throw new Error('Explore 247A page did not initialize');
    }
    var evalRes = await page.send('Runtime.evaluate', {
      expression: 'window.__LANTERN_247A_RUN.runReactionRace()',
      awaitPromise: true,
      returnByValue: true,
    });
    var pollRes = await page.send('Runtime.evaluate', {
      expression: 'window.__LANTERN_247A_RUN.runPollRace()',
      awaitPromise: true,
      returnByValue: true,
    });
    var scrollRes = await page.send('Runtime.evaluate', {
      expression: '(function(){var o=document.getElementById("lanternCardDetailOverlay"); if(!o) return {ok:false}; var b=o.scrollTop; o.scrollTop=80; var m=o.scrollTop; o.scrollTop=b; return {ok:m>=30,before:b,mid:m};})()',
      returnByValue: true,
    });
    var replayRes = await page.send('Runtime.evaluate', {
      expression: '(async function(){var before=window.__LANTERN_247A_RUN.capture("replay-before"); window.__LANTERN_247A_RUN.openExplorePost(); var panel=document.querySelector(".lanternFinalRxPanel"); window.LANTERN_RESULT_REVEAL.mountReactionSpatialRace(panel, window.__LANTERN_247A_RUN.fixtures, {choiceSelector:".lanternFinalRxChoice",typeAttr:"data-rx-type",playAudio:false}); await new Promise(function(r){setTimeout(r,3200);}); var after=window.__LANTERN_247A_RUN.capture("replay-after"); return {ok:after.maxBarH>=80 && Math.abs(after.iconSectionY-before.iconSectionY)<=2, before:before, after:after};})()',
      awaitPromise: true,
      returnByValue: true,
    });
    page.close();
    browser.close();
    return {
      result: evalRes.result && evalRes.result.value,
      poll: pollRes.result && pollRes.result.value,
      scroll: scrollRes.result && scrollRes.result.value,
      replay: replayRes.result && replayRes.result.value,
      via: 'chrome-cdp',
    };
  } finally {
    chrome.kill('SIGKILL');
  }
}

async function main() {
  var launched = await startServer();
  var url = 'http://127.0.0.1:' + launched.port + '/dev/race-explore-247a.html';
  var chrome = findChrome();
  if (!chrome) throw new Error('Chrome is required for Explore overlay measurement');
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
      var measured = await measureWithChrome(chrome, url, c.viewport, c.zoom);
      out[c.name] = measured;
      var r = measured && measured.result;
      var ok = !!(r && r.ok && measured.poll && measured.poll.ok && measured.scroll && measured.scroll.ok && measured.replay && measured.replay.ok);
      console.log((ok ? 'PASS' : 'FAIL'), c.name, JSON.stringify({
        iconDrift: r && r.iconDrift,
        followDown: r && r.followDown,
        stageH: r && r.after && r.after.stageH,
        barInStage: r && r.after && r.after.barInStage,
        iconInStage: r && r.after && r.after.iconInStage,
        poll: measured.poll,
        scroll: measured.scroll,
        replay: measured.replay && { ok: measured.replay.ok, maxBarH: measured.replay.after && measured.replay.after.maxBarH },
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
