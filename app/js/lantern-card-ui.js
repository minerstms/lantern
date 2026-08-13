/**
 * Lantern — shared opened-card surface + fullscreen media for student preview cards (Explore, Profile, Contribute embedded).
 * - Opened surface: #lanternCardDetailOverlay + fillNewsDetailModal / fillCreationDetailModal / fillPollDetailModal; mount*DetailInto for embedded.
 * - Prompt #148 — Explore overlay is a viewport-fit shell (header + stage + footer). Outer modal does not scroll; long body uses in-modal Reading Mode.
 * - Fullscreen media: openMediaFullscreen + wireOpenedPostMediaInteractions (only stack for student opened-post media).
 * Depends: LanternCards, LanternMedia (optional), LANTERN_REACTIONS (news), LANTERN_API (post reactions).
 * See docs/ui/LANTERN_RAIL_OPEN_FULLSCREEN_SYSTEM.md
 */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;';
    });
  }

  /** Prompt #149 — durable account key for avatar (not display labels). */
  function durableAccountKeyFromItem(item) {
    item = item || {};
    if (global.LanternAvatar && typeof global.LanternAvatar.accountKeyFromItem === 'function') {
      return global.LanternAvatar.accountKeyFromItem(item);
    }
    var raw = String(
      item.authorAvatarKey || item.author_avatar_key || item.authorId || item.author_id || item.actor_id || item.character_name || ''
    ).trim();
    if (global.LanternAvatar && typeof global.LanternAvatar.normalizeAvatarAccountKey === 'function') {
      return global.LanternAvatar.normalizeAvatarAccountKey(raw);
    }
    return raw;
  }

  /** Prompt #149 — same public name as Explore cards (formatExploreAuthorLabel). Never railIdentityFirstName. */
  function publicAuthorLabelFromItem(item) {
    item = item || {};
    if (global.LanternCards && typeof global.LanternCards.formatExploreAuthorLabel === 'function') {
      return String(global.LanternCards.formatExploreAuthorLabel(item) || '').trim();
    }
    return String(item.authorPublicLabel || item.author_public_label || item.authorDisplayName || item.author_name || '').trim();
  }

  /**
   * Same identity chip the card uses: approved avatar + public author label.
   * Fetches canonical avatar when missing so card and modal cannot diverge.
   */
  function paintCanonicalPersonIdentity(idw, item, opts) {
    opts = opts || {};
    var LC = global.LanternCards;
    if (!idw || !LC || typeof LC.buildExploreAuthorAvatarHtml !== 'function') return;
    item = item || {};
    var accountKey = durableAccountKeyFromItem(item);
    var label = publicAuthorLabelFromItem(item);
    if (!accountKey && !label) {
      idw.innerHTML = '';
      return;
    }
    var size = opts.size || 'md';
    idw.innerHTML =
      '<div class="lanternCardDetailIdentity exploreCardIdentity exploreCardIdentity--rail">' +
      LC.buildExploreAuthorAvatarHtml({
        character_name: accountKey,
        authorAvatarKey: accountKey,
        author_name: label,
        _canonicalAvatar: item._canonicalAvatar,
        frame: 'none',
        identitySize: size
      }) +
      (label ? '<span class="exploreAuthor exploreAuthor--identity">' + esc(label) + '</span>' : '') +
      '</div>';
    var hasImg = item._canonicalAvatar && item._canonicalAvatar.imageUrl && String(item._canonicalAvatar.imageUrl).trim();
    if (!hasImg && accountKey && global.LanternAvatar && typeof global.LanternAvatar.getCanonicalAvatar === 'function' && !item._lanternIdentityAvatarFetch) {
      item._lanternIdentityAvatarFetch = true;
      var leg = global.LanternAvatar.getLegacyEmojiForCharacter ? global.LanternAvatar.getLegacyEmojiForCharacter(accountKey) : '';
      global.LanternAvatar.getCanonicalAvatar(accountKey, leg || undefined).then(function (canon) {
        item._canonicalAvatar = canon || item._canonicalAvatar;
        if (!idw.parentNode) return;
        paintCanonicalPersonIdentity(idw, item, opts);
      });
    }
  }

  var overlay = null;
  var escapeWired = false;
  var mediaFsOverlay = null;
  var canonicalResizeWired = false;

  /** Prompt #9 — freeze page scroll while opened-detail dialog is shown (prevents jump/zoom feel). */
  function lockPageScrollForDetail() {
    var body = global.document && global.document.body;
    var html = global.document && global.document.documentElement;
    if (!body || body.dataset.lanternDetailScrollLock === '1') return;
    body.dataset.lanternDetailScrollLock = '1';
    body.dataset.lanternDetailScrollY = String(global.scrollY || (html && html.scrollTop) || 0);
    body.style.overflow = 'hidden';
    if (html) html.style.overflow = 'hidden';
  }

  function unlockPageScrollForDetail() {
    var body = global.document && global.document.body;
    var html = global.document && global.document.documentElement;
    if (!body || body.dataset.lanternDetailScrollLock !== '1') return;
    var y = parseInt(body.dataset.lanternDetailScrollY || '0', 10) || 0;
    delete body.dataset.lanternDetailScrollLock;
    delete body.dataset.lanternDetailScrollY;
    body.style.overflow = '';
    if (html) html.style.overflow = '';
    try {
      global.scrollTo(0, y);
    } catch (eScroll) {}
  }

  function isExploreOpenedOverlayModal(modalRoot) {
    if (!modalRoot) return false;
    var cl = modalRoot.classList;
    if (cl && typeof cl.contains === 'function' && cl.contains('lanternCardDetailModal--embedded')) return false;
    if (typeof modalRoot.closest === 'function') {
      try {
        return !!modalRoot.closest('#lanternCardDetailOverlay');
      } catch (eClosest) {}
    }
    var p = modalRoot.parentNode;
    while (p) {
      if (p.id === 'lanternCardDetailOverlay') return true;
      p = p.parentNode;
    }
    return false;
  }

  function openedModalHasMedia(modalRoot) {
    var v = modalRoot && modalRoot.querySelector ? modalRoot.querySelector('.lanternCardDetailVisual') : null;
    if (!v) return false;
    if (!String(v.innerHTML || '').trim()) return false;
    return !!(v.querySelector('img, video, .lanternDetailMedia, .exploreCardVisual, .lcCardImg, .pollModalImage'));
  }

  function openedReadingReturnLabel(modalRoot) {
    var v = modalRoot && modalRoot.querySelector ? modalRoot.querySelector('.lanternCardDetailVisual') : null;
    if (v && v.querySelector('video, .lanternDetailMedia--video')) return 'Show video';
    if (v && v.querySelector('img, .lanternDetailMedia--img')) return 'Show photo';
    if (openedModalHasMedia(modalRoot)) return 'Show media';
    return 'Collapse message';
  }

  function ensureCanonicalOpenedShell(modalRoot) {
    if (!modalRoot || !global.document) return;
    var sc = modalRoot.querySelector('.lanternSurfaceContent');
    if (!sc) return;
    var header = sc.querySelector('.lanternCardDetailHeader');
    var stage = sc.querySelector('.lanternCardDetailStage');
    if (!stage) {
      stage = global.document.createElement('div');
      stage.className = 'lanternCardDetailStage';
      if (header && header.parentNode === sc) sc.insertBefore(stage, header.nextSibling);
      else sc.insertBefore(stage, sc.firstChild);
    }
    var rec = sc.querySelector('.lanternCardDetailRecognizing');
    if (!rec) {
      rec = global.document.createElement('div');
      rec.className = 'lanternCardDetailRecognizing';
      rec.id = 'lanternCardDetailRecognizing';
      rec.hidden = true;
      rec.setAttribute('aria-hidden', 'true');
      stage.appendChild(rec);
    }
    /* Prompt #171 — read/view content first, react last. DOM order is the visual/keyboard order. */
    var stageOrder = [
      'lanternCardDetailVisual',
      'lanternCardDetailTitle',
      'lanternCardDetailIdentityWrap',
      'lanternCardDetailMeta',
      'lanternCardDetailRecognizing',
      'lanternCardDetailBody',
      'lanternCardDetailReactions',
      'lanternCardDetailAdminModeration',
    ];
    for (var si = 0; si < stageOrder.length; si++) {
      var node = sc.querySelector('.' + stageOrder[si]);
      if (node) stage.appendChild(node);
    }
    var footer = sc.querySelector('.lanternCardDetailFooter');
    if (!footer) {
      footer = global.document.createElement('footer');
      footer.className = 'lanternCardDetailFooter';
      sc.appendChild(footer);
    }
    var actions = sc.querySelector('.lanternCardDetailActions');
    if (actions && actions.parentNode !== footer) footer.appendChild(actions);
  }

  function ensureCanonicalBodyChrome(modalRoot) {
    if (!modalRoot || !global.document) return null;
    var body = modalRoot.querySelector('.lanternCardDetailBody');
    if (!body) return null;
    var read = body.querySelector('.lanternCardDetailBodyRead');
    if (!read) {
      read = global.document.createElement('div');
      read.className = 'lanternCardDetailBodyRead';
      var move = [];
      for (var i = 0; i < body.childNodes.length; i++) {
        var n = body.childNodes[i];
        if (n.classList && n.classList.contains('lanternCardDetailReadToggle')) continue;
        move.push(n);
      }
      for (var mi = 0; mi < move.length; mi++) read.appendChild(move[mi]);
      body.insertBefore(read, body.firstChild);
    }
    var toggle = body.querySelector('.lanternCardDetailReadToggle');
    if (!toggle) {
      toggle = global.document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'lanternCardDetailReadToggle';
      toggle.hidden = true;
      body.appendChild(toggle);
    }
    return { body: body, read: read, toggle: toggle };
  }

  function syncOpenedBodyVisibility(modalRoot) {
    var body = modalRoot && modalRoot.querySelector ? modalRoot.querySelector('.lanternCardDetailBody') : null;
    if (!body) return;
    var read = body.querySelector('.lanternCardDetailBodyRead');
    var hasText = !!(read && String(read.textContent || '').trim());
    var hasPollUi = !!(read && (read.querySelector('.pollChoiceBtn, .pollChoiceGroup, .pollResultsWrap, #lanternPollDetailChoices, .pollLockInBtn')));
    body.style.display = hasText || hasPollUi ? '' : 'none';
  }

  function applyOpenedRecognizing(modalRoot, item) {
    var rec = modalRoot && modalRoot.querySelector ? modalRoot.querySelector('.lanternCardDetailRecognizing') : null;
    if (!rec) return;
    var party = '';
    var LC = global.LanternCards;
    if (item && LC && typeof LC.shoutOutRecognizedPartyLabel === 'function') {
      party = String(LC.shoutOutRecognizedPartyLabel(item) || '').trim();
    }
    var cap = modalRoot.querySelector('.lanternCardDetailCaption');
    var blob = cap ? String(cap.textContent || '') : '';
    if (!party) {
      var m = blob.match(/Recognizing:\s*([^\n\r]+)/i);
      if (m && m[1]) party = String(m[1]).replace(/\s+/g, ' ').trim();
    }
    if (!party || /^(undefined|null)$/i.test(party)) {
      rec.hidden = true;
      rec.textContent = '';
      rec.setAttribute('aria-hidden', 'true');
      return;
    }
    rec.hidden = false;
    rec.setAttribute('aria-hidden', 'false');
    rec.textContent = 'Recognizing: ' + party;
    if (cap) {
      var html = String(cap.innerHTML || '');
      var stripped = html.replace(/Recognizing:\s*[^<]*(?:<br\s*\/?>)?/gi, '');
      stripped = stripped.replace(/^(?:\s|<br\s*\/?>)+/i, '');
      cap.innerHTML = stripped;
      if (!String(cap.textContent || '').trim() && cap.parentNode) cap.parentNode.removeChild(cap);
    }
  }

  function measureOpenedModalTruncation(modalRoot) {
    if (!isExploreOpenedOverlayModal(modalRoot)) return;
    var chrome = ensureCanonicalBodyChrome(modalRoot);
    if (!chrome || !chrome.toggle) return;
    /* Prompt #168 — full body is always in flow; no inner Read-full-message viewport. */
    chrome.toggle.hidden = true;
    chrome.toggle.textContent = '';
    chrome.toggle.removeAttribute('aria-expanded');
    modalRoot.classList.remove('lanternCardDetailModal--truncated', 'lanternCardDetailModal--reading');
  }

  function scheduleOpenedModalMeasure(modalRoot) {
    if (!modalRoot) return;
    if (typeof global.requestAnimationFrame !== 'function') {
      measureOpenedModalTruncation(modalRoot);
      return;
    }
    global.requestAnimationFrame(function () {
      global.requestAnimationFrame(function () {
        measureOpenedModalTruncation(modalRoot);
      });
    });
  }

  function enterOpenedReadingMode(modalRoot) {
    if (!modalRoot || !modalRoot.classList) return;
    modalRoot.classList.add('lanternCardDetailModal--reading');
    var read = modalRoot.querySelector('.lanternCardDetailBodyRead');
    if (read) read.scrollTop = 0;
    scheduleOpenedModalMeasure(modalRoot);
  }

  function exitOpenedReadingMode(modalRoot) {
    if (!modalRoot || !modalRoot.classList) return;
    modalRoot.classList.remove('lanternCardDetailModal--reading');
    var read = modalRoot.querySelector('.lanternCardDetailBodyRead');
    if (read) read.scrollTop = 0;
    scheduleOpenedModalMeasure(modalRoot);
  }

  function toggleOpenedReadingMode(modalRoot) {
    if (!modalRoot || !modalRoot.classList) return;
    if (modalRoot.classList.contains('lanternCardDetailModal--reading')) exitOpenedReadingMode(modalRoot);
    else enterOpenedReadingMode(modalRoot);
  }

  function wireOpenedModalReadControls(modalRoot) {
    var chrome = ensureCanonicalBodyChrome(modalRoot);
    if (!chrome) return;
    if (chrome.toggle.dataset.lanternReadWired !== '1') {
      chrome.toggle.dataset.lanternReadWired = '1';
      chrome.toggle.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        toggleOpenedReadingMode(modalRoot);
      });
    }
    if (chrome.read.dataset.lanternReadWired !== '1') {
      chrome.read.dataset.lanternReadWired = '1';
      chrome.read.addEventListener('click', function (e) {
        var t = e.target;
        if (t && t.closest && t.closest('a, button, input, textarea, select, video, .pollChoiceBtn, .pollLockInBtn')) return;
        if (!modalRoot.classList.contains('lanternCardDetailModal--truncated')) return;
        if (modalRoot.classList.contains('lanternCardDetailModal--reading')) return;
        if (modalRoot.classList.contains('lanternCardDetailModal--poll')) return;
        enterOpenedReadingMode(modalRoot);
      });
    }
  }

  function wireOpenedModalMediaMeasure(modalRoot) {
    var v = modalRoot && modalRoot.querySelector ? modalRoot.querySelector('.lanternCardDetailVisual') : null;
    if (!v) return;
    var imgs = v.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      if (imgs[i].dataset.lanternMeasureWired === '1') continue;
      imgs[i].dataset.lanternMeasureWired = '1';
      imgs[i].addEventListener('load', function () { scheduleOpenedModalMeasure(modalRoot); });
    }
    var vids = v.querySelectorAll('video');
    for (var vi = 0; vi < vids.length; vi++) {
      if (vids[vi].dataset.lanternMeasureWired === '1') continue;
      vids[vi].dataset.lanternMeasureWired = '1';
      vids[vi].addEventListener('loadedmetadata', function () { scheduleOpenedModalMeasure(modalRoot); });
    }
  }

  function wireOpenedModalResize() {
    if (canonicalResizeWired) return;
    canonicalResizeWired = true;
    global.addEventListener('resize', function () {
      if (!overlay || !overlay.classList || !overlay.classList.contains('show')) return;
      var modal = overlay.querySelector('.lanternCardDetailModal');
      if (modal) scheduleOpenedModalMeasure(modal);
    });
  }

  function resetCanonicalOpenedModal(modalRoot) {
    if (!modalRoot || !modalRoot.classList) return;
    modalRoot.classList.remove(
      'lanternCardDetailModal--reading',
      'lanternCardDetailModal--no-media',
      'lanternCardDetailModal--poll',
      'lanternCardDetailModal--video',
      'lanternCardDetailModal--truncated'
    );
    var read = modalRoot.querySelector('.lanternCardDetailBodyRead');
    if (read) read.scrollTop = 0;
    var rec = modalRoot.querySelector('.lanternCardDetailRecognizing');
    if (rec) {
      rec.hidden = true;
      rec.textContent = '';
      rec.setAttribute('aria-hidden', 'true');
    }
    var toggle = modalRoot.querySelector('.lanternCardDetailReadToggle');
    if (toggle) {
      toggle.hidden = true;
      toggle.textContent = '';
      toggle.setAttribute('aria-expanded', 'false');
    }
  }

  function prepareCanonicalOpenedModal(modalRoot, ctx) {
    ctx = ctx || {};
    if (!isExploreOpenedOverlayModal(modalRoot)) return;
    ensureCanonicalOpenedShell(modalRoot);
    modalRoot.classList.remove('lanternCardDetailModal--reading', 'lanternCardDetailModal--truncated');
    var read = modalRoot.querySelector('.lanternCardDetailBodyRead');
    if (read) read.scrollTop = 0;
    ensureCanonicalBodyChrome(modalRoot);
    var kind = String(ctx.kind || '').toLowerCase();
    var isPoll = kind === 'poll' || !!(modalRoot.querySelector('#lanternPollDetailChoices, .pollChoiceGroup, .pollLockInBtn'));
    modalRoot.classList.toggle('lanternCardDetailModal--poll', isPoll);
    var hasVideo = !!(modalRoot.querySelector('.lanternDetailMedia--video, video.newsCardVideo, video.lcCardVideo'));
    modalRoot.classList.toggle('lanternCardDetailModal--video', hasVideo);
    modalRoot.classList.toggle('lanternCardDetailModal--no-media', !openedModalHasMedia(modalRoot));
    if (isPoll) {
      var rec = modalRoot.querySelector('.lanternCardDetailRecognizing');
      if (rec) {
        rec.hidden = true;
        rec.textContent = '';
        rec.setAttribute('aria-hidden', 'true');
      }
    } else {
      applyOpenedRecognizing(modalRoot, ctx.item || null);
    }
    syncOpenedBodyVisibility(modalRoot);
    wireOpenedModalReadControls(modalRoot);
    wireOpenedModalMediaMeasure(modalRoot);
    wireOpenedModalResize();
    scheduleOpenedModalMeasure(modalRoot);
  }

  function showDetailOverlay(el) {
    if (!el) return;
    el.classList.add('show');
    el.setAttribute('aria-hidden', 'false');
    el.scrollTop = 0;
    lockPageScrollForDetail();
    var modal = el.querySelector('.lanternCardDetailModal');
    if (modal) prepareCanonicalOpenedModal(modal);
  }

  function closeMediaFullscreen() {
    if (!mediaFsOverlay || !mediaFsOverlay.parentNode) {
      mediaFsOverlay = null;
      return;
    }
    mediaFsOverlay.parentNode.removeChild(mediaFsOverlay);
    mediaFsOverlay = null;
  }

  function wireGlobalEscape() {
    if (escapeWired) return;
    escapeWired = true;
    global.document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (mediaFsOverlay && mediaFsOverlay.parentNode) {
        closeMediaFullscreen();
        e.preventDefault();
        return;
      }
      if (overlay && overlay.classList.contains('show')) closeDetail();
    });
  }

  function openMediaFullscreen(kind, payload) {
    payload = payload || {};
    closeMediaFullscreen();
    var shell = global.document.createElement('div');
    shell.id = 'lanternMediaFullscreenOverlay';
    shell.className = 'lanternMediaFullscreenOverlay';
    shell.setAttribute('role', 'dialog');
    shell.setAttribute('aria-modal', 'true');
    shell.setAttribute('aria-label', 'Media');
    var inner = '';
    if (kind === 'image' && payload.src) {
      inner = '<div class="lanternMediaFullscreenInner"><img src="' + esc(payload.src) + '" alt="" class="lanternMediaFullscreenImg" /></div>';
    } else if (kind === 'video' && payload.src) {
      var posterAttr = payload.poster ? ' poster="' + esc(payload.poster) + '"' : '';
      inner = '<div class="lanternMediaFullscreenInner"><video class="lanternMediaFullscreenVideo" controls autoplay playsinline src="' + esc(payload.src) + '"' + posterAttr + '></video></div>';
    } else {
      return;
    }
    shell.innerHTML = '<button type="button" class="lanternMediaFullscreenClose" aria-label="Close">✕</button>' + inner;
    shell.addEventListener('click', function (e) {
      if (e.target === shell) closeMediaFullscreen();
    });
    var closeBtn = shell.querySelector('.lanternMediaFullscreenClose');
    if (closeBtn) closeBtn.addEventListener('click', function (e) { e.stopPropagation(); closeMediaFullscreen(); });
    global.document.body.appendChild(shell);
    mediaFsOverlay = shell;
    shell.classList.add('lanternMediaFullscreenOverlay--show');
    wireGlobalEscape();
  }

  function wireOpenedPostMediaInteractions(modalRoot) {
    if (!modalRoot) return;
    var host = modalRoot.querySelector('.lanternCardDetailVisual');
    if (!host) return;
    /* Prompt #219 — promote rail-fallback imgs into detail media wraps so expand + contain sizing apply. */
    host.querySelectorAll('.lanternCardDetailVisualInner > .lcCardImg, .lanternCardDetailVisualInner .exploreCardVisual img').forEach(function (img) {
      if (img.closest('.lanternDetailMedia--img')) return;
      var src = img.currentSrc || img.src || '';
      if (!src) return;
      var inner = img.closest('.lanternCardDetailVisualInner') || host;
      inner.innerHTML =
        '<div class="lanternDetailMedia lanternDetailMedia--img">' +
        '<div class="newsCardImageWrap lanternDetailMediaImageInner">' +
        '<button type="button" class="lanternDetailMediaExpandBtn" aria-label="View full image" title="View full image">⛶</button>' +
        '<img class="newsCardImage" src="' + esc(src) + '" alt="" />' +
        '</div></div>';
    });
    /* Prompt #219 — ensure every detail image wrap has an LRHC expand control (poll/news injectors too). */
    host.querySelectorAll('.lanternDetailMedia--img .newsCardImageWrap').forEach(function (wrap) {
      if (wrap.querySelector('.lanternDetailMediaExpandBtn')) return;
      var img = wrap.querySelector('img');
      if (!img) return;
      wrap.classList.add('lanternDetailMediaImageInner');
      var btn = global.document.createElement('button');
      btn.type = 'button';
      btn.className = 'lanternDetailMediaExpandBtn';
      btn.setAttribute('aria-label', 'View full image');
      btn.title = 'View full image';
      btn.textContent = '⛶';
      wrap.appendChild(btn);
    });
    host.querySelectorAll('.lanternDetailMedia--img img').forEach(function (img) {
      if (img.closest('a')) return;
      img.style.cursor = 'zoom-in';
      if (img.dataset.lanternFsWired === '1') return;
      img.dataset.lanternFsWired = '1';
      img.addEventListener('click', function (e) {
        e.stopPropagation();
        openMediaFullscreen('image', { src: img.currentSrc || img.src });
      });
    });
    host.querySelectorAll('.lanternDetailMediaExpandBtn').forEach(function (btn) {
      if (btn.dataset.lanternFsWired === '1') return;
      btn.dataset.lanternFsWired = '1';
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var imgWrap = btn.closest('.lanternDetailMedia--img');
        if (imgWrap) {
          var img = imgWrap.querySelector('img');
          if (img) openMediaFullscreen('image', { src: img.currentSrc || img.src });
          return;
        }
        var wrap = btn.closest('.lanternDetailMedia--video');
        var vid = wrap && wrap.querySelector('video');
        if (!vid) return;
        openMediaFullscreen('video', { src: vid.currentSrc || vid.src, poster: vid.poster || '' });
      });
    });
  }

  function ensureOverlay() {
    if (overlay && overlay.parentNode) {
      overlay.classList.add('lanternSurfaceShell');
      var modalPatch = overlay.querySelector('.lanternCardDetailModal');
      if (modalPatch) modalPatch.classList.add('lanternSurface');
      if (modalPatch && !modalPatch.querySelector('.lanternSurfaceContent')) {
        var inner = global.document.createElement('div');
        inner.className = 'lanternSurfaceContent';
        while (modalPatch.firstChild) {
          inner.appendChild(modalPatch.firstChild);
        }
        modalPatch.appendChild(inner);
      }
      if (modalPatch && !modalPatch.querySelector('.lanternCardDetailIdentityWrap')) {
        var tEl = modalPatch.querySelector('.lanternCardDetailTitle');
        var mEl = modalPatch.querySelector('.lanternCardDetailMeta');
        if (tEl && mEl && tEl.parentNode === mEl.parentNode) {
          var idw = global.document.createElement('div');
          idw.className = 'lanternCardDetailIdentityWrap';
          idw.id = 'lanternCardDetailIdentityWrap';
          tEl.parentNode.insertBefore(idw, mEl);
        }
      }
      if (modalPatch) {
        var scPatch = modalPatch.querySelector('.lanternSurfaceContent');
        var closePatch = scPatch && scPatch.querySelector('.lanternCardDetailClose');
        if (closePatch && closePatch.parentNode === scPatch && !scPatch.querySelector('.lanternCardDetailHeader')) {
          var hdrPatch = global.document.createElement('header');
          hdrPatch.className = 'lanternCardDetailHeader';
          hdrPatch.setAttribute('role', 'presentation');
          scPatch.insertBefore(hdrPatch, closePatch);
          hdrPatch.appendChild(closePatch);
        }
      }
      if (modalPatch) {
        var scAdm = modalPatch.querySelector('.lanternSurfaceContent');
        if (scAdm && !scAdm.querySelector('#lanternCardDetailAdminModeration')) {
          var admEl = global.document.createElement('div');
          admEl.id = 'lanternCardDetailAdminModeration';
          admEl.className = 'lanternCardDetailAdminModeration';
          admEl.setAttribute('aria-hidden', 'true');
          var actEl = scAdm.querySelector('.lanternCardDetailActions');
          if (actEl) scAdm.insertBefore(admEl, actEl);
          else scAdm.appendChild(admEl);
        }
        ensureCanonicalOpenedShell(modalPatch);
      }
      return overlay;
    }
    overlay = global.document.createElement('div');
    overlay.id = 'lanternCardDetailOverlay';
    overlay.className = 'lanternCardDetailOverlay lanternSurfaceShell';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML =
      '<div class="lanternCardDetailModal lanternSurface" role="dialog" aria-modal="true" aria-labelledby="lanternCardDetailTitle">' +
      '<div class="lanternSurfaceContent">' +
      '<header class="lanternCardDetailHeader" role="presentation">' +
      '<button type="button" class="lanternCardDetailClose" aria-label="Close">✕</button>' +
      '</header>' +
      '<div class="lanternCardDetailStage">' +
      '<div class="lanternCardDetailVisual" id="lanternCardDetailVisual"></div>' +
      '<h2 class="lanternCardDetailTitle" id="lanternCardDetailTitle"></h2>' +
      '<div class="lanternCardDetailIdentityWrap" id="lanternCardDetailIdentityWrap"></div>' +
      '<div class="lanternCardDetailMeta" id="lanternCardDetailMeta"></div>' +
      '<div class="lanternCardDetailRecognizing" id="lanternCardDetailRecognizing" hidden></div>' +
      '<div class="lanternCardDetailBody" id="lanternCardDetailBody"></div>' +
      '<div class="lanternCardDetailReactions" id="lanternCardDetailReactions"></div>' +
      '<div class="lanternCardDetailAdminModeration" id="lanternCardDetailAdminModeration" aria-hidden="true"></div>' +
      '</div>' +
      '<footer class="lanternCardDetailFooter">' +
      '<div class="lanternCardDetailActions" id="lanternCardDetailActions"></div>' +
      '</footer>' +
      '</div></div>';
    global.document.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeDetail();
    });
    overlay.querySelector('.lanternCardDetailClose').addEventListener('click', closeDetail);
    wireGlobalEscape();
    return overlay;
  }

  function closeDetail() {
    closeMediaFullscreen();
    if (!overlay) return;
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.scrollTop = 0;
    unlockPageScrollForDetail();
    var modalClose = overlay.querySelector('.lanternCardDetailModal');
    if (modalClose) resetCanonicalOpenedModal(modalClose);
    var rx = global.document.getElementById('lanternCardDetailReactions');
    if (rx) rx.innerHTML = '';
    var ex = global.document.getElementById('lanternCardDetailProfileExtras');
    if (ex) ex.remove();
    var adm = overlay.querySelector('#lanternCardDetailAdminModeration');
    if (adm) {
      adm.innerHTML = '';
      adm.style.display = 'none';
      adm.setAttribute('aria-hidden', 'true');
    }
  }

  function exploreAdminDetailModLog(action, id, type, removable, endpoint, result) {
    try {
      global.console.log('EXPLORE ADMIN DETAIL MODERATION', {
        action: action,
        id: id,
        type: type,
        removable: removable,
        endpoint: endpoint || null,
        result: result,
      });
    } catch (e) {}
  }

  function isExploreAdminViewer() {
    return global.exploreViewerIsAdmin === true;
  }

  function showAdminExploreToast(msg, isErr) {
    var toast = global.document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.style.display = 'block';
    try {
      toast.style.borderColor = isErr ? 'rgba(255,77,109,.55)' : 'rgba(255,255,255,.12)';
    } catch (e) {}
    setTimeout(function () {
      toast.style.display = 'none';
    }, isErr ? 4500 : 2600);
  }

  function postExploreAdminHide(path, body) {
    var base =
      typeof global.LANTERN_AVATAR_API !== 'undefined' && global.LANTERN_AVATAR_API !== null
        ? String(global.LANTERN_AVATAR_API).replace(/\/$/, '')
        : null;
    if (!base) return Promise.resolve({ okHttp: false, body: { ok: false, error: 'no_api' } });
    return global
      .fetch(base + path, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
      })
      .then(function (r) {
        return r.text().then(function (text) {
          var j = {};
          try {
            j = text ? JSON.parse(text) : {};
          } catch (eParse) {
            return { okHttp: false, body: { ok: false, error: 'bad_response', detail: text ? String(text).slice(0, 240) : '' } };
          }
          if (global.LanternAuth && typeof global.LanternAuth.redirectIfPasswordChangeRequired === 'function') {
            if (global.LanternAuth.redirectIfPasswordChangeRequired(r, j)) return { blocked: true };
          }
          return { okHttp: r.ok, body: j };
        });
      })
      .catch(function (err) {
        return {
          okHttp: false,
          body: { ok: false, error: 'network', detail: err && err.message ? String(err.message) : '' },
        };
      });
  }

  function ensureAdminModerationNode(modalRoot) {
    if (!modalRoot) return null;
    var sc = modalRoot.querySelector('.lanternSurfaceContent');
    if (!sc) return null;
    var el = sc.querySelector('#lanternCardDetailAdminModeration');
    if (el) return el;
    el = global.document.createElement('div');
    el.id = 'lanternCardDetailAdminModeration';
    el.className = 'lanternCardDetailAdminModeration';
    el.setAttribute('aria-hidden', 'true');
    var act = sc.querySelector('.lanternCardDetailActions');
    if (act) sc.insertBefore(el, act);
    else sc.appendChild(el);
    return el;
  }

  function ensureAuthorActionsNode(modalRoot) {
    if (!modalRoot) return null;
    var sc = modalRoot.querySelector('.lanternSurfaceContent');
    if (!sc) return null;
    var el = sc.querySelector('#lanternCardDetailAuthorActions');
    if (el) return el;
    el = global.document.createElement('div');
    el.id = 'lanternCardDetailAuthorActions';
    el.className = 'lanternCardDetailAuthorActions';
    el.setAttribute('aria-hidden', 'true');
    var hdr = sc.querySelector('.lanternCardDetailHeader');
    if (hdr) hdr.appendChild(el);
    else {
      var adm = sc.querySelector('#lanternCardDetailAdminModeration');
      if (adm) sc.insertBefore(el, adm);
      else sc.appendChild(el);
    }
    return el;
  }

  function viewerOwnershipKeys() {
    var me = global.LANTERN_PILOT_ME && global.LANTERN_PILOT_ME.ok ? global.LANTERN_PILOT_ME : null;
    if (!me) return [];
    var out = [];
    var seen = {};
    function add(v) {
      var s = v != null ? String(v).trim().toLowerCase() : '';
      if (!s || seen[s]) return;
      seen[s] = true;
      out.push(s);
    }
    add(me.username);
    add(me.student_character_name);
    add(me.mtss_student_id);
    add(me.economy_character_name);
    add(me.display_name);
    add(me.first_name && me.last_name ? String(me.first_name).trim() + ' ' + String(me.last_name).trim() : '');
    var auth = global.LanternAuth;
    if (auth && typeof auth.sessionEconomyKey === 'function') add(auth.sessionEconomyKey(me));
    var u = String(me.username || '').trim();
    if (u) {
      add('staff:' + u);
      if (me.staff_id) add('staff_id:' + String(me.staff_id).trim());
    }
    return out;
  }

  function viewerOwnsAuthorFields(fields) {
    fields = fields || {};
    var keys = viewerOwnershipKeys();
    if (!keys.length) return false;
    var candidates = [
      fields.authorId,
      fields.author_id,
      fields.actor_id,
      fields.authorDisplayName,
      fields.author_display_name,
      fields.author_name,
      fields.author,
      fields.character_name,
      fields.authorAvatarKey,
      fields.author_avatar_key,
    ];
    for (var i = 0; i < candidates.length; i++) {
      var s = candidates[i] != null ? String(candidates[i]).trim().toLowerCase() : '';
      if (s && keys.indexOf(s) >= 0) return true;
    }
    return false;
  }

  function resolveAuthorRemoveTarget(itemOrType, maybeId) {
    if (itemOrType && typeof itemOrType === 'object') {
      var item = itemOrType;
      var id = String(item.id || item.newsId || item.pollId || '').trim();
      var type = String(item.type || item.itemType || '').trim().toLowerCase();
      if (item.contentSlot && item.contentSlot.pollId) id = String(item.contentSlot.pollId).trim();
      if (item.contentSlot && item.contentSlot.newsId) id = String(item.contentSlot.newsId).trim();
      if (id.indexOf('news:') === 0) return { item_type: 'news', item_id: id.slice(5) };
      if (id.indexOf('mission:') === 0) return { item_type: 'mission', item_id: id.slice(8) };
      if (id.indexOf('poll:') === 0) return { item_type: 'poll', item_id: id.slice(5) };
      if (type === 'poll') return { item_type: 'poll', item_id: id };
      if (type === 'mission') return { item_type: 'mission', item_id: id };
      if (type === 'game_score' || type === 'achievement' || type === 'leaderboard') {
        return { item_type: 'feed', item_id: id };
      }
      if (
        type === 'news' ||
        type === 'shout_out' ||
        type === 'photo' ||
        type === 'video' ||
        type === 'article' ||
        id.indexOf('news-') === 0
      ) {
        return { item_type: 'news', item_id: id.replace(/^news:/, '') };
      }
      return { item_type: 'feed', item_id: id };
    }
    return {
      item_type: String(itemOrType || '').trim().toLowerCase(),
      item_id: String(maybeId || '').trim(),
    };
  }

  function postAuthorContentRemove(target) {
    var apiBase = '';
    if (typeof global.LANTERN_AVATAR_API === 'string') apiBase = global.LANTERN_AVATAR_API;
    var url = (apiBase || '') + '/api/content/remove';
    return global
      .fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ item_type: target.item_type, item_id: target.item_id }),
      })
      .then(function (r) {
        return r.json().then(function (j) {
          if (global.LanternAuth && typeof global.LanternAuth.redirectIfPasswordChangeRequired === 'function') {
            if (global.LanternAuth.redirectIfPasswordChangeRequired(r, j)) return { blocked: true };
          }
          return { okHttp: r.ok, body: j };
        });
      })
      .catch(function (err) {
        return {
          okHttp: false,
          body: { ok: false, error: 'network', detail: err && err.message ? String(err.message) : '' },
        };
      });
  }

  /**
   * Prompt #226 — author overflow: Remove from Lantern (soft-hide).
   * spec: { show, target: {item_type,item_id}, pendingWithdraw?: {item_type,item_id} }
   */
  function fillAuthorActions(modalRoot, spec) {
    spec = spec || {};
    var node = ensureAuthorActionsNode(modalRoot);
    if (!node) return;
    node.innerHTML = '';
    if (!spec.show || !spec.target || !spec.target.item_id) {
      node.style.display = 'none';
      node.setAttribute('aria-hidden', 'true');
      return;
    }
    node.style.display = 'block';
    node.setAttribute('aria-hidden', 'false');

    var wrap = global.document.createElement('div');
    wrap.className = 'lanternAuthorOverflow';
    var toggle = global.document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'lanternAuthorOverflowToggle';
    toggle.setAttribute('aria-label', 'Post actions');
    toggle.setAttribute('aria-haspopup', 'true');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.textContent = '⋯';
    var menu = global.document.createElement('div');
    menu.className = 'lanternAuthorOverflowMenu';
    menu.hidden = true;
    var removeBtn = global.document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'lanternAuthorOverflowItem';
    removeBtn.textContent = 'Remove from Lantern';
    menu.appendChild(removeBtn);
    wrap.appendChild(toggle);
    wrap.appendChild(menu);
    node.appendChild(wrap);

    function closeMenu() {
      menu.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
    }
    toggle.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      var open = menu.hidden;
      menu.hidden = !open;
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    removeBtn.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      closeMenu();
      var confirmed = false;
      try {
        confirmed = global.confirm('Remove this post from Lantern?\n\nIt will no longer be visible to others.');
      } catch (e0) {
        confirmed = false;
      }
      if (!confirmed) return;
      removeBtn.disabled = true;
      toggle.disabled = true;
      postAuthorContentRemove(spec.target).then(function (res) {
        if (res && res.blocked) {
          removeBtn.disabled = false;
          toggle.disabled = false;
          return;
        }
        var body = res && res.body ? res.body : {};
        if (res && res.okHttp && body && body.ok) {
          showAdminExploreToast('Removed from Lantern', false);
          closeDetail();
          if (typeof global.refreshExploreExplore === 'function') global.refreshExploreExplore();
          try {
            if (global.document && typeof global.document.dispatchEvent === 'function') {
              global.document.dispatchEvent(new global.CustomEvent('lantern:content-removed', { detail: body }));
            }
          } catch (e1) {}
        } else {
          removeBtn.disabled = false;
          toggle.disabled = false;
          var errMsg = (body && body.error) ? String(body.error) : 'Could not remove';
          showAdminExploreToast('Remove failed: ' + errMsg, true);
        }
      });
    });
  }

  /**
   * spec: { removable, itemType, endpoint?, id?, body?, detail? }
   */
  function fillAdminModeration(modalRoot, spec) {
    spec = spec || {};
    var node = ensureAdminModerationNode(modalRoot);
    if (!node) return;
    if (!isExploreAdminViewer()) {
      node.innerHTML = '';
      node.style.display = 'none';
      node.setAttribute('aria-hidden', 'true');
      return;
    }
    var removable = !!spec.removable;
    var endpoint = spec.endpoint || '';
    var id = spec.id != null ? String(spec.id) : '';
    var itemType = spec.itemType || 'unknown';
    exploreAdminDetailModLog('open', id, itemType, removable, endpoint || null, null);
    node.style.display = 'block';
    node.setAttribute('aria-hidden', 'false');
    var inner = global.document.createElement('div');
    inner.className = 'lanternCardDetailAdminModerationInner';
    var hd = global.document.createElement('div');
    hd.className = 'lanternCardDetailAdminModerationHd';
    hd.textContent = 'Admin controls';
    inner.appendChild(hd);
    if (removable && endpoint) {
      var meta = global.document.createElement('p');
      meta.className = 'lanternCardDetailAdminModerationMeta';
      meta.textContent =
        'Remove this item from student-facing Lantern feeds. It stays in the database; use Admin → Feed visibility to restore if needed.';
      inner.appendChild(meta);
      var btn = global.document.createElement('button');
      btn.type = 'button';
      btn.className = 'lanternCardDetailAdminModerationBtn';
      btn.textContent = 'Remove from student view';
      var path = endpoint;
      var postBody = spec.body;
      var typeStr = itemType;
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        btn.disabled = true;
        try {
          global.console.log('EXPLORE ADMIN DETAIL MODERATION', {
            phase: 'before_fetch',
            action: 'hide',
            endpoint: path,
            id: id,
            type: typeStr,
            removable: true,
          });
        } catch (e0) {}
        postExploreAdminHide(path, postBody).then(function (res) {
          try {
            global.console.log('EXPLORE ADMIN DETAIL MODERATION', {
              phase: 'after_fetch',
              action: 'hide',
              endpoint: path,
              id: id,
              type: typeStr,
              result: res,
            });
          } catch (e1) {}
          if (res && res.blocked) {
            exploreAdminDetailModLog('hide', id, typeStr, true, path, { blocked: true });
            showAdminExploreToast('Sign-in update required (e.g. change password). Cannot remove until resolved.', true);
            btn.disabled = false;
            return;
          }
          var body = res && res.body ? res.body : {};
          exploreAdminDetailModLog('hide', id, typeStr, true, path, body);
          if (res && res.okHttp && body && body.ok) {
            showAdminExploreToast('Removed from student view', false);
            closeDetail();
            if (typeof global.refreshExploreExplore === 'function') global.refreshExploreExplore();
            try {
              global.console.log('EXPLORE ADMIN DETAIL MODERATION', {
                phase: 'after_refresh_trigger',
                id: id,
                type: typeStr,
              });
            } catch (e2) {}
          } else {
            btn.disabled = false;
            var errMsg = (body && body.error) ? String(body.error) : res && !res.okHttp ? 'HTTP error' : 'Could not remove item';
            showAdminExploreToast('Remove failed: ' + errMsg, true);
            try {
              global.alert('Remove failed: ' + errMsg);
            } catch (e3) {}
          }
        }).catch(function (err) {
          exploreAdminDetailModLog('hide', id, typeStr, true, path, { error: 'network', detail: err });
          btn.disabled = false;
          showAdminExploreToast('Remove failed: network or unexpected error.', true);
        });
      });
      inner.appendChild(btn);
    } else {
      var warn = global.document.createElement('p');
      warn.className = 'lanternCardDetailAdminModerationWarn';
      warn.textContent = 'This item type is not removable yet.';
      inner.appendChild(warn);
      if (spec.detail) {
        var det = global.document.createElement('p');
        det.className = 'lanternCardDetailAdminModerationMeta';
        det.textContent = String(spec.detail);
        inner.appendChild(det);
      }
    }
    node.innerHTML = '';
    node.appendChild(inner);
  }

  /**
   * Same DOM + behavior as Explore → openCreation overlay; modalRoot is .lanternCardDetailModal.
   */
  function fillCreationDetailModal(modalRoot, p, opts) {
    opts = opts || {};
    var LC = global.LanternCards;
    if (!LC || !modalRoot) return;
    p = p || {};
    var charName = String(opts.characterName || '').trim();
    var v = modalRoot.querySelector('.lanternCardDetailVisual');
    var t = modalRoot.querySelector('.lanternCardDetailTitle');
    var m = modalRoot.querySelector('.lanternCardDetailMeta');
    var b = modalRoot.querySelector('.lanternCardDetailBody');
    var a = modalRoot.querySelector('.lanternCardDetailActions');
    var r = modalRoot.querySelector('.lanternCardDetailReactions');
    if (!v || !t || !m || !b || !a || !r) return;
    var admClearC = modalRoot.querySelector('#lanternCardDetailAdminModeration');
    if (admClearC) {
      admClearC.innerHTML = '';
      admClearC.style.display = 'none';
    }
    t.textContent = p.title || 'Untitled';
    var time = '';
    try {
      var dt = new Date(p.created_at || '');
      if (!isNaN(dt.getTime())) time = dt.toLocaleDateString();
    } catch (e2) {}
    var metaWho = String(p.display_name || p.author_name || '').trim();
    var idwC = modalRoot.querySelector('.lanternCardDetailIdentityWrap');
    paintCanonicalPersonIdentity(idwC, p, { size: 'md' });
    if (idwC && idwC.innerHTML) {
      m.textContent = time;
    } else {
      m.textContent = [metaWho, time].filter(Boolean).join(' · ');
    }
    var cap = String(p.caption || '').trim();
    b.innerHTML = cap ? '<div class="lanternCardDetailCaption">' + esc(cap).replace(/\n/g, '<br>') + '</div>' : '';
    if (opts.profilePostExtras) {
      if (p.returned && String(p.returned_reason || '').trim()) {
        b.innerHTML += '<div class="lanternCardDetailCaption" style="color:var(--warn);margin-top:12px;"><strong>Teacher feedback:</strong> ' + esc(String(p.returned_reason).trim()).replace(/\n/g, '<br>') + '</div>';
      }
      var tp = p.curation && String(p.curation.teacher_praise || '').trim();
      if (tp) {
        b.innerHTML += '<div class="lanternCardDetailCaption" style="margin-top:12px;"><strong>Teacher praise</strong><br>' + esc(tp).replace(/\n/g, '<br>') + '</div>';
      }
    }
    var type = p.type || 'link';
    var visualUrl = LC.getCardImageUrl ? LC.getCardImageUrl(p) : '';
    var typeFb = LC.getTypeFallbackMediaDataUri ? LC.getTypeFallbackMediaDataUri(type) : '';
    var uniFb = LC.getUniversalFallbackMediaDataUri ? LC.getUniversalFallbackMediaDataUri() : '';
    var vidSrc = String(p.video_url || '').trim() || (type === 'video' ? String(p.url || '').trim() : '');
    var hasMedia = (p.image_url && String(p.image_url).trim()) || !!vidSrc || (p.link_url && String(p.link_url).trim()) || (type === 'image' && String(p.url || '').trim());
    var imgSrc = String(p.image_url || '').trim() || (type === 'image' ? String(p.url || '').trim() : '');
    if (hasMedia && global.LanternMedia && global.LanternMedia.renderMedia) {
      var mediaC = global.LanternMedia.renderMedia({ image_url: imgSrc, video_url: vidSrc, link_url: p.link_url }, { esc: esc, variant: 'detail', exploreTypeFallback: typeFb, exploreUniversalFallback: uniFb });
      v.innerHTML = (mediaC && mediaC.mediaBlock) ? '<div class="lanternCardDetailVisualInner">' + mediaC.mediaBlock + '</div>' : '<div class="lanternCardDetailVisualInner">' + (LC.buildGuaranteedExploreImageHtml ? LC.buildGuaranteedExploreImageHtml(type, visualUrl) : '') + '</div>';
    } else {
      v.innerHTML = '<div class="lanternCardDetailVisualInner">' + (LC.buildGuaranteedExploreImageHtml ? LC.buildGuaranteedExploreImageHtml(type, visualUrl) : '') + '</div>';
    }
    wireOpenedPostMediaInteractions(modalRoot);
    a.innerHTML = '';
    var url = String(p.url || '').trim();
    if (url && /^https?:\/\//i.test(url)) {
      var link = global.document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.className = 'btn good';
      link.textContent = 'Open link →';
      a.appendChild(link);
    }
    r.innerHTML = '';
    var postId = String(p.id || '').trim();
    var embeddedPreview = !!(opts && opts.embeddedPreview);
    var previewId = embeddedPreview && (!postId || postId.indexOf('preview') === 0);
    var createRun = global.LANTERN_API && global.LANTERN_API.createRun ? global.LANTERN_API.createRun() : null;
    if (previewId) {
      r.innerHTML = '<p class="lanternCardDetailMuted">Preview — reactions appear after your post is published.</p>';
    } else if (createRun && postId && charName && postId.indexOf('mission_') !== 0) {
      function callToggle(pid, name, typ) {
        return new Promise(function (resolve) {
          createRun.withSuccessHandler(resolve).withFailureHandler(function () { resolve({ ok: false }); }).togglePostReaction({ post_id: pid, character_name: name, reaction_type: typ });
        });
      }
      function callGetRx(pid, name) {
        return new Promise(function (resolve) {
          createRun.withSuccessHandler(resolve).withFailureHandler(function () { resolve({ ok: false, reactions: {} }); }).getReactionsForPosts({ post_ids: [pid], character_name: name });
        });
      }
      var row = global.document.createElement('div');
      row.className = 'lanternCardDetailPostRx';
      row.innerHTML = '<span class="lanternCardDetailRxLabel">Your reaction</span>' +
        '<button type="button" class="lanternCardDetailRxBtn" data-rx="like" title="Like">❤️</button>' +
        '<button type="button" class="lanternCardDetailRxBtn" data-rx="favorite" title="Favorite">⭐</button>' +
        '<button type="button" class="lanternCardDetailRxBtn" data-rx="fire" title="Fire">🔥</button>';
      r.appendChild(row);
      callGetRx(postId, charName).then(function (res) {
        var map = (res && res.reactions && res.reactions[postId]) || {};
        ['like', 'favorite', 'fire'].forEach(function (typ) {
          var btn = row.querySelector('[data-rx="' + typ + '"]');
          if (btn && map[typ]) btn.classList.add('is-on');
        });
      });
      row.querySelectorAll('.lanternCardDetailRxBtn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var typ = btn.getAttribute('data-rx');
          var wasOn = btn.classList.contains('is-on');
          btn.classList.toggle('is-on', !wasOn);
          callToggle(postId, charName, typ).then(function (res) {
            if (!res || !res.ok) btn.classList.toggle('is-on', wasOn);
            else btn.classList.toggle('is-on', !!res.active);
          });
        });
      });
    } else if (postId && postId.indexOf('mission_') !== 0) {
      r.innerHTML = '<p class="lanternCardDetailMuted">Adopt a character in Locker (Overview) to react to posts.</p>';
    }
    if (previewId) {
      fillAdminModeration(modalRoot, {
        removable: false,
        itemType: 'feed_post_preview',
        id: postId,
        detail: 'Preview / draft — not a live feed item.',
      });
    } else if (postId && postId.indexOf('mission_') === 0) {
      var subId = postId.replace(/^mission_/, '');
      fillAdminModeration(modalRoot, {
        removable: true,
        itemType: 'mission_submission',
        endpoint: '/api/missions/submissions/hide',
        id: subId,
        body: { id: subId },
      });
    } else if (postId) {
      fillAdminModeration(modalRoot, {
        removable: false,
        itemType: 'studio_feed_post',
        id: postId,
        detail: 'Design Studio / local approved post (getExploreFeed). No worker hide route for this type yet.',
      });
    } else {
      fillAdminModeration(modalRoot, {
        removable: false,
        itemType: 'feed_post',
        id: '',
        detail: 'No post id — cannot target hide API.',
      });
    }
    var ownsCreation = !previewId && viewerOwnsAuthorFields({
      author_name: p.author_name || p.authorDisplayName || p.display_name || p.author,
      character_name: p.character_name,
      authorId: p.authorId || p.author_id,
      authorAvatarKey: p.authorAvatarKey,
    });
    var creationTarget = null;
    if (ownsCreation && postId && postId.indexOf('mission_') === 0) {
      creationTarget = { item_type: 'mission', item_id: postId.replace(/^mission_/, '') };
    } else if (ownsCreation && postId) {
      creationTarget = resolveAuthorRemoveTarget(p);
    }
    fillAuthorActions(modalRoot, {
      show: !!(ownsCreation && creationTarget && creationTarget.item_id),
      target: creationTarget,
    });
    var oldEx = modalRoot.querySelector('.lanternCardDetailProfileExtras');
    if (oldEx) oldEx.remove();
    if (opts.profilePostExtras && typeof opts.profilePostExtras.mount === 'function') {
      var wrap = global.document.createElement('div');
      wrap.className = 'lanternCardDetailProfileExtras';
      wrap.style.marginTop = '18px';
      wrap.style.paddingTop = '14px';
      wrap.style.borderTop = '1px solid rgba(255,255,255,.1)';
      modalRoot.appendChild(wrap);
      opts.profilePostExtras.mount(wrap, p);
    }
    prepareCanonicalOpenedModal(modalRoot, { kind: 'creation', item: p });
  }

  function openCreation(p, opts) {
    opts = opts || {};
    if (!global.LanternCards) return;
    var el = ensureOverlay();
    var modal = el.querySelector('.lanternCardDetailModal');
    if (!modal) return;
    fillCreationDetailModal(modal, p, opts);
    showDetailOverlay(el);
  }

  /** Same strings as explore.html getAuthorLabel — meta line must match production news items. */
  function newsRoleLabelFromAuthorType(authorType) {
    var t = String(authorType || 'student').trim();
    if (t === 'teacher') return 'Teacher Contributor';
    if (t === 'staff') return 'Staff Announcement';
    if (t === 'admin') return 'Admin Update';
    return 'Student Reporter';
  }

  /**
   * Same DOM + behavior as Explore → openNews overlay; modalRoot is .lanternCardDetailModal.
   * Meta uses n.author_name, n.author_type, n.approved_at || n.created_at only (same as Explore cards).
   */
  function fillNewsDetailModal(modalRoot, n, opts) {
    opts = opts || {};
    if (!modalRoot) return;
    n = n || {};
    var LC = global.LanternCards;
    var v = modalRoot.querySelector('.lanternCardDetailVisual');
    var t = modalRoot.querySelector('.lanternCardDetailTitle');
    var idw = modalRoot.querySelector('.lanternCardDetailIdentityWrap');
    var m = modalRoot.querySelector('.lanternCardDetailMeta');
    var b = modalRoot.querySelector('.lanternCardDetailBody');
    var a = modalRoot.querySelector('.lanternCardDetailActions');
    var r = modalRoot.querySelector('.lanternCardDetailReactions');
    if (!v || !t || !m || !b || !a || !r) return;
    var admClearN = modalRoot.querySelector('#lanternCardDetailAdminModeration');
    if (admClearN) {
      admClearN.innerHTML = '';
      admClearN.style.display = 'none';
    }
    t.textContent = n.title || 'Untitled';
    var time = '';
    try {
      var dt = new Date(n.approved_at || n.created_at || '');
      if (!isNaN(dt.getTime())) time = dt.toLocaleDateString();
    } catch (e3) {}
    paintCanonicalPersonIdentity(idw, n, { size: 'md' });
    var roleLabel = newsRoleLabelFromAuthorType(n.author_type);
    var cat = String(n.category || '').trim();
    var isShout = /shout/i.test(cat) || /shout/i.test(String(n.type || n.content_type || '')) ||
      /Recognizing:\s*/i.test(String(n.body || '')) || /^Shout[\s-]?out\b/i.test(String(n.title || ''));
    if (isShout) {
      var shoutLabel = (LC && LC.SHOUT_OUT_DISPLAY_NAME) || 'Shout-Out!';
      m.textContent = [shoutLabel, time].filter(Boolean).join(' · ');
    } else {
      m.textContent = [roleLabel, cat, time].filter(Boolean).join(' · ');
    }
    var body = String(n.body || '').trim();
    b.innerHTML = body ? '<div class="lanternCardDetailCaption">' + esc(body).replace(/\n/g, '<br>') + '</div>' : '';
    var itemId = String(n.id || '').trim();
    var embeddedPreview = !!(opts && opts.embeddedPreview);
    var previewDraft = embeddedPreview && (!itemId || itemId.indexOf('preview') === 0);
    a.innerHTML = '';
    var rep = global.document.createElement('button');
    rep.type = 'button';
    rep.className = 'lanternReportDetailBtn';
    rep.textContent = 'Report';
    rep.setAttribute('aria-label', itemId ? 'Report this news' : 'Report unavailable');
    if (!itemId) rep.disabled = true;
    rep.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (!itemId) return;
      openReportModal({ reportType: 'news', reportId: itemId });
    });
    a.appendChild(rep);
    if (global.LanternMedia && global.LanternMedia.renderMedia) {
      var dm = global.LanternMedia.renderMedia(n, { esc: esc, variant: 'detail' });
      if (dm && dm.mediaBlock && String(dm.mediaBlock).trim()) {
        v.innerHTML = '<div class="lanternCardDetailVisualInner">' + dm.mediaBlock + '</div>';
      } else if (global.LanternCards && global.LanternCards.buildNewsCardVisualBlockFromItem) {
        v.innerHTML = '<div class="lanternCardDetailVisualInner">' + global.LanternCards.buildNewsCardVisualBlockFromItem(n, esc).replace('exploreCardVisual', 'exploreCardVisual lanternCardDetailNewsVisual') + '</div>';
      } else v.innerHTML = '';
    } else if (global.LanternCards && global.LanternCards.buildNewsCardVisualBlockFromItem) {
      v.innerHTML = '<div class="lanternCardDetailVisualInner">' + global.LanternCards.buildNewsCardVisualBlockFromItem(n, esc).replace('exploreCardVisual', 'exploreCardVisual lanternCardDetailNewsVisual') + '</div>';
    } else v.innerHTML = '';
    wireOpenedPostMediaInteractions(modalRoot);
    r.innerHTML = '<div class="lanternCardDetailRxNewsWrap"></div>';
    var wrap = r.querySelector('.lanternCardDetailRxNewsWrap');
    var characterName = opts.characterName || '';
    var authorName = String(n.author_name || '').trim();
    function mountNewsRx(preferredTypes) {
      if (!global.LANTERN_REACTIONS || !global.LANTERN_REACTIONS.getApiBase || !global.LANTERN_REACTIONS.getApiBase() || !itemId || !wrap) return;
      var rxDisplayMode = embeddedPreview ? 'types_only' : 'percentages';
      if (rxDisplayMode === 'types_only') {
        wrap.innerHTML = '';
        global.LANTERN_REACTIONS.renderReactionBar({
          container: wrap,
          item_type: 'news',
          item_id: itemId,
          counts: {},
          my_reactions: [],
          character_name: '',
          preferred_types: preferredTypes,
          display_mode: 'types_only',
          contribute_hint: true,
          on_react: function () {}
        });
        return;
      }
      global.LANTERN_REACTIONS.getCounts('news', [itemId]).then(function (countRes) {
        var counts = (countRes && countRes.ok && countRes.counts) ? countRes.counts : {};
        return global.LANTERN_REACTIONS.getMine('news', [itemId], characterName).then(function (mineRes) {
          var mine = (mineRes && mineRes.ok && mineRes.mine) ? mineRes.mine : {};
          wrap.innerHTML = '';
          global.LANTERN_REACTIONS.renderReactionBar({
            container: wrap,
            item_type: 'news',
            item_id: itemId,
            counts: counts,
            my_reactions: mine[itemId] || [],
            character_name: characterName,
            preferred_types: preferredTypes,
            display_mode: 'percentages',
            on_react: function (reactionType, emoji, btn) {
              if (btn.disabled) return;
              global.LANTERN_REACTIONS.playCelebration(btn, emoji);
              btn.classList.add('is-mine');
              btn.disabled = true;
              global.LANTERN_REACTIONS.addReaction('news', itemId, reactionType, characterName).then(function (res) {
                if (!res || !res.ok) {
                  btn.disabled = false;
                  btn.classList.remove('is-mine');
                  mountNewsRx(preferredTypes);
                } else {
                  if (res.early_encourager_reward && res.early_encourager_reward.nuggets) {
                    var toast = global.document.getElementById('toast');
                    if (toast) {
                      toast.textContent = '+1 nugget — early encouragement!';
                      toast.style.display = 'block';
                      setTimeout(function () { toast.style.display = 'none'; }, 2800);
                    }
                  }
                  mountNewsRx(preferredTypes);
                }
              });
            }
          });
        });
      });
    }
    /* Prompt #149 — paintCanonicalPersonIdentity already fetches canonical avatar when missing. */
    if (previewDraft && wrap) {
      wrap.innerHTML = '<p class="lanternCardDetailMuted">Preview — praise and reactions appear after teacher approval.</p>';
    } else if (global.LANTERN_REACTIONS && global.LANTERN_REACTIONS.getApiBase && global.LANTERN_REACTIONS.getApiBase() && itemId && wrap) {
      if (authorName && global.LANTERN_REACTIONS.getPraisePreferences) {
        global.LANTERN_REACTIONS.getPraisePreferences(authorName).then(function (pr) {
          var pt = (pr && pr.ok && pr.reaction_types && pr.reaction_types.length) ? pr.reaction_types : null;
          mountNewsRx(pt);
        });
      } else {
        mountNewsRx(opts.preferredTypes || null);
      }
    } else if (wrap) {
      wrap.innerHTML = '<p class="lanternCardDetailMuted">Sign in with a character to react to news.</p>';
    }
    var newsRemovable = !!(itemId && !previewDraft && String(itemId).indexOf('preview') !== 0);
    if (newsRemovable) {
      fillAdminModeration(modalRoot, {
        removable: true,
        itemType: 'approved_news',
        endpoint: '/api/news/hide',
        id: itemId,
        body: { id: itemId },
      });
    } else {
      fillAdminModeration(modalRoot, {
        removable: false,
        itemType: 'approved_news',
        id: itemId,
        detail: !itemId
          ? 'No news id on this card.'
          : previewDraft
            ? 'Preview / draft — not published to the API yet.'
            : 'Not removable in this context.',
      });
    }
    var ownsNews = !previewDraft && viewerOwnsAuthorFields({
      author_name: n.author_name || n.authorDisplayName || n.author,
      actor_id: n.actor_id || n.authorId || n.author_id,
      authorAvatarKey: n.authorAvatarKey || n.author_avatar_key,
      character_name: n.character_name,
    });
    fillAuthorActions(modalRoot, {
      show: !!(ownsNews && newsRemovable),
      target: ownsNews && newsRemovable ? { item_type: 'news', item_id: String(itemId).replace(/^news:/, '') } : null,
    });
    prepareCanonicalOpenedModal(modalRoot, { kind: 'news', item: n });
  }

  function openNews(n, opts) {
    opts = opts || {};
    var el = ensureOverlay();
    var modal = el.querySelector('.lanternCardDetailModal');
    if (!modal) return;
    fillNewsDetailModal(modal, n, opts);
    showDetailOverlay(el);
  }

  /** Contribute / embedded: same opened-news DOM as Explore modal, without overlay shell. */
  function mountNewsDetailInto(container, n, opts) {
    if (!container) return;
    container.innerHTML = '';
    var modal = global.document.createElement('div');
    modal.className = 'lanternCardDetailModal lanternCardDetailModal--embedded lanternSurface';
    modal.setAttribute('role', 'region');
    modal.setAttribute('aria-label', 'When opened');
    modal.innerHTML =
      '<div class="lanternSurfaceContent">' +
      '<div class="lanternCardDetailVisual"></div>' +
      '<h2 class="lanternCardDetailTitle"></h2>' +
      '<div class="lanternCardDetailIdentityWrap"></div>' +
      '<div class="lanternCardDetailMeta"></div>' +
      '<div class="lanternCardDetailBody"></div>' +
      '<div class="lanternCardDetailAdminModeration" id="lanternCardDetailAdminModeration" aria-hidden="true"></div>' +
      '<div class="lanternCardDetailActions"></div>' +
      '<div class="lanternCardDetailReactions"></div>' +
      '</div>';
    container.appendChild(modal);
    fillNewsDetailModal(modal, n, Object.assign({ embeddedPreview: true }, opts || {}));
  }

  /** Contribute / embedded: same opened-creation DOM as Explore modal. */
  function mountCreationDetailInto(container, p, opts) {
    if (!container) return;
    container.innerHTML = '';
    var modal = global.document.createElement('div');
    modal.className = 'lanternCardDetailModal lanternCardDetailModal--embedded lanternSurface';
    modal.setAttribute('role', 'region');
    modal.setAttribute('aria-label', 'When opened');
    modal.innerHTML =
      '<div class="lanternSurfaceContent">' +
      '<div class="lanternCardDetailVisual"></div>' +
      '<h2 class="lanternCardDetailTitle"></h2>' +
      '<div class="lanternCardDetailIdentityWrap"></div>' +
      '<div class="lanternCardDetailMeta"></div>' +
      '<div class="lanternCardDetailBody"></div>' +
      '<div class="lanternCardDetailAdminModeration" id="lanternCardDetailAdminModeration" aria-hidden="true"></div>' +
      '<div class="lanternCardDetailActions"></div>' +
      '<div class="lanternCardDetailReactions"></div>' +
      '</div>';
    container.appendChild(modal);
    fillCreationDetailModal(modal, p, Object.assign({ embeddedPreview: true }, opts || {}));
  }

  /** Contribute poll preview only (static .pollModal). Explore uses openPoll + fillPollDetailModal. */
  function mountPollOpenedInto(container, poll, escFn) {
    if (!container) return;
    var e = escFn || esc;
    var LC = global.LanternCards;
    var p = poll || {};
    var fk = String(p.fallback_key || 'poll').trim();
    var typeForDefault = fk === 'news' ? 'news' : fk === 'creation' ? 'creation' : fk === 'generic' ? 'creation' : fk === 'shoutout' ? 'shoutout' : fk === 'explain' ? 'explain' : 'poll';
    var imgUrl = String(p.image_url || '').trim();
    if (!imgUrl && LC && LC.getDefaultImageUrl) imgUrl = LC.getDefaultImageUrl(typeForDefault);
    var q = e(p.question || '');
    var choices = p.choices || [];
    var html = '<div class="pollModal lanternSurface"><div class="lanternSurfaceContent">';
    html += '<div class="pollModalImageWrap" style="' + (imgUrl ? '' : 'display:none;') + '"><img class="pollModalImage" src="' + e(imgUrl) + '" alt="" /></div>';
    html += '<div class="pollModalQuestion">' + q + '</div><div class="pollModalChoices">';
    for (var i = 0; i < choices.length; i++) {
      html += '<button type="button" class="pollChoiceBtn" disabled tabindex="-1">' + e(choices[i]) + '</button>';
    }
    html += '</div>';
    html += '<p class="lanternCardDetailMuted" style="margin-top:16px;">Preview — votes and nuggets work on Lantern after approval.</p></div></div>';
    container.innerHTML = html;
  }

  /** Shared production detail modal shell (overlay + Studio embedded preview). */
  function buildProductionDetailModalShell(opts) {
    opts = opts || {};
    var modal = global.document.createElement('div');
    var cls = 'lanternCardDetailModal lanternSurface lanternCardDetailModal--embedded';
    if (opts.studioPreview) cls += ' lanternCardDetailModal--studioPreview';
    modal.className = cls;
    modal.setAttribute('role', opts.studioPreview ? 'region' : 'dialog');
    modal.setAttribute('aria-label', 'When opened');
    modal.innerHTML =
      '<div class="lanternSurfaceContent">' +
      '<header class="lanternCardDetailHeader" role="presentation">' +
      '<button type="button" class="lanternCardDetailClose" aria-label="Close preview">✕</button>' +
      '</header>' +
      '<div class="lanternCardDetailVisual"></div>' +
      '<h2 class="lanternCardDetailTitle"></h2>' +
      '<div class="lanternCardDetailIdentityWrap"></div>' +
      '<div class="lanternCardDetailMeta"></div>' +
      '<div class="lanternCardDetailBody"></div>' +
      '<div class="lanternCardDetailAdminModeration" id="lanternCardDetailAdminModeration" aria-hidden="true"></div>' +
      '<div class="lanternCardDetailActions"></div>' +
      '<div class="lanternCardDetailReactions"></div>' +
      '</div>';
    return modal;
  }

  function wireStudioPreviewClose(modal) {
    if (!modal) return;
    var closeBtn = modal.querySelector('.lanternCardDetailClose');
    if (closeBtn) {
      closeBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
      });
    }
  }

  function inferStudioFeedTypeFromDraft(draft) {
    if (draft.videoUrl || draft.video_url) return 'video';
    if (draft.imageUrl || draft.image_url || draft.thumbnailUrl) return 'photo';
    if (draft.linkUrl || draft.link_url) return 'link';
    return draft.type || 'article';
  }

  function studioNewsDraftToFeedItem(n, opts) {
    opts = opts || {};
    n = n || {};
    var LC = global.LanternCards;
    var TB = LC && LC.TYPE_BADGES ? LC.TYPE_BADGES : {};
    var ct = String(opts.contributeType || '').trim();
    var cat = String((n.category || '').trim());
    var typeLabel = cat || (ct === 'shoutout' ? (LC && LC.SHOUT_OUT_DISPLAY_NAME) || (TB.shoutout || 'Shout-Out!') : (TB.news || 'News'));
    var media = LC && LC.normalizeNewsMediaItemForExplore ? LC.normalizeNewsMediaItemForExplore(n) : n;
    var iso = n.approved_at || n.created_at || new Date().toISOString();
    var feedType = ct === 'shoutout' || String(n.type || '').toLowerCase() === 'shout_out' ? 'shout_out' : inferStudioFeedTypeFromDraft({
      type: 'news',
      imageUrl: media.image_url,
      videoUrl: media.video_url,
      linkUrl: media.link_url
    });
    var avatarKey = String(n.author_avatar_key || n.authorAvatarKey || n.character_name || n.actor_id || '').trim();
    if (global.LanternAvatar && typeof global.LanternAvatar.normalizeAvatarAccountKey === 'function') {
      avatarKey = global.LanternAvatar.normalizeAvatarAccountKey(avatarKey);
    }
    var publicLabel = String(n.author_public_label || n.authorPublicLabel || '').trim();
    var displayName = String(n.author_name || publicLabel || '').trim();
    return {
      id: String(n.id || 'preview-draft'),
      type: feedType,
      typeLabel: typeLabel,
      title: n.title || (ct === 'shoutout' ? ((LC && LC.SHOUT_OUT_DISPLAY_NAME) || 'Shout-Out!') : 'Untitled'),
      body: n.body || '',
      summary: n.body || '',
      authorDisplayName: displayName,
      authorPublicLabel: publicLabel || displayName,
      authorRole: n.author_type || 'student',
      authorAvatarKey: avatarKey,
      authorId: avatarKey || null,
      character_name: avatarKey,
      _canonicalAvatar: n._canonicalAvatar,
      createdAt: iso,
      approvedAt: iso,
      imageUrl: media.image_url || '',
      thumbnailUrl: media.image_url || '',
      videoUrl: media.video_url || '',
      contentSlot: {
        linkUrl: media.link_url || '',
        photoCredit: n.photo_credit || '',
        recipient: (function () {
          if (ct !== 'shoutout' && feedType !== 'shout_out') return '';
          var m = String(n.body || '').match(/Recognizing:\s*([^\n\r]+)/i);
          return m && m[1] ? String(m[1]).trim() : '';
        })()
      }
    };
  }

  function studioCreationDraftToFeedItem(p, opts) {
    opts = opts || {};
    p = p || {};
    var LC = global.LanternCards;
    var TB = LC && LC.TYPE_BADGES ? LC.TYPE_BADGES : {};
    var parts = LC && LC.buildFeedPostParts ? LC.buildFeedPostParts(p, opts) : { model: {} };
    var model = parts.model || {};
    var type = p.type || 'create';
    var iso = p.created_at || new Date().toISOString();
    var avatarKey = String(p.author_avatar_key || p.authorAvatarKey || p.character_name || p.actor_id || '').trim();
    if (global.LanternAvatar && typeof global.LanternAvatar.normalizeAvatarAccountKey === 'function') {
      avatarKey = global.LanternAvatar.normalizeAvatarAccountKey(avatarKey);
    }
    var displayName = String(p.display_name || p.author_name || p.author_public_label || '').trim();
    return {
      id: String(p.id || 'preview-draft'),
      type: inferStudioFeedTypeFromDraft({
        type: type,
        imageUrl: p.image_url,
        videoUrl: p.video_url,
        linkUrl: p.link_url || p.url
      }),
      typeLabel: model.typeBadge || TB[type] || TB.create || 'Post',
      title: model.title || p.title || 'Untitled',
      body: p.caption || '',
      summary: p.caption || '',
      authorDisplayName: displayName,
      authorPublicLabel: String(p.author_public_label || p.authorPublicLabel || displayName).trim(),
      authorRole: p.author_type || 'student',
      authorAvatarKey: avatarKey,
      authorId: avatarKey || null,
      character_name: avatarKey,
      _canonicalAvatar: p._canonicalAvatar,
      createdAt: iso,
      approvedAt: iso,
      imageUrl: p.image_url || '',
      thumbnailUrl: p.image_url || '',
      videoUrl: p.video_url || '',
      contentSlot: { linkUrl: p.link_url || p.url || '' }
    };
  }

  function wrapStudioPreviewForScale(modal) {
    var SPS = global.LANTERN_STUDIO_OPENED_PREVIEW_SCALE;
    if (SPS && typeof SPS.wrapModal === 'function') return SPS.wrapModal(modal);
    var scaleHost = global.document.createElement('div');
    scaleHost.className = 'studioOpenedPreviewScaleHost';
    var stage = global.document.createElement('div');
    stage.className = 'studioOpenedPreviewScaleStage';
    if (modal) stage.appendChild(modal);
    scaleHost.appendChild(stage);
    return scaleHost;
  }

  function scheduleStudioPreviewScale(container) {
    var SPS = global.LANTERN_STUDIO_OPENED_PREVIEW_SCALE;
    if (SPS && typeof SPS.scheduleAttach === 'function') SPS.scheduleAttach(container);
  }

  /**
   * Shared production detail renderer — Explore/Locker overlay + Studio RIGHT preview.
   */
  function renderFeedItemDetailInto(container, item, opts) {
    opts = opts || {};
    if (!container || !item) return null;
    var isStudio = opts.mode === 'studio-preview';
    container.innerHTML = '';
    var modal = buildProductionDetailModalShell({ studioPreview: isStudio });
    if (isStudio) {
      container.appendChild(wrapStudioPreviewForScale(modal));
    } else {
      container.appendChild(modal);
    }
    if (isStudio) wireStudioPreviewClose(modal);
    fillFeedItemDetailModal(modal, item, opts);
    if (isStudio) scheduleStudioPreviewScale(container);
    return modal;
  }

  function renderPollDraftDetailInto(container, poll, escFn) {
    if (!container) return;
    var e = escFn || esc;
    poll = poll || {};
    container.innerHTML = '';
    var modal = buildProductionDetailModalShell({ studioPreview: true });
    container.appendChild(wrapStudioPreviewForScale(modal));
    wireStudioPreviewClose(modal);
    var v = modal.querySelector('.lanternCardDetailVisual');
    var t = modal.querySelector('.lanternCardDetailTitle');
    var idw = modal.querySelector('.lanternCardDetailIdentityWrap');
    var m = modal.querySelector('.lanternCardDetailMeta');
    var b = modal.querySelector('.lanternCardDetailBody');
    var a = modal.querySelector('.lanternCardDetailActions');
    var r = modal.querySelector('.lanternCardDetailReactions');
    if (t) t.textContent = poll.question || 'Poll';
    paintCanonicalPersonIdentity(idw, {
      authorAvatarKey: poll.author_avatar_key || poll.authorAvatarKey || poll.character_name,
      author_avatar_key: poll.author_avatar_key || poll.authorAvatarKey,
      character_name: poll.character_name,
      author_name: poll.author_name || poll.display_name,
      authorPublicLabel: poll.author_public_label || poll.authorPublicLabel,
      author_type: poll.author_type,
      _canonicalAvatar: poll._canonicalAvatar
    }, { size: 'md' });
    if (m) {
      var nch = (poll.choices || []).length;
      m.textContent = ['Poll', nch ? (nch + ' choices') : ''].filter(Boolean).join(' · ');
    }
    if (v && global.LanternMedia && global.LanternMedia.renderMedia && poll.image_url) {
      var dm = global.LanternMedia.renderMedia({ image_url: poll.image_url, type: 'poll' }, { esc: e, variant: 'detail' });
      if (dm && dm.mediaBlock) v.innerHTML = '<div class="lanternCardDetailVisualInner">' + dm.mediaBlock + '</div>';
    }
    if (b) {
      var rows = (poll.choices || []).map(function (c) {
        return '<button type="button" class="pollChoiceBtn" disabled tabindex="-1">' + e(c) + '</button>';
      }).join('');
      b.innerHTML = rows ? '<div class="pollModalChoices">' + rows + '</div>' : '';
    }
    if (a) a.innerHTML = '';
    if (r) r.innerHTML = '';
    scheduleStudioPreviewScale(container);
  }

  function mountStudioNewsOpenedInto(container, n, opts) {
    renderFeedItemDetailInto(container, studioNewsDraftToFeedItem(n, opts), Object.assign({ mode: 'studio-preview' }, opts || {}));
  }

  function mountStudioCreationOpenedInto(container, p, opts) {
    renderFeedItemDetailInto(container, studioCreationDraftToFeedItem(p, opts), Object.assign({ mode: 'studio-preview' }, opts || {}));
  }

  function mountStudioPollOpenedInto(container, poll, escFn) {
    renderPollDraftDetailInto(container, poll, escFn);
  }

  function getPollApiBase(opts) {
    opts = opts || {};
    if (opts.apiBase) return String(opts.apiBase).replace(/\/$/, '');
    return (typeof global.LANTERN_AVATAR_API !== 'undefined' && global.LANTERN_AVATAR_API !== null) ? String(global.LANTERN_AVATAR_API).replace(/\/$/, '') : null;
  }

  function getPollCharacterName(opts) {
    opts = opts || {};
    var fromOpts = String(opts.characterName || '').trim();
    if (fromOpts) return fromOpts;
    try {
      var auth = global.LanternAuth || global.LanternPilotAuth;
      if (auth && typeof auth.sessionEconomyKey === 'function') {
        var k = auth.sessionEconomyKey();
        if (k) return k;
      }
      if (auth && typeof auth.getCachedPilotMe === 'function') {
        var me = auth.getCachedPilotMe();
        if (me && me.authenticated) {
          var role = String(me.role || '').trim().toLowerCase();
          if (role === 'teacher' || role === 'admin' || role === 'staff') {
            return String(me.username || me.display_name || '').trim();
          }
          if (auth.sessionEconomyKey) {
            var sk = auth.sessionEconomyKey(me);
            if (sk) return sk;
          }
        }
      }
    } catch (e) {}
    return '';
  }

  function buildPollResultsBarsHtml(results, votedChoiceIndex) {
    var total = (results || []).reduce(function (s, r) { return s + (r.count || 0); }, 0);
    var yoursIdx = votedChoiceIndex != null && !isNaN(Number(votedChoiceIndex)) ? Math.floor(Number(votedChoiceIndex)) : -1;
    var html = '<p class="pollResultsSummary">You voted · ' + total + ' total vote' + (total !== 1 ? 's' : '') + '</p>';
    (results || []).forEach(function (r, i) {
      var isYours = !!(r && r.is_yours) || (yoursIdx >= 0 && i === yoursIdx);
      html +=
        '<div class="pollResultRow' + (isYours ? ' pollResultRow--yours' : '') + '">' +
        '<div class="pollResultLabel"><span>' + esc(r.choice || '') +
        (isYours ? ' <em class="pollYourChoiceMark">Your choice</em>' : '') +
        '</span><span>' + (r.percentage || 0) + '%</span></div>' +
        '<div class="pollBarTrack"><div class="pollBarFill" style="width:' + (r.percentage || 0) + '%;"></div></div></div>';
    });
    return html;
  }

  function applyPollRewardCopy(nuggetEl, voteRes) {
    if (!nuggetEl) return;
    if (voteRes && voteRes.voter_nuggets) {
      nuggetEl.textContent = '+1 nugget for participating!';
      nuggetEl.style.display = 'block';
    } else if (voteRes && voteRes.reward_status === 'needs_link') {
      nuggetEl.textContent = 'Vote saved. Nugget account needs linking.';
      nuggetEl.style.display = 'block';
    } else if (voteRes && voteRes.reward_status === 'failed') {
      nuggetEl.textContent = 'Vote saved. Nugget reward will retry.';
      nuggetEl.style.display = 'block';
    } else {
      nuggetEl.style.display = 'none';
    }
  }

  /**
   * Explore interactive poll: same shell as openNews (detail overlay + detail media for fullscreen).
   * payload: { pollId, apiBase, characterName, fetchRes } — fetchRes is JSON from GET /api/polls/:id or { ok: false } on error.
   */
  function fillPollDetailModal(modalRoot, payload) {
    payload = payload || {};
    var pollId = String(payload.pollId || '').trim();
    var apiBase = String(payload.apiBase || '').replace(/\/$/, '');
    var characterName = String(payload.characterName || '').trim();
    var res = payload.fetchRes;
    var LC = global.LanternCards;
    if (!modalRoot) return;
    var v = modalRoot.querySelector('.lanternCardDetailVisual');
    var t = modalRoot.querySelector('.lanternCardDetailTitle');
    var idw = modalRoot.querySelector('.lanternCardDetailIdentityWrap');
    var m = modalRoot.querySelector('.lanternCardDetailMeta');
    var b = modalRoot.querySelector('.lanternCardDetailBody');
    var a = modalRoot.querySelector('.lanternCardDetailActions');
    var r = modalRoot.querySelector('.lanternCardDetailReactions');
    if (!v || !t || !m || !b || !a || !r) return;
    try {
    var admClearP = modalRoot.querySelector('#lanternCardDetailAdminModeration');
    if (admClearP) {
      admClearP.innerHTML = '';
      admClearP.style.display = 'none';
    }

    function pollAdminFooter() {
      fillAdminModeration(modalRoot, {
        removable: !!(pollId && !payload.previewDraft),
        itemType: 'poll',
        endpoint: '/api/polls/hide',
        id: pollId,
        body: { id: pollId },
        detail: !pollId ? 'No poll id.' : null,
      });
      var ownsPoll = !payload.previewDraft && viewerOwnsAuthorFields({
        character_name: (res && res.poll && res.poll.character_name) || payload.character_name || payload.author,
        author_name: (res && res.poll && res.poll.character_name) || payload.author,
        authorDisplayName: payload.authorDisplayName,
        authorAvatarKey: (res && res.poll && res.poll.author_avatar_key) || (payload.sourceItem && payload.sourceItem.authorAvatarKey),
      });
      fillAuthorActions(modalRoot, {
        show: !!(ownsPoll && pollId),
        target: ownsPoll && pollId ? { item_type: 'poll', item_id: pollId } : null,
      });
    }

    function setPollBodyShell() {
      b.innerHTML =
        '<div id="lanternPollDetailChoices"></div>' +
        '<div id="lanternPollDetailResults" class="pollResultsWrap" style="display:none;"></div>' +
        '<p class="pollVoterNugget" id="lanternPollDetailNugget" style="display:none;"></p>';
    }

    if (apiBase === null) {
      t.textContent = 'Poll';
      v.innerHTML = '';
      if (idw) idw.innerHTML = '';
      m.textContent = '';
      b.innerHTML = '<p class="lanternCardDetailCaption">Load the page with API enabled to vote.</p>';
      a.innerHTML = '';
      r.innerHTML = '';
      pollAdminFooter();
      return;
    }
    if (!res) {
      t.textContent = 'Poll';
      v.innerHTML = '';
      if (idw) idw.innerHTML = '';
      m.textContent = '';
      b.innerHTML = '<p class="lanternCardDetailCaption">Could not load poll.</p>';
      a.innerHTML = '';
      r.innerHTML = '';
      pollAdminFooter();
      return;
    }
    if (res._loadFailed) {
      t.textContent = 'Poll';
      v.innerHTML = '';
      if (idw) idw.innerHTML = '';
      m.textContent = '';
      b.innerHTML = '<p class="lanternCardDetailCaption">Could not load poll.</p>';
      a.innerHTML = '';
      r.innerHTML = '';
      pollAdminFooter();
      return;
    }
    if (!res.ok || !res.poll) {
      t.textContent = 'Poll';
      v.innerHTML = '';
      if (idw) idw.innerHTML = '';
      m.textContent = '';
      b.innerHTML = '<p class="lanternCardDetailCaption">Poll not found.</p>';
      a.innerHTML = '';
      r.innerHTML = '';
      pollAdminFooter();
      return;
    }

    var p = res.poll;
    var hasVoted = !!res.has_voted;
    var results = res.results;
    var imgUrl = (p.image_url && String(p.image_url).trim()) || (apiBase ? apiBase + '/api/media/image?key=default/default_poll.png' : '');
    if (imgUrl) {
      v.innerHTML =
        '<div class="lanternCardDetailVisualInner">' +
        '<div class="lanternDetailMedia lanternDetailMedia--img">' +
        '<div class="newsCardImageWrap lanternDetailMediaImageInner">' +
        '<button type="button" class="lanternDetailMediaExpandBtn" aria-label="View full image" title="View full image">⛶</button>' +
        '<img class="newsCardImage" src="' + esc(imgUrl) + '" alt="" onerror="this.parentNode.style.display=\'none\'" />' +
        '</div></div></div>';
    } else {
      v.innerHTML = '';
    }
    wireOpenedPostMediaInteractions(modalRoot);

    t.textContent = p.question || 'Poll';
    var sourceItem = payload.sourceItem || {};
    var pollIdentity = {
      authorAvatarKey: p.author_avatar_key || sourceItem.authorAvatarKey || sourceItem.author_avatar_key || p.character_name,
      author_avatar_key: p.author_avatar_key || sourceItem.authorAvatarKey,
      authorId: sourceItem.authorId || sourceItem.author_id,
      character_name: p.character_name,
      author_name: sourceItem.authorDisplayName || sourceItem.author_name || p.author_name,
      authorDisplayName: sourceItem.authorDisplayName,
      authorPublicLabel: p.author_public_label || sourceItem.authorPublicLabel || sourceItem.author_public_label,
      authorRole: sourceItem.authorRole || sourceItem.author_role,
      _canonicalAvatar: sourceItem._canonicalAvatar || p._canonicalAvatar
    };
    paintCanonicalPersonIdentity(idw, pollIdentity, { size: 'md' });
    var nch = (p.choices || []).length;
    var time = '';
    try {
      var dt = new Date(p.created_at || '');
      if (!isNaN(dt.getTime())) time = dt.toLocaleDateString();
    } catch (e2) {}
    m.textContent = [nch + ' choice' + (nch !== 1 ? 's' : ''), 'Poll', time].filter(Boolean).join(' · ');

    setPollBodyShell();
    var choicesEl = modalRoot.querySelector('#lanternPollDetailChoices');
    var resultsEl = modalRoot.querySelector('#lanternPollDetailResults');
    var nuggetEl = modalRoot.querySelector('#lanternPollDetailNugget');

    a.innerHTML = '';
    var rep = global.document.createElement('button');
    rep.type = 'button';
    rep.className = 'lanternReportDetailBtn';
    rep.textContent = 'Report';
    rep.setAttribute('aria-label', pollId ? 'Report this poll' : 'Report unavailable');
    if (!pollId) rep.disabled = true;
    rep.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (!pollId) return;
      openReportModal({ reportType: 'poll', reportId: pollId });
    });
    a.appendChild(rep);

    // Prompt #215 — Poll voting is primary; do not mount generic reactions in place of MC UI.
    r.innerHTML = '';

    var votedIdx = res.voted_choice_index != null ? Math.floor(Number(res.voted_choice_index)) : null;

    if (hasVoted && results && results.length && choicesEl && resultsEl && nuggetEl) {
      choicesEl.innerHTML = '';
      resultsEl.innerHTML = buildPollResultsBarsHtml(results, votedIdx);
      resultsEl.style.display = 'block';
      applyPollRewardCopy(nuggetEl, res);
    } else if (choicesEl && resultsEl && nuggetEl) {
      resultsEl.style.display = 'none';
      nuggetEl.style.display = 'none';
      choicesEl.innerHTML = '';
      var selectedIdx = null;
      var lockBtn = null;
      var group = global.document.createElement('div');
      group.className = 'pollChoiceGroup';
      group.setAttribute('role', 'radiogroup');
      group.setAttribute('aria-label', 'Poll choices');

      function syncChoiceSelection() {
        var buttons = group.querySelectorAll('.pollChoiceBtn');
        for (var bi = 0; bi < buttons.length; bi++) {
          var on = selectedIdx === bi;
          buttons[bi].classList.toggle('is-selected', on);
          buttons[bi].setAttribute('aria-checked', on ? 'true' : 'false');
        }
        if (lockBtn) {
          lockBtn.disabled = selectedIdx == null;
        }
      }

      (p.choices || []).forEach(function (choice, idx) {
        var btn = global.document.createElement('button');
        btn.type = 'button';
        btn.className = 'pollChoiceBtn';
        btn.setAttribute('role', 'radio');
        btn.setAttribute('aria-checked', 'false');
        btn.textContent = choice || ('Choice ' + (idx + 1));
        btn.addEventListener('click', function () {
          if (selectedIdx === idx) {
            selectedIdx = null;
          } else {
            selectedIdx = idx;
          }
          syncChoiceSelection();
        });
        group.appendChild(btn);
      });
      choicesEl.appendChild(group);

      lockBtn = global.document.createElement('button');
      lockBtn.type = 'button';
      lockBtn.className = 'btn good pollLockInBtn';
      lockBtn.textContent = 'Lock In';
      lockBtn.disabled = true;
      lockBtn.addEventListener('click', function () {
        if (selectedIdx == null || lockBtn._busy) return;
        if (!characterName) {
          try {
            global.alert('Sign in to vote on this poll.');
          } catch (e3) {}
          return;
        }
        lockBtn._busy = true;
        lockBtn.disabled = true;
        lockBtn.textContent = 'Saving…';
        var choiceButtons = group.querySelectorAll('.pollChoiceBtn');
        for (var di = 0; di < choiceButtons.length; di++) choiceButtons[di].disabled = true;
        global.fetch(apiBase + '/api/polls/vote', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ poll_id: pollId, choice_index: selectedIdx })
        })
          .then(function (resp) { return resp.json(); })
          .then(function (voteRes) {
            if (!voteRes || !voteRes.ok) {
              lockBtn._busy = false;
              lockBtn.textContent = 'Lock In';
              lockBtn.disabled = selectedIdx == null;
              for (var ei = 0; ei < choiceButtons.length; ei++) choiceButtons[ei].disabled = false;
              try {
                global.alert(voteRes && voteRes.error ? voteRes.error : 'Vote failed');
              } catch (e4) {}
              return;
            }
            var c2 = modalRoot.querySelector('#lanternPollDetailChoices');
            var r2 = modalRoot.querySelector('#lanternPollDetailResults');
            var n2 = modalRoot.querySelector('#lanternPollDetailNugget');
            if (c2) c2.innerHTML = '';
            if (lockBtn && lockBtn.parentNode) lockBtn.parentNode.removeChild(lockBtn);
            if (r2) {
              r2.innerHTML = buildPollResultsBarsHtml(voteRes.results || [], voteRes.voted_choice_index);
              r2.style.display = 'block';
            }
            applyPollRewardCopy(n2, voteRes);
          })
          .catch(function () {
            lockBtn._busy = false;
            lockBtn.textContent = 'Lock In';
            lockBtn.disabled = selectedIdx == null;
            for (var fi = 0; fi < choiceButtons.length; fi++) choiceButtons[fi].disabled = false;
            try {
              global.alert('Unable to save your vote. Please try again.');
            } catch (e5) {}
          });
      });
      choicesEl.appendChild(lockBtn);
      syncChoiceSelection();
    }
    } finally {
      prepareCanonicalOpenedModal(modalRoot, { kind: 'poll' });
    }
  }

  function openPoll(pollId, opts) {
    opts = opts || {};
    var el = ensureOverlay();
    var modal = el.querySelector('.lanternCardDetailModal');
    if (!modal) return;
    var apiBase = getPollApiBase(opts);
    var characterName = getPollCharacterName(opts);
    var v = modal.querySelector('.lanternCardDetailVisual');
    var t = modal.querySelector('.lanternCardDetailTitle');
    var idw = modal.querySelector('.lanternCardDetailIdentityWrap');
    var m = modal.querySelector('.lanternCardDetailMeta');
    var b = modal.querySelector('.lanternCardDetailBody');
    var a = modal.querySelector('.lanternCardDetailActions');
    var r = modal.querySelector('.lanternCardDetailReactions');
    if (v) v.innerHTML = '';
    if (t) t.textContent = 'Loading…';
    if (idw) idw.innerHTML = '';
    if (m) m.textContent = '';
    if (b) b.innerHTML = '<p class="lanternCardDetailCaption">Loading poll…</p>';
    if (a) a.innerHTML = '';
    if (r) r.innerHTML = '';
    var admPoll = modal.querySelector('#lanternCardDetailAdminModeration');
    if (admPoll) {
      admPoll.innerHTML = '';
      admPoll.style.display = 'none';
      admPoll.setAttribute('aria-hidden', 'true');
    }
    showDetailOverlay(el);

    if (apiBase === null) {
      fillPollDetailModal(modal, { pollId: pollId, apiBase: '', characterName: characterName, fetchRes: { ok: false, error: 'no_api' }, sourceItem: opts.sourceItem, previewDraft: opts.previewDraft });
      return;
    }
    global.fetch(apiBase + '/api/polls/' + encodeURIComponent(pollId), { credentials: 'include', cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!modal.parentNode) return;
        fillPollDetailModal(modal, { pollId: pollId, apiBase: apiBase, characterName: characterName, fetchRes: res, sourceItem: opts.sourceItem, previewDraft: opts.previewDraft });
      })
      .catch(function () {
        if (!modal.parentNode) return;
        fillPollDetailModal(modal, { pollId: pollId, apiBase: apiBase, characterName: characterName, fetchRes: { ok: false }, sourceItem: opts.sourceItem, previewDraft: opts.previewDraft });
      });
  }

  function openTextDetail(title, meta, bodyText) {
    var el = ensureOverlay();
    el.querySelector('#lanternCardDetailVisual').innerHTML = '';
    el.querySelector('#lanternCardDetailTitle').textContent = title || '';
    var idwTxt = el.querySelector('#lanternCardDetailIdentityWrap');
    if (idwTxt) idwTxt.innerHTML = '';
    el.querySelector('#lanternCardDetailMeta').textContent = meta || '';
    el.querySelector('#lanternCardDetailBody').innerHTML = bodyText ? '<div class="lanternCardDetailCaption">' + esc(bodyText).replace(/\n/g, '<br>') + '</div>' : '';
    el.querySelector('#lanternCardDetailActions').innerHTML = '';
    el.querySelector('#lanternCardDetailReactions').innerHTML = '';
    var admTxt = el.querySelector('#lanternCardDetailAdminModeration');
    if (admTxt) {
      admTxt.innerHTML = '';
      admTxt.style.display = 'none';
      admTxt.setAttribute('aria-hidden', 'true');
    }
    showDetailOverlay(el);
  }

  var reportOverlay = null;
  var pendingReport = { reportType: '', reportId: '' };

  function ensureReportOverlay() {
    if (reportOverlay && reportOverlay.parentNode) return reportOverlay;
    reportOverlay = global.document.createElement('div');
    reportOverlay.id = 'lanternReportModalOverlay';
    reportOverlay.className = 'lanternReportModalOverlay';
    reportOverlay.setAttribute('aria-hidden', 'true');
    reportOverlay.innerHTML =
      '<div class="lanternReportModal" role="dialog" aria-modal="true" aria-labelledby="lanternReportModalTitle">' +
      '<h2 id="lanternReportModalTitle">Report this?</h2>' +
      '<fieldset class="lanternReportModalFieldset">' +
      '<label class="lanternReportModalOption"><input type="radio" name="lanternReportReason" value="Inappropriate" checked> Inappropriate</label>' +
      '<label class="lanternReportModalOption"><input type="radio" name="lanternReportReason" value="Bullying"> Bullying</label>' +
      '<label class="lanternReportModalOption"><input type="radio" name="lanternReportReason" value="Other"> Other</label>' +
      '</fieldset>' +
      '<label class="lanternReportModalVisuallyHidden" for="lanternReportModalNote">Optional details</label>' +
      '<textarea id="lanternReportModalNote" rows="3" maxlength="500" placeholder="Optional details"></textarea>' +
      '<p class="lanternReportModalNote">Reports are reviewed by staff.</p>' +
      '<div class="lanternReportModalActions">' +
      '<button type="button" class="lanternReportModalCancel" id="lanternReportModalCancel">Cancel</button>' +
      '<button type="button" class="lanternReportModalSubmit" id="lanternReportModalSubmit">Submit</button>' +
      '</div></div>';
    global.document.body.appendChild(reportOverlay);
    reportOverlay.addEventListener('click', function (e) {
      if (e.target === reportOverlay) closeReportModal();
    });
    reportOverlay.querySelector('#lanternReportModalCancel').addEventListener('click', closeReportModal);
    reportOverlay.querySelector('#lanternReportModalSubmit').addEventListener('click', submitReportModal);
    return reportOverlay;
  }

  function closeReportModal() {
    if (!reportOverlay) return;
    reportOverlay.classList.remove('show');
    reportOverlay.setAttribute('aria-hidden', 'true');
    pendingReport = { reportType: '', reportId: '' };
  }

  function toastReport(msg) {
    var t = global.document.getElementById('toast');
    if (t) {
      t.textContent = msg;
      t.style.display = 'block';
      setTimeout(function () { t.style.display = 'none'; }, 3200);
    } else {
      try { global.alert(msg); } catch (e) {}
    }
  }

  function submitReportModal() {
    var el = ensureReportOverlay();
    var type = (pendingReport.reportType || '').trim();
    var itemId = (pendingReport.reportId || '').trim();
    var noteEl = global.document.getElementById('lanternReportModalNote');
    var extra = noteEl ? String(noteEl.value || '').trim().slice(0, 500) : '';
    var radios = el.querySelectorAll('input[name="lanternReportReason"]');
    var cat = 'Other';
    for (var i = 0; i < radios.length; i++) {
      if (radios[i].checked) { cat = radios[i].value; break; }
    }
    var reason = cat + (extra ? ': ' + extra : '');

    // Prompt #117 — every Report-capable Explore type maps to a server-supported item_type.
    var apiItemType = null;
    var t = String(type || '').toLowerCase();
    if (t === 'news' || t === 'shoutout' || t === 'shout-out' || t === 'shout_out') apiItemType = 'news';
    else if (t === 'poll' || t === 'polls') apiItemType = 'poll';
    else if (t === 'mission_submission' || t === 'mission' || t === 'missions') apiItemType = 'mission_submission';
    else if (t === 'feed_item' || t === 'feed' || t === 'creation' || t === 'article' || t === 'post') apiItemType = 'feed_item';

    if (!apiItemType) {
      toastReport('Report unavailable for this item.');
      closeReportModal();
      return;
    }
    if (!itemId) {
      toastReport('Report unavailable for this item.');
      closeReportModal();
      return;
    }

    var apiBase = (typeof global.LANTERN_AVATAR_API !== 'undefined' && global.LANTERN_AVATAR_API !== null) ? String(global.LANTERN_AVATAR_API).replace(/\/$/, '') : null;
    if (apiBase === null) {
      toastReport('Reporting is not available (API not configured).');
      closeReportModal();
      return;
    }
    var me = null;
    try {
      me = global.LANTERN_PILOT_ME && global.LANTERN_PILOT_ME.ok ? global.LANTERN_PILOT_ME : null;
    } catch (eMe) {}
    if (!me || me.authenticated === false) {
      toastReport('Sign in to submit a report.');
      closeReportModal();
      return;
    }

    // Explore feed ids may be prefixed (poll:…, mission:…, news:…).
    var resolvedType = apiItemType;
    var resolvedId = itemId;
    var pref = String(itemId || '').match(/^(news|poll|mission|feed):(.+)$/i);
    if (pref) {
      var kind = pref[1].toLowerCase();
      resolvedId = String(pref[2] || '').trim();
      if (kind === 'poll') resolvedType = 'poll';
      else if (kind === 'mission') resolvedType = 'mission_submission';
      else if (kind === 'news') resolvedType = 'news';
      else if (kind === 'feed') resolvedType = 'feed_item';
    }

    var btn = el.querySelector('#lanternReportModalSubmit');
    if (btn) btn.disabled = true;
    global.fetch(apiBase + '/api/report', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ item_type: resolvedType, item_id: resolvedId, reason: reason })
    }).then(function (r) { return r.json().catch(function () { return null; }).then(function (j) { return { http: r, j: j }; }); }).then(function (pack) {
      var el2 = ensureReportOverlay();
      var btn2 = el2.querySelector('#lanternReportModalSubmit');
      if (btn2) btn2.disabled = false;
      var res = pack && pack.j;
      if (res && res.ok) {
        toastReport('Report submitted. This post was removed pending staff review.');
        removeReportedContentFromUi(resolvedType, itemId);
        removeReportedContentFromUi(resolvedType, resolvedId);
        try { closeDetail(); } catch (eClose) {}
        closeReportModal();
        return;
      }
      if (pack && pack.http && pack.http.status === 401) {
        toastReport('Sign in to submit a report.');
      } else {
        toastReport((res && res.error) ? String(res.error) : 'Report failed.');
      }
      closeReportModal();
    }).catch(function () {
      var el3 = ensureReportOverlay();
      var btn3 = el3.querySelector('#lanternReportModalSubmit');
      if (btn3) btn3.disabled = false;
      toastReport('Report failed.');
      closeReportModal();
    });
  }

  /** Prompt #117 — drop reported card(s) from Explore without full reload. */
  function removeReportedContentFromUi(itemType, itemId) {
    var id = String(itemId || '').trim();
    if (!id || !global.document) return;
    try {
      var nodes = global.document.querySelectorAll('[data-report-id="' + id.replace(/"/g, '') + '"]');
      Array.prototype.forEach.call(nodes, function (node) {
        var wrap = node.closest && (node.closest('.exploreCardOuterWrap') || node.closest('.exploreCard') || node);
        if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
      });
    } catch (e) {}
    try {
      if (global.LanternFeed && typeof global.LanternFeed.removeItemById === 'function') {
        global.LanternFeed.removeItemById(id);
      }
    } catch (e2) {}
  }

  function openReportModal(opts) {
    opts = opts || {};
    pendingReport = {
      reportType: String(opts.reportType || '').trim(),
      reportId: String(opts.reportId != null ? opts.reportId : '').trim()
    };
    var el = ensureReportOverlay();
    var noteEl = global.document.getElementById('lanternReportModalNote');
    if (noteEl) noteEl.value = '';
    var first = el.querySelector('input[name="lanternReportReason"]');
    if (first) first.checked = true;
    el.classList.add('show');
    el.setAttribute('aria-hidden', 'false');
  }

  function feedItemTypeBadge(item) {
    return String((item && item.typeLabel) || (item && item.type) || 'Post').trim();
  }

  function feedItemToMediaModel(item) {
    item = item || {};
    var slot = item.contentSlot || {};
    return {
      image_url: item.imageUrl || item.thumbnailUrl || '',
      thumbnail_url: item.thumbnailUrl || '',
      full_image_url: item.fullImageUrl || item.full_image_url || slot.fullImageUrl || '',
      video_url: item.videoUrl || slot.videoUrl || '',
      link_url: slot.linkUrl || '',
      photo_credit: slot.photoCredit || '',
      type: item.type || 'article'
    };
  }

  function formatFeedItemDate(item) {
    var iso = (item && (item.approvedAt || item.createdAt)) || '';
    if (!iso) return '';
    try {
      var d = new Date(iso);
      if (!isNaN(d.getTime())) return d.toLocaleDateString();
    } catch (e) {}
    return '';
  }

  /**
   * ONE FEED canonical item → shared Lantern detail modal (Explore/Locker).
   */
  function fillFeedItemDetailModal(modalRoot, item, opts) {
    opts = opts || {};
    if (!modalRoot || !item) return;
    var LC = global.LanternCards;
    var v = modalRoot.querySelector('.lanternCardDetailVisual');
    var t = modalRoot.querySelector('.lanternCardDetailTitle');
    var idw = modalRoot.querySelector('.lanternCardDetailIdentityWrap');
    var m = modalRoot.querySelector('.lanternCardDetailMeta');
    var b = modalRoot.querySelector('.lanternCardDetailBody');
    var a = modalRoot.querySelector('.lanternCardDetailActions');
    var r = modalRoot.querySelector('.lanternCardDetailReactions');
    if (!v || !t || !m || !b || !a || !r) return;

    var adm = modalRoot.querySelector('#lanternCardDetailAdminModeration');
    if (adm) {
      adm.innerHTML = '';
      adm.style.display = 'none';
    }

    t.textContent = item.title || 'Untitled';
    paintCanonicalPersonIdentity(idw, item, { size: 'md' });
    var dateStr = formatFeedItemDate(item);
    var typeKey = String(item.type || item.typeLabel || '').toLowerCase();
    var isShoutFeed = /shout/.test(typeKey) || typeKey === 'recognition' ||
      /Recognizing:\s*/i.test(String(item.body || item.summary || ''));
    var typeLabel = isShoutFeed
      ? ((LC && LC.SHOUT_OUT_DISPLAY_NAME) || 'Shout-Out!')
      : feedItemTypeBadge(item);
    m.textContent = [typeLabel, dateStr].filter(Boolean).join(' · ');

    var body = String(item.body || item.summary || '').trim();
    b.innerHTML = body ? '<div class="lanternCardDetailCaption">' + esc(body).replace(/\n/g, '<br>') + '</div>' : '';
    var photoCredit = item.contentSlot && String(item.contentSlot.photoCredit || '').trim();
    if (photoCredit) {
      b.innerHTML += '<div class="lanternCardDetailCaption lanternCardDetailPhotoCredit">Photo: ' + esc(photoCredit) + '</div>';
    }

    var mediaModel = feedItemToMediaModel(item);
    var typeFb = LC && LC.getTypeFallbackMediaDataUri ? LC.getTypeFallbackMediaDataUri(item.type || 'article') : '';
    var uniFb = LC && LC.getUniversalFallbackMediaDataUri ? LC.getUniversalFallbackMediaDataUri() : '';
    if (global.LanternMedia && global.LanternMedia.renderMedia) {
      var dm = global.LanternMedia.renderMedia(mediaModel, { esc: esc, variant: 'detail', exploreTypeFallback: typeFb, exploreUniversalFallback: uniFb });
      if (dm && dm.mediaBlock && String(dm.mediaBlock).trim()) {
        v.innerHTML = '<div class="lanternCardDetailVisualInner">' + dm.mediaBlock + '</div>';
      } else if (LC && LC.buildGuaranteedExploreImageHtml) {
        v.innerHTML = '<div class="lanternCardDetailVisualInner">' + LC.buildGuaranteedExploreImageHtml(item.type || 'article', mediaModel.image_url || '') + '</div>';
      } else {
        v.innerHTML = '';
      }
    } else if (LC && LC.buildGuaranteedExploreImageHtml) {
      v.innerHTML = '<div class="lanternCardDetailVisualInner">' + LC.buildGuaranteedExploreImageHtml(item.type || 'article', mediaModel.image_url || '') + '</div>';
    } else {
      v.innerHTML = '';
    }
    wireOpenedPostMediaInteractions(modalRoot);

    r.innerHTML = '<div class="lanternFinalRxHost"></div>';
    var rxHost = r.querySelector('.lanternFinalRxHost');
    var isStudioPreview = opts.mode === 'studio-preview';
    if (global.LANTERN_FINAL_REACTIONS && global.LANTERN_FINAL_REACTIONS.mountFinalReactionPanel && rxHost) {
      global.LANTERN_FINAL_REACTIONS.mountFinalReactionPanel(rxHost, {
        item_type: 'feed',
        item_id: isStudioPreview ? '' : String(item.id || '').trim(),
        mode: isStudioPreview ? 'preview' : 'interactive'
      });
    }

    /* Prompt #219 — full-image opens via LRHC expand icon on the artwork (no bottom text button). */
    a.innerHTML = '';

    var feedTarget = !isStudioPreview ? resolveAuthorRemoveTarget(item) : null;
    var ownsFeed = !isStudioPreview && viewerOwnsAuthorFields({
      authorId: item.authorId || item.author_id,
      authorDisplayName: item.authorDisplayName || item.author_display_name,
      author_name: item.author_name,
      character_name: item.character_name,
      authorAvatarKey: item.authorAvatarKey || item.author_avatar_key,
    });
    fillAuthorActions(modalRoot, {
      show: !!(ownsFeed && feedTarget && feedTarget.item_id),
      target: feedTarget,
    });

    // Admin hide for news/mission-backed Explore cards
    if (!isStudioPreview && feedTarget && feedTarget.item_type === 'news') {
      fillAdminModeration(modalRoot, {
        removable: true,
        itemType: 'approved_news',
        endpoint: '/api/news/hide',
        id: feedTarget.item_id,
        body: { id: feedTarget.item_id },
      });
    } else if (!isStudioPreview && feedTarget && feedTarget.item_type === 'mission') {
      fillAdminModeration(modalRoot, {
        removable: true,
        itemType: 'mission_submission',
        endpoint: '/api/missions/submissions/hide',
        id: feedTarget.item_id,
        body: { id: feedTarget.item_id },
      });
    } else if (!isStudioPreview && feedTarget && feedTarget.item_type === 'poll') {
      fillAdminModeration(modalRoot, {
        removable: true,
        itemType: 'poll',
        endpoint: '/api/polls/hide',
        id: feedTarget.item_id,
        body: { id: feedTarget.item_id },
      });
    } else if (!isStudioPreview && feedTarget && feedTarget.item_type === 'feed') {
      fillAdminModeration(modalRoot, {
        removable: true,
        itemType: 'feed_item',
        endpoint: '/api/feed/hide',
        id: feedTarget.item_id,
        body: { id: feedTarget.item_id },
      });
    }
    prepareCanonicalOpenedModal(modalRoot, { kind: String(item.type || '').toLowerCase(), item: item });
  }

  function resolveFeedPollId(item) {
    if (!item) return '';
    var slot = item.contentSlot || {};
    if (slot.pollId != null && String(slot.pollId).trim()) return String(slot.pollId).trim();
    var id = String(item.id || '').trim();
    if (id.indexOf('poll:') === 0) return id.slice(5);
    return '';
  }

  function openFeedItem(item, opts) {
    opts = opts || {};
    if (!item) return;
    // Prompt #215 — Explore polls must open the interactive vote UI, not the generic content modal.
    var type = String(item.type || '').toLowerCase();
    if (type === 'poll') {
      var pollId = resolveFeedPollId(item);
      if (pollId) {
        openPoll(pollId, Object.assign({}, opts, { sourceItem: item }));
        return;
      }
    }
    var el = ensureOverlay();
    var modal = el.querySelector('.lanternCardDetailModal');
    if (!modal) return;
    fillFeedItemDetailModal(modal, item, opts);
    showDetailOverlay(el);
    var lastCard = opts.triggerEl || null;
    el._lanternFeedTriggerEl = lastCard;
    var closeBtn = el.querySelector('.lanternCardDetailClose');
    if (closeBtn) closeBtn.focus();
  }

  global.LanternCardUI = {
    showDetailOverlay: showDetailOverlay,
    openCreation: openCreation,
    openNews: openNews,
    openPoll: openPoll,
    openTextDetail: openTextDetail,
    openFeedItem: openFeedItem,
    closeDetail: closeDetail,
    ensureOverlay: ensureOverlay,
    openReportModal: openReportModal,
    closeReportModal: closeReportModal,
    newsRoleLabelFromAuthorType: newsRoleLabelFromAuthorType,
    fillNewsDetailModal: fillNewsDetailModal,
    fillCreationDetailModal: fillCreationDetailModal,
    fillPollDetailModal: fillPollDetailModal,
    fillFeedItemDetailModal: fillFeedItemDetailModal,
    renderFeedItemDetailInto: renderFeedItemDetailInto,
    studioNewsDraftToFeedItem: studioNewsDraftToFeedItem,
    studioCreationDraftToFeedItem: studioCreationDraftToFeedItem,
    openMediaFullscreen: openMediaFullscreen,
    mountNewsDetailInto: mountNewsDetailInto,
    mountCreationDetailInto: mountCreationDetailInto,
    mountPollOpenedInto: mountPollOpenedInto,
    mountStudioNewsOpenedInto: mountStudioNewsOpenedInto,
    mountStudioCreationOpenedInto: mountStudioCreationOpenedInto,
    mountStudioPollOpenedInto: mountStudioPollOpenedInto,
    /* Prompt #226 */
    fillAuthorActions: fillAuthorActions,
    resolveAuthorRemoveTarget: resolveAuthorRemoveTarget,
    postAuthorContentRemove: postAuthorContentRemove,
  };
})(typeof window !== 'undefined' ? window : this);
