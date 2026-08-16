/**
 * Prompt #228 — client protected-content layer.
 * Visible watermark is an opaque TMS trace only. Viewer identity stays server-side.
 * Deterrence controls are not a security boundary.
 */
(function (global) {
  var TIER0 = {
    games: 1,
    play: 1,
    school_survival: 1,
    class_code: 1,
    login: 1,
    change_password: 1,
    setup: 1,
    verify: 1
  };
  var TIER2 = {
    admin: 1,
    teacher: 1,
    staff: 1,
    feed_review: 1,
    device_pairing: 1
  };

  function pageKey() {
    var path = (typeof location !== 'undefined' && location.pathname) ? location.pathname : '';
    var file = path.split('/').pop() || '';
    return String(file).replace(/\.html$/i, '').replace(/-/g, '_') || 'explore';
  }

  function classifyPage(key) {
    if (TIER0[key]) return { surface: key, tier: 0 };
    if (TIER2[key]) return { surface: key, tier: 2 };
    return { surface: key || 'explore', tier: 1 };
  }

  function apiBase() {
    if (typeof global.LANTERN_AVATAR_API !== 'undefined' && global.LANTERN_AVATAR_API !== null) {
      return String(global.LANTERN_AVATAR_API).replace(/\/$/, '');
    }
    return '';
  }

  function hasPii(label) {
    var hay = String(label || '').toLowerCase();
    if (!hay) return true;
    if (/@/.test(hay)) return true;
    if (/\b\d{5,}\b/.test(hay)) return true;
    return false;
  }

  function injectCss() {
    if (document.querySelector('link[data-lantern-protected-css]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/lantern-protected-content.css?v=228';
    link.setAttribute('data-lantern-protected-css', '1');
    document.head.appendChild(link);
  }

  function renderWatermark(label, tier) {
    if (!label || hasPii(label)) return;
    var existing = document.getElementById('lanternProtectedWatermark');
    if (existing) existing.remove();
    var wrap = document.createElement('div');
    wrap.id = 'lanternProtectedWatermark';
    wrap.className = 'lanternProtectedWatermark' + (Number(tier) >= 2 ? ' lanternProtectedWatermark--tier2' : '');
    wrap.setAttribute('aria-hidden', 'true');
    var grid = document.createElement('div');
    grid.className = 'lanternProtectedWatermark__grid';
    for (var i = 0; i < 18; i++) {
      var cell = document.createElement('span');
      cell.className = 'lanternProtectedWatermark__cell';
      cell.textContent = label;
      grid.appendChild(cell);
    }
    wrap.appendChild(grid);
    document.body.appendChild(wrap);
  }

  function renderNotice(text) {
    if (!text || document.getElementById('lanternSchoolUseNotice')) return;
    var el = document.createElement('p');
    el.id = 'lanternSchoolUseNotice';
    el.className = 'lanternSchoolUseNotice';
    el.textContent = text;
    var host = document.querySelector('.lanternContent') || document.body;
    if (host.firstChild) host.insertBefore(el, host.firstChild);
    else host.appendChild(el);
  }

  function wireDeterrence() {
    if (document.documentElement.dataset.lanternProtectedDeterrence === '1') return;
    document.documentElement.dataset.lanternProtectedDeterrence = '1';
    document.addEventListener('contextmenu', function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      if (t.closest('.lanternProtectedMedia, .lanternProtectedWatermark, .newsCardImageWrap, .lanternDetailMedia, .reviewLargeImg, .lcCardImg, video.lcCardVideo, video.newsCardVideo, video.reviewVideo')) {
        ev.preventDefault();
      }
    }, true);
    document.addEventListener('dragstart', function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      if (t.closest('.lanternProtectedMedia, img.newsCardImage, img.lcCardImg, img.reviewLargeImg')) {
        ev.preventDefault();
      }
    }, true);
  }

  function markMedia() {
    var nodes = document.querySelectorAll('img.newsCardImage, img.lcCardImg, img.reviewLargeImg, video.newsCardVideo, video.lcCardVideo, video.reviewVideo');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].classList.add('lanternProtectedMedia');
      nodes[i].setAttribute('draggable', 'false');
    }
  }

  function wireAdminLookup() {
    var input = document.getElementById('adminProtectedTraceInput');
    var btn = document.getElementById('adminProtectedTraceBtn');
    var out = document.getElementById('adminProtectedTraceResult');
    if (!input || !btn || !out) return;
    function lookup() {
      var code = String(input.value || '').trim();
      out.textContent = 'Looking up…';
      fetch(apiBase() + '/api/admin/protected/trace?code=' + encodeURIComponent(code), {
        credentials: 'include',
        cache: 'no-store'
      }).then(function (r) {
        return r.json().then(function (d) { return { ok: r.ok, body: d }; });
      }).then(function (res) {
        if (!res.ok || !res.body || !res.body.receipt) {
          out.textContent = (res.body && (res.body.error || res.body.message)) || 'No matching protected-access receipt.';
          return;
        }
        var rec = res.body.receipt;
        out.textContent =
          'Trace ' + rec.trace_code +
          ' — ' + (rec.action || 'view') +
          ' of ' + (rec.resource_type || 'surface') +
          (rec.resource_id ? ' (' + rec.resource_id + ')' : '') +
          ' by ' + (rec.viewer_username || 'unknown') +
          ' (' + (rec.viewer_role || '') + ')' +
          ' at ' + (rec.created_at || '');
      }).catch(function () {
        out.textContent = 'Lookup failed.';
      });
    }
    btn.addEventListener('click', lookup);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        lookup();
      }
    });
  }

  function boot() {
    var classified = classifyPage(pageKey());
    wireAdminLookup();
    if (classified.tier < 1) return;
    injectCss();
    document.documentElement.classList.add('lantern-protection-tier' + classified.tier);
    document.documentElement.setAttribute('data-lantern-protection', String(classified.tier));
    wireDeterrence();
    markMedia();
    fetch(apiBase() + '/api/protected/view-session?surface=' + encodeURIComponent(classified.surface) + '&action=view', {
      credentials: 'include',
      cache: 'no-store'
    }).then(function (r) { return r.json(); }).then(function (data) {
      if (!data || !data.ok || !data.protected || !data.watermark) return;
      if (hasPii(data.watermark) || hasPii(data.trace_code)) return;
      renderWatermark(data.watermark, data.tier || classified.tier);
      if (data.notice) renderNotice(data.notice);
    }).catch(function () {});
  }

  global.LanternProtectedContent = {
    classifyPage: classifyPage,
    pageKey: pageKey,
    boot: boot,
    renderWatermark: renderWatermark,
    hasPii: hasPii
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : self);
