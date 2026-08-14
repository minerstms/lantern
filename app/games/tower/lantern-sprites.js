/**
 * Lantern-owned Tower (Stack Lab) sprites.
 *
 * Generated at runtime from original canvas primitives. No donor bitmaps,
 * no third-party art packs, no Tower Bloxx assets.
 *
 * Visual language: nighttime navy sky, faint stars, glowing window grids,
 * Lantern blue (#5aa7ff) accents.
 */
(function (global) {
  'use strict';

  var NAVY = '#0b1220';
  var NAVY_MID = '#12203a';
  var SLATE = '#1a2a4a';
  var FLOOR_A = '#243656';
  var FLOOR_B = '#1e3a5f';
  var FLOOR_PERFECT = '#2a4a78';
  var ACCENT = '#5aa7ff';
  var GLOW = '#7ec8ff';
  var WINDOW = '#c8e4ff';
  var MUTED = '#8aa4c8';

  var URLS = {};

  function canvas(w, h, paint) {
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    var ctx = c.getContext('2d');
    paint(ctx, w, h);
    return c.toDataURL('image/png');
  }

  function roundRect(ctx, x, y, w, h, r) {
    var rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawStars(ctx, w, h, count, seed) {
    var s = seed || 1;
    function rnd() {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    }
    var i;
    for (i = 0; i < count; i += 1) {
      var x = rnd() * w;
      var y = rnd() * h * 0.72;
      var a = 0.25 + rnd() * 0.55;
      var r = rnd() < 0.15 ? 1.4 : 0.8;
      ctx.fillStyle = 'rgba(200, 228, 255,' + a + ')';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawWindowGrid(ctx, x, y, w, h, cols, rows, lit) {
    var padX = w * 0.12;
    var padY = h * 0.18;
    var innerW = w - padX * 2;
    var innerH = h - padY * 2;
    var gapX = innerW * 0.08;
    var gapY = innerH * 0.12;
    var cw = (innerW - gapX * (cols - 1)) / cols;
    var ch = (innerH - gapY * (rows - 1)) / rows;
    var c;
    var r;
    for (r = 0; r < rows; r += 1) {
      for (c = 0; c < cols; c += 1) {
        var wx = x + padX + c * (cw + gapX);
        var wy = y + padY + r * (ch + gapY);
        ctx.fillStyle = lit ? WINDOW : 'rgba(90, 167, 255, 0.28)';
        ctx.fillRect(wx, wy, cw, ch);
        if (lit) {
          ctx.fillStyle = 'rgba(126, 200, 255, 0.35)';
          ctx.fillRect(wx, wy, cw, ch * 0.35);
        }
      }
    }
  }

  function makeBackground() {
    return canvas(750, 1050, function (ctx, w, h) {
      var g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#070b14');
      g.addColorStop(0.45, NAVY);
      g.addColorStop(0.78, NAVY_MID);
      g.addColorStop(1, '#15243c');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      drawStars(ctx, w, h, 90, 17);

      function silhouette(sx, sw, sh, floors) {
        ctx.fillStyle = '#0a1424';
        ctx.fillRect(sx, h - sh, sw, sh);
        var fh = sh / floors;
        var i;
        for (i = 0; i < floors; i += 1) {
          var wy = h - sh + i * fh + fh * 0.28;
          ctx.fillStyle = i % 3 === 0 ? 'rgba(90, 167, 255, 0.35)' : 'rgba(90, 167, 255, 0.16)';
          ctx.fillRect(sx + sw * 0.18, wy, sw * 0.22, fh * 0.28);
          ctx.fillRect(sx + sw * 0.58, wy, sw * 0.22, fh * 0.28);
        }
      }
      silhouette(40, 90, 220, 8);
      silhouette(160, 70, 160, 6);
      silhouette(500, 110, 280, 10);
      silhouette(640, 80, 190, 7);

      ctx.fillStyle = '#101a2c';
      ctx.fillRect(0, h * 0.86, w, h * 0.14);
      ctx.fillStyle = 'rgba(90, 167, 255, 0.12)';
      ctx.fillRect(0, h * 0.86, w, 3);
    });
  }

  function makeFloor(kind) {
    var fill = kind === 'perfect' ? FLOOR_PERFECT : (kind === 'rope' ? FLOOR_B : FLOOR_A);
    var h = kind === 'rope' ? 179 : (kind === 'perfect' ? 133 : 134);
    return canvas(188, h, function (ctx, w, hh) {
      var bodyY = kind === 'rope' ? 36 : 0;
      var bodyH = hh - bodyY;
      ctx.fillStyle = fill;
      ctx.fillRect(0, bodyY, w, bodyH);
      ctx.fillStyle = kind === 'perfect' ? ACCENT : SLATE;
      ctx.fillRect(0, bodyY, w, 6);
      ctx.fillStyle = 'rgba(8, 14, 28, 0.35)';
      ctx.fillRect(0, hh - 8, w, 8);
      drawWindowGrid(ctx, 0, bodyY + 4, w, bodyH - 8, 4, 2, kind !== 'plain');
      if (kind === 'perfect') {
        ctx.strokeStyle = GLOW;
        ctx.lineWidth = 3;
        ctx.strokeRect(2, bodyY + 2, w - 4, bodyH - 4);
      }
      if (kind === 'rope') {
        ctx.strokeStyle = ACCENT;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(w / 2, 4);
        ctx.lineTo(w / 2, 40);
        ctx.stroke();
        ctx.strokeStyle = GLOW;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(w / 2, 44, 10, Math.PI, 0, true);
        ctx.stroke();
      }
    });
  }

  function makeHook() {
    return canvas(50, 507, function (ctx, w, h) {
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(w / 2, 0);
      ctx.lineTo(w / 2, h - 70);
      ctx.stroke();
      ctx.fillStyle = SLATE;
      roundRect(ctx, 8, h - 92, w - 16, 28, 6);
      ctx.fill();
      ctx.strokeStyle = GLOW;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(w / 2, h - 48, 18, -0.2, Math.PI + 0.4, false);
      ctx.stroke();
    });
  }

  function makeCloud(variant) {
    return canvas(260, 260, function (ctx, w, h) {
      ctx.clearRect(0, 0, w, h);
      var blobs;
      if (variant === 1) blobs = [[130, 150, 70], [80, 160, 50], [180, 158, 48]];
      else if (variant === 2) blobs = [[120, 140, 80], [60, 155, 46], [190, 150, 52], [130, 110, 36]];
      else blobs = [[140, 160, 58], [90, 168, 40], [185, 165, 42]];
      var i;
      for (i = 0; i < blobs.length; i += 1) {
        var b = blobs[i];
        var g = ctx.createRadialGradient(b[0], b[1], 4, b[0], b[1], b[2]);
        g.addColorStop(0, 'rgba(210, 226, 255, 0.92)');
        g.addColorStop(1, 'rgba(138, 164, 200, 0.0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(b[0], b[1], b[2], 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  function makeHaze(variant) {
    return canvas(260, 260, function (ctx, w, h) {
      ctx.clearRect(0, 0, w, h);
      var cx = 130;
      var cy = 140;
      ctx.fillStyle = 'rgba(26, 42, 74, 0.85)';
      roundRect(ctx, 50 + variant * 4, 90, 160 - variant * 6, 90, 28);
      ctx.fill();
      ctx.fillStyle = 'rgba(90, 167, 255, 0.22)';
      ctx.beginPath();
      ctx.arc(cx, cy, 18 + variant, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function makeFlight(kind) {
    return canvas(260, 260, function (ctx, w, h) {
      ctx.clearRect(0, 0, w, h);
      ctx.translate(130, 130);
      if (kind === 1) {
        ctx.strokeStyle = MUTED;
        ctx.lineWidth = 3;
        var i;
        for (i = -2; i <= 2; i += 1) {
          ctx.beginPath();
          ctx.moveTo(i * 22 - 10, i * 8);
          ctx.lineTo(i * 22 + 10, i * 8 - 12);
          ctx.lineTo(i * 22 + 30, i * 8);
          ctx.stroke();
        }
      } else if (kind === 2) {
        ctx.fillStyle = SLATE;
        roundRect(ctx, -70, -18, 140, 36, 18);
        ctx.fill();
        ctx.fillStyle = ACCENT;
        ctx.fillRect(-8, -18, 16, 36);
        ctx.fillStyle = GLOW;
        ctx.beginPath();
        ctx.moveTo(70, 0);
        ctx.lineTo(96, -10);
        ctx.lineTo(96, 10);
        ctx.closePath();
        ctx.fill();
      } else if (kind === 3) {
        ctx.fillStyle = ACCENT;
        ctx.beginPath();
        ctx.moveTo(0, -50);
        ctx.lineTo(40, 30);
        ctx.lineTo(0, 12);
        ctx.lineTo(-40, 30);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = GLOW;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 12);
        ctx.lineTo(0, 58);
        ctx.stroke();
      } else if (kind === 4 || kind === 5) {
        ctx.fillStyle = kind === 5 ? GLOW : ACCENT;
        ctx.beginPath();
        ctx.moveTo(50, 0);
        ctx.lineTo(-30, -36);
        ctx.lineTo(-18, 0);
        ctx.lineTo(-30, 36);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = SLATE;
        ctx.fillRect(-8, -8, 36, 16);
      } else if (kind === 6) {
        ctx.fillStyle = '#d7e6ff';
        roundRect(ctx, -16, -50, 32, 80, 12);
        ctx.fill();
        ctx.fillStyle = ACCENT;
        ctx.beginPath();
        ctx.moveTo(0, -70);
        ctx.lineTo(16, -48);
        ctx.lineTo(-16, -48);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = GLOW;
        ctx.beginPath();
        ctx.moveTo(-10, 32);
        ctx.lineTo(0, 62);
        ctx.lineTo(10, 32);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.strokeStyle = MUTED;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(-40, 0);
        ctx.lineTo(40, 0);
        ctx.moveTo(0, -40);
        ctx.lineTo(0, 40);
        ctx.stroke();
        ctx.strokeStyle = ACCENT;
        ctx.beginPath();
        ctx.arc(0, 0, 16, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    });
  }

  function makeTutorial() {
    return canvas(181, 85, function (ctx, w, h) {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(11, 18, 32, 0.72)';
      roundRect(ctx, 4, 8, w - 8, h - 16, 12);
      ctx.fill();
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 2;
      roundRect(ctx, 4, 8, w - 8, h - 16, 12);
      ctx.stroke();
      ctx.fillStyle = GLOW;
      ctx.font = 'bold 28px Arial, Helvetica, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('TAP', w / 2, h / 2);
    });
  }

  function makeTutorialArrow() {
    return canvas(182, 85, function (ctx, w, h) {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = ACCENT;
      ctx.beginPath();
      ctx.moveTo(w / 2, 12);
      ctx.lineTo(w / 2 + 28, 48);
      ctx.lineTo(w / 2 + 10, 48);
      ctx.lineTo(w / 2 + 10, 72);
      ctx.lineTo(w / 2 - 10, 72);
      ctx.lineTo(w / 2 - 10, 48);
      ctx.lineTo(w / 2 - 28, 48);
      ctx.closePath();
      ctx.fill();
    });
  }

  function makeHeart() {
    return canvas(60, 53, function (ctx, w, h) {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = ACCENT;
      roundRect(ctx, 8, 10, 44, 32, 8);
      ctx.fill();
      ctx.fillStyle = WINDOW;
      roundRect(ctx, 16, 16, 28, 12, 4);
      ctx.fill();
    });
  }

  function makeScore() {
    return canvas(409, 131, function (ctx, w, h) {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(18, 32, 58, 0.92)';
      roundRect(ctx, 8, 18, w - 16, h - 36, 20);
      ctx.fill();
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 3;
      roundRect(ctx, 8, 18, w - 16, h - 36, 20);
      ctx.stroke();
      ctx.fillStyle = GLOW;
      ctx.font = 'bold 36px Arial, Helvetica, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('PTS', 28, h / 2);
    });
  }

  function build() {
    URLS['background.png'] = makeBackground();
    URLS['hook.png'] = makeHook();
    URLS['block.png'] = makeFloor('plain');
    URLS['block-perfect.png'] = makeFloor('perfect');
    URLS['block-rope.png'] = makeFloor('rope');
    URLS['c1.png'] = makeCloud(1);
    URLS['c2.png'] = makeCloud(2);
    URLS['c3.png'] = makeCloud(3);
    URLS['c4.png'] = makeHaze(1);
    URLS['c5.png'] = makeHaze(2);
    URLS['c6.png'] = makeHaze(3);
    URLS['c7.png'] = makeHaze(4);
    URLS['c8.png'] = makeHaze(5);
    URLS['f1.png'] = makeFlight(1);
    URLS['f2.png'] = makeFlight(2);
    URLS['f3.png'] = makeFlight(3);
    URLS['f4.png'] = makeFlight(4);
    URLS['f5.png'] = makeFlight(5);
    URLS['f6.png'] = makeFlight(6);
    URLS['f7.png'] = makeFlight(7);
    URLS['tutorial.png'] = makeTutorial();
    URLS['tutorial-arrow.png'] = makeTutorialArrow();
    URLS['heart.png'] = makeHeart();
    URLS['score.png'] = makeScore();
    return URLS;
  }

  function url(path) {
    var name = String(path || '').split('/').pop();
    if (URLS[name]) return URLS[name];
    if (/\.mp3$/i.test(name) || /\.ogg$/i.test(name)) {
      return (global.LanternTowerSfx && global.LanternTowerSfx.silentUrl) || '';
    }
    return URLS[name] || '';
  }

  global.LanternTowerAssets = {
    build: build,
    url: url,
    urls: URLS,
    provenance: 'Lantern-original canvas primitives, 2026-08-13',
  };
})(typeof window !== 'undefined' ? window : globalThis);
