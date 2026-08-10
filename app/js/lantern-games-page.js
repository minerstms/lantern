/**
 * Games page — leaderboard dashboard carousel + game library grid.
 * Uses shared Explore feed grid architecture; game-only dataset.
 */
(function (global) {
  'use strict';

  var AUTO_ADVANCE_MS = 5000;
  var CAROUSEL_VISIBLE = { desktop: 3, tablet: 2, mobile: 1 };

  function el(id) {
    return document.getElementById(id);
  }

  function catalog() {
    return global.LANTERN_GAME_CATALOG || null;
  }

  function cardsApi() {
    return global.LanternCards || null;
  }

  /**
   * HTTP prefix for /api/*. Empty string means same-origin (LANTERN_AVATAR_API = '').
   * Only null means "cannot fetch".
   */
  function apiBase() {
    if (global.LanternGamesRuntime && typeof global.LanternGamesRuntime.gamesApiBase !== 'undefined') {
      var runtimeBase = global.LanternGamesRuntime.gamesApiBase;
      if (runtimeBase === null) return null;
      return String(runtimeBase).replace(/\/$/, '');
    }
    if (typeof global.LANTERN_ECONOMY_API !== 'undefined' && global.LANTERN_ECONOMY_API !== null && String(global.LANTERN_ECONOMY_API).trim() !== '') {
      return String(global.LANTERN_ECONOMY_API).replace(/\/$/, '');
    }
    if (typeof global.LANTERN_AVATAR_API !== 'undefined' && global.LANTERN_AVATAR_API !== null) {
      return String(global.LANTERN_AVATAR_API).replace(/\/$/, '');
    }
    return null;
  }

  function adoptedName() {
    if (global.LanternGamesRuntime && typeof global.LanternGamesRuntime.loadAdopted === 'function') {
      var a = global.LanternGamesRuntime.loadAdopted();
      return a && a.name ? String(a.name) : '';
    }
    return '';
  }

  function friendlyName() {
    var auth = global.LanternAuth || global.LanternPilotAuth;
    if (auth && typeof auth.studentFriendlyDisplayNameFromAdopted === 'function') {
      var a = global.LanternGamesRuntime && global.LanternGamesRuntime.loadAdopted
        ? global.LanternGamesRuntime.loadAdopted()
        : null;
      return auth.studentFriendlyDisplayNameFromAdopted(a) || adoptedName();
    }
    return adoptedName();
  }

  function toast(msg) {
    if (global.LanternGamesRuntime && typeof global.LanternGamesRuntime.toast === 'function') {
      global.LanternGamesRuntime.toast(msg);
    }
  }

  function periodApiKey(periodUi) {
    var cat = catalog();
    if (!cat || !cat.PERIOD_MAP) return 'weekly';
    return cat.PERIOD_MAP[periodUi] || 'weekly';
  }

  function fetchLeaderboard(gameName, limit, periodUi) {
    var base = apiBase();
    if (base === null) return Promise.resolve({ ok: false, entries: [] });
    var cat = catalog();
    var key =
      cat && typeof cat.leaderboardKey === 'function' ? cat.leaderboardKey(gameName) : gameName;
    var period = periodApiKey(periodUi || state.period);
    var url =
      base +
      '/api/leaderboards?period=' +
      encodeURIComponent(period) +
      '&game_name=' +
      encodeURIComponent(key) +
      '&limit=' +
      (limit || 25);
    return fetch(url, { credentials: 'include' })
      .then(function (r) {
        return r.json();
      })
      .catch(function () {
        return { ok: false, entries: [] };
      });
  }

  var state = {
    period: '7d',
    typeFilter: 'all',
    statusFilter: 'all',
    sort: 'featured',
    search: '',
    leaderboardData: [],
    carouselIndex: 0,
    autoTimer: null,
    autoPaused: false,
    filtersOpen: false,
    playStarting: false,
  };

  function visibleCarouselCount() {
    if (typeof global.matchMedia !== 'function') return CAROUSEL_VISIBLE.desktop;
    var w = global.innerWidth || 1200;
    if (w < 640) return CAROUSEL_VISIBLE.mobile;
    if (w < 1024) return CAROUSEL_VISIBLE.tablet;
    return CAROUSEL_VISIBLE.desktop;
  }

  function prefersReducedMotion() {
    return typeof global.matchMedia === 'function' && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function clearAutoTimer() {
    if (state.autoTimer) {
      clearInterval(state.autoTimer);
      state.autoTimer = null;
    }
  }

  function scheduleAutoAdvance() {
    clearAutoTimer();
    if (prefersReducedMotion() || state.autoPaused) return;
    state.autoTimer = setInterval(function () {
      if (state.autoPaused || prefersReducedMotion()) return;
      advanceCarousel(1);
    }, AUTO_ADVANCE_MS);
  }

  function pauseAuto(reason) {
    state.autoPaused = true;
    clearAutoTimer();
    if (reason) {
      var root = el('gamesLeaderboardCarousel');
      if (root) root.setAttribute('data-paused', reason);
    }
  }

  function resumeAuto() {
    state.autoPaused = false;
    var root = el('gamesLeaderboardCarousel');
    if (root) root.removeAttribute('data-paused');
    scheduleAutoAdvance();
  }

  function medalForRank(rank) {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return '#' + rank;
  }

  function formatEntryLine(ent, lowerBetter) {
    var name = ent.character_name || '';
    var val = ent.score_display != null ? String(ent.score_display) : String(ent.score || '');
    return medalForRank(ent.rank) + ' ' + name + ' · ' + val;
  }

  function findUserRank(entries, userKey) {
    if (!userKey || !entries || !entries.length) return null;
    for (var i = 0; i < entries.length; i++) {
      if (String(entries[i].character_name || '') === userKey) {
        return { rank: entries[i].rank || i + 1, entry: entries[i] };
      }
    }
    return null;
  }

  /**
   * Prompt #99 follow-up — the leaderboard carousel's game+leaderboard pairing is now rendered as
   * ONE composite card: clean artwork on top (no title/badge/cost/description overlay — those all
   * still live on the canonical game_hub card used by the library grid below, untouched), and the
   * title + leaderboard info + actions directly underneath with no visible seam between the two
   * halves. Deliberately does NOT reuse buildGameHubCardSpec()/specGameHubRailCard() (the shared
   * LanternCards canonical card used by the library grid below, which always overlays
   * title/badges/meta onto the image by design) — this is a plain, purpose-built element instead,
   * so the shared card system used everywhere else on the site is untouched.
   */
  function renderLeaderboardPairedCardHtml(game, bundle) {
    var entries = (bundle && bundle.entries) || [];
    var lines = [];
    if (entries.length) {
      entries.slice(0, 3).forEach(function (ent, i) {
        var rank = ent.rank || i + 1;
        lines.push(
          '<div class="gamesLbRow">' +
            medalForRank(rank) +
            ' <span class="gamesLbPlayer">' +
            escapeHtml(ent.character_name || '') +
            '</span> · <span class="gamesLbScore">' +
            escapeHtml(ent.score_display != null ? String(ent.score_display) : String(ent.score || '')) +
            '</span></div>'
        );
      });
    } else {
      lines.push('<p class="gamesLbEmpty">No scores yet. Be the first on the board!</p>');
    }
    var userKey = adoptedName();
    var you = findUserRank(entries, userKey);
    var youLine = '';
    if (you) {
      var yVal =
        you.entry.score_display != null ? String(you.entry.score_display) : String(you.entry.score || '');
      youLine = '<p class="gamesLbYou">You: #' + you.rank + ' · ' + escapeHtml(yVal) + '</p>';
    }
    var playLabel = catalog().playActionLabel(game.play_cost);
    var artworkAlt = escapeHtml(game.name + ' artwork');
    var artworkAria = escapeHtml(playLabel + ' — ' + game.name);
    return (
      '<article class="gamesLbCard" data-game-id="' +
      escapeHtml(game.id) +
      '" data-game-name="' +
      escapeHtml(game.name) +
      '">' +
      '<button type="button" class="gamesLbArtworkBtn" data-action="play-game" aria-label="' +
      artworkAria +
      '">' +
      '<img class="gamesLbArtworkImg" src="' +
      escapeHtml(game.image || '') +
      '" alt="' +
      artworkAlt +
      '" loading="lazy" onerror="this.style.display=\'none\'; this.nextElementSibling.classList.remove(\'gamesLbArtworkFallbackHidden\');">' +
      '<span class="gamesLbArtworkFallback gamesLbArtworkFallbackHidden" aria-hidden="true"><span class="gamesLbArtworkIcon">' +
      escapeHtml(game.icon || '🎮') +
      '</span></span>' +
      '</button>' +
      '<div class="gamesLbBody">' +
      '<h3 class="gamesLbCardTitle">' +
      escapeHtml(game.icon + ' ' + game.name) +
      '</h3>' +
      '<div class="gamesLbTop3">' +
      lines.join('') +
      '</div>' +
      youLine +
      '<div class="gamesLbCardActions">' +
      '<button type="button" class="gamesLbViewBtn" data-action="view-lb">View full leaderboard</button>' +
      '<button type="button" class="gamesLbPlayBtn" data-action="play-game">' +
      escapeHtml(playLabel) +
      '</button>' +
      '</div></div></article>'
    );
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Canonical game-hub card spec — Games library grid only (Prompt #88; leaderboard carousel moved
   * to its own purpose-built element in Prompt #99, see renderLeaderboardPairedCardHtml above).
   * Prompt #114: library grid artwork stays unobstructed except one bottom-center cost line
   * ("1 Nugget = 1 Play" via playCostCardMeta). No type/Featured badge, no title over art
   * (title stays in DOM for LanternCanonicalEnforce; visually hidden by scoped CSS), no hub
   * identity prefix. Accessible name remains ariaLabel.
   */
  function buildGameHubCardSpec(g, opts) {
    opts = opts || {};
    var LC = cardsApi();
    var cat = catalog();
    if (!LC || !cat) return null;
    var metaOne = cat.playCostCardMeta(g.play_cost);
    if (g.status !== 'playable') metaOne = 'Coming soon';
    return LC.specGameHubRailCard({
      title: g.name,
      icon: g.icon,
      imageUrl: g.image || '',
      metaOne: metaOne,
      hubIdentityLabel: '',
      typeBadge: '',
      reportId: (opts.reportPrefix || 'game_') + g.id,
      extraClass: opts.extraClass || 'exploreCard--gamesLibrary',
      dataAttrs: {
        gamesProxyPlay: g.playBtnId,
        gameName: g.name,
        gameId: g.id,
        routeSurface: opts.routeSurface || 'games_library',
        routeDetail: g.id,
      },
      role: g.status === 'playable' ? 'button' : 'group',
      tabIndex: g.status === 'playable' ? 0 : -1,
      ariaLabel: g.status === 'playable' ? cat.playActionLabel(g.play_cost) + ' — ' + g.name : g.name + ' — coming soon',
    });
  }

  function renderCarousel() {
    var track = el('gamesLeaderboardTrack');
    var dots = el('gamesLeaderboardDots');
    if (!track) return;
    var cat = catalog();
    if (!cat) return;
    var games = cat.leaderboardGames();
    track.innerHTML = '';
    state.leaderboardData.forEach(function (bundle, idx) {
      var wrap = document.createElement('div');
      wrap.className = 'gamesLbSlide';
      wrap.setAttribute('data-slide-index', String(idx));
      var cardHost = document.createElement('div');
      cardHost.innerHTML = renderLeaderboardPairedCardHtml(bundle.game, bundle);
      var card = cardHost.firstElementChild;
      if (card) wrap.appendChild(card);
      track.appendChild(wrap);
    });
    if (dots) {
      dots.innerHTML = '';
      games.forEach(function (_g, i) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'gamesLbDot' + (i === state.carouselIndex ? ' is-active' : '');
        b.setAttribute('aria-label', 'Leaderboard ' + (i + 1));
        b.setAttribute('data-dot-index', String(i));
        dots.appendChild(b);
      });
    }
    updateCarouselTransform();
  }

  function updateCarouselTransform() {
    var track = el('gamesLeaderboardTrack');
    var viewport = el('gamesLeaderboardViewport');
    if (!track || !viewport) return;
    var visible = visibleCarouselCount();
    var slideW = viewport.clientWidth / visible;
    track.querySelectorAll('.gamesLbSlide').forEach(function (slide) {
      slide.style.flex = '0 0 ' + slideW + 'px';
      slide.style.maxWidth = slideW + 'px';
    });
    var maxIndex = Math.max(0, state.leaderboardData.length - visible);
    if (state.carouselIndex > maxIndex) state.carouselIndex = maxIndex;
    track.style.transform = 'translateX(' + -state.carouselIndex * slideW + 'px)';
    var dots = el('gamesLeaderboardDots');
    if (dots) {
      dots.querySelectorAll('.gamesLbDot').forEach(function (d, i) {
        d.classList.toggle('is-active', i === state.carouselIndex);
      });
    }
    var status = el('gamesLeaderboardCarouselStatus');
    if (status && state.leaderboardData.length) {
      status.textContent =
        'Leaderboard ' +
        (state.carouselIndex + 1) +
        ' of ' +
        state.leaderboardData.length;
    }
  }

  function advanceCarousel(delta) {
    var visible = visibleCarouselCount();
    var maxIndex = Math.max(0, state.leaderboardData.length - visible);
    state.carouselIndex = Math.min(maxIndex, Math.max(0, state.carouselIndex + delta));
    updateCarouselTransform();
    pauseAuto('manual');
    setTimeout(function () {
      if (!el('gamesLeaderboardCarousel') || !el('gamesLeaderboardCarousel').matches(':hover')) {
        resumeAuto();
      }
    }, AUTO_ADVANCE_MS * 2);
  }

  function loadAllLeaderboards() {
    var cat = catalog();
    if (!cat) return Promise.resolve();
    var games = cat.leaderboardGames();
    return Promise.all(
      games.map(function (g) {
        return fetchLeaderboard(g.name, 25, state.period).then(function (res) {
          var entries = res && res.ok && res.entries ? res.entries : [];
          entries.forEach(function (e, i) {
            if (!e.rank) e.rank = i + 1;
          });
          return { game: g, entries: entries };
        });
      })
    ).then(function (bundles) {
      state.leaderboardData = bundles;
      state.carouselIndex = 0;
      renderCarousel();
      scheduleAutoAdvance();
    });
  }

  function openFullLeaderboard(game) {
    if (!game) return;
    var overlay = el('gamesLbModal');
    var title = el('gamesLbModalTitle');
    var body = el('gamesLbModalBody');
    var youEl = el('gamesLbModalYou');
    if (!overlay || !body) return;
    if (title) title.textContent = game.name + ' — Leaderboard';
    body.innerHTML = '<p class="gamesLbModalLoading">Loading…</p>';
    if (youEl) youEl.textContent = '';
    overlay.hidden = false;
    fetchLeaderboard(game.name, 25, state.period).then(function (res) {
      var entries = res && res.ok && res.entries ? res.entries : [];
      if (!entries.length) {
        body.innerHTML = '<p class="gamesLbModalEmpty">No scores yet for this timeframe.</p>';
        return;
      }
      var html = '<ol class="gamesLbModalList">';
      entries.forEach(function (ent, i) {
        var rank = ent.rank || i + 1;
        html +=
          '<li><span class="gamesLbModalRank">' +
          rank +
          '</span> ' +
          escapeHtml(ent.character_name || '') +
          ' · ' +
          escapeHtml(ent.score_display != null ? String(ent.score_display) : String(ent.score || '')) +
          '</li>';
      });
      html += '</ol>';
      body.innerHTML = html;
      var userKey = adoptedName();
      var you = findUserRank(entries, userKey);
      if (youEl) {
        if (you && you.rank > 10) {
          var yVal =
            you.entry.score_display != null
              ? String(you.entry.score_display)
              : String(you.entry.score || '');
          youEl.textContent = 'You: #' + you.rank + ' · ' + yVal;
        } else if (you) {
          youEl.textContent = '';
        } else if (userKey) {
          youEl.textContent = 'You: not ranked in this window yet.';
        }
      }
    });
  }

  function filteredGames() {
    var cat = catalog();
    if (!cat) return [];
    var list = cat.listGames().slice();
    if (state.typeFilter !== 'all') {
      list = list.filter(function (g) {
        return g.type === state.typeFilter;
      });
    }
    if (state.statusFilter === 'playable') {
      list = list.filter(function (g) {
        return g.status === 'playable';
      });
    } else if (state.statusFilter === 'coming_soon') {
      list = list.filter(function (g) {
        return g.status !== 'playable';
      });
    }
    var q = String(state.search || '')
      .trim()
      .toLowerCase();
    if (q) {
      list = list.filter(function (g) {
        return (
          String(g.name || '')
            .toLowerCase()
            .indexOf(q) >= 0 ||
          String(g.description || '')
            .toLowerCase()
            .indexOf(q) >= 0
        );
      });
    }
    if (state.sort === 'az') {
      list.sort(function (a, b) {
        return String(a.name).localeCompare(String(b.name));
      });
    } else if (state.sort === 'newest') {
      list.reverse();
    } else {
      list.sort(function (a, b) {
        if (a.featured && !b.featured) return -1;
        if (!a.featured && b.featured) return 1;
        return String(a.name).localeCompare(String(b.name));
      });
    }
    return list;
  }

  function renderGameLibrary() {
    var grid = el('gamesLibraryGrid');
    var countEl = el('gamesLibraryCount');
    var LC = cardsApi();
    var cat = catalog();
    if (!grid || !LC || !cat) {
      if (global.LanternCanonicalFailClosed) {
        global.LanternCanonicalFailClosed('gamesLibraryGrid + LanternCards + LANTERN_GAME_CATALOG required');
      }
      return;
    }
    var games = filteredGames();
    if (countEl) countEl.textContent = games.length + ' game' + (games.length === 1 ? '' : 's');
    grid.innerHTML = '';
    games.forEach(function (g) {
      var spec = buildGameHubCardSpec(g, {});
      var node = spec ? LC.createStudentCard(spec) : null;
      if (node) grid.appendChild(node);
    });
    LC.enhanceReportControlsIn(grid);
    wireLibraryProxyClicks(grid);
    if (typeof global.LanternGamesRuntime !== 'undefined' && global.LanternGamesRuntime.refreshDailyHunt) {
      global.LanternGamesRuntime.refreshDailyHunt();
    }
  }

  function wireLibraryProxyClicks(container) {
    if (!container || container._gamesLibProxyWired) return;
    container._gamesLibProxyWired = true;
    function proxyPlay(card) {
      if (!card || card.getAttribute('data-game-id') && catalog().getGameById(card.getAttribute('data-game-id')) && catalog().getGameById(card.getAttribute('data-game-id')).status !== 'playable') {
        toast('This game is coming soon.');
        return;
      }
      var pid = (card.getAttribute('data-games-proxy-play') || '').trim();
      var target = pid && el(pid);
      if (!target) return;
      if (target.disabled || (global.LanternGamesPaidStart && global.LanternGamesPaidStart.isInFlight && global.LanternGamesPaidStart.isInFlight())) {
        if (global.LanternGamesPaidStart && global.LanternGamesPaidStart.isInFlight && global.LanternGamesPaidStart.isInFlight()) {
          toast('Game is starting…');
        }
        return;
      }
      target.click();
    }
    container.addEventListener('click', function (e) {
      if (e.target.closest('.exploreCardReportBtn')) return;
      var card = e.target.closest('.gamesHubPlayCard[data-games-proxy-play]');
      if (!card) return;
      e.preventDefault();
      proxyPlay(card);
    });
    container.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var card = e.target.closest('.gamesHubPlayCard[data-games-proxy-play]');
      if (!card || e.target !== card) return;
      e.preventDefault();
      proxyPlay(card);
    });
  }

  function wireCarouselControls() {
    var root = el('gamesLeaderboardCarousel');
    if (!root || root._wired) return;
    root._wired = true;
    root.addEventListener('mouseenter', function () {
      pauseAuto('hover');
    });
    root.addEventListener('mouseleave', function () {
      resumeAuto();
    });
    root.addEventListener('focusin', function () {
      pauseAuto('focus');
    });
    root.addEventListener('focusout', function (e) {
      if (!root.contains(e.relatedTarget)) resumeAuto();
    });
    var prev = el('gamesLeaderboardPrev');
    var next = el('gamesLeaderboardNext');
    if (prev) prev.addEventListener('click', function () {
      advanceCarousel(-1);
    });
    if (next) next.addEventListener('click', function () {
      advanceCarousel(1);
    });
    var dots = el('gamesLeaderboardDots');
    if (dots) {
      dots.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-dot-index]');
        if (!btn) return;
        state.carouselIndex = parseInt(btn.getAttribute('data-dot-index'), 10) || 0;
        updateCarouselTransform();
        pauseAuto('dot');
        setTimeout(resumeAuto, AUTO_ADVANCE_MS * 2);
      });
    }
    root.addEventListener('click', function (e) {
      var viewBtn = e.target.closest('[data-action="view-lb"]');
      var playBtn = e.target.closest('[data-action="play-game"]');
      var card = e.target.closest('.gamesLbCard');
      if (!card) return;
      var gameId = card.getAttribute('data-game-id');
      var game = catalog().getGameById(gameId);
      if (viewBtn && game) {
        e.preventDefault();
        openFullLeaderboard(game);
        return;
      }
      if (playBtn && game) {
        e.preventDefault();
        var pid = game.playBtnId;
        var target = pid && el(pid);
        if (target) target.click();
      }
    });
    global.addEventListener('resize', function () {
      updateCarouselTransform();
    });
  }

  function wirePeriodTabs() {
    var bar = el('gamesLeaderboardPeriods');
    if (!bar || bar._wired) return;
    bar._wired = true;
    bar.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-period]');
      if (!btn) return;
      var p = btn.getAttribute('data-period');
      if (!p || p === state.period) return;
      state.period = p;
      bar.querySelectorAll('[data-period]').forEach(function (b) {
        var active = b.getAttribute('data-period') === p;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      loadAllLeaderboards();
    });
  }

  function wireFilters() {
    var toggle = el('gamesFiltersToggle');
    var panel = el('gamesFiltersPanel');
    if (toggle && panel) {
      toggle.addEventListener('click', function () {
        state.filtersOpen = !state.filtersOpen;
        panel.hidden = !state.filtersOpen;
        toggle.setAttribute('aria-expanded', state.filtersOpen ? 'true' : 'false');
        toggle.textContent = state.filtersOpen ? 'Filters ▾' : 'Filters ▸';
      });
    }
    var typeSel = el('gamesTypeFilter');
    var statusSel = el('gamesStatusFilter');
    var sortSel = el('gamesSortSelect');
    if (typeSel) {
      typeSel.addEventListener('change', function () {
        state.typeFilter = typeSel.value || 'all';
        renderGameLibrary();
      });
    }
    if (statusSel) {
      statusSel.addEventListener('change', function () {
        state.statusFilter = statusSel.value || 'all';
        renderGameLibrary();
      });
    }
    if (sortSel) {
      sortSel.addEventListener('change', function () {
        state.sort = sortSel.value || 'featured';
        renderGameLibrary();
      });
    }
    if (global.LanternNav && typeof global.LanternNav.onHeaderSearch === 'function') {
      global.LanternNav.onHeaderSearch(function (q) {
        state.search = q;
        renderGameLibrary();
      });
    }
  }

  function wireModal() {
    var overlay = el('gamesLbModal');
    var closeBtn = el('gamesLbModalClose');
    if (closeBtn && overlay) {
      closeBtn.addEventListener('click', function () {
        overlay.hidden = true;
      });
    }
    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) overlay.hidden = true;
      });
    }
  }

  function refreshWalletDisplay() {
    var amt = el('gamesPageWalletAmt');
    if (!amt || !global.LanternWallet) return Promise.resolve();
    return global.LanternWallet.fetchMyBalance().then(function (res) {
      if (res && res.ok && res.available != null) {
        amt.textContent = String(res.available);
      } else if (amt.textContent === '' || amt.textContent === '…') {
        amt.textContent = '—';
      }
    });
  }

  function init() {
    var cat = catalog();
    if (!cat) {
      if (global.LanternCanonicalFailClosed) global.LanternCanonicalFailClosed('LANTERN_GAME_CATALOG required');
      return;
    }
    state.period = cat.DEFAULT_PERIOD || '7d';
    wireCarouselControls();
    wirePeriodTabs();
    wireFilters();
    wireModal();
    renderGameLibrary();
    loadAllLeaderboards();
    refreshWalletDisplay();
  }

  global.LanternGamesPage = {
    init: init,
    refreshWalletDisplay: refreshWalletDisplay,
    loadAllLeaderboards: loadAllLeaderboards,
    renderGameLibrary: renderGameLibrary,
    setPlayStarting: function (v) {
      state.playStarting = !!v;
    },
    getPeriod: function () {
      return state.period;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
