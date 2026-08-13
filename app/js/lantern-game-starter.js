/**
 * Lantern Game Starter — thin wrappers around the CURRENT production contracts.
 *
 * This is not a second game engine. New games should call these helpers (or the
 * same functions they wrap) instead of rediscovering auth/economy/score wiring.
 *
 * Wraps:
 *   LanternGamesPaidStart.startPaidGame  — 1 Nugget TMS spend + run_id
 *   LanternGamePlayer.open               — pregame → Start → gameplay shell
 *   POST /api/leaderboards/record        — session identity, allowlisted game, bounds
 *   LanternWallet.fetchMyBalance         — TMS authoritative balance
 *
 * Mission launch is OPT-IN via ?mission= on the Games URL. Ordinary play has no
 * mission param and must not be treated as a Mission.
 *
 * See docs/LANTERN_GAME_STARTER_KIT.md
 */
(function (global) {
  'use strict';

  function apiBase() {
    if (typeof global === 'undefined') return null;
    var raw =
      typeof global.LANTERN_ECONOMY_API !== 'undefined' &&
      global.LANTERN_ECONOMY_API !== null &&
      String(global.LANTERN_ECONOMY_API).trim() !== ''
        ? global.LANTERN_ECONOMY_API
        : global.LANTERN_AVATAR_API;
    if (typeof raw === 'undefined' || raw === null) return null;
    return String(raw).replace(/\/$/, '');
  }

  /**
   * Read Mission launch context from a location (default: window.location).
   * Returns fromMission:false for ordinary Games play. Never starts a Mission.
   */
  function missionLaunchContext(loc) {
    var search = '';
    if (loc && loc.search != null) search = String(loc.search);
    else if (typeof global.location !== 'undefined' && global.location) search = String(global.location.search || '');
    var params = new URLSearchParams(search);
    var missionId = String(params.get('mission') || '').trim();
    var gameId = String(params.get('game') || '').trim();
    if (!missionId) {
      return { fromMission: false, missionId: '', gameId: gameId };
    }
    return { fromMission: true, missionId: missionId, gameId: gameId };
  }

  /** After a Mission run, strip ?mission= so Play Again is ordinary paid play. */
  function clearMissionQuery(historyObj, loc) {
    try {
      var href = loc && loc.href ? loc.href : global.location && global.location.href;
      if (!href) return false;
      var u = new URL(href);
      if (!u.searchParams.has('mission')) return false;
      u.searchParams.delete('mission');
      var h = historyObj || (typeof global.history !== 'undefined' ? global.history : null);
      if (h && typeof h.replaceState === 'function') {
        h.replaceState(null, '', u.pathname + (u.search || '') + (u.hash || ''));
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  function lastRunId() {
    var paid = global.LanternGamesPaidStart;
    if (paid && typeof paid.getLastRunId === 'function') return paid.getLastRunId() || '';
    return '';
  }

  function refreshBalance() {
    if (global.LanternWallet && typeof global.LanternWallet.fetchMyBalance === 'function') {
      return global.LanternWallet.fetchMyBalance();
    }
    return Promise.resolve({ ok: false, error: 'wallet_unavailable' });
  }

  /**
   * Open the shared Game Player pregame, then charge 1 Nugget on Start.
   * onGameplayStart runs only after a successful paid start (same as games.html tryPlay).
   *
   * @param {{ gameName: string, surface: string|Element, onExit?: function, returnFocus?: Element, title?: string }} opts
   * @param {function} onGameplayStart
   */
  function openPaidGame(opts, onGameplayStart) {
    opts = opts || {};
    var gameName = opts.gameName || opts.title || '';
    if (!global.LanternGamePlayer || !opts.surface) {
      return { ok: false, error: 'player_unavailable' };
    }
    if (!global.LanternGamesPaidStart || typeof global.LanternGamesPaidStart.startPaidGame !== 'function') {
      return { ok: false, error: 'paid_start_unavailable' };
    }
    var opened = global.LanternGamePlayer.open({
      title: opts.title || gameName,
      gameName: gameName,
      gameId: opts.gameId,
      surface: opts.surface,
      onExit: opts.onExit,
      returnFocus: opts.returnFocus || null,
      onPregameStart: function (done) {
        global.LanternGamesPaidStart.startPaidGame(gameName, function () {
          try {
            done(true);
            if (typeof onGameplayStart === 'function') onGameplayStart();
          } catch (err) {
            if (typeof global.LanternGamePlayer.setPregameStatus === 'function') {
              global.LanternGamePlayer.setPregameStatus("Couldn't start the game. Try again.", 'error');
            }
            global.LanternGamePlayer.close({ skipExit: true, force: true });
          }
        }).then(function (res) {
          if (!res || !res.ok) done(false, res || { error: 'transact_failed' });
        });
      },
    });
    return opened ? { ok: true } : { ok: false, error: 'player_open_failed' };
  }

  var submitGuard = Object.create(null);

  /**
   * POST /api/leaderboards/record — session identity only; do not send character_name.
   * @param {{ gameName: string, score: number, scoreDisplay?: string, runId?: string }} opts
   */
  function postScore(opts) {
    opts = opts || {};
    var base = apiBase();
    var key = opts.gameName || opts.game_name || '';
    var cat = global.LANTERN_GAME_CATALOG;
    if (cat && typeof cat.leaderboardKey === 'function') {
      key = cat.leaderboardKey(key) || key;
    }
    var numericScore = Math.floor(Number(opts.score));
    if (base == null || !key || !Number.isFinite(numericScore)) {
      return Promise.resolve({ ok: false, error: 'malformed_score' });
    }
    var resultRunId = opts.runId || opts.run_id || lastRunId() || '';
    var guardKey = key + '|' + String(numericScore) + '|' + String(opts.scoreDisplay || '') + '|' + resultRunId;
    if (submitGuard[guardKey]) return Promise.resolve({ ok: true, deduped: true });
    submitGuard[guardKey] = true;
    var payload = {
      game_name: key,
      score: numericScore,
      score_display: opts.scoreDisplay || opts.score_display || String(numericScore),
    };
    if (resultRunId) payload.run_id = resultRunId;
    return fetch(base + '/api/leaderboards/record', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(function (r) {
      return r.json().then(function (res) {
        return { httpOk: r.ok, res: res };
      }).catch(function () {
        return { httpOk: r.ok, res: null };
      });
    }).then(function (pack) {
      var ok = !!(pack && pack.httpOk && pack.res && pack.res.ok);
      if (ok) {
        setTimeout(function () { delete submitGuard[guardKey]; }, 5000);
        if (global.LanternGamesPage && typeof global.LanternGamesPage.loadAllLeaderboards === 'function') {
          global.LanternGamesPage.loadAllLeaderboards();
        }
      } else {
        delete submitGuard[guardKey];
      }
      return { ok: ok, error: ok ? null : ((pack && pack.res && pack.res.error) || 'record_failed') };
    }).catch(function () {
      delete submitGuard[guardKey];
      return { ok: false, error: 'network' };
    });
  }

  global.LanternGameStarter = {
    apiBase: apiBase,
    missionLaunchContext: missionLaunchContext,
    clearMissionQuery: clearMissionQuery,
    lastRunId: lastRunId,
    refreshBalance: refreshBalance,
    openPaidGame: openPaidGame,
    postScore: postScore,
  };
})(typeof window !== 'undefined' ? window : globalThis);
