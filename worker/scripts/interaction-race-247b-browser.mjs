/**
 * Prompt #247B — real Explore path screenshots + measurements.
 * Usage: node worker/scripts/interaction-race-247b-browser.mjs
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const appRoot = path.join(root, 'app');
const shotDir = fs.existsSync('/opt/cursor/artifacts/screenshots')
  ? '/opt/cursor/artifacts/screenshots'
  : path.join(root, 'app/dev/247b-shots');
fs.mkdirSync(shotDir, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function startServer() {
  return new Promise(function (resolve, reject) {
    const server = http.createServer(function (req, res) {
      var urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      if (urlPath === '/') urlPath = '/dev/race-explore-247b.html';
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
  var candidates = [
    process.env.CHROME_PATH,
    '/usr/local/bin/google-chrome',
    '/usr/bin/google-chrome',
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

async function evalValue(page, expression, awaitPromise) {
  var res = await page.send('Runtime.evaluate', {
    expression: expression,
    awaitPromise: !!awaitPromise,
    returnByValue: true,
  });
  if (res.exceptionDetails) {
    throw new Error(JSON.stringify(res.exceptionDetails));
  }
  return res.result && res.result.value;
}

async function shotModal(page, name) {
  var clip = await evalValue(page, '(function(){var m=document.querySelector("#lanternCardDetailOverlay .lanternCardDetailModal"); if(!m) return null; var r=m.getBoundingClientRect(); return {x:Math.max(0,r.x),y:Math.max(0,r.y),width:Math.max(8,Math.min(r.width, window.innerWidth-Math.max(0,r.x))),height:Math.max(8,Math.min(r.height, window.innerHeight-Math.max(0,r.y)))};})()');
  var params = { format: 'png', fromSurface: true };
  if (clip) {
    params.clip = { x: clip.x, y: clip.y, width: clip.width, height: Math.min(clip.height, 1600), scale: 1 };
  }
  var png = await page.send('Page.captureScreenshot', params);
  var file = path.join(shotDir, name + '.png');
  fs.writeFileSync(file, Buffer.from(png.data, 'base64'));
  return file;
}

async function withChrome(chromePath, url, viewport, fn) {
  var userData = fs.mkdtempSync(path.join('/tmp', 'lantern-247b-'));
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
    await page.send('Page.navigate', { url: url });
    await new Promise(function (res) { setTimeout(res, 1100); });
    var ready = await evalValue(page, '!!(window.__LANTERN_247B_RUN && window.LanternCardUI && window.LANTERN_FINAL_REACTIONS)');
    if (ready !== true) throw new Error('247B page did not initialize');
    var out = await fn(page);
    page.close();
    browser.close();
    return out;
  } finally {
    chrome.kill('SIGKILL');
  }
}

function summarize(before, during, after, opts) {
  opts = opts || {};
  var iconDrift = Math.max(
    Math.abs((during.iconSectionY || 0) - (before.iconSectionY || 0)),
    Math.abs((after.iconSectionY || 0) - (before.iconSectionY || 0))
  );
  var followDown = Math.round((after.followDocY || 0) - (before.followDocY || 0));
  var growOk = opts.replay
    ? after.barInStage && !after.iconInStage && after.maxBarH >= 80
    : followDown >= 70 && after.barInStage && !after.iconInStage && after.stageH > 20;
  return {
    ok: iconDrift <= 2 && growOk,
    iconDrift: iconDrift,
    followDown: followDown,
    before: before,
    during: during,
    after: after,
  };
}

async function runScenario(page, label, openExpr, clickExpr, includePoll) {
  await evalValue(page, openExpr, true);
  await new Promise(function (r) { setTimeout(r, 250); });
  var beforeFile = await shotModal(page, label + '-before');
  var before = await evalValue(page, 'window.__LANTERN_247B_RUN.capture("before")');
  await evalValue(page, clickExpr);
  await new Promise(function (r) { setTimeout(r, 800); });
  var duringFile = await shotModal(page, label + '-during');
  var during = await evalValue(page, 'window.__LANTERN_247B_RUN.capture("during")');
  await new Promise(function (r) { setTimeout(r, 2800); });
  var afterFile = await shotModal(page, label + '-after');
  var after = await evalValue(page, 'window.__LANTERN_247B_RUN.capture("after")');
  var poll = includePoll ? await evalValue(page, 'window.__LANTERN_247B_RUN.runPoll()', true) : { ok: true, skipped: true };
  var rec = summarize(before, during, after, { replay: label.indexOf('replay') !== -1 });
  rec.poll = poll;
  rec.shots = { before: beforeFile, during: duringFile, after: afterFile };
  return rec;
}

async function main() {
  var launched = await startServer();
  var url = 'http://127.0.0.1:' + launched.port + '/dev/race-explore-247b.html';
  var chrome = findChrome();
  if (!chrome) throw new Error('Chrome required');
  var cases = [
    {
      name: '247b-desktop-fresh',
      viewport: { width: 1280, height: 900 },
      open: 'window.__LANTERN_247B_RUN.openFresh()',
      click: 'document.querySelector(\'.lanternFinalRxChoice[data-rx-type="star"]\').click()',
      poll: true,
    },
    {
      name: '247b-desktop-reveal',
      viewport: { width: 1280, height: 900 },
      open: 'window.__LANTERN_247B_RUN.openLocked()',
      click: 'document.querySelector("[data-reveal-results]").click()',
    },
    {
      name: '247b-desktop-replay',
      viewport: { width: 1280, height: 900 },
      open: '(async function(){ await window.__LANTERN_247B_RUN.openLocked(); document.querySelector("[data-reveal-results]").click(); await new Promise(function(r){setTimeout(r,3200);}); return true; })()',
      click: 'document.querySelector("[data-reveal-results]").click()',
    },
    {
      name: '247b-phone-fresh',
      viewport: { width: 390, height: 844 },
      open: 'window.__LANTERN_247B_RUN.openFresh()',
      click: 'document.querySelector(\'.lanternFinalRxChoice[data-rx-type="star"]\').click()',
    },
  ];
  var out = {};
  var fail = 0;
  try {
    for (var i = 0; i < cases.length; i++) {
      var c = cases[i];
      var measured = await withChrome(chrome, url, c.viewport, function (page) {
        return runScenario(page, c.name, c.open, c.click, !!c.poll);
      });
      out[c.name] = measured;
      console.log((measured.ok ? 'PASS' : 'FAIL'), c.name, JSON.stringify({
        iconDrift: measured.iconDrift,
        followDown: measured.followDown,
        stageH: measured.after && measured.after.stageH,
        barInStage: measured.after && measured.after.barInStage,
        iconInStage: measured.after && measured.after.iconInStage,
        poll: measured.poll,
        shots: measured.shots,
      }));
      if (!measured.ok) fail += 1;
    }
  } finally {
    launched.server.close();
  }
  fs.writeFileSync(path.join(root, 'worker/scripts/interaction-race-247b-browser-last.json'), JSON.stringify(out, null, 2));
  if (fail) process.exit(1);
}

main().catch(function (err) {
  console.error('FAIL 247B browser', err && err.stack ? err.stack : err);
  process.exit(1);
});
