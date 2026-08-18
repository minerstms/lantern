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
      nextCursor: '',
      hasMore: false,
      loadError: '',
    };

    var EXPLORE_PAGE_SIZE = 60;

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
          loadFeed(false);
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
          loadFeed(false);
        });
        wrap.appendChild(btn);
      });
    }

    function seenIds() {
      var map = {};
      state.items.forEach(function (it) {
        if (it && it.id) map[String(it.id)] = true;
      });
      return map;
    }

    function renderPagination() {
      var wrap = el('feedLoadMoreWrap');
      var btn = el('feedLoadMoreBtn');
      var status = el('feedLoadMoreStatus');
      if (!wrap || context !== 'explore') return;
      wrap.hidden = false;
      if (btn) {
        btn.hidden = !state.hasMore || !!state.loadError;
        btn.disabled = !!state.loading;
        btn.textContent = state.loading ? 'Loading…' : 'Load More';
      }
      if (status) {
        if (state.loading && !state.items.length) status.textContent = '';
        else if (state.loadError) status.textContent = state.loadError;
        else if (!state.loading && state.items.length && !state.hasMore) {
          status.textContent = "You've reached the beginning of Lantern.";
        } else status.textContent = '';
      }
    }

    function renderGrid() {
      var grid = el('feedGrid');
      var empty = el('feedEmpty');
      if (!grid) return;
      grid.innerHTML = '';
      if (!state.items.length) {
        if (empty) empty.hidden = false;
        renderPagination();
        return;
      }
      if (empty) empty.hidden = true;
      var cardApi = global.LANTERN_FEED_CARD;
      if (!cardApi) return;
      state.items.forEach(function (item) {
        grid.appendChild(cardApi.buildCard(item, { onRefresh: function () { loadFeed(false); } }));
      });
      renderPagination();
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

    function loadFeed(append) {
      if (!global.LANTERN_FEED || state.loading) return;
      if (append && !state.hasMore) return;
      state.loading = true;
      state.loadError = '';
      renderPagination();
      var status = el('feedStatus');
      /* Prompt #187 — Explore has no visible item count; Locker (#185) still shows live count. */
      if (status && context === 'locker' && !append) status.textContent = 'Loading…';
      var req;
      if (context === 'locker' && global.LANTERN_FEED.getLockerPersonalFeed) {
        req = global.LANTERN_FEED.getLockerPersonalFeed({
          relationship: state.relationship,
          type: state.type,
          search: state.search,
          sort: state.sort,
          limit: EXPLORE_PAGE_SIZE,
        });
      } else {
        var q = {
          type: state.type,
          search: state.search,
          sort: state.sort,
          limit: EXPLORE_PAGE_SIZE,
        };
        if (append && state.nextCursor) q.cursor = state.nextCursor;
        req = global.LANTERN_FEED.getFeed(q);
      }
      req.then(function (res) {
        state.loading = false;
        if (status && context === 'locker') status.textContent = '';
        if (!res || !res.ok) {
          if (status && context === 'locker') status.textContent = 'Could not load feed.';
          if (append) {
            state.loadError = 'Could not load more. Try again.';
            renderPagination();
            return;
          }
          state.items = [];
          state.hasMore = false;
          state.nextCursor = '';
          renderGrid();
          return;
        }
        var incoming = res.items || [];
        var meta = res.meta || {};
        if (append) {
          var seen = seenIds();
          incoming.forEach(function (it) {
            if (!it || !it.id || seen[String(it.id)]) return;
            seen[String(it.id)] = true;
            state.items.push(it);
          });
        } else {
          state.items = incoming;
        }
        state.nextCursor = meta.next_cursor ? String(meta.next_cursor) : '';
        state.hasMore = context === 'explore' && !!meta.has_more && !!state.nextCursor;
        if (status && context === 'locker') {
          status.textContent = state.items.length + ' item' + (state.items.length === 1 ? '' : 's');
        }
        /* Prompt #158 / #218 — resolve canonical author avatars before paint.
           Prefer durable authorAvatarKey / authorId (rick.radle), not display "Rick Radle". */
        state.items.forEach(function (it) {
          if (!it) return;
          var avatarKey = String(it.authorAvatarKey || it.author_avatar_key || it.authorId || it.author_id || it.actor_id || '').trim();
          var displayNm = String(it.authorDisplayName || it.author_name || '').trim();
          if (avatarKey) it.character_name = avatarKey;
          if (displayNm) it.author_name = displayNm;
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
          loadFeed(false);
        });
      }
      var refreshBtn = el('feedRefreshBtn');
      if (refreshBtn) refreshBtn.addEventListener('click', function () { loadFeed(false); });
      var moreBtn = el('feedLoadMoreBtn');
      if (moreBtn && context === 'explore' && !moreBtn._wired) {
        moreBtn._wired = true;
        moreBtn.addEventListener('click', function () {
          if (state.loading || !state.hasMore) return;
          loadFeed(true);
        });
      }
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
      refresh: function () { return loadFeed(false); },
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
