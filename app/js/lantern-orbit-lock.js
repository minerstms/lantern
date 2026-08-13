/**
 * Orbit Lock — original Lantern timing/precision arcade.
 *
 * Pure run logic is deterministic and testable. DOM mount is optional.
 * Paid start, run_id, and leaderboard posting stay on the shared Games contract.
 */
(function (global) {
  'use strict';

  var GAME_ID = 'orbit-lock';
  var GAME_NAME = 'Orbit Lock';
  var STARTING_LIVES = 3;
  var MAX_STAGE = 20;
  var NORMAL_POINTS = 100;
  var PERFECT_BONUS = 50;
  var STREAK_BONUS_PER = 10;
  var STREAK_BONUS_CAP = 100;
  var SCORE_MIN = 0;
  var SCORE_MAX = 6000;
  var TAU = Math.PI * 2;
  var MAX_DT_MS = 48;
  var MIN_ARC_SPAN = 0.32;
  var MIN_PERFECT_SPAN = 0.11;

  function clamp(n, lo, hi) {
    if (n < lo) return lo;
    if (n > hi) return hi;
    return n;
  }

  function wrapAngle(a) {
    var x = a % TAU;
    if (x < 0) x += TAU;
    return x;
  }

  function difficultyForStage(stage) {
    var s = clamp(Math.floor(Number(stage) || 1), 1, MAX_STAGE);
    var t = (s - 1) / (MAX_STAGE - 1);
    var arcSpan = 1.16 - t * (1.16 - MIN_ARC_SPAN);
    if (arcSpan < MIN_ARC_SPAN) arcSpan = MIN_ARC_SPAN;
    var perfectSpan = clamp(arcSpan * 0.28, MIN_PERFECT_SPAN, arcSpan * 0.42);
    var speed = 1.12 + t * 1.78;
    var reverse = s >= 8 && (s - 8) % 3 === 0;
    return {
      stage: s,
      arcSpan: arcSpan,
      perfectSpan: perfectSpan,
      speed: speed,
      reverse: reverse,
    };
  }

  function scoreLock(isPerfect, streakBefore) {
    var streak = Math.max(0, Math.floor(Number(streakBefore) || 0)) + 1;
    var points = NORMAL_POINTS;
    if (isPerfect) points += PERFECT_BONUS;
    var streakBonus = Math.min(STREAK_BONUS_CAP, Math.max(0, streak - 1) * STREAK_BONUS_PER);
    points += streakBonus;
    return { points: points, streak: streak, streakBonus: streakBonus };
  }

  function maxPracticalScore() {
    var total = 0;
    var streak = 0;
    for (var i = 0; i < MAX_STAGE; i++) {
      var scored = scoreLock(true, streak);
      streak = scored.streak;
      total += scored.points;
    }
    return total;
  }

  function isInsideArc(angle, start, span) {
    var a = wrapAngle(angle - start);
    return a >= 0 && a <= span;
  }

  function isPerfectLock(angle, start, span, perfectSpan) {
    var mid = start + span / 2;
    var half = perfectSpan / 2;
    return isInsideArc(angle, wrapAngle(mid - half), perfectSpan);
  }

  function classifyLock(angle, targetStart, targetSpan, perfectSpan) {
    if (isPerfectLock(angle, targetStart, targetSpan, perfectSpan)) return 'perfect';
    if (isInsideArc(angle, targetStart, targetSpan)) return 'hit';
    return 'miss';
  }

  function createRun(opts) {
    opts = opts || {};
    var rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
    var run = {
      lives: STARTING_LIVES,
      score: 0,
      stage: 1,
      streak: 0,
      ended: false,
      win: false,
      angle: wrapAngle(rng() * TAU),
      direction: 1,
      speed: 0,
      targetStart: 0,
      targetSpan: 0,
      perfectSpan: 0,
      lastResult: null,
    };
    placeTarget(run, rng);
    return run;
  }

  function placeTarget(run, rng) {
    if (!run || run.ended) return run;
    var roll = typeof rng === 'function' ? rng : Math.random;
    var d = difficultyForStage(run.stage);
    run.targetSpan = d.arcSpan;
    run.perfectSpan = d.perfectSpan;
    run.speed = d.speed;
    if (d.reverse) run.direction *= -1;
    var marker = wrapAngle(run.angle);
    var start = wrapAngle(roll() * TAU);
    var guard = 0;
    while (guard < 16 && isInsideArc(marker, start, run.targetSpan)) {
      start = wrapAngle(marker + Math.PI * (0.55 + roll() * 0.9));
      guard++;
    }
    if (isInsideArc(marker, start, run.targetSpan)) {
      start = wrapAngle(marker + Math.PI);
    }
    run.targetStart = start;
    return run;
  }

  function tick(run, dtMs) {
    if (!run || run.ended) return run;
    var dt = Number(dtMs);
    if (!Number.isFinite(dt) || dt <= 0) return run;
    if (dt > MAX_DT_MS) dt = MAX_DT_MS;
    run.angle = wrapAngle(run.angle + run.direction * run.speed * (dt / 1000));
    return run;
  }

  function attemptLock(run, opts) {
    opts = opts || {};
    if (!run) return { type: 'invalid' };
    if (run.ended) return { type: 'ended', run: run };
    var kind = classifyLock(run.angle, run.targetStart, run.targetSpan, run.perfectSpan);
    var rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
    if (kind === 'miss') {
      run.streak = 0;
      run.lives -= 1;
      run.lastResult = 'miss';
      if (run.lives <= 0) {
        run.lives = 0;
        run.ended = true;
        run.win = false;
        return { type: 'gameover', lives: 0, score: run.score, stage: run.stage, run: run };
      }
      return { type: 'miss', lives: run.lives, score: run.score, stage: run.stage, run: run };
    }
    var scored = scoreLock(kind === 'perfect', run.streak);
    run.streak = scored.streak;
    run.score = clamp(run.score + scored.points, SCORE_MIN, SCORE_MAX);
    run.lastResult = kind;
    if (run.stage >= MAX_STAGE) {
      run.ended = true;
      run.win = true;
      return {
        type: 'complete',
        perfect: kind === 'perfect',
        points: scored.points,
        score: run.score,
        stage: run.stage,
        lives: run.lives,
        run: run,
      };
    }
    run.stage += 1;
    placeTarget(run, rng);
    return {
      type: kind,
      perfect: kind === 'perfect',
      points: scored.points,
      score: run.score,
      stage: run.stage,
      lives: run.lives,
      streak: run.streak,
      run: run,
    };
  }

  function livesGlyphs(lives) {
    var n = clamp(Math.floor(Number(lives) || 0), 0, STARTING_LIVES);
    var out = '';
    var i;
    for (i = 0; i < STARTING_LIVES; i++) out += i < n ? '●' : '○';
    return out;
  }

  var activeMount = null;

  function prefersReducedMotionNow() {
    try {
      return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) {
      return false;
    }
  }

  function setText(node, text) {
    if (node) node.textContent = text;
  }

  function sizeCanvas(canvas) {
    if (!canvas) return 1;
    var wrap = canvas.parentNode;
    var cssW = wrap && wrap.clientWidth ? wrap.clientWidth : canvas.clientWidth || 320;
    var cssH = wrap && wrap.clientHeight ? wrap.clientHeight : canvas.clientHeight || 320;
    var side = Math.max(160, Math.min(cssW, cssH));
    var dpr = global.devicePixelRatio || 1;
    if (dpr > 2.5) dpr = 2.5;
    if (dpr < 1) dpr = 1;
    canvas.style.width = side + 'px';
    canvas.style.height = side + 'px';
    canvas.width = Math.floor(side * dpr);
    canvas.height = Math.floor(side * dpr);
    return dpr;
  }

  function drawRun(canvas, run, flash, reducedMotion) {
    if (!canvas || !run) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var w = canvas.width;
    var h = canvas.height;
    var cx = w / 2;
    var cy = h / 2;
    var radius = Math.min(w, h) * 0.36;
    ctx.clearRect(0, 0, w, h);

    var bg = ctx.createRadialGradient(cx, cy, radius * 0.1, cx, cy, radius * 1.6);
    bg.addColorStop(0, '#102044');
    bg.addColorStop(1, '#070b16');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, TAU);
    ctx.strokeStyle = 'rgba(90, 167, 255, 0.28)';
    ctx.lineWidth = Math.max(6, radius * 0.055);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, radius, run.targetStart, run.targetStart + run.targetSpan);
    ctx.strokeStyle = flash === 'miss' ? '#ff8aa0' : '#f2c230';
    ctx.lineWidth = Math.max(10, radius * 0.1);
    ctx.lineCap = 'butt';
    ctx.stroke();

    var mid = run.targetStart + run.targetSpan / 2;
    var pHalf = run.perfectSpan / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, wrapAngle(mid - pHalf), wrapAngle(mid + pHalf));
    ctx.strokeStyle = '#fff6c2';
    ctx.lineWidth = Math.max(14, radius * 0.145);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, radius, wrapAngle(mid - 0.035), wrapAngle(mid + 0.035));
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(18, radius * 0.18);
    ctx.stroke();

    var mx = cx + Math.cos(run.angle) * radius;
    var my = cy + Math.sin(run.angle) * radius;
    if (!reducedMotion) {
      ctx.beginPath();
      ctx.arc(mx, my, Math.max(10, radius * 0.09), 0, TAU);
      ctx.fillStyle = 'rgba(90, 220, 255, 0.28)';
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(mx, my, Math.max(7, radius * 0.055), 0, TAU);
    ctx.fillStyle = '#eaf7ff';
    ctx.strokeStyle = '#5ad7ff';
    ctx.lineWidth = Math.max(3, radius * 0.02);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(4, radius * 0.03), 0, TAU);
    ctx.fillStyle = '#9ecbff';
    ctx.fill();
  }

  function updateHud(nodes, run, message) {
    if (!nodes || !run) return;
    setText(nodes.livesVal, livesGlyphs(run.lives));
    setText(nodes.scoreVal, String(run.score));
    setText(nodes.stageVal, String(run.stage));
    if (nodes.hint) {
      if (run.stage <= 2) {
        setText(nodes.hint, 'Tap, click, or press Space when the marker is inside the bright arc. The inner notch is Perfect.');
      } else if (run.stage >= 8) {
        setText(nodes.hint, 'Stay ready — later stages can reverse.');
      } else {
        setText(nodes.hint, 'Lock the bright arc. Perfect hits score more.');
      }
    }
    if (message != null) setText(nodes.feedback, message);
  }

  function stopMount() {
    if (!activeMount) return;
    if (activeMount.raf) {
      global.cancelAnimationFrame(activeMount.raf);
      activeMount.raf = 0;
    }
    activeMount.playing = false;
    activeMount = null;
  }

  function mount(root, opts) {
    opts = opts || {};
    stopMount();
    if (!root) return null;
    var canvas = root.querySelector('#orbitLockCanvas') || root.querySelector('canvas');
    var nodes = {
      livesVal: root.querySelector('#orbitLockLivesVal'),
      scoreVal: root.querySelector('#orbitLockScoreVal'),
      stageVal: root.querySelector('#orbitLockStageVal'),
      hint: root.querySelector('#orbitLockHint'),
      feedback: root.querySelector('#orbitLockFeedback'),
      playAgainRow: root.querySelector('#orbitLockPlayAgainRow'),
    };
    var reducedMotion = opts.reducedMotion != null ? !!opts.reducedMotion : prefersReducedMotionNow();
    var run = createRun({ rng: opts.rng });
    var flash = '';
    var flashUntil = 0;
    var lastTs = 0;
    var playing = true;

    function resize() {
      sizeCanvas(canvas);
      drawRun(canvas, run, flash, reducedMotion);
    }

    function finishMessage() {
      if (run.win) return 'Orbit complete! Score ' + run.score + ' · Stage ' + run.stage;
      return 'Game over · Score ' + run.score + ' · Stage ' + run.stage;
    }

    function loop(ts) {
      if (!playing || run.ended || !activeMount || activeMount.run !== run) return;
      if (!lastTs) lastTs = ts;
      var dt = ts - lastTs;
      lastTs = ts;
      tick(run, dt);
      if (flash && ts > flashUntil) flash = '';
      drawRun(canvas, run, flash, reducedMotion);
      if (activeMount && activeMount.run === run) {
        activeMount.raf = global.requestAnimationFrame(loop);
      }
    }

    function lock(ev) {
      if (!playing || run.ended) return;
      if (ev) {
        if (ev.cancelable) ev.preventDefault();
        if (ev.type === 'keydown' && ev.repeat) return;
      }
      var result = attemptLock(run, { rng: opts.rng });
      if (result.type === 'miss' || result.type === 'gameover') {
        flash = 'miss';
        flashUntil = (global.performance && performance.now ? performance.now() : Date.now()) + 180;
        updateHud(nodes, run, result.type === 'gameover' ? finishMessage() : 'Miss');
      } else if (result.type === 'perfect' || result.type === 'hit' || result.type === 'complete') {
        flash = result.perfect ? 'perfect' : 'hit';
        flashUntil = (global.performance && performance.now ? performance.now() : Date.now()) + 160;
        var msg = result.type === 'complete'
          ? finishMessage()
          : (result.perfect ? 'Perfect +' + result.points : 'Lock +' + result.points);
        updateHud(nodes, run, msg);
      }
      drawRun(canvas, run, flash, reducedMotion);
      if (typeof opts.onLock === 'function') opts.onLock(result);
      if (run.ended) {
        playing = false;
        if (activeMount) activeMount.playing = false;
        if (activeMount && activeMount.raf) {
          global.cancelAnimationFrame(activeMount.raf);
          activeMount.raf = 0;
        }
        updateHud(nodes, run, finishMessage());
        if (typeof opts.onGameOver === 'function') opts.onGameOver(run, result);
      }
    }

    if (!root._orbitLockWired) {
      root._orbitLockWired = true;
      root.addEventListener('pointerdown', function (ev) {
        if (!activeMount || activeMount.root !== root || !activeMount.playing) return;
        if (ev.target && ev.target.closest && ev.target.closest('#orbitLockPlayAgainBtn, .playAgainRow')) return;
        if (ev.pointerType === 'mouse' && ev.button != null && ev.button !== 0) return;
        activeMount.lock(ev);
      });
      if (typeof global.addEventListener === 'function') {
        global.addEventListener('keydown', function (ev) {
          if (!activeMount || activeMount.root !== root || !activeMount.playing) return;
          if (ev.target && ev.target.closest && ev.target.closest('button, input, textarea, select, a')) return;
          var key = ev && ev.key;
          if (key !== ' ' && key !== 'Enter' && key !== 'Spacebar') return;
          activeMount.lock(ev);
        });
      }
    }
    root.setAttribute('tabindex', '0');

    resize();
    updateHud(nodes, run, '');
    if (nodes.playAgainRow) nodes.playAgainRow.style.display = 'none';
    activeMount = {
      root: root,
      run: run,
      canvas: canvas,
      playing: true,
      raf: 0,
      lock: lock,
      resize: resize,
    };
    if (typeof global.addEventListener === 'function' && !root._orbitLockResizeWired) {
      root._orbitLockResizeWired = true;
      global.addEventListener('resize', function () {
        if (activeMount && activeMount.root === root) activeMount.resize();
      });
    }
    activeMount.raf = global.requestAnimationFrame(loop);
    if (typeof root.focus === 'function') {
      try { root.focus({ preventScroll: true }); } catch (e) { try { root.focus(); } catch (e2) {} }
    }
    return activeMount;
  }

  var api = {
    GAME_ID: GAME_ID,
    GAME_NAME: GAME_NAME,
    STARTING_LIVES: STARTING_LIVES,
    MAX_STAGE: MAX_STAGE,
    NORMAL_POINTS: NORMAL_POINTS,
    PERFECT_BONUS: PERFECT_BONUS,
    STREAK_BONUS_PER: STREAK_BONUS_PER,
    STREAK_BONUS_CAP: STREAK_BONUS_CAP,
    SCORE_MIN: SCORE_MIN,
    SCORE_MAX: SCORE_MAX,
    MIN_ARC_SPAN: MIN_ARC_SPAN,
    MAX_DT_MS: MAX_DT_MS,
    difficultyForStage: difficultyForStage,
    scoreLock: scoreLock,
    maxPracticalScore: maxPracticalScore,
    isInsideArc: isInsideArc,
    isPerfectLock: isPerfectLock,
    classifyLock: classifyLock,
    createRun: createRun,
    placeTarget: placeTarget,
    tick: tick,
    attemptLock: attemptLock,
    livesGlyphs: livesGlyphs,
    mount: mount,
    stop: stopMount,
  };

  global.LANTERN_ORBIT_LOCK = api;
})(typeof window !== 'undefined' ? window : globalThis);
