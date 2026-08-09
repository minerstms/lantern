/**
 * Missions page — unified mission library grid (Prompt #63).
 */
(function (global) {
  'use strict';

  var state = {
    status: 'active',
    typeFilter: 'all',
    rewardFilter: 'any',
    sort: 'recommended',
    search: '',
    filtersOpen: false,
    items: [],
    loading: true,
  };

  function el(id) {
    return document.getElementById(id);
  }

  function runtime() {
    return global.LanternMissionsRuntime || null;
  }

  function cardsApi() {
    return global.LanternCards || null;
  }

  function toast(msg) {
    var rt = runtime();
    if (rt && typeof rt.toast === 'function') rt.toast(msg);
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function typeBadgeFor(item) {
    if (item.typeBadge) return item.typeBadge;
    if (item.kind === 'quick') return '⚡ Quick';
    return '🧠 Teacher';
  }

  function rewardMeta(reward) {
    if (reward == null || reward === '' || Number(reward) <= 0) return '';
    return '🟡 +' + Number(reward);
  }

  // Prompt #81 — real persisted teacher-mission `audience` values (enforced/coerced to this
  // enum server-side; see lantern-api.js) mapped to plain-language labels. Any other/future
  // value is humanized rather than dropped, so a new enum value never disappears silently.
  var AUDIENCE_LABELS = {
    school_mission: 'Schoolwide',
    my_students: 'Classroom',
    selected_students: 'Selected students',
  };

  function humanizeAudienceValue(raw) {
    return String(raw || '')
      .trim()
      .replace(/_/g, ' ')
      .replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  // ONE canonical primary footer token. Prefers an item-supplied categoryLabel (only ever set
  // when a card genuinely has one meaningful category); otherwise maps a teacher mission's real
  // `audience` field. Returns '' when there is nothing meaningful — never fabricated, and never
  // used to restate the type badge or status badge, which already own that information.
  function primaryMetaToken(item) {
    var explicit = String(item.categoryLabel || '').trim();
    if (explicit) return explicit;
    var aud = String(item.audience || '').trim();
    if (!aud) return '';
    return AUDIENCE_LABELS[aud] || humanizeAudienceValue(aud);
  }

  // Canonical footer contract (Prompt #81): "Primary token • Reward token", each token shown
  // fully or not at all. Deliberately excludes status/CTA prose ("Waiting for teacher",
  // "Start →", …) — status lives solely in the URHC state badge (Prompt #80) and the card's own
  // click action, never repeated here. If both tokens together would overflow the fixed-width
  // card, the lower-priority primary token is dropped whole so the row never becomes a
  // meaningless CSS-ellipsis fragment (e.g. "Ga…"); the reward token is never partially cut.
  var META_ROW_CHAR_BUDGET = 26;
  function buildFooterMeta(item) {
    var reward = rewardMeta(item.reward);
    var primary = primaryMetaToken(item);
    if (primary && reward && (primary.length + reward.length + 3) > META_ROW_CHAR_BUDGET) {
      primary = '';
    }
    return { primary: primary, reward: reward };
  }

  // Active tab = never-submitted (available) + pending/in-progress + returned; internal
  // per-item status values are unchanged, only the tab bucketing groups them together
  // so a submitted mission never appears to "disappear" from the main grid.
  function isActiveStatus(itemStatus) {
    return itemStatus === 'available' || itemStatus === 'in_progress';
  }

  function matchesTab(item) {
    if (state.status === 'active') return isActiveStatus(item.status);
    return item.status === state.status;
  }

  function matchesFilters(item) {
    if (!matchesTab(item)) return false;
    if (state.typeFilter !== 'all' && item.typeFilter !== state.typeFilter) return false;
    if (state.rewardFilter === 'has_reward' && !(Number(item.reward) > 0)) return false;
    var q = String(state.search || '')
      .trim()
      .toLowerCase();
    if (q) {
      var hay = (item.title + ' ' + item.description + ' ' + item.typeBadge).toLowerCase();
      if (hay.indexOf(q) < 0) return false;
    }
    return true;
  }

  function sortItems(list) {
    var out = list.slice();
    if (state.sort === 'az') {
      out.sort(function (a, b) {
        return String(a.title).localeCompare(String(b.title));
      });
    } else if (state.sort === 'reward') {
      out.sort(function (a, b) {
        return (Number(b.reward) || 0) - (Number(a.reward) || 0);
      });
    } else if (state.sort === 'newest') {
      out.sort(function (a, b) {
        return String(b.created_at || '').localeCompare(String(a.created_at || ''));
      });
    } else {
      out.sort(function (a, b) {
        if (a.featured && !b.featured) return -1;
        if (!a.featured && b.featured) return 1;
        if (a.kind === 'quick' && b.kind !== 'quick') return -1;
        if (a.kind !== 'quick' && b.kind === 'quick') return 1;
        return String(a.title).localeCompare(String(b.title));
      });
    }
    return out;
  }

  function countByStatus(status) {
    return state.items.filter(function (i) {
      return i.status === status;
    }).length;
  }

  // Active count = available + pending/in_progress + returned (returned items also carry
  // status 'in_progress' internally). Completed count = completed/accepted per current semantics.
  function countActive() {
    return state.items.filter(function (i) {
      return isActiveStatus(i.status);
    }).length;
  }

  function updateStatusTabLabels() {
    var active = countActive();
    var done = countByStatus('completed');
    var map = {
      active: 'Active' + (state.loading ? '' : ' ' + active),
      completed: 'Completed' + (state.loading ? '' : ' ' + done),
    };
    var bar = el('missionsStatusTabs');
    if (!bar) return;
    bar.querySelectorAll('[data-mission-status]').forEach(function (btn) {
      var key = btn.getAttribute('data-mission-status');
      if (map[key]) btn.textContent = map[key];
      btn.classList.toggle('is-active', key === state.status);
      btn.setAttribute('aria-selected', key === state.status ? 'true' : 'false');
    });
  }

  function emptyMessage() {
    if (state.loading) return 'Loading missions…';
    if (state.status === 'active') return 'No active missions right now.';
    return 'No completed missions yet.';
  }

  function renderGrid() {
    var grid = el('missionsLibraryGrid');
    var countEl = el('missionsLibraryCount');
    var LC = cardsApi();
    if (!grid) return;
    if (!LC || !LC.specGameHubRailCard || !LC.createStudentCard) {
      grid.innerHTML = '<p class="missionsLibraryEmpty">Mission cards unavailable.</p>';
      return;
    }
    var filtered = sortItems(state.items.filter(matchesFilters));
    if (countEl) {
      countEl.textContent = state.loading
        ? '…'
        : filtered.length + ' mission' + (filtered.length === 1 ? '' : 's');
    }
    grid.innerHTML = '';
    updateStatusTabLabels();
    if (!filtered.length) {
      grid.innerHTML = '<p class="missionsLibraryEmpty">' + escapeHtml(emptyMessage()) + '</p>';
      return;
    }
    filtered.forEach(function (item) {
      var footer = buildFooterMeta(item);
      var ariaBits = [item.title, item.stateBadge, footer.primary, footer.reward].filter(Boolean);
      var spec = LC.specGameHubRailCard({
        title: item.title,
        icon: item.icon || '✨',
        // Canonical footer contract (Prompt #81): primary token in the identity slot, reward
        // token in the merged meta slot — the shared card face's own "•" separator combines
        // them ("Schoolwide • 🟡 +3") only when both are present; empty slots render nothing.
        hubIdentityLabel: footer.primary,
        metaOne: '',
        rewardText: footer.reward,
        typeBadge: typeBadgeFor(item),
        stateBadge: item.stateBadge || '',
        // Real submission photo (if any) always wins; otherwise the canonical Mission cover
        // (Prompt #76) fills the 16:9 media area instead of a generic gradient placeholder.
        imageUrl: item.imageUrl || '',
        fallbackType: 'mission',
        reportId: 'mission_' + (item.id || ''),
        extraClass: 'exploreCard--missionsLibrary missionsHubCard',
        dataAttrs: {
          missionId: item.id || '',
          missionKind: item.kind || '',
          routeSurface: 'missions_library',
          routeDetail: item.id || '',
        },
        role: 'button',
        tabIndex: 0,
        ariaLabel: ariaBits.join(' — '),
      });
      var node = LC.createStudentCard(spec);
      if (!node) return;
      // Card faces from specGameHubRailCard never produce an .exploreCardOuterWrap <a>
      // wrapper (no navHref is passed), so every card — url-based or onActivate-based —
      // must get its dispatch wired directly on the returned node. A prior version only
      // wired onActivate items and silently left url items with no handler (dead clicks).
      node.addEventListener('click', function (e) {
        if (e.target.closest('.exploreCardReportBtn')) return;
        e.preventDefault();
        activateMissionItem(item);
      });
      node.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        if (e.target !== node && !node.contains(e.target)) return;
        e.preventDefault();
        activateMissionItem(item);
      });
      grid.appendChild(node);
    });
    LC.enhanceReportControlsIn(grid);
  }

  function activateMissionItem(item) {
    try {
      if (item && typeof item.onActivate === 'function') {
        item.onActivate();
        return;
      }
      if (item && item.url) {
        global.location.href = item.url;
        return;
      }
      toast("Couldn't open this mission. Try again.");
    } catch (e) {
      if (global.console && global.console.error) global.console.error('[LanternMissionsPage] mission action failed', e);
      toast("Couldn't open this mission. Try again.");
    }
  }

  function wireControls() {
    var bar = el('missionsStatusTabs');
    if (bar && !bar._wired) {
      bar._wired = true;
      bar.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-mission-status]');
        if (!btn) return;
        var next = btn.getAttribute('data-mission-status');
        if (!next || next === state.status) return;
        state.status = next;
        renderGrid();
      });
    }
    var toggle = el('missionsFiltersToggle');
    var panel = el('missionsFiltersPanel');
    if (toggle && panel && !toggle._wired) {
      toggle._wired = true;
      toggle.addEventListener('click', function () {
        state.filtersOpen = !state.filtersOpen;
        panel.hidden = !state.filtersOpen;
        toggle.setAttribute('aria-expanded', state.filtersOpen ? 'true' : 'false');
        toggle.textContent = state.filtersOpen ? 'Filters ▾' : 'Filters ▸';
      });
    }
    var typeSel = el('missionsTypeFilter');
    var rewardSel = el('missionsRewardFilter');
    var sortSel = el('missionsSortSelect');
    if (typeSel && !typeSel._wired) {
      typeSel._wired = true;
      typeSel.addEventListener('change', function () {
        state.typeFilter = typeSel.value || 'all';
        renderGrid();
      });
    }
    if (rewardSel && !rewardSel._wired) {
      rewardSel._wired = true;
      rewardSel.addEventListener('change', function () {
        state.rewardFilter = rewardSel.value || 'any';
        renderGrid();
      });
    }
    if (sortSel && !sortSel._wired) {
      sortSel._wired = true;
      sortSel.addEventListener('change', function () {
        state.sort = sortSel.value || 'recommended';
        renderGrid();
      });
    }
    if (global.LanternNav && typeof global.LanternNav.onHeaderSearch === 'function' && !global._missionsHeaderSearchWired) {
      global._missionsHeaderSearchWired = true;
      global.LanternNav.onHeaderSearch(function (q) {
        state.search = q;
        renderGrid();
      });
    }
  }

  function refreshWalletDisplay() {
    var amt = el('missionsPageWalletAmt');
    if (!amt || !global.LanternWallet) return Promise.resolve();
    return global.LanternWallet.fetchMyBalance().then(function (res) {
      if (res && res.ok && res.available != null) {
        amt.textContent = String(res.available);
      } else if (amt.textContent === '' || amt.textContent === '…') {
        amt.textContent = '—';
      }
    });
  }

  function setItems(items, loading) {
    state.items = Array.isArray(items) ? items : [];
    state.loading = !!loading;
    renderGrid();
  }

  function init() {
    wireControls();
    renderGrid();
    refreshWalletDisplay();
  }

  global.LanternMissionsPage = {
    init: init,
    setItems: setItems,
    renderGrid: renderGrid,
    refreshWalletDisplay: refreshWalletDisplay,
    getStatus: function () {
      return state.status;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
