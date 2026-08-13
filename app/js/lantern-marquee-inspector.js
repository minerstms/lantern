/**
 * Prompt #137 — SYSTEM_ADMIN-only Marquee Feed inspector.
 * Capability comes from GET /api/marquee/access (TMS SYSTEM_ADMIN). Not username/role guessing.
 * Read-only Power Scroller of the same events eligible for the public ticker.
 */
(function (global) {
  'use strict';

  var POWER = null;
  var LOADED = false;
  var ACCESS_OK = false;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function apiBase() {
    if (typeof global.LANTERN_AVATAR_API === 'undefined' || global.LANTERN_AVATAR_API === null) return '';
    return String(global.LANTERN_AVATAR_API).replace(/\/$/, '');
  }

  function formatWhen(iso) {
    var t = String(iso || '').trim();
    if (!t) return '—';
    var d = new Date(t);
    if (isNaN(d.getTime())) return t;
    try {
      return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    } catch (_) {
      return t;
    }
  }

  function ensureOverlay() {
    var overlay = document.getElementById('marqueeFeedInspector');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'marqueeFeedInspector';
    overlay.className = 'marqueeFeedOverlay';
    overlay.hidden = true;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'marqueeFeedTitle');
    overlay.innerHTML =
      '<div class="marqueeFeedPanel">' +
        '<div class="marqueeFeedPanelHd">' +
          '<h2 id="marqueeFeedTitle">Marquee Feed</h2>' +
          '<button type="button" class="marqueeFeedCloseBtn" id="marqueeFeedCloseBtn">Close</button>' +
        '</div>' +
        '<p class="marqueeFeedHint">Read-only. Newest first. Same events the public ticker can show.</p>' +
        '<div id="marqueeFeedListMount"></div>' +
      '</div>';
    document.body.appendChild(overlay);
    return overlay;
  }

  function closeInspector() {
    var overlay = document.getElementById('marqueeFeedInspector');
    if (overlay) overlay.hidden = true;
    var btn = document.getElementById('marqueeFeedBtn');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function openInspector() {
    if (!ACCESS_OK) return;
    var overlay = ensureOverlay();
    overlay.hidden = false;
    var btn = document.getElementById('marqueeFeedBtn');
    if (btn) btn.setAttribute('aria-expanded', 'true');
    loadEvents();
  }

  function ensurePowerList() {
    var mount = document.getElementById('marqueeFeedListMount');
    if (!mount || !global.LanternPowerList) return null;
    if (POWER) return POWER;
    POWER = global.LanternPowerList.create({
      mount: mount,
      className: 'lanternPowerList--marquee',
      searchPlaceholder: 'Search public text, type, or title…',
      emptyMessage: 'No marquee events match.',
      defaultSort: { key: 'date', dir: 'desc' },
      columns: [
        { key: 'type', label: 'Type', sortable: true },
        { key: 'text', label: 'Public Text', sortable: true },
        { key: 'date', label: 'Time', sortable: true },
        { key: 'status', label: 'Status', sortable: true },
      ],
      filters: [
        {
          id: 'type',
          label: 'Event type',
          defaultValue: 'all',
          options: [
            { value: 'all', label: 'All' },
            { value: 'poll', label: 'Poll' },
            { value: 'mission_created', label: 'Mission Created' },
            { value: 'mission_completed', label: 'Mission Completed' },
            { value: 'shout_out', label: 'Shout-Out' },
            { value: 'news', label: 'News' },
            { value: 'leaderboard', label: 'Leaderboard' },
          ],
        },
      ],
      getRowId: function (item) {
        return item.id || item.event_key || '';
      },
      getSortValue: function (item, key) {
        if (key === 'type') return item.type_label || item.type || '';
        if (key === 'text') return item.public_text || '';
        if (key === 'date') return Date.parse(item.created_at || '') || 0;
        if (key === 'status') return item.eligible === false ? 1 : 0;
        return item.id;
      },
      getSearchText: function (item) {
        return [item.public_text, item.type_label, item.type, item.source_title].join(' ');
      },
      matchFilter: function (item, filterId, value) {
        if (filterId !== 'type' || !value || value === 'all') return true;
        if (value === 'poll') return item.type === 'poll_created';
        if (value === 'shout_out') return item.type === 'shout_out' || item.type === 'recognition';
        if (value === 'leaderboard') return item.type === 'leaderboard_entry';
        return item.type === value;
      },
      getStatus: function (item) {
        if (item.eligible === false) return { label: 'Excluded', tone: 'hidden' };
        return { label: 'Eligible', tone: 'live' };
      },
      getCellHtml: function (item, key) {
        if (key === 'type') return esc(item.type_label || item.type || '—');
        if (key === 'text') return esc(item.public_text || '—');
        if (key === 'date') return esc(formatWhen(item.created_at));
        return '';
      },
      renderExpanded: function (item, detail) {
        var rows = [
          ['Public sentence', item.public_text || ''],
          ['Event type', item.type_label || item.type || ''],
          ['Timestamp', item.created_at || ''],
          ['Source content ID', item.source_id || ''],
          ['Source type', item.source_type || ''],
          ['Source title', item.source_title || ''],
          ['Eligible', item.eligible === false ? 'No' : 'Yes'],
          ['Event key', item.event_key || item.id || ''],
        ];
        if (item.excluded_reason) rows.push(['Excluded reason', item.excluded_reason]);
        var html = '<dl class="marqueeFeedDl">';
        rows.forEach(function (pair) {
          html += '<dt>' + esc(pair[0]) + '</dt><dd>' + esc(pair[1] || '—') + '</dd>';
        });
        html += '</dl>';
        detail.innerHTML = html;
      },
    });
    return POWER;
  }

  function loadEvents() {
    var ui = ensurePowerList();
    if (!ui) return;
    fetch(apiBase() + '/api/marquee/inspector?limit=200', { credentials: 'include', cache: 'no-store' })
      .then(function (r) {
        return r.json().then(function (body) {
          return { status: r.status, body: body };
        });
      })
      .then(function (res) {
        if (!res.body || !res.body.ok) {
          ui.setItems([]);
          return;
        }
        ui.setItems(res.body.events || []);
      })
      .catch(function () {
        ui.setItems([]);
      });
  }

  function showButton() {
    var btn = document.getElementById('marqueeFeedBtn');
    if (!btn) return false;
    btn.hidden = false;
    btn.removeAttribute('hidden');
    if (btn.getAttribute('data-marquee-feed-ready') === '1') return true;
    btn.setAttribute('data-marquee-feed-ready', '1');
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      openInspector();
    });
    return true;
  }

  function wireOverlayOnce() {
    var overlay = ensureOverlay();
    if (overlay.getAttribute('data-marquee-feed-wired') === '1') return;
    overlay.setAttribute('data-marquee-feed-wired', '1');
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeInspector();
    });
    var closeBtn = document.getElementById('marqueeFeedCloseBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', function (e) {
        e.preventDefault();
        closeInspector();
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay && !overlay.hidden) closeInspector();
    });
  }

  function checkAccess() {
    return fetch(apiBase() + '/api/marquee/access', { credentials: 'include', cache: 'no-store' })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        ACCESS_OK = !!(data && data.ok && data.inspector === true);
        if (!ACCESS_OK) return false;
        wireOverlayOnce();
        var tries = 0;
        function waitBtn() {
          if (showButton() || tries > 20) return;
          tries += 1;
          setTimeout(waitBtn, 50);
        }
        waitBtn();
        return true;
      })
      .catch(function () {
        ACCESS_OK = false;
        return false;
      });
  }

  function init() {
    if (LOADED) return;
    if (typeof document === 'undefined' || !document.body) return;
    if (document.body.classList.contains('page-marquee-only')) return;
    LOADED = true;
    checkAccess();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }

  global.LanternMarqueeInspector = {
    init: init,
    open: openInspector,
    close: closeInspector,
    checkAccess: checkAccess,
  };
})(typeof window !== 'undefined' ? window : self);
