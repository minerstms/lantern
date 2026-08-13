/**
 * TEMPLATE ONLY — Tap Once
 *
 * Mechanically trivial game used to prove the starter kit wiring:
 *   start → wait for one tap/click/Enter/Space → score 1 → end → Play Again
 *
 * Copy this IIFE into app/games.html when promoting a real game, AFTER registering
 * the id in BOTH catalogs. Do not ship this template in the production Games catalog.
 *
 * Hooks (passed by the host):
 *   onEnd({ score, scoreDisplay })  — host posts via LanternGameStarter.postScore
 */
(function (global) {
  'use strict';

  var SPEC = {
    id: 'starter-tap-once',
    name: 'Tap Once (Starter Template)',
    playBtnId: 'starterTapOncePlayBtn',
  };

  function el(root, sel) {
    return root.querySelector(sel);
  }

  function mount(root, hooks) {
    hooks = hooks || {};
    var score = 0;
    var playing = false;
    var ended = false;
    var keyHandler = null;

    function setStatus(text) {
      var status = el(root, '[data-tap-once-status]');
      if (status) status.textContent = text;
    }

    function setScoreLine(text) {
      var line = el(root, '[data-tap-once-score]');
      if (line) line.textContent = text;
    }

    function showPlayAgain(show) {
      var row = el(root, '[data-tap-once-again-row]');
      if (!row) return;
      row.hidden = !show;
      if (show) row.removeAttribute('hidden');
      else row.setAttribute('hidden', '');
    }

    function unbindKeys() {
      if (keyHandler && global.document) {
        global.document.removeEventListener('keydown', keyHandler);
        keyHandler = null;
      }
    }

    function bindKeys() {
      unbindKeys();
      keyHandler = function (e) {
        if (!playing || ended) return;
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault();
          hit();
        }
      };
      if (global.document) global.document.addEventListener('keydown', keyHandler);
    }

    function hit() {
      if (!playing || ended) return;
      ended = true;
      playing = false;
      score = 1;
      unbindKeys();
      setStatus('Got it!');
      setScoreLine('Score: 1');
      showPlayAgain(true);
      if (typeof hooks.onEnd === 'function') {
        hooks.onEnd({ score: score, scoreDisplay: '1 pt' });
      }
    }

    function start() {
      score = 0;
      playing = true;
      ended = false;
      showPlayAgain(false);
      setStatus('Tap the target — or press Enter / Space.');
      setScoreLine('Score: 0');
      bindKeys();
      var target = el(root, '[data-tap-once-target]');
      if (target) target.focus();
    }

    function render() {
      return root;
    }

    function end() {
      if (!ended && playing) {
        ended = true;
        playing = false;
        unbindKeys();
        setStatus('Game over.');
        showPlayAgain(true);
      }
    }

    var target = el(root, '[data-tap-once-target]');
    if (target && !target._tapOnceWired) {
      target._tapOnceWired = true;
      target.addEventListener('click', function () {
        hit();
      });
      target.addEventListener('touchend', function (e) {
        e.preventDefault();
        hit();
      }, { passive: false });
    }
    var again = el(root, '[data-tap-once-again]');
    if (again && !again._tapOnceWired) {
      again._tapOnceWired = true;
      again.addEventListener('click', function () {
        if (typeof hooks.onPlayAgain === 'function') hooks.onPlayAgain();
        else start();
      });
    }

    return { start: start, render: render, end: end, getScore: function () { return score; } };
  }

  global.LANTERN_STARTER_TAP_ONCE = {
    SPEC: SPEC,
    mount: mount,
  };
})(typeof window !== 'undefined' ? window : globalThis);
