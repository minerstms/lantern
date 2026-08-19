/**
 * Prompt #238 — Avatar Match client helpers (modes, unique targets, accuracy-first score).
 * Keep formulas aligned with worker/avatar-match-game.js.
 */
(function (global) {
  'use strict';

  var MIN_POOL = 4;
  var FIXED = [10, 25, 50, 100];
  var TIME_CAP_MS = 99999999;
  var ACCURACY_SCALE = 10000;
  var TIME_BUCKET = 100000000;

  function modeAvailability(eligibleCount) {
    var n = Math.max(0, Math.floor(Number(eligibleCount) || 0));
    var playable = n >= MIN_POOL;
    return {
      eligibleCount: n,
      playable: playable,
      modes: [
        { id: '10', label: '10 Questions', questions: 10, enabled: playable && n >= 10, requires: 10 },
        { id: '25', label: '25 Questions', questions: 25, enabled: playable && n >= 25, requires: 25 },
        { id: '50', label: '50 Questions', questions: 50, enabled: playable && n >= 50, requires: 50 },
        { id: '100', label: '100 Questions', questions: 100, enabled: playable && n >= 100, requires: 100 },
        { id: 'full', label: 'Full Roster', questions: n, enabled: playable, requires: MIN_POOL }
      ]
    };
  }

  function questionProgressLabel(index, total) {
    return 'Question ' + Math.max(1, Math.floor(Number(index) || 1)) + ' of ' + Math.max(1, Math.floor(Number(total) || 1));
  }

  function teachingRevealCopy(displayName) {
    var name = String(displayName || '').trim();
    return name ? "That's " + name + '.' : "That's the correct person.";
  }

  function revealDelayMs(isCorrect, reducedMotion) {
    if (reducedMotion) return 650;
    return isCorrect ? 800 : 950;
  }

  function formatClock(elapsedMs) {
    var ms = Math.max(0, Math.floor(Number(elapsedMs) || 0));
    var totalSec = Math.floor(ms / 1000);
    var m = Math.floor(totalSec / 60);
    var s = totalSec % 60;
    return m + ':' + String(s).padStart(2, '0');
  }

  function accuracyPct(correct, total) {
    var n = Math.max(0, Math.floor(Number(total) || 0));
    var c = Math.max(0, Math.floor(Number(correct) || 0));
    if (!n) return 0;
    return Math.round((c / n) * 1000) / 10;
  }

  function encodeScore(correct, total, elapsedMs) {
    var t = Math.max(0, Math.min(TIME_CAP_MS, Math.floor(Number(elapsedMs) || 0)));
    var c = Math.max(0, Math.floor(Number(correct) || 0));
    var n = Math.max(1, Math.floor(Number(total) || 0));
    var safeCorrect = Math.min(c, n);
    var bp = Math.round((safeCorrect / n) * ACCURACY_SCALE);
    return bp * TIME_BUCKET + (TIME_CAP_MS - t);
  }

  function formatScoreDisplay(correct, total, elapsedMs) {
    return String(Math.floor(Number(correct) || 0)) + '/' + String(Math.floor(Number(total) || 0)) + ' · ' + accuracyPct(correct, total).toFixed(1) + '% · ' + formatClock(elapsedMs);
  }

  function selectUniqueTargets(roster, modeId) {
    var list = (roster || []).slice();
    var i;
    var j;
    var t;
    for (i = list.length - 1; i > 0; i--) {
      j = Math.floor(Math.random() * (i + 1));
      t = list[i];
      list[i] = list[j];
      list[j] = t;
    }
    if (String(modeId) === 'full') return list;
    var n = Math.floor(Number(modeId) || 0);
    return n < 1 ? [] : list.slice(0, n);
  }

  function disabledReason(mode, eligibleCount) {
    if (!mode || mode.enabled) return '';
    if (mode.id === 'full') return 'Needs at least ' + MIN_POOL + ' eligible users.';
    return 'Requires ' + mode.requires + ' eligible users\n' + Math.max(0, eligibleCount) + ' available';
  }

  global.LanternAvatarMatch = {
    MIN_POOL: MIN_POOL,
    FIXED_MODES: FIXED,
    modeAvailability: modeAvailability,
    questionProgressLabel: questionProgressLabel,
    teachingRevealCopy: teachingRevealCopy,
    revealDelayMs: revealDelayMs,
    formatClock: formatClock,
    accuracyPct: accuracyPct,
    encodeScore: encodeScore,
    formatScoreDisplay: formatScoreDisplay,
    selectUniqueTargets: selectUniqueTargets,
    disabledReason: disabledReason
  };
})(typeof window !== 'undefined' ? window : globalThis);
