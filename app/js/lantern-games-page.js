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

  function isAvatarMatchName(gameName, key) {
    return String(gameName || '') === 'Avatar Match' || String(key || '') === 'Avatar Match';
  }

  function fetchLeaderboard(gameName, limit, periodUi, amOpts) {
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
    if (isAvatarMatchName(gameName, key)) {
      var mode = String((amOpts && amOpts.amMode) || '10').trim().toLowerCase() || '10';
      url += '&am_mode=' + encodeURIComponent(mode);
      if (mode === 'full') {
        var q = Math.floor(Number(amOpts && amOpts.amQuestions != null ? amOpts.amQuestions : state.amEligibleCount) || 0);
        if (q > 0) url += '&am_questions=' + encodeURIComponent(String(q));
      }
    }
    return fetch(url, { credentials: 'include' })
      .then(function (r) {
        return r.json();
      })
      .catch(function () {
        return { ok: false, entries: [] };
      });
  }

  function fetchAvatarMatchEligibleCount() {
    var base = apiBase();
    if (base === null) return Promise.resolve(0);
    if (state.amEligibleCount > 0) return Promise.resolve(state.amEligibleCount);
    return fetch(base + '/api/games/characters', { credentials: 'include', cache: 'no-store' })
      .then(function (r) {
        return r.json();
      })
      .then(function (res) {
        var n = res && res.ok && Array.isArray(res.characters) ? res.characters.length : 0;
        state.amEligibleCount = n;
        return n;
      })
      .catch(function () {
        return state.amEligibleCount || 0;
      });
  }

  function amDivisionLabel(mode, count) {
    var id = String(mode || '10').trim().toLowerCase();
    if (id === 'full') return 'Full Roster · ' + Math.max(0, Math.floor(Number(count) || 0));
    return id + ' Questions';
  }

  function renderAmDivisionBar(selected, count) {
    var n = Math.max(0, Math.floor(Number(count) || 0));
    var avail =
      global.LanternAvatarMatch && typeof global.LanternAvatarMatch.modeAvailability === 'function'
        ? global.LanternAvatarMatch.modeAvailability(n)
        : null;
    var modes = avail && avail.modes ? avail.modes : [
      { id: '10', enabled: n >= 10, requires: 10 },
      { id: '25', enabled: n >= 25, requires: 25 },
      { id: '50', enabled: n >= 50, requires: 50 },
      { id: '100', enabled: n >= 100, requires: 100 },
      { id: 'full', enabled: n >= 4, questions: n },
    ];
    var html = '<div class="gamesAmDivisions" id="gamesAmDivisions" role="tablist" aria-label="Avatar Match leaderboard length" data-am-lb-default="10">';
    modes.forEach(function (mode) {
      var viewable = mode.id === '100' ? n >= 100 : true;
      if (mode.id === 'full') viewable = n >= 4;
      var reason = '';
      if (!viewable && global.LanternAvatarMatch && typeof global.LanternAvatarMatch.disabledReason === 'function') {
        reason = global.LanternAvatarMatch.disabledReason(mode, n);
      } else if (!viewable && mode.id === '100') {
        reason = 'Requires 100 eligible users\n' + n + ' available';
      }
      var label = mode.id === 'full' ? amDivisionLabel('full', n) : amDivisionLabel(mode.id, n);
      html +=
        '<button type="button" class="gamesAmDivBtn' +
        (String(selected) === String(mode.id) ? ' is-active' : '') +
        (viewable ? '' : ' is-disabled') +
        '" data-am-lb-mode="' +
        escapeHtml(mode.id) +
        '" role="tab" aria-selected="' +
        (String(selected) === String(mode.id) ? 'true' : 'false') +
        '"' +
        (viewable ? '' : ' disabled aria-disabled="true" title="' + escapeHtml(reason.replace(/\n/g, ' ')) + '"') +
        '>' +
        escapeHtml(label) +
        (!viewable && reason ? '<span class="gamesAmDivWhy">' + escapeHtml(reason) + '</span>' : '') +
        '</button>';
    });
    html += '</div>';
    return html;
  }

  function parseAmScoreDisplay(ent) {
    var raw = ent && ent.score_display != null ? String(ent.score_display) : '';
    var parts = raw.split(' · ');
    return {
      correct: parts[0] || '',
      accuracy: parts[1] || '',
      time: parts[2] || raw,
    };
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
    amModalMode: '10',
    amEligibleCount: 0,
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

  function leaderboardPublicLabel(ent) {
    if (!ent) return '';
    var pdn = ent.public_display_name != null && String(ent.public_display_name).trim() ? String(ent.public_display_name).trim() : '';
    if (pdn) return pdn;
    pdn = ent.display_name != null && String(ent.display_name).trim() ? String(ent.display_name).trim() : '';
    if (pdn) return pdn;
    return 'Player';
  }

  function formatEntryLine(ent, lowerBetter) {
    var name = leaderboardPublicLabel(ent);
    var val = ent.score_display != null ? String(ent.score_display) : String(ent.score || '');
    return medalForRank(ent.rank) + ' ' + name + ' · ' + val;
  }

  function sessionLooksSignedIn() {
    return !!(adoptedName() || friendlyName());
  }

  function youScoreText(you) {
    if (!you) return '';
    if (you.score_display != null && String(you.score_display).trim()) return String(you.score_display);
    if (you.score != null) return String(you.score);
    return '';
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
            escapeHtml(leaderboardPublicLabel(ent)) +
            '</span> · <span class="gamesLbScore">' +
            escapeHtml(ent.score_display != null ? String(ent.score_display) : String(ent.score || '')) +
            '</span></div>'
        );
      });
    } else {
      lines.push('<p class="gamesLbEmpty">No scores yet. Be the first on the board!</p>');
    }
    var you = bundle && bundle.you;
    var youLine = '';
    if (you && you.rank) {
      youLine = '<p class="gamesLbYou">You: #' + you.rank + ' · ' + escapeHtml(youScoreText(you)) + '</p>';
    } else if (you && youScoreText(you)) {
      youLine = '<p class="gamesLbYou">You: ' + escapeHtml(youScoreText(you)) + '</p>';
    }
    var playLabel = catalog().playActionLabel(g.id || g.name);
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
      (game.id === 'avatar-match' || game.name === 'Avatar Match'
        ? '<p class="gamesLbAmDefault">10 Questions</p>'
        : '') +
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
    var metaOne = cat.playCostCardMeta(g.id || g.name);
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
      ariaLabel: g.status === 'playable' ? cat.playActionLabel(g.id || g.name) + ' — ' + g.name : g.name + ' — coming soon',
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
        return fetchLeaderboard(g.name, 25, state.period, g.id === 'avatar-match' ? { amMode: '10' } : null).then(function (res) {
          var entries = res && res.ok && res.entries ? res.entries : [];
          entries.forEach(function (e, i) {
            if (!e.rank) e.rank = i + 1;
          });
          return { game: g, entries: entries, you: res && res.ok ? res.you || null : null };
        });
      })
    ).then(function (bundles) {
      state.leaderboardData = bundles;
      state.carouselIndex = 0;
      renderCarousel();
      scheduleAutoAdvance();
    });
  }

  function fillYouLine(youEl, you) {
    if (!youEl) return;
    if (you && you.rank) {
      youEl.textContent = 'You: #' + you.rank + ' · ' + youScoreText(you);
      return;
    }
    if (you && youScoreText(you)) {
      youEl.textContent = 'You: ' + youScoreText(you);
      return;
    }
    if (sessionLooksSignedIn()) {
      youEl.textContent = 'You: not ranked in this window yet.';
      return;
    }
    youEl.textContent = '';
  }

  function renderGenericLeaderboardList(entries) {
    var html = '<ol class="gamesLbModalList">';
    entries.forEach(function (ent, i) {
      var rank = ent.rank || i + 1;
      html +=
        '<li><span class="gamesLbModalRank">' +
        rank +
        '</span> ' +
        escapeHtml(leaderboardPublicLabel(ent)) +
        ' · ' +
        escapeHtml(ent.score_display != null ? String(ent.score_display) : String(ent.score || '')) +
        '</li>';
    });
    html += '</ol>';
    return html;
  }

  function renderAmLeaderboardList(entries) {
    if (!entries.length) return '<p class="gamesLbModalEmpty">No scores yet for this length.</p>';
    var html = '<ol class="gamesLbModalList gamesLbModalListAm">';
    entries.forEach(function (ent, i) {
      var rank = ent.rank || i + 1;
      var bits = parseAmScoreDisplay(ent);
      html +=
        '<li class="gamesLbModalRow">' +
        '<span class="gamesLbModalRank">' +
        rank +
        '</span>' +
        '<span class="gamesLbModalName">' +
        escapeHtml(leaderboardPublicLabel(ent)) +
        '</span>' +
        '<span class="gamesLbModalMeta">' +
        '<span class="gamesLbModalCorrect">' +
        escapeHtml(bits.correct || '—') +
        '</span>' +
        '<span class="gamesLbModalAcc">' +
        escapeHtml(bits.accuracy || '—') +
        '</span>' +
        '<span class="gamesLbModalTime">' +
        escapeHtml(bits.time || '—') +
        '</span></span></li>';
    });
    html += '</ol>';
    return html;
  }

  function loadAvatarMatchModalBoard(game, mode, count) {
    var body = el('gamesLbModalBody');
    var youEl = el('gamesLbModalYou');
    var title = el('gamesLbModalTitle');
    if (!body) return;
    state.amModalMode = String(mode || '10');
    if (title) title.textContent = 'Avatar Match — ' + amDivisionLabel(state.amModalMode, count);
    body.innerHTML = renderAmDivisionBar(state.amModalMode, count) + '<p class="gamesLbModalLoading">Loading…</p>';
    if (youEl) youEl.textContent = '';
    fetchLeaderboard('Avatar Match', 25, state.period, {
      amMode: state.amModalMode,
      amQuestions: state.amModalMode === 'full' ? count : 0,
    }).then(function (res) {
      var entries = res && res.ok && res.entries ? res.entries : [];
      body.innerHTML = renderAmDivisionBar(state.amModalMode, count) + renderAmLeaderboardList(entries);
      fillYouLine(youEl, res && res.ok ? res.you : null);
    });
  }

  function openFullLeaderboard(game, opts) {
    if (!game) return;
    var overlay = el('gamesLbModal');
    var title = el('gamesLbModalTitle');
    var body = el('gamesLbModalBody');
    var youEl = el('gamesLbModalYou');
    if (!overlay || !body) return;
    if (youEl) youEl.textContent = '';
    var wasHidden = overlay.hidden;
    overlay.hidden = false;
    if (wasHidden && global.LanternInteractiveSurface && typeof global.LanternInteractiveSurface.lockPage === 'function') {
      global.LanternInteractiveSurface.lockPage();
    }
    if (game.id === 'avatar-match' || game.name === 'Avatar Match') {
      var startMode = String((opts && opts.amMode) || state.amModalMode || '10').trim().toLowerCase() || '10';
      if (opts && opts.amQuestions) state.amEligibleCount = Math.max(state.amEligibleCount, Math.floor(Number(opts.amQuestions) || 0));
      if (title) title.textContent = 'Avatar Match — ' + amDivisionLabel(startMode, state.amEligibleCount);
      body.innerHTML = '<p class="gamesLbModalLoading">Loading…</p>';
      fetchAvatarMatchEligibleCount().then(function (count) {
        if (startMode === '100' && count < 100) startMode = '10';
        loadAvatarMatchModalBoard(game, startMode, count);
      });
      return;
    }
    if (title) title.textContent = game.name + ' — Leaderboard';
    body.innerHTML = '<p class="gamesLbModalLoading">Loading…</p>';
    fetchLeaderboard(game.name, 25, state.period).then(function (res) {
      var entries = res && res.ok && res.entries ? res.entries : [];
      if (!entries.length) {
        body.innerHTML = '<p class="gamesLbModalEmpty">No scores yet for this timeframe.</p>';
        fillYouLine(youEl, res && res.ok ? res.you : null);
        return;
      }
      body.innerHTML = renderGenericLeaderboardList(entries);
      fillYouLine(youEl, res && res.ok ? res.you : null);
    });
  }

  function openAvatarMatchLeaderboard(mode, questions) {
    var cat = catalog();
    var game = cat && typeof cat.getGameByName === 'function' ? cat.getGameByName('Avatar Match') : null;
    if (!game && cat && typeof cat.getGameById === 'function') game = cat.getGameById('avatar-match');
    if (!game) return;
    openFullLeaderboard(game, { amMode: mode || '10', amQuestions: questions });
  }

  function filteredGames() {
    var cat = catalog();
    if (!cat) return [];
    var list = (typeof cat.playHubGames === 'function' ? cat.playHubGames() : cat.listGames()).slice();
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
    if (countEl) {
      countEl.textContent = games.length + ' game' + (games.length === 1 ? '' : 's');
    }
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
      if (!card) return;
      var gameId = (card.getAttribute('data-game-id') || '').trim();
      var cat = catalog();
      var game = gameId && cat && typeof cat.getGameById === 'function' ? cat.getGameById(gameId) : null;
      if (game && game.status !== 'playable') {
        toast('This game is coming soon.');
        return;
      }
      // Prompt #151 — card selection opens the game (pregame). Do not block on trigger
      // `.disabled` (legacy balance gate); Nugget spend is enforced later on Start.
      if (global.LanternGamesPaidStart && global.LanternGamesPaidStart.isInFlight && global.LanternGamesPaidStart.isInFlight()) {
        toast('Game is starting…');
        return;
      }
      var pid = (card.getAttribute('data-games-proxy-play') || '').trim();
      var target = pid && el(pid);
      if (!target) {
        toast('Couldn\'t open game. Try again.');
        return;
      }
      // Programmatic click must work even if a stale disabled attribute remains on the
      // off-DOM trigger (disabled buttons swallow HTMLElement.click()).
      var wasDisabled = !!target.disabled;
      if (wasDisabled) target.disabled = false;
      try {
        target.click();
      } finally {
        if (wasDisabled) target.disabled = true;
      }
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
        if (!target) {
          toast('Couldn\'t open game. Try again.');
          return;
        }
        var wasDisabled = !!target.disabled;
        if (wasDisabled) target.disabled = false;
        try {
          target.click();
        } finally {
          if (wasDisabled) target.disabled = true;
        }
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

  function closeFullLeaderboard() {
    var overlay = el('gamesLbModal');
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    if (global.LanternInteractiveSurface && typeof global.LanternInteractiveSurface.unlockPage === 'function') {
      global.LanternInteractiveSurface.unlockPage();
    }
  }

  function wireModal() {
    var overlay = el('gamesLbModal');
    var closeBtn = el('gamesLbModalClose');
    var body = el('gamesLbModalBody');
    if (closeBtn && overlay) {
      closeBtn.addEventListener('click', function () {
        closeFullLeaderboard();
      });
    }
    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeFullLeaderboard();
      });
    }
    if (body && !body._amDivWired) {
      body._amDivWired = true;
      body.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-am-lb-mode]');
        if (!btn || btn.disabled) return;
        var mode = btn.getAttribute('data-am-lb-mode');
        var cat = catalog();
        var game = cat && typeof cat.getGameById === 'function' ? cat.getGameById('avatar-match') : null;
        if (!game) return;
        loadAvatarMatchModalBoard(game, mode, state.amEligibleCount);
      });
    }
  }

  function refreshWalletDisplay() {
    var amt = el('gamesPageWalletAmt');
    if (!amt || !global.LanternWallet) return Promise.resolve();
    if (typeof global.LanternWallet.bindElement === 'function' && !amt.getAttribute('data-lantern-economy-bound')) {
      amt.setAttribute('data-lantern-economy-bound', '1');
      global.LanternWallet.bindElement(amt, { format: 'number' });
    }
    if (typeof global.LanternWallet.refreshBalance === 'function') {
      return global.LanternWallet.refreshBalance({ force: true });
    }
    return global.LanternWallet.fetchMyBalance();
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
    var econReady =
      global.LanternGameEconomy && typeof global.LanternGameEconomy.load === 'function'
        ? global.LanternGameEconomy.load()
        : Promise.resolve();
    econReady.finally(function () {
      renderGameLibrary();
      loadAllLeaderboards();
      refreshWalletDisplay();
    });
  }

  global.LanternGamesPage = {
    init: init,
    refreshWalletDisplay: refreshWalletDisplay,
    loadAllLeaderboards: loadAllLeaderboards,
    renderGameLibrary: renderGameLibrary,
    openFullLeaderboard: openFullLeaderboard,
    openAvatarMatchLeaderboard: openAvatarMatchLeaderboard,
    setPlayStarting: function (v) {
      state.playStarting = !!v;
    },
    getPeriod: function () {
      return state.period;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
