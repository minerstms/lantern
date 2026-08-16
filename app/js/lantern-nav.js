/**
 * TMS Lantern — App shell: ONE visible header (Explore); no per-page center titles.
 */
(function (global) {
  var NAV = {
    navy: '#0f2744',
    columbiaBlue: '#9dd4f0',
    white: '#ffffff',
  };

  function getCurrentPage() {
    var path = (typeof location !== 'undefined' && location.pathname) ? location.pathname : '';
    if (/index\.html$|\/$/.test(path)) return 'profile';
    if (/missions\.html/.test(path)) return 'missions';
    if (/thanks\.html/.test(path)) return 'thanks';
    if (/grades\.html/.test(path)) return 'grades';
    if (/news\.html/.test(path)) return 'news';
    if (/store\.html/.test(path) || /\/store\/?$/.test(path)) return 'store';
    if (/games\.html/.test(path) || /\/games\/?$/.test(path)) return 'games';
    if (/locker\.html/.test(path) || /\/locker\/?$/.test(path)) return 'locker';
    if (/explore\.html/.test(path) || /\/explore\/?$/.test(path)) return 'explore';
    if (/teacher\.html/.test(path) || /\/teacher\/?$/.test(path)) return 'teacher';
    if (/admin\.html/.test(path) || /\/admin\/?$/.test(path)) return 'admin';
    if (/display\.html/.test(path)) return 'display';
    if (/staff\.html/.test(path)) return 'staff';
    if (/contribute\.html/.test(path)) return 'contribute';
    if (/school-survival\.html/.test(path)) return 'school_survival';
    return '';
  }

  function getPageContext() {
    return '';
  }

  /** Chevron menu: fail-closed student core until /api/auth/me applies role + capabilities (#163). */
  function buildLanternNavDropdownHtml(current) {
    var sections =
      global.LanternStaffNav && typeof global.LanternStaffNav.buildMenuSectionsHtml === 'function'
        ? global.LanternStaffNav.buildMenuSectionsHtml(current, 'lantern', null, null)
        : '<div class="lanternAppBarDropdownSection"><div class="lanternAppBarDropdownGroupLabel">NAVIGATION</div>' +
          '<a href="explore.html" role="menuitem" class="lanternAppBarDropdownLink" data-page="explore">Lantern</a>' +
          '<a href="locker.html" role="menuitem" class="lanternAppBarDropdownLink" data-page="locker">Locker</a>' +
          '<a href="contribute.html" role="menuitem" class="lanternAppBarDropdownLink" data-page="create">Create</a>' +
          '<a href="games.html" role="menuitem" class="lanternAppBarDropdownLink" data-page="play">Play</a>' +
          '<a href="missions.html" role="menuitem" class="lanternAppBarDropdownLink" data-page="missions">Missions <span id="lanternNavMissionsBadge" class="lanternNavBadge">0</span></a>' +
          '</div>';
    return (
      '<div class="lanternAppBarDropdown" id="lanternMenuDropdown" role="menu" hidden>' +
      sections +
      '<div class="lanternAppBarDropdownSection lanternAppBarDropdownSection--logout" id="lanternNavLogoutSection" hidden>' +
      '<button type="button" class="lanternAppBarDropdownLogout" id="lanternNavLogoutBtn" role="menuitem">Log out</button>' +
      '</div></div>'
    );
  }

  function buildLanternChevronMenuWrap(current) {
    var chevron = '<button type="button" class="lanternAppBarMenuChevron" id="lanternMenuTrigger" aria-haspopup="true" aria-expanded="false" aria-label="Open navigation menu"><span class="lanternAppBarMenuChevronIcon" aria-hidden="true">&#9660;</span></button>';
    return '<div class="lanternAppBarMenuWrap lanternAppBarLanternMenuWrap">' + chevron + buildLanternNavDropdownHtml(current) + '</div>';
  }

  /** Same returned semantics as Locker → Overview → My Creations → Needs Attention (status === 'returned'). */
  function countReturnedRows(rows) {
    var n = 0;
    (rows || []).forEach(function (r) {
      if (r && String(r.status || '').toLowerCase() === 'returned') n++;
    });
    return n;
  }

  function getAdoptedFromStorage() {
    try {
      var auth = global.LanternAuth || global.LanternPilotAuth;
      if (auth && typeof auth.adoptedFromPilotMe === 'function') {
        var a = auth.adoptedFromPilotMe();
        if (a && a.name) return a;
      }
    } catch (e) {}
    return null;
  }

  function fetchProfileNeedsAttentionCount() {
    var apiBase =
      typeof global.LANTERN_AVATAR_API !== 'undefined' && global.LANTERN_AVATAR_API !== null
        ? String(global.LANTERN_AVATAR_API).replace(/\/$/, '')
        : null;
    var adopted = getAdoptedFromStorage();
    var characterNameForApi = adopted && String((adopted.character_id || adopted.name || '')).trim();
    var newsAuthorMine = adopted && String((adopted.name || adopted.character_id || '')).trim();
    if (apiBase === null || !characterNameForApi) return Promise.resolve(0);

    var urlPoll = apiBase + '/api/polls/contributions?character_name=' + encodeURIComponent(characterNameForApi);
    var urlMiss = apiBase + '/api/missions/submissions/character';
    var urlNews = apiBase + '/api/news/mine?author_name=' + encodeURIComponent(newsAuthorMine);

    var pPoll = fetch(urlPoll, { credentials: 'include' }).then(function (r) { return r.json(); }).then(function (res) { return (res && res.contributions) || []; }).catch(function () { return []; });
    var pMiss = fetch(urlMiss, { credentials: 'include' }).then(function (r) { return r.json(); }).then(function (res) { return (res && res.ok && res.submissions) ? res.submissions : []; }).catch(function () { return []; });
    var pNews = fetch(urlNews).then(function (r) { return r.json(); }).then(function (res) { return (res && res.ok && res.news) ? res.news : []; }).catch(function () { return []; });

    return Promise.all([pPoll, pMiss, pNews]).then(function (arr) {
      return countReturnedRows(arr[0]) + countReturnedRows(arr[1]) + countReturnedRows(arr[2]);
    });
  }

  var lastAttentionCount = -1;
  /* Prompt #85 — pilotSessionShellGate() below already makes its own definitive /api/auth/me
     call on every page. Once that call has established the visitor is not authenticated, the
     periodic/visibility-triggered bell refresh has nothing to show and would just be firing
     mission/poll/news requests that are certain to fail on an expired session. This flag is set
     from that same established check (no new auth call added) and only skips the recurring
     refresh — the very first refreshNeedsAttentionBellFromApi() call at init() still runs as
     before, since the shell gate has not resolved yet at that point. */
  var navKnownUnauthenticated = false;

  function applyBellCount(count) {
    var bell = document.getElementById('lanternExploreBell');
    if (!bell) return;
    var n = typeof count === 'number' && !isNaN(count) ? count : 0;
    lastAttentionCount = n;
    if (n <= 0) {
      bell.classList.add('lanternAppBarBell--inactive');
      bell.style.display = '';
      bell.setAttribute('aria-hidden', 'true');
      bell.setAttribute('aria-label', 'Needs attention');
      bell.classList.remove('lanternAppBarBell--attention');
      return;
    }
    bell.classList.remove('lanternAppBarBell--inactive');
    bell.style.display = '';
    bell.removeAttribute('aria-hidden');
    bell.setAttribute('aria-label', 'Needs attention — ' + n + ' item' + (n !== 1 ? 's' : '') + ' — open Locker');
    bell.classList.add('lanternAppBarBell--attention');
  }

  function wireBellClick() {
    var bellBtn = document.getElementById('lanternExploreBell');
    if (!bellBtn) return;
    bellBtn.addEventListener('click', function () {
      global.location.href = 'locker.html#profileNeedsAttention';
    });
  }

  function buildInteractiveBar() {
    var current = getCurrentPage();
    var contextText = getPageContext();
    var homeLink = '<a href="explore.html" class="lanternAppBarHomeLink" id="lanternHomeLink">Lantern</a>';
    var left = '<div class="lanternAppBarLeft"><div class="lanternAppBarBrandMenu">' + homeLink + buildLanternChevronMenuWrap(current) + '</div></div>';
    var ctxClass = 'lanternAppBarContext' + (contextText ? '' : ' lanternAppBarContext--empty');
    var context = '<div class="' + ctxClass + '" id="lanternAppBarContext">' + (contextText || '') + '</div>';
    var searchWrap = '<div class="lanternAppBarSearchWrap" id="lanternExploreSearchWrap"><span class="lanternAppBarSearchTrigger" id="lanternExploreSearchTrigger" role="button" tabindex="0" aria-label="Search">&#128269;</span><input type="text" class="lanternAppBarSearchInput" id="lanternExploreSearch" placeholder="Search Lantern..." aria-label="Search Lantern"></div>';
    /* Prompt #187 — Explore-only Filters sits immediately right of Search (same existing disclosure). */
    var exploreFilters =
      current === 'explore'
        ? '<button type="button" class="lanternAppBarFiltersBtn" id="feedFiltersToggle" aria-expanded="false" aria-controls="feedFiltersPanel">Filters ▸</button>'
        : '';
    var marqueeFeedBtn =
      current === 'explore'
        ? '<button type="button" class="lanternAppBarFiltersBtn" id="marqueeFeedBtn" hidden aria-controls="marqueeFeedInspector">Marquee Feed</button>'
        : '';
    var searchCluster =
      current === 'explore'
        ? '<div class="lanternAppBarSearchFilters">' + searchWrap + exploreFilters + marqueeFeedBtn + '</div>'
        : searchWrap;
    // Prompt #185 — keep Needs Attention bell; remove header avatar + Help Mode slot (desktop + phone).
    var bellBtn = '<button type="button" class="lanternAppBarIconBtn" id="lanternExploreBell" style="display:none" aria-hidden="true" aria-label="Needs attention">&#128276;</button>';
    var right = '<div class="lanternAppBarRight">' + bellBtn + '</div>';
    return '<div class="lanternAppBar lanternAppBarExplore" id="lanternAppBar">' +
      '<div class="lanternAppBarInner">' + left + context + searchCluster + right + '</div></div>';
  }

  function buildBar() {
    return buildInteractiveBar();
  }

  function injectStyles() {
    if (document.getElementById('lantern-nav-styles')) return;
    var s = document.createElement('style');
    s.id = 'lantern-nav-styles';
    s.textContent = [
      ':root{ --lantern-appbar-search-max: 320px; --lantern-nav-text-inset: 14px; }',
      '@keyframes lanternBellWiggle{ 0%,100%{ transform: rotate(0); } 20%{ transform: rotate(-10deg); } 40%{ transform: rotate(10deg); } 60%{ transform: rotate(-6deg); } 80%{ transform: rotate(6deg); } }',
      '.lanternAppBarBell--attention{ animation: lanternBellWiggle 2.4s ease-in-out infinite; transform-origin: 50% 0; }',
      '.lanternAppBar{ position: sticky; top: 0; z-index: 10000; background: ' + NAV.navy + '; color: ' + NAV.white + '; padding: 0 var(--lantern-pad-x); flex-shrink: 0; border-bottom: 1px solid rgba(255,255,255,.1); }',
      '.lanternAppBarInner{ max-width: var(--lantern-page-max-width); margin: 0 auto; display: flex; align-items: center; flex-wrap: nowrap; height: 52px; min-height: 52px; max-height: 52px; box-sizing: border-box; gap: 16px; overflow: visible; }',
      '.lanternAppBarLeft{ display: flex; align-items: center; flex-shrink: 0; gap: 2px; flex-wrap: wrap; }',
      /* Prompt #152 — brand menu is the positioning root so dropdown text aligns under the L in Lantern */
      '.lanternAppBarBrandMenu{ position: relative; display: inline-flex; align-items: stretch; flex-shrink: 0; border-radius: 12px; border: 1px solid rgba(255,255,255,.22); background: rgba(0,0,0,.22); box-shadow: inset 0 1px 0 rgba(255,255,255,.07); overflow: visible; }',
      '.lanternAppBarBrandMenu .lanternAppBarHomeLink{ display: inline-flex; align-items: center; align-self: stretch; color: ' + NAV.white + '; font-weight: 900; font-size: 17px; text-decoration: none; padding: 8px 12px 8px var(--lantern-nav-text-inset); margin: 0; border-radius: 11px 0 0 11px; min-height: 38px; box-sizing: border-box; transition: background .15s, color .15s; font-family: inherit; cursor: pointer; }',
      '.lanternAppBarBrandMenu .lanternAppBarHomeLink:hover{ background: rgba(255,255,255,.1); color: ' + NAV.columbiaBlue + '; }',
      '.lanternAppBarBrandMenu .lanternAppBarHomeLink:active{ background: rgba(0,0,0,.25); }',
      '.lanternAppBarBrandMenu .lanternAppBarHomeLink:focus-visible{ outline: 2px solid ' + NAV.columbiaBlue + '; outline-offset: 2px; z-index: 1; position: relative; }',
      '.lanternAppBarBrandMenu .lanternAppBarHomeLink.is-active{ color: ' + NAV.columbiaBlue + '; text-decoration: underline; text-underline-offset: 4px; }',
      '.lanternAppBarContext{ flex: 1; min-width: 0; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 18px; font-weight: 800; color: rgba(255,255,255,.85); padding: 0 8px; }',
      '.lanternAppBarContext--empty{ display: none !important; flex: 0 !important; min-width: 0 !important; width: 0 !important; padding: 0 !important; margin: 0 !important; overflow: hidden !important; }',
      '.lanternAppBarContextGlow{ text-shadow: 0 0 16px rgba(157,212,240,.35), 0 0 6px rgba(255,255,255,.2); }',
      '.lanternAppBarMenuWrap{ position: relative; }',
      '.lanternAppBarBrandMenu .lanternAppBarLanternMenuWrap{ display: inline-flex; align-items: stretch; align-self: stretch; margin: 0; position: static; }',
      '.lanternAppBarBrandMenu .lanternAppBarMenuChevron{ background: transparent; border: none; color: rgba(255,255,255,.95); font-size: 14px; line-height: 1; cursor: pointer; padding: 4px 12px 4px 10px; margin: 0; border-radius: 0 9px 9px 0; font-family: inherit; display: inline-flex; align-items: center; justify-content: center; min-width: 40px; min-height: 0; max-height: 100%; flex-shrink: 0; box-sizing: border-box; transition: background .15s, color .15s; border-left: 1px solid rgba(255,255,255,.16); }',
      '.lanternAppBarBrandMenu .lanternAppBarMenuChevronIcon{ display: inline-block; font-size: 13px; line-height: 1; margin: 0; transform: translateY(0); font-weight: 700; }',
      '.lanternAppBarBrandMenu .lanternAppBarMenuChevron:hover{ color: ' + NAV.columbiaBlue + '; background: rgba(255,255,255,.1); }',
      '.lanternAppBarBrandMenu .lanternAppBarMenuChevron:active{ background: rgba(0,0,0,.28); }',
      '.lanternAppBarBrandMenu .lanternAppBarMenuChevron:focus-visible{ outline: 2px solid ' + NAV.columbiaBlue + '; outline-offset: 2px; z-index: 1; position: relative; }',
      '.lanternAppBarBrandMenu .lanternAppBarMenuChevron[aria-expanded="true"]{ color: ' + NAV.columbiaBlue + '; background: rgba(255,255,255,.12); }',
      /* Dropdown anchors to brand menu; item padding matches --lantern-nav-text-inset (L under L) */
      '.lanternAppBarBrandMenu > .lanternAppBarDropdown, .lanternAppBarBrandMenu .lanternAppBarDropdown{ position: absolute; top: 100%; left: 0; right: auto; margin-top: 4px; min-width: 240px; max-width: min(320px, 92vw); background: ' + NAV.white + '; color: ' + NAV.navy + '; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,.22); padding: 8px 0; z-index: 10001; opacity: 0; transform: translateY(-6px); transition: opacity .2s ease, transform .2s ease; pointer-events: none; }',
      '.lanternAppBarDropdown{ position: absolute; top: 100%; left: 0; margin-top: 4px; min-width: 220px; max-width: min(320px, 92vw); background: ' + NAV.white + '; color: ' + NAV.navy + '; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,.22); padding: 8px 0; z-index: 10001; opacity: 0; transform: translateY(-6px); transition: opacity .2s ease, transform .2s ease; pointer-events: none; }',
      '.lanternAppBarDropdown.is-open{ opacity: 1; transform: translateY(0); pointer-events: auto; }',
      '.lanternAppBarDropdown.is-open[hidden]{ display: block !important; }',
      '.lanternAppBarDropdownSection{ padding: 4px 0; }',
      '.lanternAppBarDropdownSection + .lanternAppBarDropdownSection{ border-top: 1px solid rgba(15,39,68,.12); }',
      '.lanternAppBarDropdownGroupLabel{ font-size: 11px; font-weight: 800; letter-spacing: .8px; text-transform: uppercase; color: rgba(15,39,68,.65); padding: 6px var(--lantern-nav-text-inset) 4px; }',
      '.lanternAppBarDropdownLink{ display: block; padding: 10px var(--lantern-nav-text-inset); font-size: 16px; font-weight: 700; color: ' + NAV.navy + '; text-decoration: none; transition: background .12s, color .12s; }',
      '.lanternAppBarDropdownLink:hover{ background: rgba(157,212,240,.25); color: ' + NAV.navy + '; }',
      '.lanternAppBarDropdownLink.is-active{ background: rgba(157,212,240,.35); color: #0a1d35; }',
      '.lanternAppBarDropdownLink{ position: relative; }',
      '.lanternAppBarDropdownSection--logout{ border-top: 1px solid rgba(15,39,68,.16); padding-top: 6px; margin-top: 2px; }',
      '.lanternAppBarDropdownLogout{ display: block; width: 100%; text-align: left; padding: 10px var(--lantern-nav-text-inset); font-size: 16px; font-weight: 800; color: #7a2030; background: transparent; border: none; cursor: pointer; font-family: inherit; box-sizing: border-box; }',
      '.lanternAppBarDropdownLogout:hover{ background: rgba(157,212,240,.25); color: #5a1020; }',
      '.lanternAppBarDropdownLogout:disabled{ opacity: .65; cursor: wait; }',
      '.lanternAppBarDropdownLogout--avatar{ color: #7a2030; }',
      '@media (max-width: 420px){ .lanternAppBarBrandMenu .lanternAppBarDropdown{ left: 0; right: auto; max-width: min(320px, calc(100vw - 16px)); } }',
      '.lanternNavBadge{ display: inline-block; min-width: 20px; padding: 2px 6px; margin-left: 6px; font-size: 12px; font-weight: 800; background: ' + NAV.columbiaBlue + '; color: ' + NAV.navy + '; border-radius: 10px; }',
      '.lanternNavBadge:empty{ display: none; }',
      '/* Header + in-page: same max width (~320px); do not flex-grow to full row. */',
      '.lanternAppBar .lanternAppBarSearchWrap{ flex: 0 1 var(--lantern-appbar-search-max); min-width: 0; max-width: var(--lantern-appbar-search-max); margin: 0 12px; display: flex; align-items: center; gap: 0; transition: max-width .2s ease; }',
      /* Prompt #187 — Explore Search + Filters as one compact action cluster */
      '.lanternAppBarSearchFilters{ display: flex; align-items: center; gap: 6px; flex: 0 1 auto; min-width: 0; max-width: calc(var(--lantern-appbar-search-max) + 96px); }',
      '.lanternAppBarSearchFilters .lanternAppBarSearchWrap{ margin: 0; flex: 1 1 auto; min-width: 0; max-width: var(--lantern-appbar-search-max); }',
      '.lanternAppBarFiltersBtn{ flex: 0 0 auto; background: transparent; border: none; color: ' + NAV.white + '; font-size: 16px; font-weight: 800; font-family: inherit; line-height: 1.2; padding: 6px 4px; margin: 0; border-radius: 8px; cursor: pointer; white-space: nowrap; min-height: 36px; -webkit-tap-highlight-color: transparent; }',
      '.lanternAppBarFiltersBtn:hover{ color: ' + NAV.columbiaBlue + '; background: rgba(255,255,255,.08); }',
      '.lanternAppBarFiltersBtn:focus-visible{ outline: 2px solid ' + NAV.columbiaBlue + '; outline-offset: 2px; }',
      '.lanternAppBarFiltersBtn[aria-expanded="true"]{ color: ' + NAV.columbiaBlue + '; }',
      '.lanternAppBar .lanternAppBarSearchTrigger{ display: none; }',
      '.lanternAppBarSearchInput{ width: 100%; max-width: 100%; padding: 8px 14px; border-radius: 999px; border: 1px solid rgba(255,255,255,.2); background: rgba(0,0,0,.25); color: ' + NAV.white + '; font-size: 16px; font-weight: 700; font-family: inherit; transition: width .2s ease, padding .2s ease, opacity .2s ease; box-sizing: border-box; }',
      '.lanternAppBarSearchInput::placeholder{ color: rgba(255,255,255,.6); }',
      '/* My Creations etc.: same constraints as header search (classes from buildInteractiveBar). */',
      '.lanternAppBarSearchWrap.lanternAppBarSearchWrap--embedded{ flex: 0 1 var(--lantern-appbar-search-max); min-width: 0; max-width: var(--lantern-appbar-search-max); width: 100%; margin: 0 0 14px 0; display: flex; align-items: center; gap: 0; box-sizing: border-box; }',
      '.lanternAppBarSearchWrap--embedded .lanternAppBarSearchTrigger{ display: none !important; }',
      '.lanternAppBarRight{ display: flex; align-items: center; gap: 8px; flex-shrink: 0; }',
      '.lanternAppBarIconBtn{ background: transparent; border: none; color: ' + NAV.white + '; font-size: 22px; cursor: pointer; padding: 6px 10px; border-radius: 8px; line-height: 1; font-family: inherit; }',
      '.lanternAppBarIconBtn:hover{ background: rgba(255,255,255,.1); color: ' + NAV.columbiaBlue + '; }',
      '.lanternAppBarBell--inactive{ visibility: hidden; opacity: 0; pointer-events: none; }',
      '@media (max-width: 900px){ .lanternAppBar .lanternAppBarSearchWrap{ max-width: var(--lantern-appbar-search-max); } .lanternAppBarSearchWrap.lanternAppBarSearchWrap--embedded{ max-width: var(--lantern-appbar-search-max); } }',
      '@media (max-width: 768px){ .lanternAppBarExplore .lanternAppBarInner{ flex-wrap: nowrap; gap: 10px; } .lanternAppBar .lanternAppBarSearchWrap{ margin: 0 6px; } .lanternAppBarSearchFilters{ gap: 4px; } }',
      '@media (max-width: 560px){ .lanternAppBarInner{ gap: 8px; } .lanternAppBar .lanternAppBarSearchWrap{ max-width: 200px; flex-basis: 200px; margin: 0 4px; } .lanternAppBarSearchWrap.lanternAppBarSearchWrap--embedded{ max-width: 200px; flex-basis: 200px; } .lanternAppBarSearchFilters{ max-width: calc(200px + 88px); } .lanternAppBarSearchFilters .lanternAppBarSearchWrap{ max-width: 200px; flex-basis: auto; margin: 0; } .lanternAppBarFiltersBtn{ font-size: 15px; padding: 6px 2px; } .lanternAppBar .lanternAppBarSearchWrap .lanternAppBarSearchInput{ font-size: 14px; padding: 6px 12px; } .lanternAppBarBrandMenu .lanternAppBarHomeLink{ font-size: 16px; padding: 8px 10px 8px 12px; } }',
      '@media (max-width: 480px){ .lanternAppBarInner{ gap: 6px; } .lanternAppBar .lanternAppBarSearchWrap{ max-width: 44px; flex: 0 0 44px; margin: 0; } .lanternAppBarSearchFilters{ max-width: none; gap: 2px; } .lanternAppBarSearchFilters .lanternAppBarSearchWrap{ max-width: 44px; flex: 0 0 44px; } .lanternAppBarFiltersBtn{ font-size: 14px; padding: 6px 0; } .lanternAppBar .lanternAppBarSearchTrigger{ display: flex; align-items: center; justify-content: center; width: 44px; height: 36px; flex-shrink: 0; cursor: pointer; font-size: 20px; color: rgba(255,255,255,.9); } .lanternAppBar .lanternAppBarSearchTrigger:hover{ color: ' + NAV.columbiaBlue + '; } .lanternAppBar .lanternAppBarSearchWrap .lanternAppBarSearchInput{ width: 0; min-width: 0; padding: 0 8px; font-size: 14px; opacity: 0; pointer-events: none; } .lanternAppBar .lanternAppBarSearchWrap.is-expanded{ max-width: min(220px, calc(100vw - 150px)); flex: 1; min-width: 0; } .lanternAppBarSearchFilters .lanternAppBarSearchWrap.is-expanded{ max-width: min(180px, calc(100vw - 200px)); flex: 1 1 auto; } .lanternAppBar .lanternAppBarSearchWrap.is-expanded .lanternAppBarSearchInput{ width: 100%; min-width: 80px; padding: 6px 12px; opacity: 1; pointer-events: auto; } .lanternAppBar .lanternAppBarSearchWrap.is-expanded .lanternAppBarSearchTrigger{ display: none; } }',
    ].join('\n');
    document.head.appendChild(s);
  }

  function showAuthenticatedLogoutControls() {
    var mainSection = document.getElementById('lanternNavLogoutSection');
    if (mainSection) mainSection.removeAttribute('hidden');
  }

  function wireLogoutButton(btn, closeDropdownFn) {
    if (!btn) return;
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof closeDropdownFn === 'function') closeDropdownFn();
      var auth = global.LanternAuth || global.LanternPilotAuth;
      if (!auth || typeof auth.performLogout !== 'function') return;
      btn.disabled = true;
      auth.performLogout().then(function (res) {
        if (!res || !res.ok) {
          btn.disabled = false;
          if (global.alert) global.alert('Could not log out. Check your connection and try again.');
        }
      }).catch(function () {
        btn.disabled = false;
        if (global.alert) global.alert('Could not log out. Check your connection and try again.');
      });
    });
  }

  function escHeaderText(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Prompt #121 — ONE shared signed-in name in #lanternAppBarContext for every full-header page.
   * Same identity source Explore/Locker already rely on: /api/auth/me → LANTERN_PILOT_ME →
   * Prompt #147 — signed-in header uses public_display_name / public_display_label only.
   * Display (page-marquee-only) never mounts this bar, so it stays marquee-only.
   */
  function resolveSignedInDisplayName(me) {
    var auth = global.LanternAuth || global.LanternPilotAuth;
    if (me && auth && typeof auth.applyStudentStorageFromSession === 'function') {
      auth.applyStudentStorageFromSession(me);
    }
    if (me && typeof me === 'object') {
      var label = me.public_display_label != null ? String(me.public_display_label).trim() : '';
      if (label) return label;
      label = me.public_display_name != null ? String(me.public_display_name).trim() : '';
      if (label) return label;
      label = me.public_staff_label != null ? String(me.public_staff_label).trim() : '';
      if (label) return label;
    }
    if (auth && typeof auth.adoptedFromPilotMe === 'function' && typeof auth.studentFriendlyDisplayNameFromAdopted === 'function') {
      var adopted = auth.adoptedFromPilotMe();
      var fromAdopted = auth.studentFriendlyDisplayNameFromAdopted(adopted);
      if (fromAdopted) return fromAdopted;
    }
    return '';
  }

  function applySignedInHeaderIdentity(me) {
    var ctx = document.getElementById('lanternAppBarContext');
    if (!ctx) return;
    var label = resolveSignedInDisplayName(me);
    if (!label) return;
    ctx.innerHTML = '<span class="lanternAppBarContextGlow">' + escHeaderText(label) + '</span>';
    ctx.classList.remove('lanternAppBarContext--empty');
    ctx.setAttribute('aria-label', 'Signed in as ' + label);
  }

  function wireInteractiveChrome() {
    // Prompt #185 — header avatar menu removed; Locker / Missions / Log out remain in Lantern ▾.
    wireBellClick();
    var searchWrap = document.getElementById('lanternExploreSearchWrap');
    var searchTrigger = document.getElementById('lanternExploreSearchTrigger');
    var searchInput = document.getElementById('lanternExploreSearch');
    if (searchWrap && searchTrigger && searchInput) {
      searchTrigger.addEventListener('click', function () { searchWrap.classList.add('is-expanded'); searchInput.focus(); });
      searchTrigger.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); searchWrap.classList.add('is-expanded'); searchInput.focus(); } });
      searchInput.addEventListener('blur', function () { setTimeout(function () { if (!searchInput.value.trim()) searchWrap.classList.remove('is-expanded'); }, 180); });
    }
    wireHeaderFeedSearch();
  }

  function wireHeaderFeedSearch() {
    var page = getCurrentPage();
    if (page !== 'explore' && page !== 'locker') return;
    var searchInput = document.getElementById('lanternExploreSearch');
    if (!searchInput) return;
    var timer;
    function applySearch() {
      if (!global.LANTERN_FEED_EXPLORE || typeof global.LANTERN_FEED_EXPLORE.setSearch !== 'function') return;
      global.LANTERN_FEED_EXPLORE.setSearch(searchInput.value);
    }
    searchInput.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(applySearch, 300);
    });
    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(timer);
        applySearch();
      }
    });
  }

  function refreshNeedsAttentionBellFromApi() {
    if (navKnownUnauthenticated) {
      applyBellCount(0);
      return Promise.resolve(0);
    }
    return fetchProfileNeedsAttentionCount().then(applyBellCount).catch(function () { applyBellCount(0); });
  }

  function wireBehaviorNavClicks(dropdown) {
    if (!dropdown) return;
    Array.prototype.forEach.call(dropdown.querySelectorAll('[data-lantern-behavior-nav="1"]'), function (a) {
      if (a.getAttribute('data-lantern-behavior-wired') === '1') return;
      a.setAttribute('data-lantern-behavior-wired', '1');
      a.addEventListener('click', function (ev) {
        if (global.LanternRememberDevice && typeof global.LanternRememberDevice.handleBehaviorNavClick === 'function') {
          global.LanternRememberDevice.handleBehaviorNavClick(ev);
        }
      });
    });
  }

  var _menuCloseFn = null;

  /**
   * Prompt #163 — rebuild the full Lantern ▼ from role + TMS capabilities after /api/auth/me.
   * Fail closed: missing role/caps never expose STAFF or ADMIN / TOOLS.
   */
  function applyCanonicalLanternMenu(role, caps) {
    var dd = document.getElementById('lanternMenuDropdown');
    if (!dd || !global.LanternStaffNav || typeof global.LanternStaffNav.buildMenuSectionsHtml !== 'function') {
      return;
    }
    var logout = dd.querySelector('#lanternNavLogoutSection') || dd.querySelector('.lanternAppBarDropdownSection--logout');
    var sectionsHtml = global.LanternStaffNav.buildMenuSectionsHtml(getCurrentPage(), 'lantern', caps || null, role || null);
    var keep = [];
    Array.prototype.forEach.call(dd.children, function (child) {
      if (child === logout || (child.classList && child.classList.contains('lanternAppBarDropdownSection--logout'))) {
        keep.push(child);
      }
    });
    keep.forEach(function (node) {
      if (node.parentNode) node.parentNode.removeChild(node);
    });
    dd.innerHTML = sectionsHtml;
    keep.forEach(function (node) {
      dd.appendChild(node);
    });
    wireBehaviorNavClicks(dd);
  }

  function init() {
    if (typeof document === 'undefined' || !document.body) return;
    /* Prompt #116 — Display (page-marquee-only): do not mount Lantern nav/search/avatar/help. */
    if (document.body.classList.contains('page-marquee-only')) return;
    var root = document.getElementById('lanternAppBarRoot');
    if (!root) return;
    injectStyles();
    root.innerHTML = buildBar();
    var menuTrigger = document.getElementById('lanternMenuTrigger');
    var dropdown = document.getElementById('lanternMenuDropdown');
    if (!menuTrigger || !dropdown) return;

    function open() {
      dropdown.classList.add('is-open');
      dropdown.removeAttribute('hidden');
      menuTrigger.setAttribute('aria-expanded', 'true');
    }
    function close() {
      dropdown.classList.remove('is-open');
      dropdown.setAttribute('hidden', '');
      menuTrigger.setAttribute('aria-expanded', 'false');
    }
    _menuCloseFn = close;
    function toggle() {
      if (dropdown.classList.contains('is-open')) close(); else open();
    }

    menuTrigger.addEventListener('click', function (e) {
      e.stopPropagation();
      toggle();
    });
    wireBehaviorNavClicks(dropdown);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
      if (e.key === 'm' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        var tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
        if (tag !== 'input' && tag !== 'textarea') { toggle(); e.preventDefault(); }
      }
    });
    document.addEventListener('click', function (e) {
      var bar = document.getElementById('lanternAppBar');
      if (bar && !bar.contains(e.target)) close();
    });

    wireInteractiveChrome();
    wireLogoutButton(document.getElementById('lanternNavLogoutBtn'), close);
    applyBellCount(0);
    refreshNeedsAttentionBellFromApi();
    try {
      var cachedMe = global.LANTERN_PILOT_ME && global.LANTERN_PILOT_ME.ok ? global.LANTERN_PILOT_ME : null;
      if (cachedMe && cachedMe.authenticated !== false) {
        applySignedInHeaderIdentity(cachedMe);
        var cachedRole =
          global.LanternAuth && typeof global.LanternAuth.normalizeRole === 'function'
            ? global.LanternAuth.normalizeRole(cachedMe.role)
            : String(cachedMe.role || '').trim().toLowerCase();
        applyCanonicalLanternMenu(cachedRole, cachedMe.capabilities || null);
      }
    } catch (eCache) {}
    (function pilotSessionShellGate(){
      if (typeof global.LANTERN_AVATAR_API === 'undefined' || global.LANTERN_AVATAR_API === null) return;
      var api = String(global.LANTERN_AVATAR_API).replace(/\/$/, '');
      fetch(api + '/api/auth/me', { credentials: 'include', cache: 'no-store' }).then(function(r){ return r.json(); }).then(function(data){
        if (!data || !data.ok || !data.authenticated) {
          navKnownUnauthenticated = true;
          applyBellCount(0);
          return;
        }
        showAuthenticatedLogoutControls();
        applySignedInHeaderIdentity(data);
        if (data.must_change_password) {
          var path = (typeof location !== 'undefined' && location.pathname) ? String(location.pathname) : '';
          if (/change-password/i.test(path)) return;
          var ret = (typeof location !== 'undefined') ? (location.pathname + location.search + (location.hash || '')) : '/explore.html';
          global.location.replace('/change-password.html?return=' + encodeURIComponent(ret));
          return;
        }
        var role =
          global.LanternAuth && typeof global.LanternAuth.normalizeRole === 'function'
            ? global.LanternAuth.normalizeRole(data.role)
            : String(data.role || '').trim().toLowerCase();
        if (role === 'student') {
          applyCanonicalLanternMenu('student', null);
          return;
        }
        applyCanonicalLanternMenu(role, data.capabilities || null);
      }).catch(function(){});
    })();
    document.addEventListener('lantern-needs-attention-count', function (e) {
      var d = e && e.detail;
      if (d && typeof d.count === 'number') applyBellCount(d.count);
    });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) refreshNeedsAttentionBellFromApi();
    });
    setInterval(function () { refreshNeedsAttentionBellFromApi(); }, 120000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  var headerSearchListeners = [];

  function onHeaderSearch(fn) {
    if (typeof fn !== 'function') return;
    headerSearchListeners.push(fn);
    var searchInput = document.getElementById('lanternExploreSearch');
    if (!searchInput || searchInput._lanternHeaderSearchWired) return;
    searchInput._lanternHeaderSearchWired = true;
    var timer;
    function emit() {
      var q = searchInput.value;
      headerSearchListeners.forEach(function (listener) {
        try { listener(q); } catch (e) {}
      });
    }
    searchInput.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(emit, 300);
    });
    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(timer);
        emit();
      }
    });
  }

  global.LANTERN_NAV = {
    getCurrentPage: getCurrentPage,
    refreshNeedsAttentionBell: refreshNeedsAttentionBellFromApi,
    onHeaderSearch: onHeaderSearch,
    applySignedInHeaderIdentity: applySignedInHeaderIdentity
  };
  global.LanternNav = global.LANTERN_NAV;

  if (typeof document !== 'undefined' && !document.querySelector('script[data-lantern-protected-js]')) {
    var prot = document.createElement('script');
    prot.src = 'js/lantern-protected-content.js?v=234';
    prot.setAttribute('data-lantern-protected-js', '1');
    if (document.body) document.body.appendChild(prot);
    else document.addEventListener('DOMContentLoaded', function () { document.body.appendChild(prot); });
  }
})(typeof window !== 'undefined' ? window : self);
