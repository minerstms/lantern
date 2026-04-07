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
    host.querySelectorAll('.lanternDetailMedia--img img').forEach(function (img) {
      if (img.closest('a')) return;
      img.style.cursor = 'zoom-in';
      img.addEventListener('click', function (e) {
        e.stopPropagation();
        openMediaFullscreen('image', { src: img.currentSrc || img.src });
      });
    });
    host.querySelectorAll('.lanternDetailMediaExpandBtn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
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
        return r.json().then(function (j) {
          if (global.LanternAuth && typeof global.LanternAuth.redirectIfPasswordChangeRequired === 'function') {
            if (global.LanternAuth.redirectIfPasswordChangeRequired(r, j)) return { blocked: true };
          }
          return { okHttp: r.ok, body: j };
        });
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
        'Remove this item from student-facing Explore feeds. It stays in the database; use Admin → Feed visibility to restore if needed.';
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
        postExploreAdminHide(path, postBody).then(function (res) {
          if (res && res.blocked) {
            exploreAdminDetailModLog('hide', id, typeStr, true, path, { blocked: true });
            btn.disabled = false;
            return;
          }
          var body = res && res.body ? res.body : {};
          exploreAdminDetailModLog('hide', id, typeStr, true, path, body);
          if (res && res.okHttp && body && body.ok) {
            var toast = global.document.getElementById('toast');
            if (toast) {
              toast.textContent = 'Removed from student view';
              toast.style.display = 'block';
              setTimeout(function () {
                toast.style.display = 'none';
              }, 2400);
            }
            closeDetail();
            if (typeof global.refreshExploreExplore === 'function') global.refreshExploreExplore();
          } else {
            btn.disabled = false;
            try {
              global.alert((body && body.error) ? String(body.error) : 'Could not remove item');
            } catch (e2) {}
          }
        }).catch(function () {
          exploreAdminDetailModLog('hide', id, typeStr, true, path, { error: 'network' });
          btn.disabled = false;
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
    html += '<p class="lanternCardDetailMuted" style="margin-top:16px;">Preview — votes and nuggets work on Explore after approval.</p></div></div>';
    container.innerHTML = html;
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
      var raw = global.localStorage.getItem('LANTERN_ADOPTED_CHARACTER');
      if (raw) {
        var o = JSON.parse(raw);
        if (o && o.name) return String(o.name).trim();
      }
    } catch (e) {}
    return '';
  }

  function buildPollResultsBarsHtml(results) {
    var total = (results || []).reduce(function (s, r) { return s + (r.count || 0); }, 0);
    var html = '<p style="font-size:20px;color:var(--muted);margin-bottom:12px;">You voted · ' + total + ' total vote' + (total !== 1 ? 's' : '') + '</p>';
    (results || []).forEach(function (r) {
      html += '<div class="pollResultRow"><div class="pollResultLabel"><span>' + esc(r.choice || '') + '</span><span>' + (r.percentage || 0) + '% · ' + (r.count || 0) + ' vote' + ((r.count || 0) !== 1 ? 's' : '') + '</span></div><div class="pollBarTrack"><div class="pollBarFill" style="width:' + (r.percentage || 0) + '%;"></div></div></div>';
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
        '<div class="newsCardImageWrap"><img class="newsCardImage" src="' + esc(imgUrl) + '" alt="" onerror="this.parentNode.style.display=\'none\'" /></div>' +
        '</div></div>';
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

    r.innerHTML = '';

    if (hasVoted && results && results.length && choicesEl && resultsEl && nuggetEl) {
      choicesEl.innerHTML = '';
      resultsEl.innerHTML = buildPollResultsBarsHtml(results);
      resultsEl.style.display = 'block';
      nuggetEl.style.display = 'none';
    } else if (choicesEl && resultsEl && nuggetEl) {
      resultsEl.style.display = 'none';
      nuggetEl.style.display = 'none';
      choicesEl.innerHTML = '';
      (p.choices || []).forEach(function (choice, idx) {
        var btn = global.document.createElement('button');
        btn.type = 'button';
        btn.className = 'pollChoiceBtn';
        btn.textContent = choice || ('Choice ' + (idx + 1));
        btn.addEventListener('click', function () {
          if (!characterName) {
            try {
              global.alert('Select a student in Locker → Overview to vote.');
            } catch (e3) {}
            return;
          }
          btn.disabled = true;
          global.fetch(apiBase + '/api/polls/vote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ poll_id: pollId, character_name: characterName, choice_index: idx })
          })
            .then(function (r) { return r.json(); })
            .then(function (voteRes) {
              if (!voteRes || !voteRes.ok) {
                btn.disabled = false;
                try {
                  global.alert(voteRes && voteRes.error ? voteRes.error : 'Vote failed');
                } catch (e4) {}
                return;
              }
              var c2 = modalRoot.querySelector('#lanternPollDetailChoices');
              var r2 = modalRoot.querySelector('#lanternPollDetailResults');
              var n2 = modalRoot.querySelector('#lanternPollDetailNugget');
              if (c2) c2.innerHTML = '';
              if (r2) {
                r2.innerHTML = buildPollResultsBarsHtml(voteRes.results || []);
                r2.style.display = 'block';
              }
              if (n2) {
                if (voteRes.voter_nuggets) n2.textContent = '+1 nugget for participating!';
                n2.style.display = voteRes.voter_nuggets ? 'block' : 'none';
              }
            })
            .catch(function () {
              btn.disabled = false;
            });
        });
        choicesEl.appendChild(btn);
      });
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
    global.fetch(apiBase + '/api/polls/' + encodeURIComponent(pollId) + (characterName ? '?character_name=' + encodeURIComponent(characterName) : ''))
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
      var raw = global.localStorage.getItem('LANTERN_ADOPTED_CHARACTER');
      if (raw) {
        var o = JSON.parse(raw);
        if (o && o.name) reportedBy = String(o.name).trim();
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

  global.LanternCardUI = {
    openCreation: openCreation,
    openNews: openNews,
    openPoll: openPoll,
    openTextDetail: openTextDetail,
    closeDetail: closeDetail,
    ensureOverlay: ensureOverlay,
    openReportModal: openReportModal,
    closeReportModal: closeReportModal,
    newsRoleLabelFromAuthorType: newsRoleLabelFromAuthorType,
    fillNewsDetailModal: fillNewsDetailModal,
    fillCreationDetailModal: fillCreationDetailModal,
    fillPollDetailModal: fillPollDetailModal,
    mountNewsDetailInto: mountNewsDetailInto,
    mountCreationDetailInto: mountCreationDetailInto,
    mountPollOpenedInto: mountPollOpenedInto
  };
})(typeof window !== 'undefined' ? window : this);
