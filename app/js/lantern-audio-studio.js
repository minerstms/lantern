/**
 * Lantern Create — local Audio / Song studio (front-end preview only).
 * HTMLAudioElement + Web Audio AnalyserNode. Does not upload or persist files.
 */
(function (global) {
  'use strict';

  var STYLES = ['neon-burst', 'sonic-storm', 'tunnel-beam'];
  var GLOWS = ['low', 'medium', 'high'];
  var PRESET_SWATCHES = [
    { c1: '#5ce1ff', c2: '#ff4fd8', c3: '#ffe566', bg: '#070614' },
    { c1: '#7cffb2', c2: '#3d9eff', c3: '#fff1a8', bg: '#041018' },
    { c1: '#ff7a59', c2: '#7b5cff', c3: '#66f0ff', bg: '#10061a' },
    { c1: '#ffd36a', c2: '#ff5c8a', c3: '#6affc5', bg: '#140808' },
    { c1: '#9b8cff', c2: '#3ef0ff', c3: '#ff9ad5', bg: '#080818' },
    { c1: '#ffffff', c2: '#5aa7ff', c3: '#38d07c', bg: '#0b1220' }
  ];

  var state = {
    style: 'neon-burst',
    color1: '#5ce1ff',
    color2: '#ff4fd8',
    color3: '#ffe566',
    background: '#070614',
    glow: 'medium',
    title: '',
    description: '',
    fileName: '',
    objectUrl: ''
  };

  var audioEl = null;
  var audioCtx = null;
  var sourceNode = null;
  var analyser = null;
  var freqBuf = null;
  var waveBuf = null;
  var lastBins = null;
  var rafId = 0;
  var liveCanvas = null;
  var liveWrap = null;
  var cardCanvases = [];
  var resizeObs = null;
  var hiddenHandler = null;
  var listenersBound = false;
  var disposed = true;

  function prefersReducedMotion() {
    try {
      return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (err) {
      return false;
    }
  }

  function clamp01(n) {
    n = Number(n);
    if (!isFinite(n)) return 0;
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
  }

  function hexToRgb(hex) {
    var h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (!isFinite(n)) return { r: 90, g: 167, b: 255 };
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function rgba(hex, a) {
    var c = hexToRgb(hex);
    return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + clamp01(a) + ')';
  }

  function glowBlur() {
    if (state.glow === 'high') return 22;
    if (state.glow === 'low') return 6;
    return 14;
  }

  function copyState() {
    return {
      style: state.style,
      color1: state.color1,
      color2: state.color2,
      color3: state.color3,
      background: state.background,
      glow: state.glow,
      title: state.title,
      description: state.description,
      fileName: state.fileName,
      objectUrl: state.objectUrl
    };
  }

  function applyPartial(next) {
    if (!next) return;
    if (next.style && STYLES.indexOf(next.style) >= 0) state.style = next.style;
    if (next.color1) state.color1 = String(next.color1);
    if (next.color2) state.color2 = String(next.color2);
    if (next.color3) state.color3 = String(next.color3);
    if (next.background) state.background = String(next.background);
    if (next.glow && GLOWS.indexOf(next.glow) >= 0) state.glow = next.glow;
    if (next.title != null) state.title = String(next.title);
    if (next.description != null) state.description = String(next.description);
  }

  function ensureAudioElement() {
    if (audioEl) return audioEl;
    audioEl = global.document.createElement('audio');
    audioEl.preload = 'metadata';
    audioEl.playsInline = true;
    if (typeof audioEl.setAttribute === 'function') audioEl.setAttribute('playsinline', '');
    audioEl.crossOrigin = 'anonymous';
    return audioEl;
  }

  function ensureContext() {
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    if (audioCtx && audioCtx.state !== 'closed') return audioCtx;
    audioCtx = new AC();
    return audioCtx;
  }

  function connectGraph() {
    var el = ensureAudioElement();
    var ctx = ensureContext();
    if (!ctx || !el) return;
    if (sourceNode) return;
    analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = prefersReducedMotion() ? 0.88 : 0.72;
    freqBuf = new Uint8Array(analyser.frequencyBinCount);
    waveBuf = new Uint8Array(analyser.fftSize);
    try {
      sourceNode = ctx.createMediaElementSource(el);
      sourceNode.connect(analyser);
      analyser.connect(ctx.destination);
    } catch (err) {
      sourceNode = null;
    }
  }

  function disconnectGraph() {
    try {
      if (sourceNode) sourceNode.disconnect();
    } catch (err) {}
    try {
      if (analyser) analyser.disconnect();
    } catch (err) {}
    sourceNode = null;
    analyser = null;
    freqBuf = null;
    waveBuf = null;
  }

  function closeContext() {
    disconnectGraph();
    if (audioCtx && audioCtx.state !== 'closed') {
      try {
        audioCtx.close();
      } catch (err) {}
    }
    audioCtx = null;
  }

  function revokeObjectUrl() {
    if (state.objectUrl && state.objectUrl.indexOf('blob:') === 0) {
      try {
        URL.revokeObjectURL(state.objectUrl);
      } catch (err) {}
    }
    state.objectUrl = '';
    state.fileName = '';
  }

  function stopRaf() {
    if (rafId) {
      global.cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  function readAnalyser() {
    if (!analyser || !freqBuf || !waveBuf) return null;
    analyser.getByteFrequencyData(freqBuf);
    analyser.getByteTimeDomainData(waveBuf);
    var bass = 0;
    var mid = 0;
    var high = 0;
    var i;
    var n = freqBuf.length;
    var bEnd = Math.max(1, Math.floor(n * 0.12));
    var mEnd = Math.max(bEnd + 1, Math.floor(n * 0.45));
    for (i = 0; i < bEnd; i++) bass += freqBuf[i];
    for (i = bEnd; i < mEnd; i++) mid += freqBuf[i];
    for (i = mEnd; i < n; i++) high += freqBuf[i];
    bass = bass / (bEnd * 255);
    mid = mid / ((mEnd - bEnd) * 255);
    high = high / ((n - mEnd) * 255);
    var peak = 0;
    for (i = 0; i < waveBuf.length; i++) {
      var v = Math.abs(waveBuf[i] - 128) / 128;
      if (v > peak) peak = v;
    }
    lastBins = {
      freq: freqBuf,
      wave: waveBuf,
      bass: clamp01(bass),
      mid: clamp01(mid),
      high: clamp01(high),
      amp: clamp01((bass * 0.5 + mid * 0.3 + high * 0.2 + peak * 0.35) / 1.15)
    };
    return lastBins;
  }

  function poseFromName(name) {
    var s = String(name || state.title || 'lantern');
    var seed = 0;
    for (var i = 0; i < s.length; i++) seed = (seed * 33 + s.charCodeAt(i)) >>> 0;
    var freq = new Uint8Array(128);
    var wave = new Uint8Array(256);
    for (var f = 0; f < freq.length; f++) {
      var t = f / freq.length;
      var wobble = Math.sin((seed % 17) + t * 18) * 0.5 + 0.5;
      freq[f] = Math.round(40 + (1 - t) * 150 * wobble + ((seed >> (f % 8)) & 15) * 3);
    }
    for (var w = 0; w < wave.length; w++) {
      wave[w] = 128 + Math.round(Math.sin(w * 0.11 + (seed % 9)) * 36);
    }
    return {
      freq: freq,
      wave: wave,
      bass: 0.42 + ((seed % 20) / 80),
      mid: 0.38 + (((seed >> 4) % 20) / 90),
      high: 0.28 + (((seed >> 8) % 20) / 100),
      amp: 0.46
    };
  }

  function bandsOrPose() {
    return lastBins || poseFromName(state.fileName || state.title);
  }

  function sizeCanvas(canvas) {
    if (!canvas) return { w: 0, h: 0, dpr: 1 };
    var wrap = canvas.parentElement || canvas;
    var cssW = Math.max(1, wrap.clientWidth || canvas.clientWidth || 320);
    var cssH = Math.max(1, wrap.clientHeight || canvas.clientHeight || Math.round(cssW * 9 / 16));
    var dpr = Math.min(2, global.devicePixelRatio || 1);
    var bw = Math.round(cssW * dpr);
    var bh = Math.round(cssH * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    return { w: bw, h: bh, dpr: dpr };
  }

  function drawNeonBurst(g, w, h, bins, reduced) {
    g.fillStyle = state.background;
    g.fillRect(0, 0, w, h);
    var pulse = 0.08 + bins.bass * (reduced ? 0.08 : 0.22);
    g.fillStyle = rgba(state.color2, pulse);
    g.fillRect(0, 0, w, h);
    var n = bins.freq.length;
    var midY = h * 0.52;
    var barW = w / n;
    g.save();
    g.shadowBlur = reduced ? 4 : glowBlur();
    g.shadowColor = state.color1;
    for (var i = 0; i < n; i++) {
      var mag = bins.freq[i] / 255;
      var bh = mag * h * 0.46;
      var x = i * barW;
      g.fillStyle = i % 3 === 0 ? state.color1 : i % 3 === 1 ? state.color2 : state.color3;
      g.globalAlpha = 0.55 + mag * 0.45;
      g.fillRect(x, midY - bh, Math.max(1, barW - 1), bh);
      g.fillRect(x, midY, Math.max(1, barW - 1), bh * 0.72);
    }
    g.restore();
    g.globalAlpha = 1;
    g.strokeStyle = rgba(state.color3, 0.55);
    g.lineWidth = Math.max(2, w * 0.004);
    g.beginPath();
    g.arc(w * 0.5, midY, h * (0.12 + bins.amp * 0.1), 0, Math.PI * 2);
    g.stroke();
  }

  function drawSonicStorm(g, w, h, bins, reduced) {
    g.fillStyle = state.background;
    g.fillRect(0, 0, w, h);
    var grd = g.createRadialGradient(w * 0.5, h * 0.45, 8, w * 0.5, h * 0.5, h * 0.7);
    grd.addColorStop(0, rgba(state.color2, 0.18 + bins.mid * 0.25));
    grd.addColorStop(1, rgba(state.background, 0.15));
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);

    g.save();
    g.shadowBlur = reduced ? 3 : glowBlur();
    g.shadowColor = state.color1;
    g.strokeStyle = state.color1;
    g.lineWidth = Math.max(2, h * 0.01);
    g.beginPath();
    var wave = bins.wave;
    for (var i = 0; i < wave.length; i++) {
      var x = (i / (wave.length - 1)) * w;
      var y = h * 0.38 + ((wave[i] - 128) / 128) * h * 0.22;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
    g.restore();

    var n = Math.min(64, bins.freq.length);
    var barW = w / n;
    for (var b = 0; b < n; b++) {
      var mag = bins.freq[b] / 255;
      g.fillStyle = rgba(b % 2 ? state.color3 : state.color2, 0.35 + mag * 0.5);
      g.fillRect(b * barW, h - mag * h * 0.34, Math.max(1, barW - 1), mag * h * 0.34);
    }

    if (!reduced) {
      var sparks = 18 + Math.round(bins.high * 22);
      g.fillStyle = state.color3;
      for (var s = 0; s < sparks; s++) {
        var px = ((s * 97 + bins.amp * 180) % 1) * w;
        px = ((s * 73 + Math.round(bins.high * 400)) % w);
        var py = h * 0.2 + ((s * 41 + Math.round(bins.mid * 200)) % Math.round(h * 0.45));
        g.globalAlpha = 0.35 + bins.high * 0.5;
        g.beginPath();
        g.arc(px, py, 1.2 + bins.amp * 2.4, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    }
  }

  function drawTunnelBeam(g, w, h, bins, reduced) {
    g.fillStyle = state.background;
    g.fillRect(0, 0, w, h);
    var cx = w * 0.5;
    var cy = h * 0.52;
    var rings = reduced ? 7 : 12;
    g.save();
    g.translate(cx, cy);
    g.lineWidth = Math.max(2, w * 0.006);
    for (var r = rings; r >= 1; r--) {
      var t = r / rings;
      var rad = (0.08 + t * 0.72 + bins.bass * 0.06) * Math.min(w, h);
      g.strokeStyle = rgba(r % 3 === 0 ? state.color1 : r % 3 === 1 ? state.color2 : state.color3, 0.18 + (1 - t) * 0.45);
      g.shadowBlur = reduced ? 2 : glowBlur() * (1 - t);
      g.shadowColor = state.color1;
      g.beginPath();
      g.ellipse(0, 0, rad, rad * 0.42, 0, 0, Math.PI * 2);
      g.stroke();
    }
    var beams = 8;
    g.globalAlpha = 0.22 + bins.high * 0.28;
    for (var k = 0; k < beams; k++) {
      var ang = (k / beams) * Math.PI * 2 + bins.mid * 0.6;
      g.strokeStyle = k % 2 ? state.color2 : state.color3;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(Math.cos(ang) * w, Math.sin(ang) * h * 0.42);
      g.stroke();
    }
    g.restore();
    g.globalAlpha = 1;
    var core = 8 + bins.amp * (reduced ? 10 : 22);
    var cg = g.createRadialGradient(cx, cy, 0, cx, cy, core * 4);
    cg.addColorStop(0, rgba(state.color3, 0.85));
    cg.addColorStop(1, rgba(state.background, 0));
    g.fillStyle = cg;
    g.beginPath();
    g.arc(cx, cy, core * 4, 0, Math.PI * 2);
    g.fill();
  }

  function paintFrame(canvas, bins) {
    if (!canvas) return;
    var dim = sizeCanvas(canvas);
    if (dim.w < 2 || dim.h < 2) return;
    var g = canvas.getContext('2d');
    if (!g) return;
    var reduced = prefersReducedMotion();
    if (state.style === 'sonic-storm') drawSonicStorm(g, dim.w, dim.h, bins, reduced);
    else if (state.style === 'tunnel-beam') drawTunnelBeam(g, dim.w, dim.h, bins, reduced);
    else drawNeonBurst(g, dim.w, dim.h, bins, reduced);
  }

  function renderCardArt(canvas, opts) {
    opts = opts || {};
    if (!canvas) return '';
    if (opts.state) applyPartial(opts.state);
    var bins = opts.bins || lastBins || poseFromName(opts.fileName || state.fileName);
    var w = opts.width || 1280;
    var h = opts.height || 720;
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    var g = canvas.getContext('2d');
    if (!g) return '';
    var reduced = true;
    if (state.style === 'sonic-storm') drawSonicStorm(g, w, h, bins, reduced);
    else if (state.style === 'tunnel-beam') drawTunnelBeam(g, w, h, bins, reduced);
    else drawNeonBurst(g, w, h, bins, reduced);
    g.fillStyle = rgba(state.color3, 0.92);
    g.font = '700 ' + Math.round(h * 0.07) + 'px system-ui, sans-serif';
    g.textAlign = 'left';
    var label = String(opts.title || state.title || 'Audio / Song').slice(0, 42);
    g.fillText(label, w * 0.05, h * 0.9);
    try {
      return canvas.toDataURL('image/png');
    } catch (err) {
      return '';
    }
  }

  function refreshCardCanvases() {
    var bins = bandsOrPose();
    for (var i = 0; i < cardCanvases.length; i++) {
      if (cardCanvases[i] && cardCanvases[i].isConnected !== false) {
        renderCardArt(cardCanvases[i], { bins: bins, title: state.title });
      }
    }
  }

  function loop() {
    rafId = 0;
    var playing = !!(audioEl && !audioEl.paused && !audioEl.ended && state.objectUrl);
    if (!playing || disposed) {
      stopRaf();
      return;
    }
    var bins = readAnalyser() || bandsOrPose();
    paintFrame(liveCanvas, bins);
    rafId = global.requestAnimationFrame(loop);
  }

  function startLoop() {
    if (disposed) return;
    if (rafId) return;
    rafId = global.requestAnimationFrame(loop);
  }

  function syncCanvasResolution() {
    if (liveCanvas) sizeCanvas(liveCanvas);
    if (liveCanvas && (!audioEl || audioEl.paused)) {
      paintFrame(liveCanvas, bandsOrPose());
    }
    refreshCardCanvases();
  }

  function observeLive() {
    if (resizeObs || typeof global.ResizeObserver !== 'function') {
      if (resizeObs && liveWrap) {
        try { resizeObs.observe(liveWrap); } catch (err) {}
      }
      return;
    }
    resizeObs = new global.ResizeObserver(function () {
      syncCanvasResolution();
    });
    if (liveWrap) resizeObs.observe(liveWrap);
  }

  function bindVisibility() {
    if (listenersBound || !global.document) return;
    listenersBound = true;
    hiddenHandler = function () {
      if (global.document.hidden) {
        stopRaf();
        if (audioEl && !audioEl.paused) {
          try { audioEl.pause(); } catch (err) {}
        }
      }
    };
    global.document.addEventListener('visibilitychange', hiddenHandler);
  }

  function selectLocalFile(file) {
    if (!file) return null;
    var type = String(file.type || '').toLowerCase();
    var name = String(file.name || 'song.mp3');
    if (type && type.indexOf('audio/') !== 0 && !/\.mp3$/i.test(name)) {
      return { ok: false, error: 'Please choose an MP3 audio file.' };
    }
    revokeObjectUrl();
    if (audioEl) {
      try { audioEl.pause(); } catch (err) {}
      audioEl.removeAttribute('src');
      audioEl.load();
    }
    var url = URL.createObjectURL(file);
    state.objectUrl = url;
    state.fileName = name;
    var el = ensureAudioElement();
    el.src = url;
    connectGraph();
    disposed = false;
    bindVisibility();
    lastBins = poseFromName(name);
    refreshCardCanvases();
    if (liveCanvas) paintFrame(liveCanvas, lastBins);
    return { ok: true, objectUrl: url, fileName: name };
  }

  function play() {
    var el = ensureAudioElement();
    var ctx = ensureContext();
    if (ctx && ctx.state === 'suspended') {
      try { ctx.resume(); } catch (err) {}
    }
    connectGraph();
    disposed = false;
    return el.play().then(function () {
      startLoop();
      return true;
    }).catch(function () {
      return false;
    });
  }

  function pause() {
    if (audioEl) {
      try { audioEl.pause(); } catch (err) {}
    }
    stopRaf();
    if (liveCanvas) paintFrame(liveCanvas, bandsOrPose());
  }

  function attachLiveCanvas(canvas, wrap) {
    liveCanvas = canvas || null;
    liveWrap = wrap || (canvas && canvas.parentElement) || null;
    disposed = false;
    observeLive();
    syncCanvasResolution();
    if (audioEl && !audioEl.paused) startLoop();
    else if (liveCanvas) paintFrame(liveCanvas, bandsOrPose());
  }

  function attachCardCanvas(canvas) {
    if (!canvas) return;
    if (cardCanvases.indexOf(canvas) < 0) cardCanvases.push(canvas);
    renderCardArt(canvas, { title: state.title });
  }

  function detachCardCanvas(canvas) {
    cardCanvases = cardCanvases.filter(function (c) { return c !== canvas; });
  }

  function randomizeColors() {
    var pick = PRESET_SWATCHES[Math.floor(Math.random() * PRESET_SWATCHES.length)];
    state.color1 = pick.c1;
    state.color2 = pick.c2;
    state.color3 = pick.c3;
    state.background = pick.bg;
    refreshCardCanvases();
    if (liveCanvas) paintFrame(liveCanvas, bandsOrPose());
    return copyState();
  }

  function formatTime(sec) {
    sec = Math.max(0, Math.floor(Number(sec) || 0));
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function dispose() {
    stopRaf();
    pause();
    if (audioEl) {
      try { audioEl.pause(); } catch (err) {}
      audioEl.removeAttribute('src');
      try { audioEl.load(); } catch (err2) {}
    }
    revokeObjectUrl();
    closeContext();
    if (resizeObs) {
      try { resizeObs.disconnect(); } catch (err) {}
      resizeObs = null;
    }
    if (hiddenHandler && global.document) {
      global.document.removeEventListener('visibilitychange', hiddenHandler);
    }
    hiddenHandler = null;
    listenersBound = false;
    liveCanvas = null;
    liveWrap = null;
    cardCanvases = [];
    lastBins = null;
    disposed = true;
  }

  global.LANTERN_AUDIO_STUDIO = {
    STYLES: STYLES,
    GLOWS: GLOWS,
    PRESET_SWATCHES: PRESET_SWATCHES,
    getState: copyState,
    setState: function (next) {
      applyPartial(next);
      refreshCardCanvases();
      if (liveCanvas) paintFrame(liveCanvas, bandsOrPose());
      return copyState();
    },
    selectLocalFile: selectLocalFile,
    play: play,
    pause: pause,
    getAudioElement: function () { return ensureAudioElement(); },
    attachLiveCanvas: attachLiveCanvas,
    attachCardCanvas: attachCardCanvas,
    detachCardCanvas: detachCardCanvas,
    renderCardArt: renderCardArt,
    randomizeColors: randomizeColors,
    formatTime: formatTime,
    syncCanvasResolution: syncCanvasResolution,
    dispose: dispose,
    usesRealAudioPath: function () {
      return !!(analyser && sourceNode && audioEl);
    },
    hasObjectUrl: function () {
      return !!(state.objectUrl && state.objectUrl.indexOf('blob:') === 0);
    }
  };
})(typeof window !== 'undefined' ? window : self);
