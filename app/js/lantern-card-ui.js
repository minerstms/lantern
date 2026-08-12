/**
 * Lantern — shared opened-card surface + fullscreen media for student preview cards (Explore, Profile, Contribute embedded).
 * - Opened surface: #lanternCardDetailOverlay + fillNewsDetailModal / fillCreationDetailModal / fillPollDetailModal; mount*DetailInto for embedded.
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

  var overlay = null;
  var escapeWired = false;
  var mediaFsOverlay = null;

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
      '<div class="lanternCardDetailVisual" id="lanternCardDetailVisual"></div>' +
      '<h2 class="lanternCardDetailTitle" id="lanternCardDetailTitle"></h2>' +
      '<div class="lanternCardDetailIdentityWrap" id="lanternCardDetailIdentityWrap"></div>' +
      '<div class="lanternCardDetailMeta" id="lanternCardDetailMeta"></div>' +
      '<div class="lanternCardDetailBody" id="lanternCardDetailBody"></div>' +
      '<div class="lanternCardDetailAdminModeration" id="lanternCardDetailAdminModeration" aria-hidden="true"></div>' +
      '<div class="lanternCardDetailActions" id="lanternCardDetailActions"></div>' +
      '<div class="lanternCardDetailReactions" id="lanternCardDetailReactions"></div>' +
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
    var displayNmC = String(p.display_name || p.author_name || '').trim();
    var accountKeyC = String(p.character_name || p.author_name || '').trim();
    if (idwC && LC && LC.buildExploreAuthorAvatarHtml && (accountKeyC || displayNmC)) {
      var idFirstC = LC.railIdentityFirstName ? LC.railIdentityFirstName(displayNmC || 'Anonymous') : displayNmC;
      idwC.innerHTML = '<div class="lanternCardDetailIdentity exploreCardIdentity exploreCardIdentity--rail">' +
        LC.buildExploreAuthorAvatarHtml({
          character_name: accountKeyC,
          author_name: displayNmC,
          _canonicalAvatar: p._canonicalAvatar,
          frame: 'none'
        }) +
        '<span class="exploreAuthor exploreAuthor--identity">' + esc(idFirstC) + '</span></div>';
      m.textContent = time;
    } else {
      if (idwC) idwC.innerHTML = '';
      m.textContent = [metaWho, time].filter(Boolean).join(' · ');
    }
    var embeddedPrevC = !!(opts && opts.embeddedPreview);
    if (embeddedPrevC && idwC && LC && LC.buildExploreAuthorAvatarHtml && global.LanternAvatar && typeof global.LanternAvatar.getCanonicalAvatar === 'function' && (accountKeyC || displayNmC)) {
      var hasCanonImgC = p._canonicalAvatar && p._canonicalAvatar.imageUrl && String(p._canonicalAvatar.imageUrl).trim();
      if (!hasCanonImgC) {
        var keysC = [];
        if (accountKeyC) keysC.push(accountKeyC);
        if (displayNmC && displayNmC !== accountKeyC) keysC.push(displayNmC);
        Promise.all(keysC.map(function (k) {
          var leg = global.LanternAvatar.getLegacyEmojiForCharacter ? global.LanternAvatar.getLegacyEmojiForCharacter(k) : '';
          return global.LanternAvatar.getCanonicalAvatar(k, leg || undefined);
        })).then(function (results) {
          var pickedC = null;
          for (var ci = 0; ci < results.length; ci++) {
            if (results[ci] && results[ci].imageUrl && String(results[ci].imageUrl).trim()) {
              pickedC = results[ci];
              break;
            }
          }
          if (!pickedC) return;
          p._canonicalAvatar = pickedC;
          if (!modalRoot.parentNode) return;
          var idw3 = modalRoot.querySelector('.lanternCardDetailIdentityWrap');
          if (!idw3 || !LC.buildExploreAuthorAvatarHtml) return;
          var idFirst3 = LC.railIdentityFirstName ? LC.railIdentityFirstName(displayNmC || 'Anonymous') : displayNmC;
          idw3.innerHTML = '<div class="lanternCardDetailIdentity exploreCardIdentity exploreCardIdentity--rail">' +
            LC.buildExploreAuthorAvatarHtml({
              character_name: accountKeyC,
              author_name: displayNmC,
              _canonicalAvatar: p._canonicalAvatar,
              frame: 'none'
            }) +
            '<span class="exploreAuthor exploreAuthor--identity">' + esc(idFirst3) + '</span></div>';
        });
      }
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
  }

  function openCreation(p, opts) {
    opts = opts || {};
    if (!global.LanternCards) return;
    var el = ensureOverlay();
    var modal = el.querySelector('.lanternCardDetailModal');
    if (!modal) return;
    fillCreationDetailModal(modal, p, opts);
    el.classList.add('show');
    el.setAttribute('aria-hidden', 'false');
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
    var displayNm = String(n.author_name || '').trim();
    var accountKey = String(n.character_name || n.author_name || '').trim();
    if (idw && LC && LC.buildExploreAuthorAvatarHtml && (accountKey || displayNm)) {
      var idFirst = LC.railIdentityFirstName ? LC.railIdentityFirstName(displayNm || 'Anonymous') : displayNm;
      idw.innerHTML = '<div class="lanternCardDetailIdentity exploreCardIdentity exploreCardIdentity--rail">' +
        LC.buildExploreAuthorAvatarHtml({
          character_name: accountKey,
          author_name: displayNm,
          _canonicalAvatar: n._canonicalAvatar,
          frame: 'none'
        }) +
        '<span class="exploreAuthor exploreAuthor--identity">' + esc(idFirst) + '</span></div>';
    } else if (idw) {
      idw.innerHTML = '';
    }
    var roleLabel = newsRoleLabelFromAuthorType(n.author_type);
    var cat = String(n.category || '').trim();
    m.textContent = [roleLabel, cat, time].filter(Boolean).join(' · ');
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
    function hasCanonImage(canon) {
      return !!(canon && canon.imageUrl && String(canon.imageUrl).trim());
    }
    if (embeddedPreview && idw && LC && LC.buildExploreAuthorAvatarHtml && global.LanternAvatar && typeof global.LanternAvatar.getCanonicalAvatar === 'function' && (accountKey || displayNm) && !hasCanonImage(n._canonicalAvatar)) {
      var keysTry = [];
      if (accountKey) keysTry.push(accountKey);
      if (displayNm && displayNm !== accountKey) keysTry.push(displayNm);
      Promise.all(keysTry.map(function (k) {
        var legN = global.LanternAvatar.getLegacyEmojiForCharacter ? global.LanternAvatar.getLegacyEmojiForCharacter(k) : '';
        return global.LanternAvatar.getCanonicalAvatar(k, legN || undefined);
      })).then(function (results) {
        var picked = null;
        for (var ri = 0; ri < results.length; ri++) {
          if (results[ri] && results[ri].imageUrl && String(results[ri].imageUrl).trim()) {
            picked = results[ri];
            break;
          }
        }
        if (!picked) return;
        n._canonicalAvatar = picked;
        if (!modalRoot.parentNode) return;
        var idw2 = modalRoot.querySelector('.lanternCardDetailIdentityWrap');
        if (!idw2 || !LC.buildExploreAuthorAvatarHtml) return;
        var idFirst2 = LC.railIdentityFirstName ? LC.railIdentityFirstName(displayNm || 'Anonymous') : displayNm;
        idw2.innerHTML = '<div class="lanternCardDetailIdentity exploreCardIdentity exploreCardIdentity--rail">' +
          LC.buildExploreAuthorAvatarHtml({
            character_name: accountKey,
            author_name: displayNm,
            _canonicalAvatar: n._canonicalAvatar,
            frame: 'none'
          }) +
          '<span class="exploreAuthor exploreAuthor--identity">' + esc(idFirst2) + '</span></div>';
      });
    }
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
  }

  function openNews(n, opts) {
    opts = opts || {};
    var el = ensureOverlay();
    var modal = el.querySelector('.lanternCardDetailModal');
    if (!modal) return;
    fillNewsDetailModal(modal, n, opts);
    el.classList.add('show');
    el.setAttribute('aria-hidden', 'false');
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
    return {
      id: String(n.id || 'preview-draft'),
      type: inferStudioFeedTypeFromDraft({
        type: 'news',
        imageUrl: media.image_url,
        videoUrl: media.video_url,
        linkUrl: media.link_url
      }),
      typeLabel: typeLabel,
      title: n.title || (ct === 'shoutout' ? ((LC && LC.SHOUT_OUT_DISPLAY_NAME) || 'Shout-Out!') : 'Untitled'),
      body: n.body || '',
      summary: n.body || '',
      authorDisplayName: String(n.author_name || 'Anonymous').trim(),
      authorRole: n.author_type || 'student',
      createdAt: iso,
      approvedAt: iso,
      imageUrl: media.image_url || '',
      thumbnailUrl: media.image_url || '',
      videoUrl: media.video_url || '',
      contentSlot: { linkUrl: media.link_url || '', photoCredit: n.photo_credit || '' }
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
      authorDisplayName: String(p.display_name || p.author_name || 'Anonymous').trim(),
      authorRole: 'student',
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
    var m = modal.querySelector('.lanternCardDetailMeta');
    var b = modal.querySelector('.lanternCardDetailBody');
    var a = modal.querySelector('.lanternCardDetailActions');
    var r = modal.querySelector('.lanternCardDetailReactions');
    if (t) t.textContent = poll.question || 'Poll';
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
    var admClearP = modalRoot.querySelector('#lanternCardDetailAdminModeration');
    if (admClearP) {
      admClearP.innerHTML = '';
      admClearP.style.display = 'none';
    }

    function pollAdminFooter() {
      fillAdminModeration(modalRoot, {
        removable: false,
        itemType: 'poll',
        id: pollId,
        detail: 'Polls have no admin hide endpoint in the worker yet.',
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
    var cn = String((p.character_name || '').trim() || '');
    function renderPollAuthorIdentity(canon) {
      if (!idw || !LC || !LC.buildExploreAuthorAvatarHtml) return;
      if (!cn) {
        idw.innerHTML = '';
        return;
      }
      var idFirst = LC.railIdentityFirstName ? LC.railIdentityFirstName(cn) : cn;
      var pm = { character_name: cn, author_name: cn, frame: 'none' };
      if (canon && typeof canon === 'object') pm._canonicalAvatar = canon;
      idw.innerHTML =
        '<div class="lanternCardDetailIdentity exploreCardIdentity exploreCardIdentity--rail">' +
        LC.buildExploreAuthorAvatarHtml(pm) +
        '<span class="exploreAuthor exploreAuthor--identity">' + esc(idFirst) + '</span></div>';
    }
    if (cn && global.LanternAvatar && typeof global.LanternAvatar.getCanonicalAvatar === 'function') {
      renderPollAuthorIdentity(null);
      var legP = global.LanternAvatar.getLegacyEmojiForCharacter ? global.LanternAvatar.getLegacyEmojiForCharacter(cn) : '';
      global.LanternAvatar.getCanonicalAvatar(cn, legP || undefined).then(function (canon) {
        renderPollAuthorIdentity(canon);
      });
    } else {
      renderPollAuthorIdentity(null);
    }
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
      nuggetEl.style.display = 'none';
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
            if (n2) {
              if (voteRes.voter_nuggets) n2.textContent = '+1 nugget for participating!';
              n2.style.display = voteRes.voter_nuggets ? 'block' : 'none';
            }
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
    el.classList.add('show');
    el.setAttribute('aria-hidden', 'false');

    if (apiBase === null) {
      fillPollDetailModal(modal, { pollId: pollId, apiBase: '', characterName: characterName, fetchRes: { ok: false, error: 'no_api' } });
      return;
    }
    global.fetch(apiBase + '/api/polls/' + encodeURIComponent(pollId), { credentials: 'include', cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!modal.parentNode) return;
        fillPollDetailModal(modal, { pollId: pollId, apiBase: apiBase, characterName: characterName, fetchRes: res });
      })
      .catch(function () {
        if (!modal.parentNode) return;
        fillPollDetailModal(modal, { pollId: pollId, apiBase: apiBase, characterName: characterName, fetchRes: { ok: false } });
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
    el.classList.add('show');
    el.setAttribute('aria-hidden', 'false');
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

    var apiItemType = null;
    if (type === 'news') apiItemType = 'news';
    else if (type === 'mission_submission') apiItemType = 'mission_submission';

    if (!apiItemType) {
      toastReport('This item type is not reportable through the server yet.');
      closeReportModal();
      return;
    }
    if (!itemId) {
      toastReport('Report unavailable for this item.');
      closeReportModal();
      return;
    }

    var apiBase = (typeof global.LANTERN_AVATAR_API !== 'undefined' && global.LANTERN_AVATAR_API !== null) ? String(global.LANTERN_AVATAR_API).replace(/\/$/, '') : null;
    var reportedBy = '';
    try {
      var auth = global.LanternAuth || global.LanternPilotAuth;
      if (auth && typeof auth.sessionEconomyKey === 'function') {
        reportedBy = auth.sessionEconomyKey() || '';
      }
    } catch (e) {}
    if (apiBase === null) {
      toastReport('Reporting is not available (API not configured).');
      closeReportModal();
      return;
    }
    if (!reportedBy) {
        toastReport('Adopt a character in Locker (Overview) to submit a report.');
      closeReportModal();
      return;
    }

    var btn = el.querySelector('#lanternReportModalSubmit');
    if (btn) btn.disabled = true;
    global.fetch(apiBase + '/api/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_type: apiItemType, item_id: itemId, reported_by: reportedBy, reason: reason })
    }).then(function (r) { return r.json(); }).then(function (res) {
      var el2 = ensureReportOverlay();
      var btn2 = el2.querySelector('#lanternReportModalSubmit');
      if (btn2) btn2.disabled = false;
      if (res && res.ok) toastReport('Report submitted. Staff will review.');
      else toastReport((res && res.error) ? String(res.error) : 'Report failed.');
      closeReportModal();
    }).catch(function () {
      var el3 = ensureReportOverlay();
      var btn3 = el3.querySelector('#lanternReportModalSubmit');
      if (btn3) btn3.disabled = false;
      toastReport('Report failed.');
      closeReportModal();
    });
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
    var author = String(item.authorDisplayName || 'Anonymous').trim();
    var dateStr = formatFeedItemDate(item);
    var typeLabel = feedItemTypeBadge(item);
    if (idw) idw.innerHTML = '';
    m.textContent = [author, typeLabel, dateStr].filter(Boolean).join(' · ');

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
        openPoll(pollId, opts);
        return;
      }
    }
    var el = ensureOverlay();
    var modal = el.querySelector('.lanternCardDetailModal');
    if (!modal) return;
    fillFeedItemDetailModal(modal, item, opts);
    el.classList.add('show');
    el.setAttribute('aria-hidden', 'false');
    var lastCard = opts.triggerEl || null;
    el._lanternFeedTriggerEl = lastCard;
    var closeBtn = el.querySelector('.lanternCardDetailClose');
    if (closeBtn) closeBtn.focus();
  }

  global.LanternCardUI = {
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
    mountStudioPollOpenedInto: mountStudioPollOpenedInto
  };
})(typeof window !== 'undefined' ? window : this);
