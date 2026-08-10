/**
 * Contribute Studio LEFT — 3×3 mini feed viewport centered on live draft (slot 5).
 * Scene maintains useful card size; viewport clips perimeter when constrained.
 */
(function (global) {
  'use strict';

  var CENTER_INDEX = 4;
  var CANONICAL_W = 280;
  var CANONICAL_H = 157.5;
  var GRID_GAP = 6;
  var MIN_CARD_W = 96;
  var MAX_CARD_W = 200;
  var DRAFT_FOCUS_SCALE_MAX = 1.25;
  var DRAFT_FOCUS_SCALE_MIN = 1;
  var DRAFT_FOCUS_TAPER_START = 112;
  /* Create RIGHT edge = 50vw + CENTER_RIGHT_HALF + right-extend (#111); #110 grew width leftward only. */
  var CENTER_RIGHT_HALF = 320;
  var CENTER_WIDTH_DEFAULT = 640;
  var CENTER_WIDTH_WIDE = 760;
  var CENTER_WIDTH_WIDE_MIN = 1280;
  var CENTER_HALF = CENTER_RIGHT_HALF; /* legacy alias */
  var CENTER_WIDTH = CENTER_WIDTH_DEFAULT; /* legacy alias (base; wide uses resolveCenterWidth) */
  var STUDIO_COL_GAP = 20;
  var DEFAULT_PAD_X = 12;
  /* Mirrors contribute.html --lantern-studio-center-right-extend: clamp(48px, 5vw, 140px) at ≥1280. */
  var CENTER_RIGHT_EXTEND_MIN = 48;
  var CENTER_RIGHT_EXTEND_MAX = 140;
  var CENTER_RIGHT_EXTEND_VW = 0.05;

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;';
    });
  }

  /** Deterministic fallback when feed API unavailable — stable order, 8 items. */
  function getFallbackContextItems() {
    return [
      { id: '_sg1', title: 'Morning announcements', category: 'Announcements', author_name: 'Jamie', author_type: 'student', created_at: '2026-04-01T12:00:00.000Z' },
      { id: '_sg2', title: 'Art club showcase Friday', category: 'Events', author_name: 'Riley', author_type: 'student', created_at: '2026-04-02T12:00:00.000Z' },
      { id: '_sg3', title: 'Soccer — regional finals', category: 'Sports', author_name: 'Coach T', author_type: 'teacher', created_at: '2026-04-03T12:00:00.000Z' },
      { id: '_sg4', title: 'Library hours extended', category: 'School News', author_name: 'Staff', author_type: 'staff', created_at: '2026-04-04T12:00:00.000Z' },
      { id: '_sg5', title: 'Science fair winners', category: 'STEM', author_name: 'Alex', author_type: 'student', created_at: '2026-04-05T12:00:00.000Z' },
      { id: '_sg6', title: 'Band concert tonight', category: 'Events', author_name: 'Morgan', author_type: 'student', created_at: '2026-04-06T12:00:00.000Z' },
      { id: '_sg7', title: 'New club sign-ups', category: 'Clubs', author_name: 'Jordan', author_type: 'student', created_at: '2026-04-07T12:00:00.000Z' },
      { id: '_sg8', title: 'Field day recap', category: 'School News', author_name: 'Casey', author_type: 'student', created_at: '2026-04-08T12:00:00.000Z' }
    ];
  }

  var cachedContext = null;
  var loadPromise = null;

  function isFeedApiItem(item) {
    return !!(item && (item.authorDisplayName != null || item.typeLabel != null || item.thumbnailUrl != null) && item.author_type == null);
  }

  function loadContextItems() {
    if (cachedContext) return Promise.resolve(cachedContext);
    if (loadPromise) return loadPromise;
    var fallback = getFallbackContextItems();
    loadPromise = new Promise(function (resolve) {
      var feed = global.LANTERN_FEED;
      if (!feed || typeof feed.getFeed !== 'function') {
        cachedContext = fallback;
        resolve(cachedContext);
        return;
      }
      feed.getFeed({ limit: 12, filter: 'all' }).then(function (res) {
        var raw = res && res.ok && Array.isArray(res.items) ? res.items : [];
        var picked = [];
        for (var i = 0; i < raw.length && picked.length < 8; i++) {
          if (raw[i] && raw[i].id != null) picked.push(raw[i]);
        }
        while (picked.length < 8) {
          picked.push(fallback[picked.length % 8]);
        }
        cachedContext = picked.slice(0, 8);
        resolve(cachedContext);
      }).catch(function () {
        cachedContext = fallback;
        resolve(cachedContext);
      });
    });
    return loadPromise;
  }

  function resolveCenterWidth(viewportW) {
    return viewportW >= CENTER_WIDTH_WIDE_MIN ? CENTER_WIDTH_WIDE : CENTER_WIDTH_DEFAULT;
  }

  /** Prompt #111 — same clamp as --lantern-studio-center-right-extend (0 below 1280). */
  function resolveCenterRightExtend(viewportW) {
    if (!(viewportW >= CENTER_WIDTH_WIDE_MIN)) return 0;
    var raw = viewportW * CENTER_RIGHT_EXTEND_VW;
    if (raw < CENTER_RIGHT_EXTEND_MIN) return CENTER_RIGHT_EXTEND_MIN;
    if (raw > CENTER_RIGHT_EXTEND_MAX) return CENTER_RIGHT_EXTEND_MAX;
    return raw;
  }

  /**
   * RIGHT pane width — Create right edge at 50vw + CENTER_RIGHT_HALF + right-extend (#111).
   */
  function computeSidePaneWidth(viewportW, padX) {
    padX = padX == null ? DEFAULT_PAD_X : padX;
    var containerW = viewportW - 2 * padX;
    var extend = resolveCenterRightExtend(viewportW);
    return Math.max(0, containerW - (viewportW * 0.5 + CENTER_RIGHT_HALF + extend + STUDIO_COL_GAP));
  }

  /**
   * LEFT pane width — shrinks when Create widens leftward (wide desktop ≥ 1280px).
   */
  function computeLeftPaneWidth(viewportW, padX) {
    padX = padX == null ? DEFAULT_PAD_X : padX;
    var containerW = viewportW - 2 * padX;
    var centerW = resolveCenterWidth(viewportW);
    return Math.max(0, containerW - (viewportW * 0.5 - CENTER_RIGHT_HALF + centerW + STUDIO_COL_GAP));
  }

  /**
   * Focal draft enlargement tapers toward 1× only when perimeter cards are already at minimum width.
   */
  function computeDraftFocusScale(cardW) {
    cardW = cardW || MIN_CARD_W;
    if (cardW >= DRAFT_FOCUS_TAPER_START) return DRAFT_FOCUS_SCALE_MAX;
    if (cardW <= MIN_CARD_W) return DRAFT_FOCUS_SCALE_MIN;
    var t = (cardW - MIN_CARD_W) / (DRAFT_FOCUS_TAPER_START - MIN_CARD_W);
    return DRAFT_FOCUS_SCALE_MIN + t * (DRAFT_FOCUS_SCALE_MAX - DRAFT_FOCUS_SCALE_MIN);
  }

  /**
   * Compute displayed card size from viewport inner width. Never shrink below MIN_CARD_W — viewport clips instead.
   */
  function computeLayout(viewportW, viewportH) {
    viewportW = Math.max(0, viewportW || 0);
    viewportH = Math.max(0, viewportH || 0);
    var fitW = viewportW > 0 ? (viewportW - 2 * GRID_GAP) / 3 : MIN_CARD_W;
    var cardW = Math.min(MAX_CARD_W, fitW);
    if (cardW < MIN_CARD_W) cardW = MIN_CARD_W;
    var cardH = cardW * (CANONICAL_H / CANONICAL_W);
    var sceneW = 3 * cardW + 2 * GRID_GAP;
    var sceneH = 3 * cardH + 2 * GRID_GAP;
    var scale = cardW / CANONICAL_W;
    var draftFocusScale = computeDraftFocusScale(cardW);
    var viewportMinH = viewportH > 0 ? Math.min(sceneH, viewportH) : sceneH;
    return {
      cardW: cardW,
      cardH: cardH,
      sceneW: sceneW,
      sceneH: sceneH,
      scale: scale,
      draftFocusScale: draftFocusScale,
      draftDisplayW: cardW * draftFocusScale,
      draftDisplayH: cardH * draftFocusScale,
      gap: GRID_GAP,
      viewportMinH: viewportMinH,
      clipsHorizontally: sceneW > viewportW + 0.5,
      clipsVertically: sceneH > viewportH + 0.5 && viewportH > 0
    };
  }

  function inertifyCard(node) {
    if (!node) return null;
    var list = [];
    if (node.classList && node.classList.contains('exploreCard')) list.push(node);
    if (node.querySelectorAll) {
      node.querySelectorAll('.exploreCard, a.exploreCard').forEach(function (c) {
        if (list.indexOf(c) < 0) list.push(c);
      });
    }
    list.forEach(function (c) {
      c.style.pointerEvents = 'none';
      c.setAttribute('tabindex', '-1');
      c.removeAttribute('role');
      c.classList.remove('exploreCard--activatable');
    });
    if (node.querySelectorAll) {
      node.querySelectorAll('.exploreCardReportBtn').forEach(function (btn) {
        btn.style.display = 'none';
      });
    }
    return node;
  }

  function buildContextCard(item, escFn) {
    var LC = global.LanternCards;
    if (!LC || typeof LC.createStudentCard !== 'function') return null;
    var e = escFn || esc;
    var node;
    if (isFeedApiItem(item) && typeof LC.normalizeFeedItemToFaceModel === 'function') {
      var model = LC.normalizeFeedItemToFaceModel(item);
      node = LC.createStudentCard(LC.compactFaceSpec(model, {
        lanternCardType: item.type || 'news',
        classNames: 'feedExploreCard studioStreamGridContextCard',
        reportType: 'feed_item',
        reportId: model.reportId || (item.id != null ? String(item.id) : '')
      }));
    } else if (typeof LC.specNewsRailCard === 'function') {
      node = LC.createStudentCard(LC.specNewsRailCard(item, e, String(item.author_name || 'Student'), false));
    } else {
      return null;
    }
    return inertifyCard(node);
  }

  function wrapScaledCard(cardEl, isDraft, layout) {
    layout = layout || computeLayout(0, 0);
    var fit = global.document.createElement('div');
    fit.className = 'studioStreamGridCardFit' + (isDraft ? ' studioStreamGridCardFit--draft' : '');
    fit.style.width = layout.cardW + 'px';
    fit.style.height = layout.cardH + 'px';
    var scale = global.document.createElement('div');
    scale.className = 'studioStreamGridCardScale';
    scale.style.width = CANONICAL_W + 'px';
    scale.style.height = CANONICAL_H + 'px';
    scale.style.transform = 'scale(' + layout.scale + ')';
    if (cardEl) scale.appendChild(cardEl);
    fit.appendChild(scale);
    return fit;
  }

  function markDraftActive(cardEl) {
    if (!cardEl) return;
    var card = cardEl.classList && cardEl.classList.contains('exploreCard')
      ? cardEl
      : (cardEl.querySelector ? cardEl.querySelector('.exploreCard, a.exploreCard') : null);
    if (card && card.classList) card.classList.add('studioScrollerCardActive');
  }

  function applyLayout(host, layout) {
    if (!host || !layout) return;
    host._studioGridLayout = layout;
    var viewport = host.querySelector('.studioStreamGridViewport');
    var scene = host.querySelector('.studioStreamGridScene');
    if (!viewport || !scene) return;

    scene.style.width = layout.sceneW + 'px';
    scene.style.height = layout.sceneH + 'px';
    scene.style.gridTemplateColumns = 'repeat(3, ' + layout.cardW + 'px)';
    scene.style.gridTemplateRows = 'repeat(3, ' + layout.cardH + 'px)';
    scene.style.gap = layout.gap + 'px';

    viewport.style.minHeight = layout.sceneH + 'px';

    host.style.setProperty('--studio-grid-card-w', layout.cardW + 'px');
    host.style.setProperty('--studio-grid-card-h', layout.cardH + 'px');
    host.style.setProperty('--studio-grid-scale', String(layout.scale));
    host.style.setProperty('--studio-grid-draft-focus-scale', String(layout.draftFocusScale));

    host.querySelectorAll('.studioStreamGridCardFit').forEach(function (fit) {
      fit.style.width = layout.cardW + 'px';
      fit.style.height = layout.cardH + 'px';
      if (fit.classList.contains('studioStreamGridCardFit--draft')) {
        fit.style.transform = 'scale(' + layout.draftFocusScale + ')';
      } else {
        fit.style.transform = '';
      }
    });
    host.querySelectorAll('.studioStreamGridCardScale').forEach(function (sc) {
      sc.style.transform = 'scale(' + layout.scale + ')';
    });
  }

  function measureAndLayout(host) {
    if (!host) return null;
    var viewport = host.querySelector('.studioStreamGridViewport');
    if (!viewport) return null;
    var rect = viewport.getBoundingClientRect();
    var layout = computeLayout(rect.width, rect.height);
    applyLayout(host, layout);
    return layout;
  }

  function ensureResizeObserver(host) {
    if (!host || host._studioGridRO || typeof global.ResizeObserver !== 'function') return;
    host._studioGridRO = new global.ResizeObserver(function () {
      measureAndLayout(host);
    });
    host._studioGridRO.observe(host);
    var viewport = host.querySelector('.studioStreamGridViewport');
    if (viewport) host._studioGridRO.observe(viewport);
  }

  function ensureGridShell(host) {
    var existing = host.querySelector('.studioStreamGridScene');
    if (existing) return existing;
    host.innerHTML = '';
    host.classList.add('studioStreamGridHost');
    host.removeAttribute('data-lantern-rail-host');
    host.removeAttribute('data-scroller-aria-label');

    var viewport = global.document.createElement('div');
    viewport.className = 'studioStreamGridViewport';

    var scene = global.document.createElement('div');
    scene.className = 'studioStreamGridScene';
    scene.setAttribute('aria-label', 'Feed preview grid');

    for (var i = 0; i < 9; i++) {
      var cell = global.document.createElement('div');
      cell.className = 'studioStreamGridCell';
      cell.setAttribute('data-grid-slot', String(i));
      if (i === CENTER_INDEX) cell.classList.add('studioStreamGridCell--draft');
      scene.appendChild(cell);
    }
    viewport.appendChild(scene);
    host.appendChild(viewport);
    ensureResizeObserver(host);
    return scene;
  }

  /**
   * Mount or refresh the 3×3 stream grid. Context cards built once; center draft updates live.
   */
  function mount(host, draftCardEl, opts) {
    opts = opts || {};
    if (!host) return;
    loadContextItems().then(function (ctx) {
      var scene = ensureGridShell(host);
      var cells = scene.querySelectorAll('.studioStreamGridCell');
      var layout = host._studioGridLayout || computeLayout(host.clientWidth || 280, 0);

      if (!host._studioGridContextBuilt) {
        var ctxIdx = 0;
        for (var i = 0; i < 9; i++) {
          if (i === CENTER_INDEX) continue;
          var card = buildContextCard(ctx[ctxIdx++], opts.esc || esc);
          cells[i].innerHTML = '';
          if (card) cells[i].appendChild(wrapScaledCard(card, false, layout));
        }
        host._studioGridContextBuilt = true;
      }

      var draftCell = cells[CENTER_INDEX];
      if (draftCell) {
        draftCell.innerHTML = '';
        if (draftCardEl) {
          markDraftActive(draftCardEl);
          draftCell.appendChild(wrapScaledCard(draftCardEl, true, layout));
        }
      }

      measureAndLayout(host);
    });
  }

  global.LANTERN_STUDIO_STREAM_GRID = {
    mount: mount,
    CENTER_INDEX: CENTER_INDEX,
    CANONICAL_CARD_WIDTH: CANONICAL_W,
    CANONICAL_CARD_HEIGHT: CANONICAL_H,
    MIN_CARD_DISPLAY_WIDTH: MIN_CARD_W,
    MAX_CARD_DISPLAY_WIDTH: MAX_CARD_W,
    CENTER_WIDTH: CENTER_WIDTH,
    CENTER_WIDTH_WIDE: CENTER_WIDTH_WIDE,
    CENTER_RIGHT_HALF: CENTER_RIGHT_HALF,
    DRAFT_FOCUS_SCALE_MAX: DRAFT_FOCUS_SCALE_MAX,
    GRID_GAP: GRID_GAP,
    computeLayout: computeLayout,
    computeDraftFocusScale: computeDraftFocusScale,
    computeSidePaneWidth: computeSidePaneWidth,
    computeLeftPaneWidth: computeLeftPaneWidth,
    resolveCenterWidth: resolveCenterWidth,
    resolveCenterRightExtend: resolveCenterRightExtend,
    getFallbackContextItems: getFallbackContextItems
  };
})(typeof window !== 'undefined' ? window : self);
