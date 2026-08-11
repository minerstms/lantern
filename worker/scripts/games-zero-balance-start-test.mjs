/**
 * Prompt #163 — zero-balance Start must not silently flash back; persistent pregame message.
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0;
let fail = 0;
function ok(m) { pass++; console.log('PASS', m); }
function bad(m, d) { fail++; console.error('FAIL', m, d || ''); }

const paidStartJs = fs.readFileSync(path.join(root, 'app/js/lantern-games-paid-start.js'), 'utf8');
const playerJs = fs.readFileSync(path.join(root, 'app/js/lantern-game-player.js'), 'utf8');
const gamesHtml = fs.readFileSync(path.join(root, 'app/games.html'), 'utf8');
const playerCss = fs.readFileSync(path.join(root, 'app/css/lantern-game-player.css'), 'utf8');

if (gamesHtml.includes('lanternGamePlayerPregameStatus') && gamesHtml.includes('lanternGamePlayerPregameCost')) {
  ok('pregame has persistent status + cost elements');
} else bad('pregame status/cost markup missing');

if (playerCss.includes('.lanternGamePlayerPregameStatus') && playerCss.includes('.is-error')) {
  ok('pregame status has visible error styling');
} else bad('pregame status CSS missing');

if (playerJs.includes('You need 1 Nugget to play') && playerJs.includes('applyPaidStartFailure')) {
  ok('game player surfaces insufficient Nuggets in pregame');
} else bad('player insufficient messaging');

if (playerJs.includes('setPregameStatus') && playerJs.includes('refreshPregameCostHint')) {
  ok('game player exposes pregame cost/status helpers');
} else bad('player helpers');

if (paidStartJs.includes("finish(false, 'insufficient'") && paidStartJs.includes('You need 1 Nugget to play')) {
  ok('paid-start returns insufficient with product wording');
} else bad('paid-start insufficient wording');

if (gamesHtml.includes('done(false, res') || gamesHtml.includes('done(false, res ||')) {
  ok('tryPlay passes failure detail into done(false, …)');
} else bad('tryPlay failure detail wiring');

// Runtime: zero balance never calls postEconomyTransact
{
  let transactCalls = 0;
  const sandbox = {
    window: {},
    globalThis: {},
    console,
    Promise,
    Number,
    Math,
    String,
    setTimeout,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.window.LanternWallet = {
    canUseHttpEconomy: function () { return true; },
    fetchMyBalance: function () { return Promise.resolve({ ok: true, available: 0 }); },
    postEconomyTransact: function () {
      transactCalls += 1;
      return Promise.resolve({ ok: true });
    },
  };
  sandbox.window.LanternGamesRuntime = {
    toast: function () {},
    loadAdopted: function () { return { name: '20889' }; },
  };
  sandbox.window.LANTERN_GAME_CATALOG = {
    getGameByName: function () { return { play_cost: 1 }; },
  };
  vm.runInNewContext(paidStartJs, sandbox);
  const api = sandbox.LanternGamesPaidStart;
  const res = await api.startPaidGame('Reaction Tap', function () { bad('onSuccess must not run at zero balance'); });
  if (res && res.ok === false && res.error === 'insufficient' && Number(res.available) === 0 && transactCalls === 0) {
    ok('zero balance: no economy transact, Start recovers with insufficient');
  } else bad('zero balance contract', { res, transactCalls });
}

// Runtime: balance >= 1 charges exactly once then succeeds
{
  let transactCalls = 0;
  let success = 0;
  const sandbox = {
    window: {},
    globalThis: {},
    console,
    Promise,
    Number,
    Math,
    String,
    setTimeout,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.window.LanternWallet = {
    canUseHttpEconomy: function () { return true; },
    fetchMyBalance: function () { return Promise.resolve({ ok: true, available: 3 }); },
    postEconomyTransact: function (body) {
      transactCalls += 1;
      if (body.kind !== 'game_play' || body.delta !== -1) {
        return Promise.resolve({ ok: false, error: 'bad_payload' });
      }
      return Promise.resolve({ ok: true, balance_after: 2 });
    },
  };
  sandbox.window.LanternGamesRuntime = {
    toast: function () {},
    loadAdopted: function () { return { name: '20889' }; },
  };
  sandbox.window.LANTERN_API = { createRun: null };
  sandbox.window.LANTERN_GAME_CATALOG = {
    getGameByName: function () { return { play_cost: 1 }; },
  };
  vm.runInNewContext(paidStartJs, sandbox);
  const api = sandbox.LanternGamesPaidStart;
  const r1 = await api.startPaidGame('Avatar Match', function () { success += 1; });
  const r2 = await api.startPaidGame('Avatar Match', function () { success += 1; });
  if (r1 && r1.ok && r2 && r2.ok && transactCalls === 2 && success === 2) {
    ok('sufficient balance: each Start charges exactly once (-1 game_play)');
  } else bad('sufficient balance contract', { r1, r2, transactCalls, success });
}

// Duplicate in-flight Start blocked
{
  let transactCalls = 0;
  const sandbox = {
    window: {},
    globalThis: {},
    console,
    Promise,
    Number,
    Math,
    String,
    setTimeout,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  let resolveTransact;
  sandbox.window.LanternWallet = {
    canUseHttpEconomy: function () { return true; },
    fetchMyBalance: function () { return Promise.resolve({ ok: true, available: 5 }); },
    postEconomyTransact: function () {
      transactCalls += 1;
      return new Promise(function (resolve) { resolveTransact = resolve; });
    },
  };
  sandbox.window.LanternGamesRuntime = {
    toast: function () {},
    loadAdopted: function () { return { name: '20889' }; },
  };
  sandbox.window.LANTERN_API = { createRun: null };
  sandbox.window.LANTERN_GAME_CATALOG = { getGameByName: function () { return { play_cost: 1 }; } };
  vm.runInNewContext(paidStartJs, sandbox);
  const api = sandbox.LanternGamesPaidStart;
  const p1 = api.startPaidGame('Memory Match', function () {});
  const p2 = api.startPaidGame('Memory Match', function () {});
  const mid = await p2;
  if (mid && mid.ok === false && mid.error === 'in_flight' && transactCalls === 1) {
    ok('duplicate Start while in-flight does not double-spend');
  } else bad('in-flight guard', { mid, transactCalls });
  resolveTransact({ ok: true });
  await p1;
}

console.log('\nGames zero-balance UX tests:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
