/**
 * Shared C-major result-race audio (Web Audio API only).
 * Enhancement only — results never depend on sound.
 * Prompt #228
 */
(function (global) {
  'use strict';

  var PREF_KEY = 'lantern.raceSound.muted';
  var C_MAJOR_HZ = [261.626, 293.665, 329.628, 349.228, 391.995, 440.0, 493.883, 523.251];
  var ctx = null;
  var lastDegree = -1;
  var raceActive = false;
  var finishedChimePlayed = false;

  function prefersReducedMotion() {
    try {
      return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) {
      return false;
    }
  }

  function readMuted() {
    try {
      var ls = global.localStorage;
      if (!ls) return false;
      return ls.getItem(PREF_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function writeMuted(on) {
    try {
      var ls = global.localStorage;
      if (!ls) return;
      ls.setItem(PREF_KEY, on ? '1' : '0');
    } catch (e) {}
  }

  function isMuted() {
    return readMuted();
  }

  function setMuted(on) {
    writeMuted(!!on);
    if (on) stopRace();
  }

  function audioAllowed() {
    return !isMuted() && !prefersReducedMotion();
  }

  function ensureFromGesture() {
    if (ctx) {
      if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
        try {
          ctx.resume();
        } catch (e) {}
      }
      return ctx;
    }
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch (e) {
      ctx = null;
      return null;
    }
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      try {
        ctx.resume();
      } catch (e2) {}
    }
    return ctx;
  }

  function clampPct(n) {
    var v = Math.round(Number(n) || 0);
    if (v < 0) return 0;
    if (v > 100) return 100;
    return v;
  }

  function degreeForProgress(grownPct) {
    return Math.max(0, Math.min(7, Math.round((clampPct(grownPct) / 100) * 7)));
  }

  function pluck(freq, opts) {
    opts = opts || {};
    if (!ctx || !audioAllowed()) return;
    var now = ctx.currentTime;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    var filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1800;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    var amp = typeof opts.amp === 'number' ? opts.amp : 0.045;
    if (amp < 0.012) amp = 0.012;
    if (amp > 0.09) amp = 0.09;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(amp, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (opts.dur || 0.16));
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + (opts.dur || 0.18));
  }

  function startRace() {
    raceActive = true;
    lastDegree = -1;
    finishedChimePlayed = false;
    if (!audioAllowed()) return;
    ensureFromGesture();
    pluck(C_MAJOR_HZ[0], { amp: 0.03, dur: 0.12 });
    lastDegree = 0;
  }

  function setProgress(grownPct, meta) {
    if (!raceActive || !audioAllowed() || !ctx) return;
    var deg = degreeForProgress(grownPct);
    if (deg <= lastDegree) return;
    lastDegree = deg;
    var active = meta && typeof meta.activeCount === 'number' ? meta.activeCount : 1;
    var amp = 0.028 + Math.min(4, Math.max(1, active)) * 0.007;
    pluck(C_MAJOR_HZ[deg], { amp: amp, dur: 0.14 });
  }

  function playFinishChime() {
    if (finishedChimePlayed || !audioAllowed() || !ctx) return;
    finishedChimePlayed = true;
    var now = ctx.currentTime;
    [523.251, 392.0, 523.251].forEach(function (freq, i) {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      var t = now + i * 0.07;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.035, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.24);
    });
  }

  function finishRace() {
    if (!raceActive) return;
    playFinishChime();
    raceActive = false;
  }

  function playSparkle() {
    if (!audioAllowed()) return;
    ensureFromGesture();
    if (!ctx) return;
    var now = ctx.currentTime;
    [659.255, 783.991, 987.767].forEach(function (freq, i) {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      var t = now + i * 0.05;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.04, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    });
  }

  function stopRace() {
    raceActive = false;
    lastDegree = -1;
  }

  function muteControlHtml() {
    return (
      '<button type="button" class="lanternRaceSoundBtn" data-race-sound-btn="1" aria-pressed="false" aria-label="Mute race sound">' +
      '<span class="lanternRaceSoundBtnIcon" aria-hidden="true">♪</span>' +
      '<span class="lanternRaceSoundBtnLabel">Sound</span>' +
      '</button>'
    );
  }

  function syncMuteButton(btn) {
    if (!btn) return;
    var muted = isMuted();
    btn.setAttribute('aria-pressed', muted ? 'true' : 'false');
    btn.setAttribute('aria-label', muted ? 'Unmute race sound' : 'Mute race sound');
    btn.classList.toggle('is-muted', muted);
    var lab = btn.querySelector('.lanternRaceSoundBtnLabel');
    if (lab) lab.textContent = muted ? 'Muted' : 'Sound';
  }

  function bindMuteControl(root) {
    if (!root) return;
    var btns = root.querySelectorAll('[data-race-sound-btn]');
    for (var i = 0; i < btns.length; i++) {
      (function (btn) {
        syncMuteButton(btn);
        btn.addEventListener('click', function (e) {
          if (e && e.preventDefault) e.preventDefault();
          if (e && e.stopPropagation) e.stopPropagation();
          setMuted(!isMuted());
          var scope = root.ownerDocument || global.document;
          var all = scope ? scope.querySelectorAll('[data-race-sound-btn]') : [btn];
          for (var j = 0; j < all.length; j++) syncMuteButton(all[j]);
        });
      })(btns[i]);
    }
  }

  function applyFloatMuteStyles(tb) {
    if (!tb || !tb.style) return;
    tb.style.position = 'absolute';
    tb.style.top = '0';
    tb.style.right = '0';
    tb.style.left = 'auto';
    tb.style.bottom = 'auto';
    tb.style.margin = '0';
    tb.style.width = 'auto';
    tb.style.height = 'auto';
  }

  function findFloatingMuteToolbar(root) {
    if (!root || !root.querySelector) return null;
    return (
      root.querySelector('[data-race-sound-float]') ||
      root.querySelector('[data-rx-sound-float]') ||
      null
    );
  }

  /**
   * Out-of-flow Sound/mute control. Must not add document-flow height.
   * opts: { extraClass, mark, searchRoot }
   */
  function attachFloatingMuteToolbar(panel, opts) {
    if (!panel) return null;
    opts = opts || {};
    var searchRoot = opts.searchRoot || panel;
    var existing = findFloatingMuteToolbar(searchRoot) || findFloatingMuteToolbar(panel);
    if (existing) {
      if (opts.extraClass && existing.className.indexOf(opts.extraClass) === -1) {
        existing.className += ' ' + opts.extraClass;
      }
      if (opts.mark) existing.setAttribute(opts.mark, '1');
      existing.setAttribute('data-race-sound-float', '1');
      applyFloatMuteStyles(existing);
      return existing;
    }
    var doc = panel.ownerDocument || global.document;
    var tb = doc.createElement('div');
    tb.className = 'lanternRaceToolbar lanternRaceToolbar--float' + (opts.extraClass ? ' ' + opts.extraClass : '');
    tb.setAttribute('data-race-sound-float', '1');
    if (opts.mark) tb.setAttribute(opts.mark, '1');
    tb.setAttribute('aria-label', 'Race sound');
    applyFloatMuteStyles(tb);
    tb.innerHTML = muteControlHtml();
    panel.appendChild(tb);
    bindMuteControl(panel);
    return tb;
  }

  global.LANTERN_RACE_AUDIO = {
    PREF_KEY: PREF_KEY,
    C_MAJOR_HZ: C_MAJOR_HZ,
    prefersReducedMotion: prefersReducedMotion,
    isMuted: isMuted,
    setMuted: setMuted,
    ensureFromGesture: ensureFromGesture,
    startRace: startRace,
    setProgress: setProgress,
    finishRace: finishRace,
    playSparkle: playSparkle,
    stopRace: stopRace,
    degreeForProgress: degreeForProgress,
    muteControlHtml: muteControlHtml,
    bindMuteControl: bindMuteControl,
    attachFloatingMuteToolbar: attachFloatingMuteToolbar,
    applyFloatMuteStyles: applyFloatMuteStyles,
    syncMuteButton: syncMuteButton,
    audioAllowed: audioAllowed,
  };
})(typeof window !== 'undefined' ? window : self);
