/**
 * Shared paid game-start path — one wallet check + one transact for all Play surfaces.
 * Prompt #257B — server resolves debit, bundles, and free play per game.
 */
(function (global) {
  'use strict';

  var spendInFlight = false;
  var lastRunId = '';

  function walletApi() {
    return global.LanternWallet || null;
  }

  function catalogApi() {
    return global.LANTERN_GAME_CATALOG || null;
  }

  function economyApi() {
    return global.LanternGameEconomy || null;
  }

  function toast(msg) {
    if (global.LanternGamesRuntime && typeof global.LanternGamesRuntime.toast === 'function') {
      global.LanternGamesRuntime.toast(msg);
    }
  }

  function loadAdopted() {
    if (global.LanternGamesRuntime && typeof global.LanternGamesRuntime.loadAdopted === 'function') {
      return global.LanternGamesRuntime.loadAdopted();
    }
    var auth = global.LanternAuth || global.LanternPilotAuth;
    if (auth && typeof auth.adoptedFromPilotMe === 'function') {
      return auth.adoptedFromPilotMe();
    }
    return null;
  }

  function gameRefForName(gameName) {
    var cat = catalogApi();
    if (cat && typeof cat.getGameByName === 'function') {
      var g = cat.getGameByName(gameName);
      if (g && g.id) return g.id;
    }
    return gameName || '';
  }

  function nuggetDebitRequired(gameName) {
    var econ = economyApi();
    if (econ && typeof econ.nuggetDebitRequired === 'function') {
      return econ.nuggetDebitRequired(gameName);
    }
    return 1;
  }

  function insufficientCopy(gameName) {
    var econ = economyApi();
    if (econ && typeof econ.formatInsufficient === 'function') {
      return econ.formatInsufficient(gameName);
    }
    return 'Not enough Nuggets to play.';
  }

  function fetchMyWallet() {
    var w = walletApi();
    if (!w || typeof w.fetchMyBalance !== 'function') {
      return Promise.resolve({ ok: false, error: 'wallet_unavailable', available: null });
    }
    return w.fetchMyBalance();
  }

  function refreshWalletDisplays() {
    if (global.LanternWallet && typeof global.LanternWallet.refreshBalance === 'function') {
      global.LanternWallet.refreshBalance({ force: true });
    }
    if (global.LanternGamesPage && typeof global.LanternGamesPage.refreshWalletDisplay === 'function') {
      global.LanternGamesPage.refreshWalletDisplay();
    }
    if (global.LanternGamesRuntime && typeof global.LanternGamesRuntime.refreshBalance === 'function') {
      global.LanternGamesRuntime.refreshBalance();
    }
  }

  function setPlayStarting(active) {
    if (global.LanternGamesPage && typeof global.LanternGamesPage.setPlayStarting === 'function') {
      global.LanternGamesPage.setPlayStarting(!!active);
    }
  }

  function completeFirstGameLocal(adopted) {
    var createRun =
      typeof global.LANTERN_API !== 'undefined' && global.LANTERN_API.createRun ? global.LANTERN_API.createRun() : null;
    if (!createRun || !adopted) return Promise.resolve();
    return new Promise(function (resolve) {
      createRun
        .withSuccessHandler(function () {
          resolve();
        })
        .withFailureHandler(function () {
          resolve();
        })
        .completeFirstGame({ character_name: adopted.name, economy_backend_charged: true });
    });
  }

  function generateRunId() {
    if (typeof global.crypto !== 'undefined' && global.crypto && typeof global.crypto.randomUUID === 'function') {
      return global.crypto.randomUUID();
    }
    return 'run_' + Date.now() + '_' + Math.random().toString(36).slice(2);
  }

  function transactGamePlay(gameName, runId) {
    var w = walletApi();
    if (w && typeof w.canUseHttpEconomy === 'function' && w.canUseHttpEconomy() && typeof w.postEconomyTransact === 'function') {
      var cat = catalogApi();
      var game = cat && typeof cat.getGameByName === 'function' ? cat.getGameByName(gameName) : null;
      return w.postEconomyTransact({
        kind: 'game_play',
        source: 'GAME',
        note: gameName || 'Game',
        meta: {
          game_name: gameName || '',
          game_id: game && game.id ? String(game.id) : gameRefForName(gameName),
          run_id: runId || '',
        },
      });
    }
    return Promise.resolve({ ok: false, error: 'economy_unavailable' });
  }

  function isAffordable(wallet, debit) {
    if (!wallet || !wallet.ok || wallet.available == null) return null;
    var need = Math.max(0, Math.floor(Number(debit) || 0));
    if (need === 0) return true;
    var available = Number(wallet.available);
    if (!Number.isFinite(available)) return null;
    return available >= need;
  }

  function startPaidGame(gameName, onSuccess) {
    if (!loadAdopted()) {
      toast('Choose a character in Locker (Overview) to play.');
      return Promise.resolve({ ok: false, error: 'no_character' });
    }
    if (spendInFlight) {
      return Promise.resolve({ ok: false, error: 'in_flight' });
    }
    var debit = nuggetDebitRequired(gameName);
    var runId = generateRunId();
    spendInFlight = true;
    setPlayStarting(true);

    function finish(ok, err, extra) {
      spendInFlight = false;
      setPlayStarting(false);
      if (ok) lastRunId = runId;
      if (ok && typeof onSuccess === 'function') onSuccess(runId);
      var out = { ok: !!ok, error: err || null, debit: debit, run_id: runId };
      if (extra && typeof extra === 'object') {
        if (extra.available != null) out.available = extra.available;
      }
      return out;
    }

    var econLoad =
      economyApi() && typeof economyApi().load === 'function' ? economyApi().load() : Promise.resolve();

    return econLoad.then(function () {
      debit = nuggetDebitRequired(gameName);
      return fetchMyWallet().then(function (wallet) {
        var affordable = isAffordable(wallet, debit);
        if (affordable === null) {
          toast('Could not check your Nugget balance. Try again.');
          return finish(false, 'wallet_error');
        }
        if (!affordable) {
          toast(insufficientCopy(gameName));
          return finish(false, 'insufficient', { available: wallet.available });
        }
        return transactGamePlay(gameName, runId).then(function (tRes) {
          if (tRes && tRes.ok) {
            if (economyApi() && typeof economyApi().load === 'function') {
              economyApi().load(true);
            }
            return completeFirstGameLocal(loadAdopted()).then(function () {
              refreshWalletDisplays();
              return finish(true);
            });
          }
          if (tRes && (tRes.error === 'insufficient' || tRes.code === 'insufficient_balance')) {
            refreshWalletDisplays();
            toast(insufficientCopy(gameName));
            return finish(false, 'insufficient', {
              available: tRes.available != null ? tRes.available : wallet.available,
            });
          }
          toast('Couldn\'t start the game. Try again.');
          return finish(false, tRes && tRes.error ? tRes.error : 'transact_failed');
        });
      });
    }).catch(function () {
      toast('Could not check your Nugget balance. Try again.');
      return finish(false, 'wallet_error');
    });
  }

  function checkAffordable(gameName) {
    var econLoad =
      economyApi() && typeof economyApi().load === 'function' ? economyApi().load() : Promise.resolve();
    return econLoad.then(function () {
      var debit = nuggetDebitRequired(gameName);
      return fetchMyWallet().then(function (wallet) {
        var affordable = isAffordable(wallet, debit);
        return {
          ok: affordable !== null,
          affordable: affordable === true,
          available: wallet && wallet.available != null ? wallet.available : null,
          debit: debit,
          wallet: wallet,
        };
      });
    });
  }

  global.LanternGamesPaidStart = {
    startPaidGame: startPaidGame,
    checkAffordable: checkAffordable,
    playCostForGame: nuggetDebitRequired,
    nuggetDebitRequired: nuggetDebitRequired,
    fetchMyWallet: fetchMyWallet,
    isAffordable: isAffordable,
    isInFlight: function () {
      return spendInFlight;
    },
    getLastRunId: function () {
      return lastRunId;
    },
    clearLastRunId: function () {
      lastRunId = '';
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
