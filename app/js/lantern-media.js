/**
 * Lantern unified media (image, video, link) — shared render and payload helpers.
 * Used by News, Explore, and Teacher for display and submission.
 * Opened-post markup: variant `detail` (consumed by lantern-card-ui.js + lantern-cards.css).
 * DEAD SIMPLE: extraction only; no behavior change.
 * See docs/ui/LANTERN_RAIL_OPEN_FULLSCREEN_SYSTEM.md §3
 */
(function (global) {
  var LINK_MAX_LEN = 2000;
  var LINK_REGEX = /^https?:\/\//i;

  function isValidLinkUrl(url) {
    var s = String(url || '').trim();
    return s && LINK_REGEX.test(s) ? s.slice(0, LINK_MAX_LEN) : '';
  }

  /**
   * Render media blocks for display (news list, featured, explore card, teacher review).
   * @param {Object} item - { image_url?, video_url?, link_url?, photo_credit? }
   * @param {Object} opts - { esc: function(s), variant: 'newsFeatured'|'newsList'|'explore'|'detail'|'teacher' }
   * @returns {Object} - newsFeatured/newsList: { imgBlock, videoBlock, linkBlock }; explore: { mediaBlock }; teacher: { imageHtml, videoHtml, linkHtml }
   */
  function renderMedia(item, opts) {
    var esc = opts && typeof opts.esc === 'function' ? opts.esc : function (s) { return String(s || '').replace(/[&<>"']/g, function (c) { return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'; }); };
    var variant = (opts && opts.variant) || 'newsList';
    var imageUrl = (item && item.image_url && String(item.image_url).trim()) || (item && item.preview_url && String(item.preview_url).trim()) || '';
    var fullImageUrl = (item && item.full_image_url && String(item.full_image_url).trim()) || imageUrl;
    var videoUrl = (item && item.video_url && String(item.video_url).trim()) || '';
    var linkUrl = isValidLinkUrl(item && item.link_url);
    var photoCredit = (item && item.photo_credit && String(item.photo_credit).trim()) || '';

    if (variant === 'newsFeatured') {
      var imgF = fullImageUrl ? '<div class="newsCardImageWrap"><img class="newsCardImage" src="' + esc(fullImageUrl) + '" alt="" onerror="this.parentNode.style.display=\'none\'">' + (photoCredit ? '<div class="newsPhotoCredit">Photo: ' + esc(photoCredit) + '</div>' : '') + '</div>' : '';
      var vidF = videoUrl ? '<div class="newsCardVideoWrap" style="margin-bottom:12px;"><video class="newsCardVideo" controls preload="metadata" style="max-width:100%;max-height:320px;border-radius:12px;border:1px solid var(--line);" src="' + esc(videoUrl) + '"></video></div>' : '';
      var linkF = linkUrl ? '<div class="newsCardLinkWrap" style="margin-bottom:12px;padding:12px;border:1px solid var(--line);border-radius:12px;background:rgba(0,0,0,.2);"><div style="font-weight:800;font-size:20px;color:var(--muted);margin-bottom:6px;">Link</div><a href="' + esc(linkUrl) + '" target="_blank" rel="noopener noreferrer" style="word-break:break-all;color:var(--accent);">' + esc(linkUrl) + '</a></div>' : '';
      return { imgBlock: imgF, videoBlock: vidF, linkBlock: linkF };
    }

    if (variant === 'newsList') {
      var imgL = imageUrl ? '<div class="newsCardImageWrap"><img class="newsCardImage" src="' + esc(imageUrl) + '" alt="" onerror="this.parentNode.style.display=\'none\'">' + (photoCredit ? '<div class="newsPhotoCredit">Photo: ' + esc(photoCredit) + '</div>' : '') + '</div>' : '';
      var vidL = videoUrl ? '<div class="newsCardVideoWrap" style="margin-bottom:12px;"><video class="newsCardVideo" controls preload="metadata" style="max-width:100%;max-height:280px;border-radius:12px;border:1px solid var(--line);" src="' + esc(videoUrl) + '"></video></div>' : '';
      var linkL = linkUrl ? '<div class="newsCardLinkWrap" style="margin-bottom:12px;padding:12px;border:1px solid var(--line);border-radius:12px;background:rgba(0,0,0,.2);"><div style="font-weight:800;font-size:20px;color:var(--muted);margin-bottom:6px;">Link</div><a href="' + esc(linkUrl) + '" target="_blank" rel="noopener noreferrer" style="word-break:break-all;color:var(--accent);">' + esc(linkUrl) + '</a></div>' : '';
      return { imgBlock: imgL, videoBlock: vidL, linkBlock: linkL };
    }

    if (variant === 'detail') {
      /* Opened post surface (Explore/Profile): large media — not rail-sized. Fullscreen is wired in lantern-card-ui.js. */
      var imgD = fullImageUrl ? '<div class="lanternDetailMedia lanternDetailMedia--img"><div class="newsCardImageWrap"><img class="newsCardImage" src="' + esc(fullImageUrl) + '" alt="" onerror="this.parentNode.style.display=\'none\'">' + (photoCredit ? '<div class="newsPhotoCredit">Photo: ' + esc(photoCredit) + '</div>' : '') + '</div></div>' : '';
      var vidD = videoUrl
        ? '<div class="lanternDetailMedia lanternDetailMedia--video"><div class="newsCardVideoWrap lanternDetailMediaVideoInner">' +
          '<button type="button" class="lanternDetailMediaExpandBtn" aria-label="Full screen video">⛶</button>' +
          '<video class="newsCardVideo" controls preload="metadata" src="' + esc(videoUrl) + '"></video></div></div>'
        : '';
      var linkD = linkUrl
        ? '<div class="lanternDetailMedia lanternDetailMedia--link"><div class="newsCardLinkWrap" style="margin-bottom:12px;padding:12px;border:1px solid var(--line);border-radius:12px;background:rgba(0,0,0,.2);"><div style="font-weight:800;font-size:20px;color:var(--muted);margin-bottom:6px;">Link</div><a href="' + esc(linkUrl) + '" target="_blank" rel="noopener noreferrer" style="word-break:break-all;color:var(--accent);" onclick="event.stopPropagation();">' + esc(linkUrl) + '</a></div></div>'
        : '';
      var mediaBlockD = (imgD + vidD + linkD).trim();
      return { mediaBlock: mediaBlockD };
    }

    if (variant === 'explore') {
      /* Explore variant: blocks stay inside .exploreCardVisual only; overlays are CSS (badges), not title rows. */
      var BUILTIN_FB = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><defs><linearGradient id="x" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#2a3441"/><stop offset="100%" stop-color="#151c26"/></linearGradient></defs><rect width="640" height="360" fill="url(%23x)"/><text x="320" y="188" text-anchor="middle" fill="rgba(255,255,255,.42)" font-size="22" font-family="system-ui,sans-serif">Lantern</text></svg>');
      var typeFb = (opts && opts.exploreTypeFallback) || BUILTIN_FB;
      var uniFb = (opts && opts.exploreUniversalFallback) || BUILTIN_FB;
      var posterAttr = typeFb ? ' poster="' + esc(typeFb) + '"' : '';
      var imgDataAttrs = ' data-lc-t="' + esc(typeFb) + '" data-lc-u="' + esc(uniFb) + '"';
      var imgErr = ' onerror="var el=this;var t=el.getAttribute(\'data-lc-t\');var u=el.getAttribute(\'data-lc-u\');if(el.dataset.lc!==\'1\'){el.dataset.lc=\'1\';el.src=t;}else{el.src=u;}"';
      var mediaBlock = '';
      if (imageUrl) {
        mediaBlock = '<div class="lanternCardNewsMedia lanternCardNewsMedia--img lanternCardNewsMedia--railBound"><img class="lcCardImg" src="' + esc(imageUrl) + '" alt=""' + imgDataAttrs + imgErr + '></div>';
      } else if (videoUrl) {
        mediaBlock = '<div class="lanternCardNewsMedia lanternCardNewsMedia--video lanternCardNewsMedia--railBound"><video src="' + esc(videoUrl) + '"' + posterAttr + ' controls preload="metadata" class="lcCardVideo"></video></div>';
      } else if (linkUrl) {
        mediaBlock = '<div class="lanternCardNewsMedia lanternCardNewsMedia--link lanternCardNewsMedia--railBound">' +
          '<span class="lcExploreLinkFill" aria-hidden="true"></span>' +
          '<span class="lcExploreLinkGlyph" aria-hidden="true">🔗</span>' +
          '<a href="' + esc(linkUrl) + '" target="_blank" rel="noopener noreferrer" class="lcCardLink" onclick="event.stopPropagation();">' + esc(linkUrl) + '</a></div>';
      }
      return { mediaBlock: mediaBlock };
    }

    if (variant === 'teacher') {
      var imageHtml = (fullImageUrl) ? '<p style="margin:14px 0 8px 0;font-weight:800;font-size:22px;color:var(--muted);">Image</p><img class="reviewLargeImg" src="' + esc(fullImageUrl) + '" alt="">' : '';
      var videoHtml = (videoUrl) ? '<p style="margin:14px 0 8px 0;font-weight:800;font-size:22px;color:var(--muted);">Video</p><video class="reviewVideo" controls preload="metadata" muted src="' + esc(videoUrl) + '"></video>' : '';
      var linkHtml = (linkUrl) ? '<p style="margin:14px 0 8px 0;font-weight:800;font-size:22px;color:var(--muted);">Link</p><div style="padding:12px;border:1px solid var(--line);border-radius:12px;background:rgba(0,0,0,.2);"><a href="' + esc(linkUrl) + '" target="_blank" rel="noopener noreferrer" style="word-break:break-all;color:var(--accent);">' + esc(linkUrl) + '</a></div>' : '';
      return { imageHtml: imageHtml, videoHtml: videoHtml, linkHtml: linkHtml };
    }

    return { imgBlock: '', videoBlock: '', linkBlock: '' };
  }

  /**
   * Preview state for submission form (before upload). Used to build preview HTML if needed.
   * @param {Object} state - { imageDataUrl?, videoSrcUrl?, linkUrl? }
   * @param {Object} opts - { esc: function(s) }
   * @returns {Object} - { imagePreviewHtml, videoPreviewHtml, linkPreviewHtml } (optional use by callers)
   */
  function renderMediaPreview(state, opts) {
    var esc = opts && typeof opts.esc === 'function' ? opts.esc : function (s) { return String(s || '').replace(/[&<>"']/g, function (c) { return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'; }); };
    var imagePreviewHtml = (state && state.imageDataUrl) ? '<img id="newsImagePreview" alt="Preview" src="' + esc(state.imageDataUrl) + '">' : '';
    var videoPreviewHtml = (state && state.videoSrcUrl) ? '<video id="newsVideoPreviewEl" controls preload="metadata" style="max-width:100%;max-height:200px;border-radius:12px;border:1px solid var(--line);display:block;margin-bottom:8px;" src="' + esc(state.videoSrcUrl) + '"></video>' : '';
    var linkUrl = isValidLinkUrl(state && state.linkUrl);
    var linkPreviewHtml = linkUrl ? '<div style="font-weight:800;font-size:20px;color:var(--muted);margin-bottom:6px;">Link</div><a id="newsLinkPreviewUrl" href="' + esc(linkUrl) + '" target="_blank" rel="noopener noreferrer" style="word-break:break-all;color:var(--accent);">' + esc(linkUrl) + '</a>' : '';
    return { imagePreviewHtml: imagePreviewHtml, videoPreviewHtml: videoPreviewHtml, linkPreviewHtml: linkPreviewHtml };
  }

  /**
   * Normalize a mission submission item to the shape expected by renderMedia (image_url, video_url, link_url).
   * Precedence: image_url (from API or submission_content when submission_type === 'image_url'),
   * then video_url (from API or submission_content when submission_type === 'video'),
   * then link_url (submission_content when submission_type === 'link').
   * @param {Object} item - { submission_type?, submission_content?, image_url?, video_url? }
   * @returns {Object} - { image_url?, video_url?, link_url? } for renderMedia
   */
  function normalizeMissionItemForMedia(item) {
    if (!item) return {};
    var imageUrl = (item.image_url && String(item.image_url).trim()) || (item.submission_type === 'image_url' && item.submission_content ? String(item.submission_content).trim().slice(0, 2000) : '') || '';
    var videoUrl = (item.video_url && String(item.video_url).trim()) || (item.submission_type === 'video' && item.submission_content ? String(item.submission_content).trim().slice(0, 2000) : '') || '';
    var linkUrl = (item.submission_type === 'link' && item.submission_content && LINK_REGEX.test(String(item.submission_content).trim())) ? String(item.submission_content).trim().slice(0, LINK_MAX_LEN) : '';
    return { image_url: imageUrl || undefined, video_url: videoUrl || undefined, link_url: linkUrl || undefined };
  }

  /**
   * Normalize media fields for submission payload. Validates link_url; passes through image/video keys.
   * @param {Object} state - { image_r2_key?, image_file_name?, image_mime_type?, image_file_size?, video_r2_key?, video_file_name?, video_mime_type?, video_file_size?, link_url? }
   * @returns {Object} - subset to merge into create payload (link_url validated and sliced)
   */
  function normalizeMediaPayload(state) {
    var out = {};
    if (state && state.image_r2_key != null && String(state.image_r2_key).trim()) {
      out.image_r2_key = String(state.image_r2_key).trim();
      if (state.image_file_name != null) out.image_file_name = String(state.image_file_name).trim();
      if (state.image_mime_type != null) out.image_mime_type = String(state.image_mime_type).trim();
      if (state.image_file_size != null) out.image_file_size = Math.max(0, parseInt(state.image_file_size, 10));
    }
    if (state && state.video_r2_key != null && String(state.video_r2_key).trim()) {
      out.video_r2_key = String(state.video_r2_key).trim();
      if (state.video_file_name != null) out.video_file_name = String(state.video_file_name).trim();
      if (state.video_mime_type != null) out.video_mime_type = String(state.video_mime_type).trim();
      if (state.video_file_size != null) out.video_file_size = Math.max(0, parseInt(state.video_file_size, 10));
    }
    var link = isValidLinkUrl(state && state.link_url);
    if (link) out.link_url = link;
    return out;
  }

  global.LanternMedia = {
    renderMedia: renderMedia,
    renderMediaPreview: renderMediaPreview,
    normalizeMediaPayload: normalizeMediaPayload,
    normalizeMissionItemForMedia: normalizeMissionItemForMedia,
    isValidLinkUrl: isValidLinkUrl
  };
})(typeof window !== 'undefined' ? window : this);
