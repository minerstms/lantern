/**
 * Lantern ONE FEED — Explore controller (one container, many filters).
 */
(function (global) {
  'use strict';

  var state = {
    type: 'all',
    search: '',
    sort: 'newest',
    columns: 1,
    items: [],
    loading: false,
  };

  function el(id) { return global.document.getElementById(id); }

  function readCardWidth() {
    var root = global.document.documentElement;
    var w = parseFloat(global.getComputedStyle(root).getPropertyValue('--lantern-card-width'));
    return isNaN(w) || w <= 0 ? 280 : w;
  }

  function readGridGap(grid) {
    if (!grid) return 16;
    var g = parseFloat(global.getComputedStyle(grid).gap);
    return isNaN(g) ? 16 : g;
  }

  function fitColumnCount(grid, requested) {
    var req = Math.min(3, Math.max(1, requested || 1));
    if (!grid) return req;
    var cardW = readCardWidth();
    var gap = readGridGap(grid);
    var avail = grid.clientWidth || grid.getBoundingClientRect().width;
    if (!avail) return req;
    var fit = Math.floor((avail + gap) / (cardW + gap));
    if (fit < 1) fit = 1;
    return Math.min(req, fit);
  }

  function applyGridColumns() {
    var grid = el('feedGrid');
    if (!grid) return;
    var effective = fitColumnCount(grid, state.columns);
    grid.style.setProperty('--feed-cols', String(effective));
    grid.classList.add('manual-cols');
    grid.setAttribute('data-columns', String(state.columns));
    grid.setAttribute('data-effective-columns', String(effective));
  }

  function setColumns(n) {
    state.columns = Math.min(3, Math.max(1, n));
    applyGridColumns();
  }

  function renderFilters() {
    var wrap = el('feedFilterBar');
    if (!wrap || !global.LANTERN_FEED) return;
    wrap.innerHTML = '';
    global.LANTERN_FEED.FEED_FILTERS.forEach(function (f) {
      var btn = global.document.createElement('button');
      btn.type = 'button';
      btn.className = 'feedFilterChip' + (state.type === f.id ? ' feedFilterChip--active' : '');
      btn.textContent = f.label;
      btn.setAttribute('data-filter', f.id);
      btn.addEventListener('click', function () {
        state.type = f.id;
        renderFilters();
        loadFeed();
      });
      wrap.appendChild(btn);
    });
  }

  function renderGrid() {
    var grid = el('feedGrid');
    var empty = el('feedEmpty');
    if (!grid) return;
    grid.innerHTML = '';
    if (!state.items.length) {
      if (empty) empty.hidden = false;
      applyGridColumns();
      return;
    }
    if (empty) empty.hidden = true;
    var cardApi = global.LANTERN_FEED_CARD;
    if (!cardApi) return;
    state.items.forEach(function (item) {
      grid.appendChild(cardApi.buildCard(item, { onRefresh: loadFeed }));
    });
    applyGridColumns();
  }

  function loadFeed() {
    if (!global.LANTERN_FEED || state.loading) return;
    state.loading = true;
    var status = el('feedStatus');
    if (status) status.textContent = 'Loading…';
    global.LANTERN_FEED.getFeed({
      type: state.type,
      search: state.search,
      sort: state.sort,
      limit: 60,
    }).then(function (res) {
      state.loading = false;
      if (status) status.textContent = '';
      if (!res || !res.ok) {
        if (status) status.textContent = 'Could not load feed.';
        state.items = [];
      } else {
        state.items = res.items || [];
        if (status) status.textContent = state.items.length + ' item' + (state.items.length === 1 ? '' : 's');
      }
      renderGrid();
    });
  }

  function bindControls() {
    var searchInput = el('feedSearchInput');
    if (searchInput) {
      var timer;
      searchInput.addEventListener('input', function () {
        clearTimeout(timer);
        timer = setTimeout(function () {
          state.search = searchInput.value.trim();
          loadFeed();
        }, 300);
      });
    }
    var sortSel = el('feedSortSelect');
    if (sortSel) {
      sortSel.addEventListener('change', function () {
        state.sort = sortSel.value;
        loadFeed();
      });
    }
    global.document.querySelectorAll('[data-feed-columns]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setColumns(parseInt(btn.getAttribute('data-feed-columns'), 10));
        global.document.querySelectorAll('[data-feed-columns]').forEach(function (b) {
          b.classList.toggle('feedColBtn--active', b === btn);
        });
      });
    });
    var refreshBtn = el('feedRefreshBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', loadFeed);
    var grid = el('feedGrid');
    if (grid && global.ResizeObserver) {
      var ro = new global.ResizeObserver(function () { applyGridColumns(); });
      ro.observe(grid);
    } else if (grid) {
      global.addEventListener('resize', applyGridColumns);
    }
  }

  function init() {
    renderFilters();
    bindControls();
    setColumns(1);
    loadFeed();
  }

  global.LANTERN_FEED_EXPLORE = {
    init: init,
    refresh: loadFeed,
    getState: function () { return state; },
    applyGridColumns: applyGridColumns,
  };
})(typeof window !== 'undefined' ? window : self);
