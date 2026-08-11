/**
 * Lantern shared Explore surface — one controller for /explore and /locker contexts.
 * Explore = community feed + default theme. Locker = personal feed + equipped shell theme.
 */
(function (global) {
  'use strict';

  var RELATIONSHIP_FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'submitted', label: 'Submitted' },
    { id: 'reacted', label: 'Reacted' },
    { id: 'tagged', label: 'Tagged' },
  ];

  var activeController = null;

  function createController(config) {
    config = config || {};
    var context = config.context === 'locker' ? 'locker' : 'explore';
    var surfaceSelector = config.surfaceSelector || '.lanternExploreSurface';
    var state = {
      context: context,
      type: 'all',
      relationship: 'all',
      search: '',
      sort: 'newest',
      items: [],
      loading: false,
    };

    function el(id) {
      return global.document.getElementById(id);
    }

    function renderRelationshipFilters() {
      if (context !== 'locker') return;
      var wrap = el('lockerRelationshipFilterBar');
      if (!wrap) return;
      wrap.innerHTML = '';
      RELATIONSHIP_FILTERS.forEach(function (f) {
        var btn = global.document.createElement('button');
        btn.type = 'button';
        btn.className =
          'feedFilterChip lockerRelationshipChip' +
          (state.relationship === f.id ? ' feedFilterChip--active' : '');
        btn.textContent = f.label;
        btn.setAttribute('data-relationship', f.id);
        btn.addEventListener('click', function () {
          state.relationship = f.id;
          renderRelationshipFilters();
          loadFeed();
        });
        wrap.appendChild(btn);
      });
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
        return;
      }
      if (empty) empty.hidden = true;
      var cardApi = global.LANTERN_FEED_CARD;
      if (!cardApi) return;
      state.items.forEach(function (item) {
        grid.appendChild(cardApi.buildCard(item, { onRefresh: loadFeed }));
      });
    }

    function applyThemeForContext() {
      var theme = global.LANTERN_SURFACE_THEME;
      var surface = global.document.querySelector(surfaceSelector);
      if (!theme || !surface) return;
      if (context === 'explore') {
        theme.applyDefaultTheme(surface);
        return;
      }
      var locker = global.LANTERN_LOCKER_ME && global.LANTERN_LOCKER_ME.getLockerMe
        ? global.LANTERN_LOCKER_ME.getLockerMe()
        : null;
      var equipped =
        locker && locker.equipped_items && locker.equipped_items.equipped
          ? locker.equipped_items.equipped
          : {};
      theme.applyLockerTheme(surface, equipped, { effectLayerId: 'cosmeticEffectLayer' });
    }

    function loadFeed() {
      if (!global.LANTERN_FEED || state.loading) return;
      state.loading = true;
      var status = el('feedStatus');
      /* Prompt #187 — Explore has no visible item count; Locker (#185) still shows live count. */
      if (status && context === 'locker') status.textContent = 'Loading…';
      var req;
      if (context === 'locker' && global.LANTERN_FEED.getLockerPersonalFeed) {
        req = global.LANTERN_FEED.getLockerPersonalFeed({
          relationship: state.relationship,
          type: state.type,
          search: state.search,
          sort: state.sort,
          limit: 60,
        });
      } else {
        req = global.LANTERN_FEED.getFeed({
          type: state.type,
          search: state.search,
          sort: state.sort,
          limit: 60,
        });
      }
      req.then(function (res) {
        state.loading = false;
        if (status && context === 'locker') status.textContent = '';
        if (!res || !res.ok) {
          if (status && context === 'locker') status.textContent = 'Could not load feed.';
          state.items = [];
          renderGrid();
          return;
        }
        state.items = res.items || [];
        if (status && context === 'locker') {
          status.textContent = state.items.length + ' item' + (state.items.length === 1 ? '' : 's');
        }
        /* Prompt #158 — resolve canonical author avatars before paint when available. */
        state.items.forEach(function (it) {
          if (!it) return;
          var nm = String(it.authorDisplayName || it.author_name || it.character_name || '').trim();
          if (nm && !it.character_name) it.character_name = nm;
          if (nm && !it.author_name) it.author_name = nm;
        });
        var attach = global.LanternAvatar && typeof global.LanternAvatar.attachCanonicalAvatarsToItems === 'function'
          ? global.LanternAvatar.attachCanonicalAvatarsToItems(state.items)
          : Promise.resolve(state.items);
        Promise.resolve(attach).then(function () {
          renderGrid();
        }).catch(function () {
          renderGrid();
        });
      });
    }

    function bindFiltersDisclosure() {
      var toggle = el('feedFiltersToggle');
      var panel = el('feedFiltersPanel');
      if (!toggle || !panel) return;
      function setOpen(open) {
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        panel.hidden = !open;
        toggle.textContent = open ? 'Filters ▾' : 'Filters ▸';
      }
      setOpen(false);
      toggle.addEventListener('click', function () {
        setOpen(!!panel.hidden);
      });
    }

    function initRelationshipSection() {
      var section = el('lockerRelationshipSection');
      if (section) section.hidden = context !== 'locker';
    }

    function bindControls() {
      bindFiltersDisclosure();
      var sortSel = el('feedSortSelect');
      if (sortSel) {
        sortSel.addEventListener('change', function () {
          state.sort = sortSel.value;
          loadFeed();
        });
      }
      var refreshBtn = el('feedRefreshBtn');
      if (refreshBtn) refreshBtn.addEventListener('click', loadFeed);
    }

    function init() {
      activeController = controllerApi;
      applyThemeForContext();
      initRelationshipSection();
      renderRelationshipFilters();
      renderFilters();
      bindControls();
      loadFeed();
    }

    var controllerApi = {
      init: init,
      refresh: loadFeed,
      applyTheme: applyThemeForContext,
      setSearch: function (query) {
        state.search = query != null ? String(query).trim() : '';
      },
      getSearch: function () {
        return state.search;
      },
      getState: function () {
        return state;
      },
      getContext: function () {
        return context;
      },
    };

    return controllerApi;
  }

  var exploreController = createController({ context: 'explore', surfaceSelector: '.lanternExploreSurface' });

  global.LANTERN_FEED_EXPLORE = {
    init: function () {
      return exploreController.init();
    },
    refresh: function () {
      return exploreController.refresh();
    },
    getState: function () {
      return exploreController.getState();
    },
    getActiveController: function () {
      return activeController || exploreController;
    },
    setSearch: function (query) {
      var ctrl = activeController || exploreController;
      ctrl.setSearch(query);
      return ctrl.refresh();
    },
    createController: createController,
    RELATIONSHIP_FILTERS: RELATIONSHIP_FILTERS,
  };
})(typeof window !== 'undefined' ? window : self);
