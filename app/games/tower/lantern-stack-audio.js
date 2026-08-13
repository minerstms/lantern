/**
 * Original Lantern Stack synthesized SFX (Web Audio API).
 * No third-party samples. No BGM.
 */
(function (global) {
  'use strict';

  var ctx = null;

  function audioCtx() {
    if (ctx) return ctx;
    var Ctor = global.AudioContext || global.webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch (e) {
      ctx = null;
    }
    return ctx;
  }

  function tone(freq, t0, dur, type, vol, slideTo) {
    var ac = audioCtx();
    if (!ac) return;
    var osc = ac.createOscillator();
    var gain = ac.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo != null) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t0 + dur);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function play(name) {
    var ac = audioCtx();
    if (!ac) return;
    if (ac.state === 'suspended' && typeof ac.resume === 'function') ac.resume();
    var t0 = ac.currentTime;
    if (name === 'bgm') return;
    if (name === 'drop') {
      tone(180, t0, 0.12, 'triangle', 0.07, 90);
      return;
    }
    if (name === 'drop-perfect') {
      tone(523, t0, 0.1, 'sine', 0.06);
      tone(784, t0 + 0.08, 0.14, 'sine', 0.06);
      return;
    }
    if (name === 'rotate') {
      tone(240, t0, 0.08, 'square', 0.03, 160);
      return;
    }
    if (name === 'game-over') {
      tone(330, t0, 0.18, 'sawtooth', 0.05, 180);
      tone(196, t0 + 0.16, 0.28, 'triangle', 0.05, 90);
      return;
    }
  }

  function attachToGame(game) {
    if (!game) return;
    game.playAudio = function (name) {
      play(name);
    };
    game.playBgm = function () {};
    game.pauseBgm = function () {};
    game.pauseAudio = function () {};
  }

  global.LanternStackAudio = {
    play: play,
    attachToGame: attachToGame,
  };
})(typeof window !== 'undefined' ? window : globalThis);
