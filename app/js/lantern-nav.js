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
    if (/store\.html/.test(path)) return 'store';
    if (/games\.html/.test(path)) return 'games';
    if (/locker\.html/.test(path)) return 'locker';
    if (/explore\.html/.test(path) || /\/explore\/?$/.test(path)) return 'explore';
    if (/teacher\.html/.test(path)) return 'teacher';
    if (/display\.html/.test(path)) return 'display';
    if (/staff\.html/.test(path)) return 'staff';
    if (/verify\.html/.test(path)) return 'verify';
    if (/contribute\.html/.test(path)) return 'contribute';
    if (/school-survival\.html/.test(path)) return 'school_survival';
    return '';
  }

  function getPageContext() {
    return '';
  }

  /** Chevron menu: NAVIGATION (Locker, Create, Play, Missions) + STAFF (Display, Teacher, Verify). Home = Lantern link → explore.html. */
  function buildLanternNavDropdownHtml(current) {
    return '<div class="lanternAppBarDropdown" id="lanternMenuDropdown" role="menu" hidden>' +
      '<div class="lanternAppBarDropdownSection"><div class="lanternAppBarDropdownGroupLabel">NAVIGATION</div>' +
      '<a href="locker.html" role="menuitem" class="lanternAppBarDropdownLink' + (current === 'locker' ? ' is-active' : '') + '" data-page="locker">Locker</a>' +
      '<a href="contribute.html" role="menuitem" class="lanternAppBarDropdownLink' + (current === 'contribute' ? ' is-active' : '') + '" data-page="create">Create</a>' +
      '<a href="games.html" role="menuitem" class="lanternAppBarDropdownLink' + (current === 'games' ? ' is-active' : '') + '" data-page="play">Play</a>' +
      '<a href="missions.html" role="menuitem" class="lanternAppBarDropdownLink' + (current === 'missions' ? ' is-active' : '') + '" data-page="missions">Missions <span id="lanternNavMissionsBadge" class="lanternNavBadge">0</span></a>' +
      '</div>' +
      '<div class="lanternAppBarDropdownSection"><div class="lanternAppBarDropdownGroupLabel">STAFF</div>' +
      '<a href="display.html" role="menuitem" class="lanternAppBarDropdownLink' + (current === 'display' ? ' is-active' : '') + '" data-page="display" target="_blank">Display</a>' +
      '<a href="/teacher" role="menuitem" class="lanternAppBarDropdownLink' + (current === 'teacher' ? ' is-active' : '') + '" data-page="teacher">Teacher</a>' +
      '<a href="verify.html" role="menuitem" class="lanternAppBarDropdownLink' + (current === 'verify' ? ' is-active' : '') + '" data-page="verify">Verify</a>' +
      '</div></div>';
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
      var raw = localStorage.getItem('LANTERN_ADOPTED_CHARACTER');
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || !obj.name) return null;
      if (obj.isTest && obj.expires_at && new Date(obj.expires_at) <= new Date()) return null;
      return obj;
    } catch (e) {
      return null;
    }
  }

  function fetchProfileNeedsAttentionCount() {
    var apiBase = (typeof global.LANTERN_AVATAR_API !== 'undefined' && global.LANTERN_AVATAR_API)
      ? String(global.LANTERN_AVATAR_API).replace(/\/$/, '')
      : '';
    var adopted = getAdoptedFromStorage();
    var characterNameForApi = adopted && String((adopted.character_id || adopted.name || '')).trim();
    var newsAuthorMine = adopted && String((adopted.name || adopted.character_id || '')).trim();
    if (!apiBase || !characterNameForApi) return Promise.resolve(0);

    var urlPoll = apiBase + '/api/polls/contributions?character_name=' + encodeURIComponent(characterNameForApi);
    var urlMiss = apiBase + '/api/missions/submissions/character?character_name=' + encodeURIComponent(characterNameForApi);
    var urlNews = apiBase + '/api/news/mine?author_name=' + encodeURIComponent(newsAuthorMine);

    var pPoll = fetch(urlPoll).then(function (r) { return r.json(); }).then(function (res) { return (res && res.contributions) || []; }).catch(function () { return []; });
    var pMiss = fetch(urlMiss).then(function (r) { return r.json(); }).then(function (res) { return (res && res.ok && res.submissions) ? res.submissions : []; }).catch(function () { return []; });
    var pNews = fetch(urlNews).then(function (r) { return r.json(); }).then(function (res) { return (res && res.ok && res.news) ? res.news : []; }).catch(function () { return []; });

    return Promise.all([pPoll, pMiss, pNews]).then(function (arr) {
      return countReturnedRows(arr[0]) + countReturnedRows(arr[1]) + countReturnedRows(arr[2]);
    });
  }

  var lastAttentionCount = -1;

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
    var helpSlot = '<div class="lanternHelpSlot" id="lanternHelpSlot"></div>';
    var left = '<div class="lanternAppBarLeft"><div class="lanternAppBarBrandMenu">' + homeLink + buildLanternChevronMenuWrap(current) + '</div></div>';
    var ctxClass = 'lanternAppBarContext' + (contextText ? '' : ' lanternAppBarContext--empty');
    var context = '<div class="' + ctxClass + '" id="lanternAppBarContext">' + (contextText || '') + '</div>';
    var searchWrap = '<div class="lanternAppBarSearchWrap" id="lanternExploreSearchWrap"><span class="lanternAppBarSearchTrigger" id="lanternExploreSearchTrigger" role="button" tabindex="0" aria-label="Search">&#128269;</span><input type="text" class="lanternAppBarSearchInput" id="lanternExploreSearch" placeholder="Search Lantern..." aria-label="Search Lantern"></div>';
    var bellBtn = '<button type="button" class="lanternAppBarIconBtn" id="lanternExploreBell" style="display:none" aria-hidden="true" aria-label="Needs attention">&#128276;</button>';
    var avatarDropdown = '<div class="lanternAppBarDropdown lanternAppBarAvatarDropdown" id="lanternExploreAvatarDropdown" role="menu" hidden>' +
      '<a href="locker.html" role="menuitem" class="lanternAppBarDropdownLink">Locker</a>' +
      '<a href="missions.html" role="menuitem" class="lanternAppBarDropdownLink">My Missions</a>' +
      '<a href="locker.html#profileNeedsAttention" role="menuitem" class="lanternAppBarDropdownLink">Needs Attention</a>' +
      '<a href="#" role="menuitem" class="lanternAppBarDropdownLink">Settings</a>' +
      '<a href="#" role="menuitem" class="lanternAppBarDropdownLink">Logout</a></div>';
    var avatarBtn = '<div class="lanternAppBarAvatarWrap" id="lanternExploreAvatarBtn" aria-haspopup="true" aria-expanded="false" tabindex="0">&#128100;</div>';
    var right = '<div class="lanternAppBarRight">' + bellBtn + '<div class="lanternAppBarMenuWrap">' + avatarBtn + avatarDropdown + '</div></div>';
    return '<div class="lanternAppBar lanternAppBarExplore" id="lanternAppBar">' +
      '<div class="lanternAppBarInner">' + left + context + searchWrap + right + helpSlot + '</div></div>';
  }

  function buildBar() {
    return buildInteractiveBar();
  }

  function injectStyles() {
    if (document.getElementById('lantern-nav-styles')) return;
    var s = document.createElement('style');
    s.id = 'lantern-nav-styles';
    s.textContent = [
      ':root{ --lantern-appbar-search-max: 320px; }',
      '@keyframes lanternBellWiggle{ 0%,100%{ transform: rotate(0); } 20%{ transform: rotate(-10deg); } 40%{ transform: rotate(10deg); } 60%{ transform: rotate(-6deg); } 80%{ transform: rotate(6deg); } }',
      '.lanternAppBarBell--attention{ animation: lanternBellWiggle 2.4s ease-in-out infinite; transform-origin: 50% 0; }',
      '.lanternAppBar{ position: sticky; top: 0; z-index: 10000; background: ' + NAV.navy + '; color: ' + NAV.white + '; padding: 0 var(--lantern-pad-x); flex-shrink: 0; border-bottom: 1px solid rgba(255,255,255,.1); }',
      '.lanternAppBarInner{ max-width: var(--lantern-page-max-width); margin: 0 auto; display: flex; align-items: center; flex-wrap: nowrap; height: 52px; min-height: 52px; max-height: 52px; box-sizing: border-box; gap: 16px; overflow: visible; }',
      '.lanternAppBarLeft{ display: flex; align-items: center; flex-shrink: 0; gap: 2px; flex-wrap: wrap; }',
      '.lanternAppBarBrandMenu{ display: inline-flex; align-items: stretch; flex-shrink: 0; border-radius: 12px; border: 1px solid rgba(255,255,255,.22); background: rgba(0,0,0,.22); box-shadow: inset 0 1px 0 rgba(255,255,255,.07); overflow: visible; }',
      '.lanternAppBarBrandMenu .lanternAppBarHomeLink{ display: inline-flex; align-items: center; align-self: stretch; color: ' + NAV.white + '; font-weight: 900; font-size: 17px; text-decoration: none; padding: 8px 12px 8px 14px; margin: 0; border-radius: 11px 0 0 11px; min-height: 38px; box-sizing: border-box; transition: background .15s, color .15s; font-family: inherit; cursor: pointer; }',
      '.lanternAppBarBrandMenu .lanternAppBarHomeLink:hover{ background: rgba(255,255,255,.1); color: ' + NAV.columbiaBlue + '; }',
      '.lanternAppBarBrandMenu .lanternAppBarHomeLink:active{ background: rgba(0,0,0,.25); }',
      '.lanternAppBarBrandMenu .lanternAppBarHomeLink:focus-visible{ outline: 2px solid ' + NAV.columbiaBlue + '; outline-offset: 2px; z-index: 1; position: relative; }',
      '.lanternAppBarBrandMenu .lanternAppBarHomeLink.is-active{ color: ' + NAV.columbiaBlue + '; text-decoration: underline; text-underline-offset: 4px; }',
      '.lanternAppBarContext{ flex: 1; min-width: 0; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 18px; font-weight: 800; color: rgba(255,255,255,.85); padding: 0 8px; }',
      '.lanternAppBarContext--empty{ display: none !important; flex: 0 !important; min-width: 0 !important; width: 0 !important; padding: 0 !important; margin: 0 !important; overflow: hidden !important; }',
      '.lanternAppBarContextGlow{ text-shadow: 0 0 16px rgba(157,212,240,.35), 0 0 6px rgba(255,255,255,.2); }',
      '.lanternAppBarMenuWrap{ position: relative; }',
      '.lanternAppBarBrandMenu .lanternAppBarLanternMenuWrap{ display: inline-flex; align-items: stretch; align-self: stretch; margin: 0; }',
      '.lanternAppBarBrandMenu .lanternAppBarMenuChevron{ background: transparent; border: none; color: rgba(255,255,255,.95); font-size: 14px; line-height: 1; cursor: pointer; padding: 4px 12px 4px 10px; margin: 0; border-radius: 0 9px 9px 0; font-family: inherit; display: inline-flex; align-items: center; justify-content: center; min-width: 40px; min-height: 0; max-height: 100%; flex-shrink: 0; box-sizing: border-box; transition: background .15s, color .15s; border-left: 1px solid rgba(255,255,255,.16); }',
      '.lanternAppBarBrandMenu .lanternAppBarMenuChevronIcon{ display: inline-block; font-size: 13px; line-height: 1; margin: 0; transform: translateY(0); font-weight: 700; }',
      '.lanternAppBarBrandMenu .lanternAppBarMenuChevron:hover{ color: ' + NAV.columbiaBlue + '; background: rgba(255,255,255,.1); }',
      '.lanternAppBarBrandMenu .lanternAppBarMenuChevron:active{ background: rgba(0,0,0,.28); }',
      '.lanternAppBarBrandMenu .lanternAppBarMenuChevron:focus-visible{ outline: 2px solid ' + NAV.columbiaBlue + '; outline-offset: 2px; z-index: 1; position: relative; }',
      '.lanternAppBarBrandMenu .lanternAppBarMenuChevron[aria-expanded="true"]{ color: ' + NAV.columbiaBlue + '; background: rgba(255,255,255,.12); }',
      '.lanternAppBarDropdown{ position: absolute; top: 100%; left: 0; margin-top: 4px; min-width: 220px; max-width: min(320px, 92vw); background: ' + NAV.white + '; color: ' + NAV.navy + '; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,.22); padding: 8px 0; z-index: 10001; opacity: 0; transform: translateY(-6px); transition: opacity .2s ease, transform .2s ease; pointer-events: none; }',
      '.lanternAppBarDropdown.is-open{ opacity: 1; transform: translateY(0); pointer-events: auto; }',
      '.lanternAppBarDropdown.is-open[hidden]{ display: block !important; }',
      '.lanternAppBarDropdownSection{ padding: 4px 0; }',
      '.lanternAppBarDropdownSection + .lanternAppBarDropdownSection{ border-top: 1px solid rgba(15,39,68,.12); }',
      '.lanternAppBarDropdownGroupLabel{ font-size: 11px; font-weight: 800; letter-spacing: .8px; text-transform: uppercase; color: rgba(15,39,68,.65); padding: 6px 14px 4px; }',
      '.lanternAppBarDropdownLink{ display: block; padding: 10px 14px; font-size: 16px; font-weight: 700; color: ' + NAV.navy + '; text-decoration: none; transition: background .12s, color .12s; }',
      '.lanternAppBarDropdownLink:hover{ background: rgba(157,212,240,.25); color: ' + NAV.navy + '; }',
      '.lanternAppBarDropdownLink.is-active{ background: rgba(157,212,240,.35); color: #0a1d35; }',
      '.lanternAppBarDropdownLink{ position: relative; }',
      '.lanternNavBadge{ display: inline-block; min-width: 20px; padding: 2px 6px; margin-left: 6px; font-size: 12px; font-weight: 800; background: ' + NAV.columbiaBlue + '; color: ' + NAV.navy + '; border-radius: 10px; }',
      '.lanternNavBadge:empty{ display: none; }',
      '.lanternHelpSlot{ display: flex; align-items: center; flex-shrink: 0; }',
      '.lanternAppBar .lanternHelpToggleWrap{ position: static; }',
      '.lanternAppBar .lanternHelpToggle{ padding: 4px 8px; font-size: 16px; font-weight: 700; border: none; border-radius: 0; background: transparent; color: rgba(255,255,255,.85); cursor: pointer; }',
      '.lanternAppBar .lanternHelpToggle:hover{ color: ' + NAV.columbiaBlue + '; }',
      '/* Header + in-page: same max width (~320px); do not flex-grow to full row. */',
      '.lanternAppBar .lanternAppBarSearchWrap{ flex: 0 1 var(--lantern-appbar-search-max); min-width: 0; max-width: var(--lantern-appbar-search-max); margin: 0 12px; display: flex; align-items: center; gap: 0; transition: max-width .2s ease; }',
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
      '.lanternAppBarAvatarWrap{ width: 36px; height: 36px; border-radius: 50%; background: rgba(255,255,255,.2); color: ' + NAV.white + '; display: flex; align-items: center; justify-content: center; font-size: 20px; cursor: pointer; user-select: none; }',
      '.lanternAppBarAvatarWrap:hover{ background: rgba(255,255,255,.3); color: ' + NAV.columbiaBlue + '; }',
      '.lanternAppBarAvatarDropdown{ left: auto; right: 0; min-width: 180px; }',
      '.lanternAppBarExplore .lanternHelpSlot .lanternHelpToggle{ padding: 4px 10px; font-size: 14px; font-weight: 700; border-radius: 999px; background: rgba(255,255,255,.06); }',
      '.lanternAppBarExplore .lanternHelpSlot .lanternHelpToggle:hover{ background: rgba(255,255,255,.12); }',
      '@media (max-width: 900px){ .lanternAppBar .lanternAppBarSearchWrap{ max-width: var(--lantern-appbar-search-max); } .lanternAppBarSearchWrap.lanternAppBarSearchWrap--embedded{ max-width: var(--lantern-appbar-search-max); } }',
      '@media (max-width: 768px){ .lanternAppBarExplore .lanternAppBarInner{ flex-wrap: nowrap; } .lanternAppBarExplore .lanternHelpSlot{ flex-shrink: 0; } }',
      '@media (max-width: 560px){ .lanternAppBar .lanternAppBarSearchWrap{ max-width: 200px; flex-basis: 200px; } .lanternAppBarSearchWrap.lanternAppBarSearchWrap--embedded{ max-width: 200px; flex-basis: 200px; } .lanternAppBar .lanternAppBarSearchWrap .lanternAppBarSearchInput{ font-size: 14px; padding: 6px 12px; } }',
      '@media (max-width: 480px){ .lanternAppBar .lanternAppBarSearchWrap{ max-width: 44px; flex: 0 0 44px; } .lanternAppBar .lanternAppBarSearchTrigger{ display: flex; align-items: center; justify-content: center; width: 44px; height: 36px; flex-shrink: 0; cursor: pointer; font-size: 20px; color: rgba(255,255,255,.9); } .lanternAppBar .lanternAppBarSearchTrigger:hover{ color: ' + NAV.columbiaBlue + '; } .lanternAppBar .lanternAppBarSearchWrap .lanternAppBarSearchInput{ width: 0; min-width: 0; padding: 0 8px; font-size: 14px; opacity: 0; pointer-events: none; } .lanternAppBar .lanternAppBarSearchWrap.is-expanded{ max-width: 220px; flex: 1; min-width: 0; } .lanternAppBar .lanternAppBarSearchWrap.is-expanded .lanternAppBarSearchInput{ width: 100%; min-width: 80px; padding: 6px 12px; opacity: 1; pointer-events: auto; } .lanternAppBar .lanternAppBarSearchWrap.is-expanded .lanternAppBarSearchTrigger{ display: none; } }',
    ].join('\n');
    document.head.appendChild(s);
  }

  function wireInteractiveChrome() {
    var avatarBtn = document.getElementById('lanternExploreAvatarBtn');
    var avatarDropdown = document.getElementById('lanternExploreAvatarDropdown');
    if (avatarBtn && avatarDropdown) {
      function openAvatar() { avatarDropdown.classList.add('is-open'); avatarDropdown.removeAttribute('hidden'); avatarBtn.setAttribute('aria-expanded', 'true'); }
      function closeAvatar() { avatarDropdown.classList.remove('is-open'); avatarDropdown.setAttribute('hidden', ''); avatarBtn.setAttribute('aria-expanded', 'false'); }
      function toggleAvatar() { if (avatarDropdown.classList.contains('is-open')) closeAvatar(); else openAvatar(); }
      avatarBtn.addEventListener('click', function (e) { e.stopPropagation(); toggleAvatar(); });
      document.addEventListener('click', function (e) {
        if (avatarDropdown && !avatarDropdown.contains(e.target) && avatarBtn && !avatarBtn.contains(e.target)) closeAvatar();
      });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAvatar(); });
      try {
        var raw = localStorage.getItem('LANTERN_ADOPTED_CHARACTER');
        if (raw && typeof global.LanternAvatar !== 'undefined' && global.LanternAvatar.getCanonicalAvatar) {
          var adopted = JSON.parse(raw);
          var name = adopted && adopted.name;
          var emoji = (adopted && adopted.avatar) ? adopted.avatar : '';
          if (!emoji && name && global.LanternAvatar.getLegacyEmojiForCharacter) {
            emoji = global.LanternAvatar.getLegacyEmojiForCharacter(name);
          }
          if (name) {
            global.LanternAvatar.getCanonicalAvatar(name, emoji || undefined).then(function (r) {
              if (!avatarBtn) return;
              if (r.imageUrl) {
                var img = document.createElement('img');
                img.src = r.imageUrl;
                img.alt = '';
                img.style.cssText = 'width:32px;height:32px;object-fit:cover;border-radius:50%;';
                avatarBtn.innerHTML = '';
                avatarBtn.appendChild(img);
              } else {
                avatarBtn.textContent = r.emoji;
              }
            });
          }
        }
      } catch (e) {}
    }
    wireBellClick();
    var searchWrap = document.getElementById('lanternExploreSearchWrap');
    var searchTrigger = document.getElementById('lanternExploreSearchTrigger');
    var searchInput = document.getElementById('lanternExploreSearch');
    if (searchWrap && searchTrigger && searchInput) {
      searchTrigger.addEventListener('click', function () { searchWrap.classList.add('is-expanded'); searchInput.focus(); });
      searchTrigger.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); searchWrap.classList.add('is-expanded'); searchInput.focus(); } });
      searchInput.addEventListener('blur', function () { setTimeout(function () { if (!searchInput.value.trim()) searchWrap.classList.remove('is-expanded'); }, 180); });
    }
  }

  function refreshNeedsAttentionBellFromApi() {
    return fetchProfileNeedsAttentionCount().then(applyBellCount).catch(function () { applyBellCount(0); });
  }

  function init() {
    if (typeof document === 'undefined' || !document.body) return;
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
    function toggle() {
      if (dropdown.classList.contains('is-open')) close(); else open();
    }

    menuTrigger.addEventListener('click', function (e) {
      e.stopPropagation();
      toggle();
    });
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
    applyBellCount(0);
    refreshNeedsAttentionBellFromApi();
    (function pilotSessionShellGate(){
      var api = (typeof global.LANTERN_AVATAR_API !== 'undefined' && global.LANTERN_AVATAR_API) ? String(global.LANTERN_AVATAR_API).replace(/\/$/, '') : '';
      if (!api) return;
      fetch(api + '/api/auth/me', { credentials: 'include' }).then(function(r){ return r.json(); }).then(function(data){
        if (!data || !data.ok || !data.authenticated) return;
        if (data.must_change_password) {
          var path = (typeof location !== 'undefined' && location.pathname) ? String(location.pathname) : '';
          if (/change-password/i.test(path)) return;
          var ret = (typeof location !== 'undefined') ? (location.pathname + location.search + (location.hash || '')) : '/explore';
          global.location.replace('/change-password?return=' + encodeURIComponent(ret));
          return;
        }
        var role = (data.role || '').trim();
        if (role !== 'student') return;
        var dd = document.getElementById('lanternMenuDropdown');
        if (!dd) return;
        var secs = dd.querySelectorAll('.lanternAppBarDropdownSection');
        if (secs.length >= 2) secs[1].style.display = 'none';
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

  global.LANTERN_NAV = {
    getCurrentPage: getCurrentPage,
    refreshNeedsAttentionBell: refreshNeedsAttentionBellFromApi
  };
})(typeof window !== 'undefined' ? window : self);
