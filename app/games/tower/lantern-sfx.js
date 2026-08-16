/**
 * Lantern-owned Tower sound effects.
 *
 * Original Web Audio oscillators. No donor MP3/OGG, no Caketown BGM.
 * Background music is intentionally omitted.
 */
(function (global) {
  'use strict';

  var ctx = null;

  function audioCtx() {
    if (ctx) return ctx;
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    return ctx;
  }

  function beep(freq, duration, type, gainValue) {
    var ac = audioCtx();
    if (!ac) return;
    if (ac.state === 'suspended' && typeof ac.resume === 'function') ac.resume();
    var osc = ac.createOscillator();
    var gain = ac.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.value = gainValue == null ? 0.08 : gainValue;
    osc.connect(gain);
    gain.connect(ac.destination);
    var now = ac.currentTime;
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  function play(name) {
    if (name === 'bgm') return;
    if (name === 'drop') {
      beep(180, 0.12, 'triangle', 0.07);
      return;
    }
    if (name === 'drop-perfect') {
      beep(520, 0.08, 'sine', 0.07);
      setTimeout(function () { beep(780, 0.12, 'sine', 0.06); }, 70);
      return;
    }
    if (name === 'rotate') {
      beep(240, 0.18, 'sawtooth', 0.04);
      return;
    }
    if (name === 'game-over') {
      beep(140, 0.28, 'square', 0.05);
      setTimeout(function () { beep(90, 0.32, 'square', 0.04); }, 120);
      return;
    }
    if (name === 'win') {
      beep(440, 0.1, 'sine', 0.06);
      setTimeout(function () { beep(554, 0.1, 'sine', 0.06); }, 90);
      setTimeout(function () { beep(659, 0.16, 'sine', 0.07); }, 180);
    }
  }

  function attach(game) {
    if (!game || typeof game.playAudio !== 'function') return;
    game.playAudio = function (name) {
      play(name);
    };
    game.playBgm = function () {};
    game.pauseBgm = function () {};
  }

  global.LanternTowerSfx = {
    play: play,
    attach: attach,
    silentUrl: '',
  };
})(typeof window !== 'undefined' ? window : globalThis);
