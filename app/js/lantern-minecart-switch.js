/**
 * Minecart Switch — original Lantern arcade game (Prompt #158 / #175 port).
 *
 * Headless simulation is exported for tests. Canvas / input / audio attach only in the browser.
 * Direct /games play never completes a Mission. Paid start and score post stay in games.html.
 * Survival score is higher-is-better. This game does not award game_win Nuggets.
 */
(function (global) {
  'use strict';

  var GAME_ID = 'minecart-switch';
  var GAME_NAME = 'Minecart Switch';
  var SCORE_MIN = 0;
  var SCORE_MAX = 15000;
  var STARTING_LIVES = 3;
  var LANE_COUNT = 3;
  var LANE_LEFT = 0;
  var LANE_CENTER = 1;
  var LANE_RIGHT = 2;

  var SPEED_MIN = 3.6;
  var SPEED_MAX = 8.8;
  var SPEED_RAMP_DISTANCE = 240;
  var SPACING_MAX = 8.6;
  var SPACING_MIN = 5.6;
  var SPAWN_LEAD = 13.2;
  var HIT_Z = 1.35;
  var SWITCH_MS = 130;
  var FIRST_SIGHT_REACTION_MS = 300;
  var LATE_SIGHT_REACTION_MS = 230;
  var BETWEEN_REACTION_MS = 90;
  var RECOVERY_MS = 850;
  var NEAR_MISS_WINDOW_MS = 280;
  var MAX_DT_MS = 50;
  var DISTANCE_POINTS = 10;
  var PASS_POINTS = 20;
  var NEAR_MISS_POINTS = 15;
  var TWO_LANE_DISTANCE = 72;
  var SEQUENCE_DISTANCE = 118;
  var FIRST_SPAWN_DISTANCE = 7.2;

  var HAZARD_TYPES = {
    ROCK: 'rock',
    BROKEN_RAIL: 'broken_rail',
    GATE: 'gate',
    WALL: 'wall',
    SIGN: 'sign',
  };

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  function clampLane(n) {
    var lane = Math.round(Number(n));
    if (!Number.isFinite(lane)) return LANE_CENTER;
    return clamp(lane, LANE_LEFT, LANE_RIGHT);
  }

  function createRng(seed) {
    var s = (Number(seed) || 1) >>> 0;
    if (!s) s = 1;
    return {
      next: function () {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
      },
      int: function (n) {
        return Math.floor(this.next() * n);
      },
      pick: function (arr) {
        return arr[this.int(arr.length)];
      },
    };
  }

  function difficultyT(distance) {
    var t = clamp(Number(distance) || 0, 0, SPEED_RAMP_DISTANCE) / SPEED_RAMP_DISTANCE;
    return t * t * (3 - 2 * t);
  }

  function currentSpeed(distance) {
    var e = difficultyT(distance);
    var speed = SPEED_MIN + (SPEED_MAX - SPEED_MIN) * e;
    return Math.min(SPEED_MAX, speed);
  }

  function currentSpacing(distance) {
    var e = difficultyT(distance);
    return SPACING_MAX - (SPACING_MAX - SPACING_MIN) * e;
  }

  function sightReactionMs(distance) {
    var e = difficultyT(distance);
    return FIRST_SIGHT_REACTION_MS + (LATE_SIGHT_REACTION_MS - FIRST_SIGHT_REACTION_MS) * e;
  }

  function maskHasSafeLane(mask) {
    var m = mask & 7;
    return m !== 7;
  }

  function safeLanesFromMask(mask) {
    var lanes = [];
    for (var i = 0; i < LANE_COUNT; i++) {
      if (((mask >> i) & 1) === 0) lanes.push(i);
    }
    return lanes;
  }

  function laneSetFromList(list) {
    var set = { 0: false, 1: false, 2: false };
    (list || []).forEach(function (l) {
      var lane = clampLane(l);
      set[lane] = true;
    });
    return set;
  }

  function setToList(set) {
    var out = [];
    for (var i = 0; i < LANE_COUNT; i++) {
      if (set[i]) out.push(i);
    }
    return out;
  }

  function maxLaneTravel(timeMs, reactionMs) {
    var usable = Math.max(0, Number(timeMs) || 0) - Math.max(0, Number(reactionMs) || 0);
    return clamp(Math.floor(usable / SWITCH_MS), 0, 2);
  }

  function reachableLanes(fromSet, timeMs, reactionMs) {
    var travel = maxLaneTravel(timeMs, reactionMs);
    var out = { 0: false, 1: false, 2: false };
    for (var lane = 0; lane < LANE_COUNT; lane++) {
      if (!fromSet[lane]) continue;
      for (var d = -travel; d <= travel; d++) {
        var n = lane + d;
        if (n >= LANE_LEFT && n <= LANE_RIGHT) out[n] = true;
      }
    }
    return out;
  }

  function intersectSafe(arriveSet, mask) {
    var out = [];
    for (var i = 0; i < LANE_COUNT; i++) {
      if (arriveSet[i] && ((mask >> i) & 1) === 0) out.push(i);
    }
    return out;
  }

  function singleLaneMasks() {
    return [1, 2, 4];
  }

  function twoLaneMasks() {
    return [3, 5, 6];
  }

  function masksForDistance(distance) {
    var masks = singleLaneMasks().slice();
    if (distance >= TWO_LANE_DISTANCE) {
      masks = masks.concat(twoLaneMasks());
      if (distance >= TWO_LANE_DISTANCE + 50) {
        masks = masks.concat(twoLaneMasks());
      }
    }
    return masks;
  }

  function pickHazardType(mask, rng) {
    var bits = 0;
    if (mask & 1) bits++;
    if (mask & 2) bits++;
    if (mask & 4) bits++;
    if (bits >= 2) return rng.next() < 0.55 ? HAZARD_TYPES.GATE : HAZARD_TYPES.WALL;
    var singles = [HAZARD_TYPES.ROCK, HAZARD_TYPES.BROKEN_RAIL, HAZARD_TYPES.GATE];
    return rng.pick(singles);
  }

  function fallbackMask(arriveSet) {
    var arrive = setToList(arriveSet);
    if (arrive.length >= 2) {
      var block = 0;
      for (var i = 0; i < LANE_COUNT; i++) {
        if (!arriveSet[i]) block |= 1 << i;
      }
      if (block === 0) block = 1 << arrive[0];
      if ((block & 7) === 7) block = 1 << arrive[0];
      return block;
    }
    if (arrive.length === 1) {
      var only = arrive[0];
      var mask = 7 ^ (1 << only);
      return mask === 7 ? 0 : mask;
    }
    return 2;
  }

  /**
   * Produce one obstacle pattern that is reachable from `fromLanes` given timing.
   * Updates ctx.reachable to the post-pattern safe set for the next row.
   */
  function generatePattern(ctx) {
    ctx = ctx || {};
    var rng = ctx.rng || createRng(1);
    var distance = Number(ctx.distance) || 0;
    var speed = Math.min(SPEED_MAX, Number(ctx.speed) || currentSpeed(distance));
    var spacing = Number(ctx.spacing) || currentSpacing(distance);
    var fromList = ctx.fromLanes && ctx.fromLanes.length ? ctx.fromLanes : setToList(ctx.reachable || { 0: false, 1: true, 2: false });
    var fromSet = laneSetFromList(fromList);
    var timeToHitMs = (SPAWN_LEAD / speed) * 1000;
    var arrive = reachableLanes(fromSet, timeToHitMs, sightReactionMs(distance));
    if (!setToList(arrive).length) {
      arrive = { 0: true, 1: true, 2: true };
    }
    var candidates = masksForDistance(distance).filter(function (mask) {
      return maskHasSafeLane(mask) && intersectSafe(arrive, mask).length > 0;
    });
    if (!candidates.length) {
      candidates = [fallbackMask(arrive)];
    }
    var mask = candidates[rng.int(candidates.length)];
    if (!maskHasSafeLane(mask) || !intersectSafe(arrive, mask).length) {
      mask = fallbackMask(arrive);
    }
    var stay = intersectSafe(arrive, mask);
    if (!stay.length) stay = safeLanesFromMask(mask);
    var timeBetweenMs = (spacing / speed) * 1000;
    ctx.reachable = reachableLanes(laneSetFromList(stay), timeBetweenMs, BETWEEN_REACTION_MS);
    ctx.fromLanes = stay;
    return {
      mask: mask,
      type: pickHazardType(mask, rng),
      safeLanes: safeLanesFromMask(mask),
      reachableAfter: setToList(ctx.reachable),
      stayLanes: stay.slice(),
    };
  }

  function generateSequence(ctx, count) {
    var n = Math.max(1, Math.floor(Number(count) || 1));
    var rows = [];
    var local = {
      rng: ctx && ctx.rng ? ctx.rng : createRng(1),
      distance: ctx && ctx.distance != null ? ctx.distance : 0,
      speed: ctx && ctx.speed,
      spacing: ctx && ctx.spacing,
      fromLanes: ctx && ctx.fromLanes ? ctx.fromLanes.slice() : [LANE_CENTER],
      reachable: ctx && ctx.reachable ? ctx.reachable : { 0: false, 1: true, 2: false },
    };
    for (var i = 0; i < n; i++) {
      local.distance += currentSpacing(local.distance);
      rows.push(generatePattern(local));
    }
    if (ctx) {
      ctx.reachable = local.reachable;
      ctx.fromLanes = local.fromLanes;
      ctx.distance = local.distance;
    }
    return rows;
  }

  function sequenceHasReachablePath(rows, startLane) {
    var lane = clampLane(startLane == null ? LANE_CENTER : startLane);
    var reachable = laneSetFromList([lane]);
    for (var i = 0; i < rows.length; i++) {
      var dist = 40 + i * 8;
      var speed = currentSpeed(dist);
      var timeMs = i === 0 ? (SPAWN_LEAD / speed) * 1000 : (currentSpacing(dist) / speed) * 1000;
      var reaction = i === 0 ? sightReactionMs(dist) : BETWEEN_REACTION_MS;
      var arrive = reachableLanes(reachable, timeMs, reaction);
      var stay = intersectSafe(arrive, rows[i].mask);
      if (!stay.length) return false;
      reachable = laneSetFromList(stay);
    }
    return true;
  }

  function computeScore(parts) {
    parts = parts || {};
    var distance = Math.max(0, Number(parts.distance) || 0);
    var passed = Math.max(0, Math.floor(Number(parts.obstaclesPassed) || 0));
    var near = Math.max(0, Math.floor(Number(parts.nearMisses) || 0));
    var raw =
      Math.floor(distance * DISTANCE_POINTS) +
      passed * PASS_POINTS +
      near * NEAR_MISS_POINTS;
    if (!Number.isFinite(raw)) return SCORE_MIN;
    return clamp(Math.floor(raw), SCORE_MIN, SCORE_MAX);
  }

  function closestSafeLane(fromLane, safe) {
    if (!safe || !safe.length) return clampLane(fromLane);
    var best = safe[0];
    var bestD = Math.abs(best - fromLane);
    for (var i = 1; i < safe.length; i++) {
      var d = Math.abs(safe[i] - fromLane);
      if (d < bestD) {
        best = safe[i];
        bestD = d;
      }
    }
    return best;
  }

  function createSim(opts) {
    opts = opts || {};
    var rng = createRng(opts.seed == null ? 15801 : opts.seed);
    var state = {
      lane: LANE_CENTER,
      visualLane: LANE_CENTER,
      switchFrom: LANE_CENTER,
      switchT: 1,
      pendingDir: 0,
      lives: STARTING_LIVES,
      distance: 0,
      obstaclesPassed: 0,
      nearMisses: 0,
      score: 0,
      ended: false,
      resultSubmitted: false,
      invulnUntil: 0,
      timeMs: 0,
      lastSwitchAt: -9999,
      lastSwitchFrom: LANE_CENTER,
      nextSpawnAt: FIRST_SPAWN_DISTANCE,
      obstacles: [],
      signs: [],
      hitFlash: 0,
      shake: 0,
      closeCallUntil: 0,
      particles: [],
      lastHitObstacleId: '',
      idSeq: 1,
      reachable: { 0: false, 1: true, 2: false },
      fromLanes: [LANE_CENTER],
      events: [],
    };

    function speed() {
      return currentSpeed(state.distance);
    }

    function isInvulnerable() {
      return state.timeMs < state.invulnUntil;
    }

    function pushEvent(type, extra) {
      var ev = { type: type, t: state.timeMs };
      if (extra) {
        Object.keys(extra).forEach(function (k) {
          ev[k] = extra[k];
        });
      }
      state.events.push(ev);
      if (state.events.length > 40) state.events.shift();
      return ev;
    }

    function refreshScore() {
      state.score = computeScore({
        distance: state.distance,
        obstaclesPassed: state.obstaclesPassed,
        nearMisses: state.nearMisses,
      });
    }

    function spawnRow() {
      var ctx = {
        rng: rng,
        distance: state.distance,
        speed: speed(),
        spacing: currentSpacing(state.distance),
        fromLanes: state.fromLanes,
        reachable: state.reachable,
      };
      var count = 1;
      if (state.distance >= SEQUENCE_DISTANCE && rng.next() < 0.28) count = 2;
      var rows = generateSequence(ctx, count);
      state.reachable = ctx.reachable;
      state.fromLanes = ctx.fromLanes;
      var zBase = HIT_Z + Math.max(0.4, state.nextSpawnAt - state.distance);
      rows.forEach(function (row, idx) {
        var z = zBase + idx * currentSpacing(state.distance) * 0.92;
        var id = 'obs_' + state.idSeq++;
        state.obstacles.push({
          id: id,
          z: z,
          mask: row.mask,
          type: row.type,
          safeLanes: row.safeLanes,
          consumed: false,
          passed: false,
          nearMissAwarded: false,
        });
        if (state.distance >= 36 && rng.next() < 0.55) {
          state.signs.push({
            id: 'sign_' + id,
            z: z + 2.4,
            mask: row.mask,
            type: HAZARD_TYPES.SIGN,
          });
        }
      });
      state.nextSpawnAt += currentSpacing(state.distance) * rows.length;
    }

    function startSwitch(dir) {
      var next = clampLane(state.lane + (dir < 0 ? -1 : 1));
      if (next === state.lane) return false;
      state.lastSwitchFrom = state.lane;
      state.switchFrom = state.visualLane;
      state.lane = next;
      state.switchT = 0;
      state.lastSwitchAt = state.timeMs;
      pushEvent('switch', { lane: state.lane, from: state.lastSwitchFrom });
      return true;
    }

    function inputDir(dir) {
      if (state.ended) return false;
      dir = dir < 0 ? -1 : 1;
      if (state.switchT < 1) {
        if (!state.pendingDir) state.pendingDir = dir;
        return false;
      }
      return startSwitch(dir);
    }

    function awardNearMiss(obs) {
      if (obs.nearMissAwarded) return;
      var recent = state.timeMs - state.lastSwitchAt <= NEAR_MISS_WINDOW_MS;
      var fromBlocked = ((obs.mask >> state.lastSwitchFrom) & 1) === 1;
      if (recent && fromBlocked) {
        obs.nearMissAwarded = true;
        state.nearMisses += 1;
        state.closeCallUntil = state.timeMs + 700;
        refreshScore();
        pushEvent('near_miss', { id: obs.id });
      }
    }

    function applyHit(obs) {
      if (state.ended || obs.consumed || isInvulnerable()) return;
      obs.consumed = true;
      state.lastHitObstacleId = obs.id;
      state.lives = Math.max(0, state.lives - 1);
      state.hitFlash = 1;
      state.shake = 1;
      state.invulnUntil = state.timeMs + RECOVERY_MS;
      var safe = obs.safeLanes && obs.safeLanes.length ? obs.safeLanes : safeLanesFromMask(obs.mask);
      if (safe.indexOf(state.lane) === -1 && safe.length) {
        var snap = closestSafeLane(state.lane, safe);
        state.lane = snap;
        state.visualLane = snap;
        state.switchT = 1;
        state.pendingDir = 0;
      }
      pushEvent('hit', { lives: state.lives, id: obs.id });
      if (state.lives <= 0) {
        endRun();
      }
    }

    function endRun() {
      if (state.ended) return;
      state.ended = true;
      state.switchT = 1;
      state.pendingDir = 0;
      refreshScore();
      pushEvent('game_over', { score: state.score });
    }

    function takeResult() {
      refreshScore();
      return {
        game_id: GAME_ID,
        game_name: GAME_NAME,
        score: state.score,
        score_display: state.score + ' pts · ' + Math.floor(state.distance) + 'm',
        distance: Math.floor(state.distance),
        obstaclesPassed: state.obstaclesPassed,
        nearMisses: state.nearMisses,
        lives: state.lives,
      };
    }

    function markSubmitted() {
      if (state.resultSubmitted) return false;
      state.resultSubmitted = true;
      return true;
    }

    function step(dtMs) {
      var dt = Number(dtMs);
      if (!Number.isFinite(dt) || dt < 0) dt = 0;
      dt = Math.min(dt, MAX_DT_MS);
      if (state.ended || dt === 0) {
        refreshScore();
        return snapshot();
      }
      state.timeMs += dt;
      var dtSec = dt / 1000;
      var spd = speed();
      state.distance += spd * dtSec;

      if (state.switchT < 1) {
        state.switchT = Math.min(1, state.switchT + dt / SWITCH_MS);
        var a = state.switchT * state.switchT * (3 - 2 * state.switchT);
        state.visualLane = state.switchFrom + (state.lane - state.switchFrom) * a;
        if (state.switchT >= 1) {
          state.visualLane = state.lane;
          if (state.pendingDir) {
            var queued = state.pendingDir;
            state.pendingDir = 0;
            startSwitch(queued);
          }
        }
      } else {
        state.visualLane = state.lane;
      }

      if (state.distance + SPAWN_LEAD >= state.nextSpawnAt) {
        spawnRow();
      }

      var i;
      for (i = state.obstacles.length - 1; i >= 0; i--) {
        var obs = state.obstacles[i];
        obs.z -= spd * dtSec;
        if (!obs.passed && obs.z <= HIT_Z) {
          var blocked = ((obs.mask >> state.lane) & 1) === 1;
          if (blocked) {
            applyHit(obs);
          } else if (!obs.consumed) {
            obs.passed = true;
            state.obstaclesPassed += 1;
            awardNearMiss(obs);
            refreshScore();
            pushEvent('pass', { id: obs.id });
          }
        }
        if (obs.z < 0.15) state.obstacles.splice(i, 1);
      }

      for (i = state.signs.length - 1; i >= 0; i--) {
        state.signs[i].z -= spd * dtSec;
        if (state.signs[i].z < 0.4) state.signs.splice(i, 1);
      }

      if (state.hitFlash > 0) state.hitFlash = Math.max(0, state.hitFlash - dtSec * 2.4);
      if (state.shake > 0) state.shake = Math.max(0, state.shake - dtSec * 3.2);

      refreshScore();
      return snapshot();
    }

    function snapshot() {
      return {
        lane: state.lane,
        visualLane: state.visualLane,
        lives: state.lives,
        distance: state.distance,
        score: state.score,
        speed: speed(),
        ended: state.ended,
        resultSubmitted: state.resultSubmitted,
        invulnerable: isInvulnerable(),
        obstaclesPassed: state.obstaclesPassed,
        nearMisses: state.nearMisses,
        obstacleCount: state.obstacles.length,
        switching: state.switchT < 1,
      };
    }

    return {
      inputLeft: function () {
        return inputDir(-1);
      },
      inputRight: function () {
        return inputDir(1);
      },
      step: step,
      snapshot: snapshot,
      getState: function () {
        return state;
      },
      takeResult: takeResult,
      markSubmitted: markSubmitted,
      endRun: endRun,
      speed: speed,
    };
  }

  function prefersReducedMotion() {
    return (
      typeof global.matchMedia === 'function' &&
      global.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  function createAudio() {
    var ctx = null;
    var muted = false;
    function ensure() {
      if (muted) return null;
      if (ctx) return ctx;
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      try {
        ctx = new AC();
      } catch (e) {
        ctx = null;
      }
      return ctx;
    }
    function beep(freq, dur, type, vol) {
      var ac = ensure();
      if (!ac) return;
      if (ac.state === 'suspended' && typeof ac.resume === 'function') {
        try {
          ac.resume();
        } catch (e2) {}
      }
      var osc = ac.createOscillator();
      var gain = ac.createGain();
      osc.type = type || 'square';
      osc.frequency.value = freq;
      gain.gain.value = vol == null ? 0.05 : vol;
      osc.connect(gain);
      gain.connect(ac.destination);
      var now = ac.currentTime;
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.start(now);
      osc.stop(now + dur + 0.02);
    }
    return {
      switch: function () {
        beep(620, 0.05, 'square', 0.04);
      },
      pass: function () {
        beep(740, 0.06, 'triangle', 0.035);
      },
      near: function () {
        beep(880, 0.07, 'square', 0.045);
        setTimeout(function () {
          beep(1100, 0.06, 'square', 0.035);
        }, 60);
      },
      hit: function () {
        beep(180, 0.16, 'sawtooth', 0.05);
      },
      over: function () {
        beep(220, 0.18, 'triangle', 0.05);
        setTimeout(function () {
          beep(160, 0.22, 'triangle', 0.045);
        }, 140);
      },
      rail: function () {
        beep(140, 0.03, 'square', 0.018);
      },
      setMuted: function (v) {
        muted = !!v;
      },
    };
  }

  var host = {
    root: null,
    canvas: null,
    ctx: null,
    sim: null,
    raf: 0,
    lastTs: 0,
    hooks: null,
    bound: false,
    handlers: null,
    audio: null,
    railAcc: 0,
    reduced: false,
  };

  function el(id, root) {
    var scope = root || (host.root ? host.root : null);
    if (scope && scope.querySelector) {
      var found = scope.querySelector('#' + id);
      if (found) return found;
    }
    return global.document ? global.document.getElementById(id) : null;
  }

  function fitCanvas() {
    if (!host.canvas || !host.root) return;
    var stage = host.root.querySelector('.mcsStage') || host.root;
    var w = stage.clientWidth || 360;
    var h = stage.clientHeight || 480;
    var dpr = 1;
    if (typeof global.devicePixelRatio === 'number') {
      dpr = Math.min(global.devicePixelRatio, 2.5);
    }
    host.canvas.width = Math.max(1, Math.floor(w * dpr));
    host.canvas.height = Math.max(1, Math.floor(h * dpr));
    host.canvas.style.width = w + 'px';
    host.canvas.style.height = h + 'px';
    if (host.ctx && host.ctx.setTransform) host.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    host.viewW = w;
    host.viewH = h;
  }

  function project(lane, z, w, h) {
    var vpX = w * 0.5;
    var vpY = h * 0.2;
    var groundY = h * 0.9;
    var t = 1 / (z + 0.42);
    var tNear = 1 / (HIT_Z + 0.42);
    var tFar = 1 / (SPAWN_LEAD + 0.42);
    var p = clamp((t - tFar) / (tNear - tFar), 0, 1);
    var y = vpY + (groundY - vpY) * p;
    var spread = w * (0.12 + 0.3 * p);
    var x = vpX + (lane - 1) * spread;
    var scale = 0.16 + 0.84 * p;
    return { x: x, y: y, scale: scale, p: p, spread: spread, vpX: vpX, vpY: vpY };
  }

  function drawRails(ctx, w, h) {
    var nearL = project(0, HIT_Z, w, h);
    var nearC = project(1, HIT_Z, w, h);
    var nearR = project(2, HIT_Z, w, h);
    var far = { x: w * 0.5, y: h * 0.2 };
    function rail(a, color, width) {
      ctx.beginPath();
      ctx.moveTo(far.x, far.y);
      ctx.lineTo(a.x, a.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    rail(nearL, '#c9a24a', 3);
    rail(nearC, '#f0d36a', 4);
    rail(nearR, '#c9a24a', 3);
    var ties = 14;
    for (var i = 0; i < ties; i++) {
      var z = HIT_Z + (SPAWN_LEAD - HIT_Z) * (i / ties);
      var l = project(0, z, w, h);
      var r = project(2, z, w, h);
      ctx.globalAlpha = 0.18 + 0.35 * l.p;
      ctx.strokeStyle = '#6b4a28';
      ctx.lineWidth = 2 + 3 * l.p;
      ctx.beginPath();
      ctx.moveTo(l.x - 10 * l.p, l.y);
      ctx.lineTo(r.x + 10 * r.p, r.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawSupports(ctx, w, h, dist) {
    var spots = [3.2, 5.8, 8.6, 11.4];
    spots.forEach(function (base) {
      var z = ((base - (dist % 4.8)) + 16) % 14 + 1.6;
      var pL = project(-0.85, z, w, h);
      var pR = project(2.85, z, w, h);
      var top = h * (0.2 + 0.08 * (1 - pL.p));
      ctx.save();
      ctx.globalAlpha = 0.28 + 0.5 * pL.p;
      ctx.strokeStyle = '#8a6236';
      ctx.fillStyle = 'rgba(92, 58, 26, 0.55)';
      ctx.lineWidth = 3 + 6 * pL.p;
      ctx.beginPath();
      ctx.moveTo(pL.x, pL.y);
      ctx.lineTo(pL.x, top);
      ctx.lineTo(pR.x, top);
      ctx.lineTo(pR.x, pR.y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 196, 92, ' + (0.08 + 0.22 * pL.p) + ')';
      ctx.beginPath();
      ctx.arc((pL.x + pR.x) / 2, top + 10 * pL.p, 6 + 10 * pL.p, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  function drawHazard(ctx, obs, w, h) {
    var lanes = [];
    for (var i = 0; i < 3; i++) {
      if ((obs.mask >> i) & 1) lanes.push(i);
    }
    lanes.forEach(function (lane) {
      var p = project(lane, obs.z, w, h);
      var s = 18 + 46 * p.scale;
      ctx.save();
      ctx.translate(p.x, p.y - s * 0.15);
      ctx.globalAlpha = 0.35 + 0.65 * p.p;
      if (obs.type === HAZARD_TYPES.ROCK) {
        ctx.fillStyle = '#6d737c';
        ctx.strokeStyle = '#d8dde4';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-s * 0.45, s * 0.15);
        ctx.lineTo(-s * 0.1, -s * 0.42);
        ctx.lineTo(s * 0.28, -s * 0.28);
        ctx.lineTo(s * 0.48, s * 0.18);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#9aa3ad';
        ctx.beginPath();
        ctx.arc(-s * 0.08, -s * 0.05, s * 0.16, 0, Math.PI * 2);
        ctx.fill();
      } else if (obs.type === HAZARD_TYPES.BROKEN_RAIL) {
        ctx.strokeStyle = '#f2c14e';
        ctx.lineWidth = 3 + 2 * p.p;
        ctx.beginPath();
        ctx.moveTo(-s * 0.4, s * 0.2);
        ctx.lineTo(-s * 0.08, -s * 0.05);
        ctx.moveTo(s * 0.08, -s * 0.02);
        ctx.lineTo(s * 0.42, s * 0.22);
        ctx.stroke();
        ctx.strokeStyle = '#ff6b6b';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-s * 0.22, -s * 0.28);
        ctx.lineTo(s * 0.22, s * 0.28);
        ctx.moveTo(s * 0.22, -s * 0.28);
        ctx.lineTo(-s * 0.22, s * 0.28);
        ctx.stroke();
      } else if (obs.type === HAZARD_TYPES.GATE) {
        ctx.fillStyle = '#7a4e24';
        ctx.strokeStyle = '#e6c089';
        ctx.lineWidth = 2;
        ctx.fillRect(-s * 0.55, -s * 0.55, s * 0.16, s * 0.85);
        ctx.fillRect(s * 0.38, -s * 0.55, s * 0.16, s * 0.85);
        ctx.fillRect(-s * 0.58, -s * 0.22, s * 1.16, s * 0.2);
        ctx.strokeRect(-s * 0.58, -s * 0.22, s * 1.16, s * 0.2);
      } else {
        ctx.fillStyle = '#5a6570';
        ctx.strokeStyle = '#c5ced6';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-s * 0.7, s * 0.2);
        ctx.lineTo(-s * 0.2, -s * 0.35);
        ctx.lineTo(s * 0.15, -s * 0.18);
        ctx.lineTo(s * 0.7, s * 0.22);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    });
  }

  function drawSign(ctx, sign, w, h) {
    var lane = 1;
    if ((sign.mask & 1) && !(sign.mask & 2)) lane = 0;
    if ((sign.mask & 4) && !(sign.mask & 2) && !(sign.mask & 1)) lane = 2;
    var p = project(lane, sign.z, w, h);
    var s = 14 + 28 * p.scale;
    ctx.save();
    ctx.translate(p.x, p.y - s * 1.1);
    ctx.globalAlpha = 0.4 + 0.6 * p.p;
    ctx.fillStyle = '#1b1f28';
    ctx.strokeStyle = '#f4d35e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.7);
    ctx.lineTo(s * 0.62, 0);
    ctx.lineTo(0, s * 0.7);
    ctx.lineTo(-s * 0.62, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f4d35e';
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.28);
    ctx.lineTo(s * 0.12, s * 0.08);
    ctx.lineTo(-s * 0.12, s * 0.08);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(-s * 0.07, s * 0.18, s * 0.14, s * 0.14);
    ctx.restore();
  }

  function drawCart(ctx, visualLane, w, h, invuln, flash) {
    var p = project(visualLane, HIT_Z, w, h);
    ctx.save();
    ctx.translate(p.x, p.y - 8);
    if (invuln) ctx.globalAlpha = 0.55 + 0.45 * Math.sin(Date.now() / 70);
    var s = 26 + 10 * p.scale;
    ctx.fillStyle = flash > 0.2 ? '#ff8a8a' : '#c4542a';
    ctx.strokeStyle = '#f3d2b0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-s * 0.7, -s * 0.05);
    ctx.lineTo(-s * 0.48, -s * 0.55);
    ctx.lineTo(s * 0.48, -s * 0.55);
    ctx.lineTo(s * 0.7, -s * 0.05);
    ctx.lineTo(s * 0.55, s * 0.28);
    ctx.lineTo(-s * 0.55, s * 0.28);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#2b1a12';
    ctx.fillRect(-s * 0.38, -s * 0.42, s * 0.76, s * 0.22);
    ctx.fillStyle = '#f6c14d';
    ctx.beginPath();
    ctx.arc(0, -s * 0.72, s * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 196, 80, 0.28)';
    ctx.beginPath();
    ctx.arc(0, -s * 0.72, s * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a2f38';
    ctx.strokeStyle = '#d7dde6';
    ctx.beginPath();
    ctx.arc(-s * 0.32, s * 0.34, s * 0.16, 0, Math.PI * 2);
    ctx.arc(s * 0.32, s * 0.34, s * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawScene() {
    if (!host.ctx || !host.sim) return;
    var ctx = host.ctx;
    var w = host.viewW || 360;
    var h = host.viewH || 520;
    var snap = host.sim.snapshot();
    var st = host.sim.getState();
    var shakeX = 0;
    var shakeY = 0;
    if (st.shake > 0 && !host.reduced) {
      shakeX = (Math.random() - 0.5) * 10 * st.shake;
      shakeY = (Math.random() - 0.5) * 8 * st.shake;
    }
    ctx.save();
    ctx.translate(shakeX, shakeY);
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#07080d');
    g.addColorStop(0.22, '#1a140e');
    g.addColorStop(1, '#0b1220');
    ctx.fillStyle = g;
    ctx.fillRect(-20, -20, w + 40, h + 40);
    var glow = ctx.createRadialGradient(w * 0.5, h * 0.2, 4, w * 0.5, h * 0.28, w * 0.42);
    glow.addColorStop(0, 'rgba(255, 178, 74, 0.28)');
    glow.addColorStop(1, 'rgba(255, 178, 74, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    drawSupports(ctx, w, h, st.distance);
    drawRails(ctx, w, h);
    st.signs.forEach(function (sign) {
      drawSign(ctx, sign, w, h);
    });
    st.obstacles.forEach(function (obs) {
      drawHazard(ctx, obs, w, h);
    });
    drawCart(ctx, st.visualLane, w, h, snap.invulnerable, st.hitFlash);
    if (st.hitFlash > 0) {
      ctx.fillStyle = 'rgba(255, 90, 90, ' + (0.18 * st.hitFlash) + ')';
      ctx.fillRect(0, 0, w, h);
    }
    if (st.closeCallUntil > st.timeMs) {
      ctx.fillStyle = 'rgba(255, 214, 102, 0.92)';
      ctx.font = '700 24px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Close Call!', w / 2, h * 0.36);
    }
    ctx.restore();
  }

  function paintHud() {
    if (!host.sim || !host.root) return;
    var snap = host.sim.snapshot();
    var scoreEl = el('mcsScore', host.root);
    var distEl = el('mcsDist', host.root);
    var livesEl = el('mcsLives', host.root);
    if (scoreEl) scoreEl.textContent = String(snap.score);
    if (distEl) distEl.textContent = String(Math.floor(snap.distance)) + 'm';
    if (livesEl) {
      var dots = '';
      for (var i = 0; i < STARTING_LIVES; i++) {
        dots += i < snap.lives ? '●' : '○';
      }
      livesEl.textContent = dots;
      livesEl.setAttribute('aria-label', snap.lives + ' lives');
    }
  }

  function showGameOver() {
    if (!host.sim || !host.root) return;
    var result = host.sim.takeResult();
    var over = el('mcsOver', host.root);
    var scoreEl = el('mcsOverScore', host.root);
    var distEl = el('mcsOverDist', host.root);
    var hint = el('mcsHint', host.root);
    if (scoreEl) scoreEl.textContent = String(result.score);
    if (distEl) distEl.textContent = String(result.distance) + 'm · ' + result.obstaclesPassed + ' clear';
    if (over) {
      over.hidden = false;
      over.removeAttribute('hidden');
    }
    if (hint) hint.hidden = true;
    if (host.hooks && typeof host.hooks.onGameOver === 'function' && host.sim.markSubmitted()) {
      host.hooks.onGameOver(result);
    }
  }

  function loop(ts) {
    if (!host.sim) return;
    if (!host.lastTs) host.lastTs = ts;
    var dt = ts - host.lastTs;
    host.lastTs = ts;
    var before = host.sim.snapshot();
    host.sim.step(dt);
    var after = host.sim.snapshot();
    if (host.audio && after.obstaclesPassed > before.obstaclesPassed) host.audio.pass();
    if (host.audio && after.nearMisses > before.nearMisses) host.audio.near();
    if (host.audio && after.lives < before.lives) host.audio.hit();
    host.railAcc += dt;
    if (host.audio && host.railAcc > 220) {
      host.railAcc = 0;
      if (!after.ended) host.audio.rail();
    }
    drawScene();
    paintHud();
    if (after.ended) {
      if (!before.ended && host.audio) host.audio.over();
      var overEl = host.root ? el('mcsOver', host.root) : null;
      if (overEl && overEl.hidden) showGameOver();
    } else {
      host.raf = global.requestAnimationFrame(loop);
    }
  }

  function bindInput(root) {
    if (host.bound) return;
    host.bound = true;
    host.reduced = prefersReducedMotion();
    var touchStartX = 0;
    var touchStartY = 0;
    var gestureUsed = false;
    var inputLockUntil = 0;
    function acceptInput() {
      var now = Date.now();
      if (now < inputLockUntil) return false;
      inputLockUntil = now + 90;
      return true;
    }
    function left(e) {
      if (e && e.preventDefault) e.preventDefault();
      // Ignore the synthetic click that follows a swipe so one gesture cannot skip a lane.
      if (e && e.type === 'click' && gestureUsed) return;
      if (!acceptInput()) return;
      if (host.sim) {
        var moved = host.sim.inputLeft();
        if (moved && host.audio) host.audio.switch();
      }
    }
    function right(e) {
      if (e && e.preventDefault) e.preventDefault();
      if (e && e.type === 'click' && gestureUsed) return;
      if (!acceptInput()) return;
      if (host.sim) {
        var moved = host.sim.inputRight();
        if (moved && host.audio) host.audio.switch();
      }
    }
    function onKey(e) {
      if (!host.sim || host.sim.snapshot().ended) return;
      if (e.repeat) return;
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        left();
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        right();
      }
    }
    function onTouchStart(e) {
      if (!e.changedTouches || !e.changedTouches[0]) return;
      touchStartX = e.changedTouches[0].clientX;
      touchStartY = e.changedTouches[0].clientY;
      gestureUsed = false;
    }
    function onTouchEnd(e) {
      if (!e.changedTouches || !e.changedTouches[0] || gestureUsed) return;
      var dx = e.changedTouches[0].clientX - touchStartX;
      var dy = e.changedTouches[0].clientY - touchStartY;
      if (Math.abs(dx) < 36 || Math.abs(dx) < Math.abs(dy)) return;
      gestureUsed = true;
      if (e.preventDefault) e.preventDefault();
      if (dx < 0) left();
      else right();
    }
    function onTouchMove(e) {
      if (e && e.cancelable && e.preventDefault) e.preventDefault();
    }
    var tapL = el('mcsTapLeft', root);
    var tapR = el('mcsTapRight', root);
    if (tapL) tapL.addEventListener('click', left);
    if (tapR) tapR.addEventListener('click', right);
    root.addEventListener('touchstart', onTouchStart, { passive: false });
    root.addEventListener('touchend', onTouchEnd, { passive: false });
    root.addEventListener('touchmove', onTouchMove, { passive: false });
    global.document.addEventListener('keydown', onKey);
    host.handlers = {
      onKey: onKey,
      onTouchStart: onTouchStart,
      onTouchEnd: onTouchEnd,
      onTouchMove: onTouchMove,
      left: left,
      right: right,
    };
    host.resizeHandler = function () {
      fitCanvas();
      drawScene();
    };
    global.addEventListener('resize', host.resizeHandler);
  }

  function unbindInput() {
    if (!host.bound || !host.handlers || !host.root) {
      host.bound = false;
      return;
    }
    var root = host.root;
    root.removeEventListener('touchstart', host.handlers.onTouchStart);
    root.removeEventListener('touchend', host.handlers.onTouchEnd);
    root.removeEventListener('touchmove', host.handlers.onTouchMove);
    if (global.document) global.document.removeEventListener('keydown', host.handlers.onKey);
    if (host.resizeHandler) global.removeEventListener('resize', host.resizeHandler);
    host.bound = false;
    host.handlers = null;
  }

  function stopLoop() {
    if (host.raf && global.cancelAnimationFrame) {
      global.cancelAnimationFrame(host.raf);
    }
    host.raf = 0;
    host.lastTs = 0;
  }

  function startRun() {
    stopLoop();
    host.sim = createSim({ seed: Date.now() % 100000 });
    host.audio = host.audio || createAudio();
    host.railAcc = 0;
    var over = host.root ? el('mcsOver', host.root) : null;
    var hint = host.root ? el('mcsHint', host.root) : null;
    if (over) {
      over.hidden = true;
      over.setAttribute('hidden', '');
    }
    if (hint) hint.hidden = false;
    fitCanvas();
    paintHud();
    drawScene();
    if (global.requestAnimationFrame) {
      host.raf = global.requestAnimationFrame(loop);
    }
  }

  function mount(root, hooks) {
    if (!root) return false;
    host.root = root;
    host.hooks = hooks || {};
    host.canvas = el('mcsCanvas', root);
    host.ctx = host.canvas && host.canvas.getContext ? host.canvas.getContext('2d') : null;
    host.reduced = prefersReducedMotion();
    bindInput(root);
    var again = el('mcsPlayAgain', root);
    if (again && !again._mcsWired) {
      again._mcsWired = true;
      again.addEventListener('click', function () {
        if (host.hooks && typeof host.hooks.onPlayAgain === 'function') {
          host.hooks.onPlayAgain();
        }
      });
    }
    var lb = el('mcsViewLb', root);
    if (lb && !lb._mcsWired) {
      lb._mcsWired = true;
      lb.addEventListener('click', function () {
        if (host.hooks && typeof host.hooks.onLeaderboard === 'function') {
          host.hooks.onLeaderboard();
        }
      });
    }
    return true;
  }

  function unmount() {
    stopLoop();
    unbindInput();
    host.root = null;
    host.canvas = null;
    host.ctx = null;
    host.sim = null;
    host.hooks = null;
  }

  global.LANTERN_MINECART_SWITCH = {
    GAME_ID: GAME_ID,
    GAME_NAME: GAME_NAME,
    SCORE_MIN: SCORE_MIN,
    SCORE_MAX: SCORE_MAX,
    STARTING_LIVES: STARTING_LIVES,
    LANE_COUNT: LANE_COUNT,
    LANE_LEFT: LANE_LEFT,
    LANE_CENTER: LANE_CENTER,
    LANE_RIGHT: LANE_RIGHT,
    SPEED_MIN: SPEED_MIN,
    SPEED_MAX: SPEED_MAX,
    SWITCH_MS: SWITCH_MS,
    RECOVERY_MS: RECOVERY_MS,
    HAZARD_TYPES: HAZARD_TYPES,
    clampLane: clampLane,
    maskHasSafeLane: maskHasSafeLane,
    safeLanesFromMask: safeLanesFromMask,
    reachableLanes: reachableLanes,
    generatePattern: generatePattern,
    generateSequence: generateSequence,
    sequenceHasReachablePath: sequenceHasReachablePath,
    computeScore: computeScore,
    currentSpeed: currentSpeed,
    currentSpacing: currentSpacing,
    createSim: createSim,
    createRng: createRng,
    mount: mount,
    unmount: unmount,
    startRun: startRun,
    stopRun: stopLoop,
    getHost: function () {
      return host;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
