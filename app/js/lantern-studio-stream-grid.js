/**
 * Contribute Studio LEFT — 3×3 mini feed grid (8 context cards + center live draft).
 */
(function (global) {
  'use strict';

  var CENTER_INDEX = 4;

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

  function wrapScaledCard(cardEl, isDraft) {
    var fit = global.document.createElement('div');
    fit.className = 'studioStreamGridCardFit' + (isDraft ? ' studioStreamGridCardFit--draft' : '');
    var scale = global.document.createElement('div');
    scale.className = 'studioStreamGridCardScale';
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

  function ensureGridShell(host) {
    var existing = host.querySelector('.studioStreamGrid');
    if (existing) return existing;
    host.innerHTML = '';
    host.classList.add('studioStreamGridHost');
    host.removeAttribute('data-lantern-rail-host');
    host.removeAttribute('data-scroller-aria-label');
    var grid = global.document.createElement('div');
    grid.className = 'studioStreamGrid';
    grid.setAttribute('aria-label', 'Stream preview grid');
    for (var i = 0; i < 9; i++) {
      var cell = global.document.createElement('div');
      cell.className = 'studioStreamGridCell';
      cell.setAttribute('data-grid-slot', String(i));
      if (i === CENTER_INDEX) cell.classList.add('studioStreamGridCell--draft');
      grid.appendChild(cell);
    }
    host.appendChild(grid);
    return grid;
  }

  /**
   * Mount or refresh the 3×3 stream grid. Context cards built once; center draft updates live.
   * @param {HTMLElement} host
   * @param {HTMLElement|null} draftCardEl — canonical card node from LanternCards
   * @param {{ esc?: function }} opts
   */
  function mount(host, draftCardEl, opts) {
    opts = opts || {};
    if (!host) return;
    loadContextItems().then(function (ctx) {
      var grid = ensureGridShell(host);
      var cells = grid.querySelectorAll('.studioStreamGridCell');
      if (!host._studioGridContextBuilt) {
        var ctxIdx = 0;
        for (var i = 0; i < 9; i++) {
          if (i === CENTER_INDEX) continue;
          var card = buildContextCard(ctx[ctxIdx++], opts.esc || esc);
          cells[i].innerHTML = '';
          if (card) cells[i].appendChild(wrapScaledCard(card, false));
        }
        host._studioGridContextBuilt = true;
      }
      var draftCell = cells[CENTER_INDEX];
      if (!draftCell) return;
      draftCell.innerHTML = '';
      if (draftCardEl) {
        markDraftActive(draftCardEl);
        draftCell.appendChild(wrapScaledCard(draftCardEl, true));
      }
    });
  }

  global.LANTERN_STUDIO_STREAM_GRID = {
    mount: mount,
    CENTER_INDEX: CENTER_INDEX,
    getFallbackContextItems: getFallbackContextItems
  };
})(typeof window !== 'undefined' ? window : self);
