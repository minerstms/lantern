/**
 * Shared paid game-start path — one wallet check + one transact for all Play surfaces.
 */
(function (global) {
  'use strict';

  var spendInFlight = false;

  function walletApi() {
    return global.LanternWallet || null;
  }

  function catalogApi() {
    return global.LANTERN_GAME_CATALOG || null;
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

  function playCostForGame(gameName) {
    // Prompt #159: ordinary game play costs exactly 1 Nugget (catalog should already be 1).
    var cat = catalogApi();
    if (cat && typeof cat.getGameByName === 'function') {
      var g = cat.getGameByName(gameName);
      if (g && g.play_cost != null) {
        var n = Math.floor(Number(g.play_cost));
        if (Number.isFinite(n) && n >= 1) return 1;
      }
    }
    return 1;
  }

  function fetchMyWallet() {
    var w = walletApi();
    if (!w || typeof w.fetchMyBalance !== 'function') {
      return Promise.resolve({ ok: false, error: 'wallet_unavailable', available: null });
    }
    return w.fetchMyBalance();
  }

  function refreshWalletDisplays() {
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

  // Prompt #96: stable per-attempt idempotency reference so a duplicate/retried spend (double
  // click, page reload racing an in-flight request, etc.) can never charge the same play twice
  // through the TMS bridge.
  function generateRunId() {
    if (typeof global.crypto !== 'undefined' && global.crypto && typeof global.crypto.randomUUID === 'function') {
      return global.crypto.randomUUID();
    }
    return 'run_' + Date.now() + '_' + Math.random().toString(36).slice(2);
  }

  function transactGamePlay(gameName, cost, runId) {
    var w = walletApi();
    if (w && typeof w.canUseHttpEconomy === 'function' && w.canUseHttpEconomy() && typeof w.postEconomyTransact === 'function') {
      return w.postEconomyTransact({
        delta: -cost,
        kind: 'game_play',
        source: 'GAME',
        note: gameName || 'Game',
        meta: { game_name: gameName || '', run_id: runId || '' },
      });
    }
    return Promise.resolve({ ok: false, error: 'economy_unavailable' });
  }

  function isAffordable(wallet, cost) {
    if (!wallet || !wallet.ok || wallet.available == null) return null;
    var available = Number(wallet.available);
    var playCost = Math.max(1, Math.floor(Number(cost) || 1));
    if (!Number.isFinite(available)) return null;
    return available >= playCost;
  }

  /**
   * @param {string} gameName canonical game display name
   * @param {function} onSuccess called after successful charge
   * @returns {Promise<{ok:boolean}>}
   */
  function startPaidGame(gameName, onSuccess) {
    if (!loadAdopted()) {
      toast('Choose a character in Locker (Overview) to play.');
      return Promise.resolve({ ok: false, error: 'no_character' });
    }
    if (spendInFlight) {
      return Promise.resolve({ ok: false, error: 'in_flight' });
    }
    var cost = playCostForGame(gameName);
    var runId = generateRunId();
    spendInFlight = true;
    setPlayStarting(true);

    function finish(ok, err) {
      spendInFlight = false;
      setPlayStarting(false);
      if (ok && typeof onSuccess === 'function') onSuccess();
      return { ok: !!ok, error: err || null };
    }

    return fetchMyWallet().then(function (wallet) {
      var affordable = isAffordable(wallet, cost);
      if (affordable === null) {
        toast('Could not check your Nugget balance. Try again.');
        return finish(false, 'wallet_error');
      }
      if (!affordable) {
        toast('Not enough Nuggets. You have ' + wallet.available + ' available.');
        return finish(false, 'insufficient');
      }
      return transactGamePlay(gameName, cost, runId).then(function (tRes) {
        if (tRes && tRes.ok) {
          return completeFirstGameLocal(loadAdopted()).then(function () {
            refreshWalletDisplays();
            return finish(true);
          });
        }
        if (tRes && tRes.error === 'insufficient') {
          refreshWalletDisplays();
          var avail = tRes.available != null ? tRes.available : wallet.available;
          toast('Not enough Nuggets. You have ' + avail + ' available.');
          return finish(false, 'insufficient');
        }
        toast('Couldn\'t start game. Try again.');
        return finish(false, tRes && tRes.error ? tRes.error : 'transact_failed');
      });
    }).catch(function () {
      toast('Could not check your Nugget balance. Try again.');
      return finish(false, 'wallet_error');
    });
  }

  /** Preflight only — same wallet object/field as heading display. */
  function checkAffordable(gameName) {
    var cost = playCostForGame(gameName);
    return fetchMyWallet().then(function (wallet) {
      var affordable = isAffordable(wallet, cost);
      return {
        ok: affordable !== null,
        affordable: affordable === true,
        available: wallet && wallet.available != null ? wallet.available : null,
        cost: cost,
        wallet: wallet,
      };
    });
  }

  global.LanternGamesPaidStart = {
    startPaidGame: startPaidGame,
    checkAffordable: checkAffordable,
    playCostForGame: playCostForGame,
    fetchMyWallet: fetchMyWallet,
    isAffordable: isAffordable,
    isInFlight: function () {
      return spendInFlight;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
