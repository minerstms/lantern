/**
 * Donor-side Lantern adapter (runs inside the Tower iframe).
 *
 * The donor may emit only gameplay concepts:
 *   gameStarted | scoreChanged | gameEnded | achievement
 *
 * This file must NEVER send:
 *   username, character_name, user_id, account identity
 *   nuggets, nugget_amount, reward, delta, wallet
 *
 * Identity, game ID, score POST, leaderboard, and Nuggets stay on the Lantern parent.
 */
(function (global) {
  'use strict';

  var MESSAGE_SOURCE = 'lantern-donor-adapter';
  var MESSAGE_TYPE = 'lantern-game';
  var ALLOWED_EVENTS = {
    gameStarted: true,
    scoreChanged: true,
    gameEnded: true,
    achievement: true,
  };

  var lastScore = 0;
  var lastFloors = 0;
  var lastFailed = 0;
  var started = false;
  var ended = false;

  function numeric(value, fallback) {
    var n = Math.floor(Number(value));
    return Number.isFinite(n) ? n : fallback;
  }

  function stripForbidden(payload) {
    var out = {};
    var src = payload && typeof payload === 'object' ? payload : {};
    if (src.score != null) out.score = numeric(src.score, 0);
    if (src.floors != null) out.floors = numeric(src.floors, 0);
    if (src.failed != null) out.failed = numeric(src.failed, 0);
    if (src.reason != null) out.reason = String(src.reason).slice(0, 80);
    if (src.name != null) out.name = String(src.name).slice(0, 80);
    return out;
  }

  function emit(event, payload) {
    if (!ALLOWED_EVENTS[event]) return false;
    var message = {
      source: MESSAGE_SOURCE,
      type: MESSAGE_TYPE,
      event: event,
      payload: stripForbidden(payload),
    };
    try {
      if (global.parent && global.parent !== global) {
        global.parent.postMessage(message, global.location.origin);
      }
    } catch (e) {}
    return true;
  }

  function notifyGameStarted() {
    if (started) return;
    started = true;
    ended = false;
    lastScore = 0;
    lastFloors = 0;
    lastFailed = 0;
    emit('gameStarted', { score: 0, floors: 0, failed: 0 });
  }

  function notifyScoreChanged(score, floors) {
    lastScore = numeric(score, lastScore);
    if (floors != null) lastFloors = numeric(floors, lastFloors);
    emit('scoreChanged', { score: lastScore, floors: lastFloors, failed: lastFailed });
  }

  function notifyGameEnded(reason) {
    if (ended) return;
    ended = true;
    emit('gameEnded', {
      score: lastScore,
      floors: lastFloors,
      failed: lastFailed,
      reason: reason || 'failed',
    });
  }

  function notifyAchievement(name) {
    emit('achievement', { name: name || 'event', score: lastScore, floors: lastFloors });
  }

  /**
   * Wrap donor option callbacks so Lantern receives events without the donor
   * knowing about identity or economy.
   */
  function wrapOptions(option) {
    var opt = option && typeof option === 'object' ? option : {};
    var userSetScore = opt.setGameScore;
    var userSetSuccess = opt.setGameSuccess;
    var userSetFailed = opt.setGameFailed;

    opt.setGameScore = function (s) {
      notifyScoreChanged(s, lastFloors);
      if (typeof userSetScore === 'function') userSetScore(s);
    };
    opt.setGameSuccess = function (count) {
      lastFloors = numeric(count, lastFloors);
      notifyScoreChanged(lastScore, lastFloors);
      if (lastFloors === 10 || lastFloors === 25) {
        notifyAchievement('floors_' + lastFloors);
      }
      if (typeof userSetSuccess === 'function') userSetSuccess(count);
    };
    opt.setGameFailed = function (f) {
      lastFailed = numeric(f, lastFailed);
      if (typeof userSetFailed === 'function') userSetFailed(f);
      if (lastFailed >= 3) notifyGameEnded('hp_depleted');
    };
    return opt;
  }

  global.LanternDonorAdapter = {
    MESSAGE_SOURCE: MESSAGE_SOURCE,
    MESSAGE_TYPE: MESSAGE_TYPE,
    ALLOWED_EVENTS: ALLOWED_EVENTS,
    emit: emit,
    stripForbidden: stripForbidden,
    wrapOptions: wrapOptions,
    notifyGameStarted: notifyGameStarted,
    notifyScoreChanged: notifyScoreChanged,
    notifyGameEnded: notifyGameEnded,
    notifyAchievement: notifyAchievement,
  };

  /**
   * Parent Play shell may ask the iframe to begin after a successful paid start.
   * Lab pages do not send this. Identity/economy stay on the parent.
   */
  if (global.addEventListener) {
    global.addEventListener('message', function (event) {
      try {
        if (event.origin && global.location && event.origin !== global.location.origin) return;
      } catch (e) {
        return;
      }
      var data = event.data;
      if (!data || data.source !== 'lantern-parent' || data.type !== MESSAGE_TYPE) return;
      if (data.event === 'beginPlay' && typeof global.__lanternTowerBeginPlay === 'function') {
        global.__lanternTowerBeginPlay();
      }
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
