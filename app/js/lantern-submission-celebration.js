/**
 * TMS Lantern — Post-submission celebration: fireworks intro + typing mini-game + nuggets summary.
 * Modular for later typing-curriculum expansion. Does not replace reaction playCelebration.
 */
(function (global) {
  var STYLES_INJECTED = false;
  var ICONS = ['🏆', '⭐', '🎖', '🏅', '🔥', '✨', '🎯', '💫', '🌟', '🎉'];
  var NAVY = '#0f3b86';
  var COLUMBIA = '#87CEEB';

  function injectStyles() {
    if (STYLES_INJECTED) return;
    STYLES_INJECTED = true;
    var s = document.createElement('style');
    s.textContent = [
      '.lscOverlay{position:fixed;inset:0;z-index:2147483000;background:rgba(5,8,14,.94);display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;color:#eaf0ff;overflow:hidden;}',
      '.lscPhase1{position:absolute;inset:0;pointer-events:none;overflow:hidden;}',
      '.lscRocket{position:absolute;bottom:-10vh;left:50%;font-size:42px;transform:translateX(-50%);will-change:transform,opacity;text-shadow:0 0 12px rgba(90,167,255,.6);}',
      '.lscParticle{position:absolute;pointer-events:none;border-radius:50%;will-change:transform,opacity;}',
      '@keyframes lscLaunch{0%{transform:translateX(-50%) translateY(0) scale(1.1);opacity:1}55%{transform:translateX(-50%) translateY(-52vh) scale(1);opacity:1}100%{transform:translateX(-50%) translateY(-48vh) scale(.85);opacity:.95}}',
      '@keyframes lscFall{0%{transform:translate(-50%,0) scale(.5);opacity:1}100%{transform:translate(-50%,85vh) scale(.35);opacity:0}}',
      '.lscPhase2{width:100%;max-width:520px;padding:20px;text-align:center;}',
      '.lscLevelAnn{font-size:22px;font-weight:900;color:#5aa7ff;margin:12px 0;min-height:1.4em;}',
      '.lscChar{font-size:min(22vw,120px);font-weight:1000;margin:20px 0;letter-spacing:.05em;transition:color .2s ease;}',
      '.lscProgress{font-size:22px;color:#b9c6ea;margin-bottom:8px;}',
      '.lscHint{font-size:20px;color:#8899cc;margin-top:8px;}',
      '.lscResults{padding:24px;max-width:480px;text-align:center;}',
      '.lscResults .lscNug{font-size:28px;font-weight:1000;color:#ffcc66;margin:16px 0;}',
      '.lscBtn{margin-top:14px;padding:14px 28px;border-radius:14px;border:2px solid rgba(90,167,255,.5);background:linear-gradient(180deg,rgba(90,167,255,.25),rgba(90,167,255,.1));color:#eaf0ff;font-weight:900;font-size:24px;cursor:pointer;font-family:inherit;}',
      '.lscBtnSecondary{margin-top:10px;background:transparent;border-color:rgba(255,255,255,.2);font-size:22px;}',
    ].join('');
    document.head.appendChild(s);
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function ease(u) {
    return easeOutCubic(u);
  }

  function runFireworks(container, done) {
    container.innerHTML = '';
    var once = false;
    function finish() {
      if (once) return;
      once = true;
      done();
    }

    function spawnOne() {
      var el = document.createElement('div');
      el.className = 'lscRocket';
      el.textContent = ICONS[Math.floor(Math.random() * ICONS.length)];
      var leftPct = 8 + Math.random() * 84;
      var yRange = 48 + Math.random() * 8;
      var fontPx = 32 + Math.random() * 22;
      el.style.left = leftPct + '%';
      el.style.fontSize = fontPx + 'px';
      container.appendChild(el);
      var dur = 900 + Math.random() * 500;
      var start = performance.now();
      function tick(now) {
        var t = Math.min(1, (now - start) / dur);
        var e = easeOutCubic(t);
        var yVh = -e * yRange;
        el.style.transform = 'translateX(-50%) translateY(' + yVh + 'vh) scale(' + (1.15 - e * 0.25) + ')';
        el.style.opacity = t < 0.92 ? 1 : 1 - (t - 0.92) / 0.08;
        var cw = container.clientWidth;
        var ch = container.clientHeight;
        var vhPx = window.innerHeight / 100;
        var x = (leftPct / 100) * cw;
        var bottomEdgeY = ch + 10 * vhPx + yVh * vhPx;
        var y = bottomEdgeY - fontPx * 0.5;
        el._cx = x;
        el._cy = y;
        if (t < 1) requestAnimationFrame(tick);
        else {
          burst(el);
          el.remove();
        }
      }
      requestAnimationFrame(tick);
    }

    function burst(parentEl) {
      var cx = parentEl._cx;
      var cy = parentEl._cy;
      var flash = document.createElement('div');
      flash.style.position = 'absolute';
      flash.style.left = cx + 'px';
      flash.style.top = cy + 'px';
      flash.style.width = '8px';
      flash.style.height = '8px';
      flash.style.borderRadius = '50%';
      flash.style.background = '#fff';
      flash.style.transform = 'translate(-50%, -50%)';
      flash.style.opacity = '1';
      flash.style.pointerEvents = 'none';
      container.appendChild(flash);
      setTimeout(function () {
        flash.style.transition = 'all 200ms ease-out';
        flash.style.transform = 'translate(-50%, -50%) scale(3)';
        flash.style.opacity = '0';
      }, 10);
      setTimeout(function () {
        if (flash.parentNode) flash.remove();
      }, 220);
      for (var i = 0; i < 7; i++) {
        var bit = document.createElement('div');
        bit.className = 'lscParticle';
        var hue = Math.floor(Math.random() * 360);
        bit.style.left = cx + 'px';
        bit.style.top = cy + 'px';
        var size = 2 + Math.random() * 2;
        bit.style.width = size + 'px';
        bit.style.height = size + 'px';
        bit.style.background = 'hsl(' + hue + ', 90%, 60%)';
        bit.style.boxShadow = '0 0 10px hsl(' + hue + ', 90%, 60%)';
        bit.style.transform = 'translate(-50%,-50%)';
        container.appendChild(bit);
        var angle = (i / 7) * Math.PI * 2 + Math.random() * 0.3;
        var speed = 1 + Math.random() * 0.6;
        var ddx = Math.cos(angle) * 120 * speed;
        var ddy = Math.sin(angle) * 120 * speed;
        var bstart = performance.now();
        var bd = 700 + Math.random() * 400;
        (function (b, bx, by, ddx, ddy, bdur) {
          function btick(nw) {
            var u = Math.min(1, (nw - bstart) / bdur);
            var ee = ease(u);
            var gravity = 140 * u * u;
            var px = ddx * ee;
            var py = ddy * ee + gravity;
            b.style.transform = `
  translate(-50%, -50%)
  translate(${px}px, ${py}px)
  scale(${0.7 + (1 - u) * 0.3})
`;
            b.style.opacity = 1 - u;
            if (u < 1) requestAnimationFrame(btick);
            else b.remove();
          }
          requestAnimationFrame(btick);
        })(bit, cx, cy, ddx, ddy, bd);
      }
    }

    var lastSpawn = 0;
    var startTime = performance.now();

    function loop(now) {
      if (now - lastSpawn > 120) {
        spawnOne();
        lastSpawn = now;
      }

      if (now - startTime < 3000) {
        requestAnimationFrame(loop);
      } else {
        finish();
      }
    }

    requestAnimationFrame(loop);
  }

  function genTypingChar() {
    var r = Math.random();
    if (r < 0.7) return String.fromCharCode(97 + Math.floor(Math.random() * 26));
    if (r < 0.9) return String.fromCharCode(65 + Math.floor(Math.random() * 26));
    var syms = '0123456789!@#$%';
    return syms[Math.floor(Math.random() * syms.length)];
  }

  function streakColor(streak) {
    if (streak < 5) return '#7eb8da';
    if (streak < 12) return '#5aa7ff';
    if (streak < 22) return '#38d07c';
    if (streak < 35) return '#b794f6';
    if (streak < 50) return '#ffcc66';
    if (streak < 70) {
      var t = (streak - 50) / 20;
      var h = Math.floor(280 + t * 80);
      return 'hsl(' + h + ',85%,65%)';
    }
    if (streak < 95) return NAVY;
    return COLUMBIA;
  }

  function runTypingGame(container, onDone) {
    container.innerHTML = '';
    var target = 42;
    var queue = '';
    for (var q = 0; q < target + 10; q++) queue += genTypingChar();
    var idx = 0;
    var correct = 0;
    var mistakes = 0;
    var streak = 0;
    var bestStreak = 0;
    var lastLevel = -1;

    var ann = document.createElement('div');
    ann.className = 'lscLevelAnn';
    var prog = document.createElement('div');
    prog.className = 'lscProgress';
    var ch = document.createElement('div');
    ch.className = 'lscChar';
    ch.setAttribute('aria-live', 'polite');
    var hint = document.createElement('div');
    hint.className = 'lscHint';
    hint.textContent = 'Type the letter shown. Build your streak!';
    container.appendChild(ann);
    container.appendChild(prog);
    container.appendChild(ch);
    container.appendChild(hint);

    function levelFor(s) {
      if (s < 5) return 0;
      if (s < 15) return 1;
      if (s < 30) return 2;
      if (s < 50) return 3;
      if (s < 70) return 4;
      return 5;
    }
    var levelNames = ['Warm up', 'Nice!', 'On a roll', 'Great streak', 'Rainbow zone', 'School colors!'];

    function refresh() {
      if (idx >= queue.length) {
        finish();
        return;
      }
      var c = queue[idx];
      ch.textContent = c;
      ch.style.color = streakColor(streak);
      prog.textContent = 'Typed right: ' + correct + ' / ' + target;
      var lv = levelFor(streak);
      if (lv !== lastLevel) {
        lastLevel = lv;
        ann.textContent = levelNames[lv] || '';
        ann.style.animation = 'none';
        void ann.offsetWidth;
        ann.style.animation = 'lscPulse .5s ease';
      }
    }

    function detachKeys() {
      document.removeEventListener('keydown', keyHandler, true);
    }

    function finish() {
      var bonus = Math.min(5, Math.floor(bestStreak / 12));
      detachKeys();
      onDone({ correct: correct, mistakes: mistakes, bestStreak: bestStreak, gameBonus: bonus });
    }

    function keyHandler(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var k = e.key;
      if (k.length !== 1) return;
      e.preventDefault();
      e.stopPropagation();
      var want = queue[idx];
      if (k === want) {
        correct++;
        streak++;
        if (streak > bestStreak) bestStreak = streak;
        idx++;
        if (correct >= target) finish();
        else refresh();
      } else {
        mistakes++;
        streak = 0;
        refresh();
      }
    }

    var skip = document.createElement('button');
    skip.type = 'button';
    skip.className = 'lscBtn lscBtnSecondary';
    skip.textContent = 'Skip game';
    skip.addEventListener('click', function () {
      detachKeys();
      onDone({ correct: correct, mistakes: mistakes, bestStreak: bestStreak, gameBonus: 0 });
    });
    container.appendChild(skip);

    var pulseStyle = document.createElement('style');
    pulseStyle.textContent = '@keyframes lscPulse{0%{transform:scale(1)}50%{transform:scale(1.06)}100%{transform:scale(1)}}';
    document.head.appendChild(pulseStyle);
    document.addEventListener('keydown', keyHandler, true);
    refresh();
  }

  function showResults(overlay, gameBonus, stats, onClose) {
    overlay.innerHTML = '';
    var box = document.createElement('div');
    box.className = 'lscResults';
    box.innerHTML =
      '<div style="font-size:32px;font-weight:1000;margin-bottom:8px;">You did it!</div>' +
      '<p style="font-size:22px;color:#b9c6ea;line-height:1.45;">Your piece is in the teacher review queue. School nuggets usually come when a teacher approves your work.</p>' +
      '<div class="lscNug">Typing celebration +' + gameBonus + '</div>' +
      '<p style="font-size:20px;color:#8899cc;">Best streak this round: ' + stats.bestStreak + ' · Mistakes: ' + stats.mistakes + '</p>' +
      '<p style="font-size:20px;color:#6a7a99;margin-top:12px;">More typing games and real nugget bonuses can grow here later.</p>';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lscBtn';
    btn.textContent = 'Continue';
    btn.addEventListener('click', function () {
      overlay.remove();
      onClose();
    });
    box.appendChild(btn);
    overlay.appendChild(box);
  }

  /**
   * @param {Object} opts
   * @param {function()} opts.onFinish — after user taps Continue
   */
  function start(opts) {
    injectStyles();
    opts = opts || {};
    var onFinish = typeof opts.onFinish === 'function' ? opts.onFinish : function () {};

    var overlay = document.createElement('div');
    overlay.className = 'lscOverlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Celebration');

    var phase1 = document.createElement('div');
    phase1.className = 'lscPhase1';
    var phase2 = document.createElement('div');
    phase2.className = 'lscPhase2';
    phase2.style.display = 'none';

    overlay.appendChild(phase1);
    overlay.appendChild(phase2);
    document.body.appendChild(overlay);

    runFireworks(phase1, function () {
      phase1.style.display = 'none';
      phase2.style.display = 'block';
      runTypingGame(phase2, function (stats) {
        phase2.style.display = 'none';
        showResults(overlay, stats.gameBonus, stats, onFinish);
      });
    });
  }

  global.LanternSubmissionCelebration = { start: start };
})(typeof window !== 'undefined' ? window : this);
