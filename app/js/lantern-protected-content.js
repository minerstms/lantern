/**
 * Prompt #234 — protected student-media watermark (corrects #228 page-wallpaper placement).
 * Visible mark is an opaque TMS trace only. Viewer identity stays server-side.
 * DOM overlay is deterrence, not a change to stored R2 bytes.
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
  var AUTH_SKIP = {
    login: 1,
    change_password: 1,
    setup: 1,
    verify: 1,
    class_code: 1
  };
  var GENERIC_ASSET_RE = /fight-?song|srp-safety|handbook|local-?history|lantern-trivia-card|stand-up-and-cheer/i;
  var VIEWPORT_SEL = [
    '.lanternMediaFullscreenInner',
    '.newsCardImageWrap',
    '.lanternCardNewsMedia',
    '.lanternDetailMediaImageInner',
    '.lanternDetailMediaVideoInner',
    '.avatarMatchImgWrap',
    '.lanternProtectedMediaFrame'
  ].join(', ');
  var MEDIA_SEL = [
    'img.newsCardImage',
    'img.lcCardImg',
    'img.reviewLargeImg',
    'img.lanternMediaFullscreenImg',
    'img.lanternProtectedMedia',
    'video.newsCardVideo',
    'video.lcCardVideo',
    'video.reviewVideo',
    'video.lanternMediaFullscreenVideo',
    'video.lanternProtectedMedia',
    '.avatarMatchImgWrap img',
    'img[src*="/api/news/image"]',
    'img[src*="/api/news/video"]',
    'img[src*="/api/avatar/image"]',
    'video[src*="/api/news/video"]',
    'video[src*="/api/news/image"]'
  ].join(', ');
  var TINY_AVATAR_SEL = [
    '.avatarSmallWrap',
    '.identity-chip',
    '.lanternCanonicalCardMetaGrid',
    '.lanternTicker',
    '.lanternMarquee',
    '.lcCardAuthor',
    '.lanternCardIdentity',
    '.avatarCircle',
    '.avatarWrap'
  ].join(', ');

  var state = {
    traceCode: '',
    watermark: '',
    tier: 0,
    surface: ''
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

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;';
    });
  }

  function extractMediaKey(url) {
    var s = String(url || '').trim();
    if (!s) return '';
    var q = s.split('?')[1] || '';
    var parts = q.split('&');
    for (var i = 0; i < parts.length; i++) {
      var pair = parts[i].split('=');
      if (decodeURIComponent(pair[0] || '') === 'key') {
        try { return decodeURIComponent(pair[1] || '').trim(); } catch (_) { return String(pair[1] || '').trim(); }
      }
    }
    return '';
  }

  function classifyMediaUrl(url) {
    var s = String(url || '').trim();
    if (!s || /^data:/i.test(s) || /^blob:/i.test(s)) {
      return { protected: false, kind: 'inline', reason: 'data' };
    }
    if (GENERIC_ASSET_RE.test(s) || /\/assets\//i.test(s)) {
      return { protected: false, kind: 'school_asset', reason: 'generic_art' };
    }
    var key = extractMediaKey(s);
    if (key) {
      if ((key.indexOf('library/') === 0 && key !== 'library/') || (key.indexOf('default/') === 0 && key !== 'default/')) {
        return { protected: false, kind: 'school_library', reason: 'library' };
      }
      if (key.indexOf('missions/card/') === 0) {
        return { protected: false, kind: 'mission_card', reason: 'mission_card' };
      }
      if (key.indexOf('avatars/') === 0) return { protected: true, kind: 'avatar' };
      if (key.indexOf('news/') === 0) return { protected: true, kind: 'news_media' };
      if (key.indexOf('recognition/') === 0) return { protected: true, kind: 'recognition_media' };
      if (key.indexOf('missions/') === 0) return { protected: true, kind: 'mission_media' };
    }
    if (/\/api\/avatar\/image/i.test(s)) return { protected: true, kind: 'avatar' };
    if (/\/api\/news\/(image|video)/i.test(s)) return { protected: true, kind: 'news_media' };
    return { protected: false, kind: 'other', reason: 'unclassified' };
  }

  function isProtectedStudentMediaUrl(url) {
    return classifyMediaUrl(url).protected === true;
  }

  function mediaWatermarkLabel(code) {
    var c = String(code || '').trim().toUpperCase();
    if (!c || hasPii(c)) return '';
    return 'TMS • ' + c;
  }

  function currentLabel() {
    if (state.traceCode && !hasPii(state.traceCode)) return mediaWatermarkLabel(state.traceCode);
    var wm = String(state.watermark || '');
    var m = wm.match(/[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}/);
    if (m && !hasPii(m[0])) return mediaWatermarkLabel(m[0]);
    return '';
  }

  function injectCss() {
    if (document.querySelector('link[data-lantern-protected-css]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/lantern-protected-content.css?v=234';
    link.setAttribute('data-lantern-protected-css', '1');
    document.head.appendChild(link);
  }

  function watermarkOverlayHtml(label, variant) {
    var safe = esc(label);
    var v = variant || 'media';
    var cells = '';
    var n = v === 'avatar' ? 0 : 12;
    for (var i = 0; i < n; i++) {
      cells += '<span class="lanternProtectedMediaMark__cell">' + safe + '</span>';
    }
    return '<div class="lanternProtectedMediaMark lanternProtectedMediaMark--' + esc(v) + '" aria-hidden="true" data-lantern-media-mark="1">' +
      '<div class="lanternProtectedMediaMark__grid">' + cells + '</div>' +
      '<span class="lanternProtectedMediaMark__chip">' + safe + '</span></div>';
  }

  function isTinyAvatar(el) {
    if (!el || !el.closest) return false;
    if (el.closest('.avatarMatchImgWrap, .lanternMediaFullscreenInner, .lanternDetailMedia, .reviewLargeImg, .newsCardImageWrap, .lanternCardNewsMedia')) {
      return false;
    }
    if (el.closest(TINY_AVATAR_SEL)) return true;
    var w = el.clientWidth || el.width || 0;
    var h = el.clientHeight || el.height || 0;
    if (w > 0 && h > 0 && w <= 96 && h <= 96) return true;
    return false;
  }

  function mediaSrc(el) {
    if (!el) return '';
    return el.currentSrc || el.src || el.getAttribute('src') || '';
  }

  function findViewport(el) {
    if (!el || !el.closest) return null;
    return el.closest(VIEWPORT_SEL);
  }

  function wrapMedia(el) {
    if (!el || !el.parentNode) return null;
    if (el.parentNode.classList && el.parentNode.classList.contains('lanternProtectedMediaFrame')) {
      return el.parentNode;
    }
    var frame = document.createElement('span');
    frame.className = 'lanternProtectedMediaFrame';
    el.parentNode.insertBefore(frame, el);
    frame.appendChild(el);
    return frame;
  }

  function applyOverlay(viewport, label, variant) {
    if (!viewport || !label || hasPii(label)) return null;
    var existing = null;
    var kids = viewport.children || [];
    for (var i = 0; i < kids.length; i++) {
      if (kids[i].classList && kids[i].classList.contains('lanternProtectedMediaMark')) {
        existing = kids[i];
        break;
      }
    }
    if (!existing && viewport.querySelector) {
      existing = viewport.querySelector('.lanternProtectedMediaMark');
    }
    if (existing && existing.parentNode === viewport) {
      if (existing.getAttribute('data-lantern-label') === label && existing.className.indexOf('--' + variant) !== -1) {
        return existing;
      }
      existing.parentNode.removeChild(existing);
    }
    var hold = document.createElement('div');
    hold.innerHTML = watermarkOverlayHtml(label, variant);
    var mark = hold.firstChild;
    if (!mark) return null;
    mark.setAttribute('data-lantern-label', label);
    viewport.appendChild(mark);
    return mark;
  }

  function decorateMedia(el, opts) {
    opts = opts || {};
    if (!el || el.nodeType !== 1) return null;
    var src = mediaSrc(el);
    var forced = opts.force === true;
    if (!forced && !isProtectedStudentMediaUrl(src)) return null;
    var label = opts.label || currentLabel();
    if (!label || hasPii(label)) return null;
    el.classList.add('lanternProtectedMedia');
    el.setAttribute('draggable', 'false');
    var variant = opts.variant || (el.closest && el.closest('.lanternMediaFullscreenInner') ? 'expanded' : (isTinyAvatar(el) ? 'avatar' : 'media'));
    var viewport = findViewport(el) || wrapMedia(el);
    if (!viewport) return null;
    if (variant === 'expanded') viewport.classList.add('lanternProtectedMediaFrame');
    return applyOverlay(viewport, label, variant);
  }

  function decorateTree(root, opts) {
    if (!root || !root.querySelectorAll) return 0;
    var label = (opts && opts.label) || currentLabel();
    if (!label) return 0;
    var nodes = root.querySelectorAll(MEDIA_SEL);
    var n = 0;
    for (var i = 0; i < nodes.length; i++) {
      if (decorateMedia(nodes[i], { label: label })) n++;
    }
    return n;
  }

  function decorateFullscreen(shell, opts) {
    if (!shell) return null;
    var inner = shell.querySelector ? shell.querySelector('.lanternMediaFullscreenInner') : shell;
    if (!inner) return null;
    inner.classList.add('lanternProtectedMediaFrame');
    var media = inner.querySelector('img, video');
    if (media) {
      media.classList.add('lanternProtectedMedia');
      media.setAttribute('draggable', 'false');
      var src = mediaSrc(media);
      if (src && !isProtectedStudentMediaUrl(src) && !(opts && opts.force)) {
        return null;
      }
    }
    var label = (opts && opts.label) || currentLabel();
    if (!label) return null;
    return applyOverlay(inner, label, 'expanded');
  }

  function removePageWideWatermark() {
    var existing = document.getElementById('lanternProtectedWatermark');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    var leftovers = document.querySelectorAll('.lanternProtectedWatermark');
    for (var i = 0; i < leftovers.length; i++) {
      if (leftovers[i].parentNode) leftovers[i].parentNode.removeChild(leftovers[i]);
    }
  }

  function refreshAllMarks() {
    removePageWideWatermark();
    var label = currentLabel();
    if (!label) return;
    decorateTree(document, { label: label });
    var fs = document.getElementById('lanternMediaFullscreenOverlay');
    if (fs) decorateFullscreen(fs, { label: label });
  }

  function wireDeterrence() {
    if (document.documentElement.dataset.lanternProtectedDeterrence === '1') return;
    document.documentElement.dataset.lanternProtectedDeterrence = '1';
    document.addEventListener('contextmenu', function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      if (t.closest('.lanternProtectedMedia, .lanternProtectedMediaMark, .lanternProtectedMediaFrame, .newsCardImageWrap, .lanternDetailMedia, .reviewLargeImg, .lcCardImg, video.lcCardVideo, video.newsCardVideo, video.reviewVideo, .lanternMediaFullscreenInner')) {
        ev.preventDefault();
      }
    }, true);
    document.addEventListener('dragstart', function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      if (t.closest('.lanternProtectedMedia, .lanternProtectedMediaFrame, img.newsCardImage, img.lcCardImg, img.reviewLargeImg, img.lanternMediaFullscreenImg')) {
        ev.preventDefault();
      }
    }, true);
  }

  function markMedia() {
    var nodes = document.querySelectorAll('img.newsCardImage, img.lcCardImg, img.reviewLargeImg, img.lanternMediaFullscreenImg, video.newsCardVideo, video.lcCardVideo, video.reviewVideo, video.lanternMediaFullscreenVideo');
    for (var i = 0; i < nodes.length; i++) {
      if (!isProtectedStudentMediaUrl(mediaSrc(nodes[i]))) continue;
      nodes[i].classList.add('lanternProtectedMedia');
      nodes[i].setAttribute('draggable', 'false');
    }
  }

  function wireObserver() {
    if (document.documentElement.dataset.lanternProtectedObserver === '1') return;
    if (typeof MutationObserver === 'undefined') return;
    document.documentElement.dataset.lanternProtectedObserver = '1';
    var timer = null;
    var obs = new MutationObserver(function () {
      if (timer) return;
      timer = setTimeout(function () {
        timer = null;
        markMedia();
        refreshAllMarks();
      }, 40);
    });
    obs.observe(document.body, { childList: true, subtree: true });
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

  function applySession(data, classified) {
    if (!data || !data.ok) return;
    if (data.trace_code && !hasPii(data.trace_code)) state.traceCode = String(data.trace_code);
    if (data.watermark && !hasPii(data.watermark)) state.watermark = String(data.watermark);
    state.tier = Number(data.tier != null ? data.tier : classified.tier) || 0;
    refreshAllMarks();
  }

  function fetchViewSession(surface, extra) {
    extra = extra || {};
    var q = '?surface=' + encodeURIComponent(surface) + '&action=' + encodeURIComponent(extra.action || 'view');
    if (extra.resource_type) q += '&resource_type=' + encodeURIComponent(extra.resource_type);
    if (extra.resource_id) q += '&resource_id=' + encodeURIComponent(extra.resource_id);
    return fetch(apiBase() + '/api/protected/view-session' + q, {
      credentials: 'include',
      cache: 'no-store'
    }).then(function (r) { return r.json(); });
  }

  function boot() {
    var classified = classifyPage(pageKey());
    state.surface = classified.surface;
    wireAdminLookup();
    removePageWideWatermark();
    if (AUTH_SKIP[classified.surface]) return;
    injectCss();
    document.documentElement.classList.add('lantern-protection-tier' + classified.tier);
    document.documentElement.setAttribute('data-lantern-protection', String(classified.tier));
    wireDeterrence();
    markMedia();
    wireObserver();
    fetchViewSession(classified.surface, { action: 'view' }).then(function (data) {
      if (data && data.ok && data.protected && data.watermark && !hasPii(data.watermark) && !hasPii(data.trace_code)) {
        applySession(data, classified);
        return;
      }
      if (state.traceCode) return;
      return fetchViewSession('protected_media', { action: 'view', resource_type: 'student_media' }).then(function (mediaData) {
        if (mediaData && mediaData.ok && mediaData.protected && mediaData.trace_code && !hasPii(mediaData.trace_code)) {
          applySession(mediaData, { surface: 'protected_media', tier: mediaData.tier || 1 });
        }
      });
    }).catch(function () {});
  }

  global.LanternProtectedContent = {
    classifyPage: classifyPage,
    pageKey: pageKey,
    boot: boot,
    hasPii: hasPii,
    classifyMediaUrl: classifyMediaUrl,
    isProtectedStudentMediaUrl: isProtectedStudentMediaUrl,
    mediaWatermarkLabel: mediaWatermarkLabel,
    watermarkOverlayHtml: watermarkOverlayHtml,
    decorateMedia: decorateMedia,
    decorateTree: decorateTree,
    decorateFullscreen: decorateFullscreen,
    currentLabel: currentLabel,
    removePageWideWatermark: removePageWideWatermark
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : self);
