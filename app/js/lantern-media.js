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
  /* The Pages app proxies every /api/* path to this Worker (app/functions/api/[[path]].js) so
     lantern_pilot auth is first-party on the Pages host. Media URLs are sometimes stored/returned
     as this absolute Worker URL (an internal representation); rendering them same-origin avoids
     depending on the Worker's own hostname and matches how every other API call is already made. */
  var LANTERN_WORKER_MEDIA_RE = /^https?:\/\/lantern-api\.mrradle\.workers\.dev(\/api\/[^\s]*)$/i;
  /* No quote characters after encodeURIComponent — safe to inline in a double-quoted onerror attribute. */
  var TEACHER_IMG_FALLBACK_SVG = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 140"><rect width="200" height="140" fill="#1a2436"/><text x="100" y="82" text-anchor="middle" font-size="48" fill="#5a6b8c" font-family="system-ui,sans-serif">\uD83D\uDDBC</text></svg>');

  function isValidLinkUrl(url) {
    var s = String(url || '').trim();
    return s && LINK_REGEX.test(s) ? s.slice(0, LINK_MAX_LEN) : '';
  }

  /**
   * Rewrite an absolute lantern-api Worker URL to the same-origin Pages proxy path
   * (/api/...). Ordinary external https URLs and already-relative paths pass through
   * unchanged — this never weakens or broadens media authorization, it only changes
   * which host an already-authorized/public media URL is requested from.
   * @param {string} url
   * @returns {string}
   */
  function toSameOriginMediaUrl(url) {
    var s = String(url || '').trim();
    if (!s) return s;
    var m = s.match(LANTERN_WORKER_MEDIA_RE);
    return m ? m[1] : s;
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
    var imageUrl = toSameOriginMediaUrl((item && item.image_url && String(item.image_url).trim()) || (item && item.preview_url && String(item.preview_url).trim()) || '');
    var fullImageUrl = toSameOriginMediaUrl((item && item.full_image_url && String(item.full_image_url).trim()) || imageUrl);
    var videoUrl = toSameOriginMediaUrl((item && item.video_url && String(item.video_url).trim()) || '');
    var linkUrl = isValidLinkUrl(item && item.link_url);
    var photoCredit = (item && item.photo_credit && String(item.photo_credit).trim()) || '';

    if (variant === 'newsFeatured') {
      var imgF = fullImageUrl ? '<div class="newsCardImageWrap lanternProtectedMedia"><img class="newsCardImage lanternProtectedMedia" draggable="false" src="' + esc(fullImageUrl) + '" alt="" onerror="this.parentNode.style.display=\'none\'">' + (photoCredit ? '<div class="newsPhotoCredit">Photo: ' + esc(photoCredit) + '</div>' : '') + '</div>' : '';
      var vidF = videoUrl ? '<div class="newsCardVideoWrap lanternProtectedMedia" style="margin-bottom:12px;"><video class="newsCardVideo lanternProtectedMedia" draggable="false" controls preload="metadata" style="max-width:100%;max-height:320px;border-radius:12px;border:1px solid var(--line);" src="' + esc(videoUrl) + '"></video></div>' : '';
      var linkF = linkUrl ? '<div class="newsCardLinkWrap" style="margin-bottom:12px;padding:12px;border:1px solid var(--line);border-radius:12px;background:rgba(0,0,0,.2);"><div style="font-weight:800;font-size:20px;color:var(--muted);margin-bottom:6px;">Link</div><a href="' + esc(linkUrl) + '" target="_blank" rel="noopener noreferrer" style="word-break:break-all;color:var(--accent);">' + esc(linkUrl) + '</a></div>' : '';
      return { imgBlock: imgF, videoBlock: vidF, linkBlock: linkF };
    }

    if (variant === 'newsList') {
      var imgL = imageUrl ? '<div class="newsCardImageWrap lanternProtectedMedia"><img class="newsCardImage lanternProtectedMedia" draggable="false" src="' + esc(imageUrl) + '" alt="" onerror="this.parentNode.style.display=\'none\'">' + (photoCredit ? '<div class="newsPhotoCredit">Photo: ' + esc(photoCredit) + '</div>' : '') + '</div>' : '';
      var vidL = videoUrl ? '<div class="newsCardVideoWrap lanternProtectedMedia" style="margin-bottom:12px;"><video class="newsCardVideo lanternProtectedMedia" draggable="false" controls preload="metadata" style="max-width:100%;max-height:280px;border-radius:12px;border:1px solid var(--line);" src="' + esc(videoUrl) + '"></video></div>' : '';
      var linkL = linkUrl ? '<div class="newsCardLinkWrap" style="margin-bottom:12px;padding:12px;border:1px solid var(--line);border-radius:12px;background:rgba(0,0,0,.2);"><div style="font-weight:800;font-size:20px;color:var(--muted);margin-bottom:6px;">Link</div><a href="' + esc(linkUrl) + '" target="_blank" rel="noopener noreferrer" style="word-break:break-all;color:var(--accent);">' + esc(linkUrl) + '</a></div>' : '';
      return { imgBlock: imgL, videoBlock: vidL, linkBlock: linkL };
    }

    if (variant === 'detail') {
      /* Opened post surface (Explore/Profile): large media — not rail-sized. Fullscreen is wired in lantern-card-ui.js.
         Prompt #219 — image expand control is a compact LRHC icon on the image (not a bottom text button). */
      var imgD = fullImageUrl
        ? '<div class="lanternDetailMedia lanternDetailMedia--img"><div class="newsCardImageWrap lanternDetailMediaImageInner">' +
          '<button type="button" class="lanternDetailMediaExpandBtn" aria-label="View full image" title="View full image">⛶</button>' +
          '<img class="newsCardImage lanternProtectedMedia" draggable="false" src="' + esc(fullImageUrl) + '" alt="" onerror="this.parentNode.style.display=\'none\'">' +
          (photoCredit ? '<div class="newsPhotoCredit">Photo: ' + esc(photoCredit) + '</div>' : '') +
          '</div></div>'
        : '';
      var vidD = videoUrl
        ? '<div class="lanternDetailMedia lanternDetailMedia--video"><div class="newsCardVideoWrap lanternDetailMediaVideoInner">' +
          '<button type="button" class="lanternDetailMediaExpandBtn" aria-label="Full screen video" title="Full screen video">⛶</button>' +
          '<video class="newsCardVideo lanternProtectedMedia" draggable="false" controls preload="metadata" src="' + esc(videoUrl) + '"></video></div></div>'
        : '';
      var linkD = linkUrl
        ? '<div class="lanternDetailMedia lanternDetailMedia--link"><div class="newsCardLinkWrap" style="margin-bottom:12px;padding:12px;border:1px solid var(--line);border-radius:12px;background:rgba(0,0,0,.2);"><div style="font-weight:800;font-size:20px;color:var(--muted);margin-bottom:6px;">Link</div><a href="' + esc(linkUrl) + '" target="_blank" rel="noopener noreferrer" style="word-break:break-all;color:var(--accent);" onclick="event.stopPropagation();">' + esc(linkUrl) + '</a></div></div>'
        : '';
      var mediaBlockD = (imgD + vidD + linkD).trim();
      return { mediaBlock: mediaBlockD };
    }

    if (variant === 'explore') {
      /* Explore variant: blocks stay inside .exploreCardVisual only; overlays are CSS (badges), not title rows. */
      var BUILTIN_FB = 'assets/mission-card.png';
      var typeFb = (opts && opts.exploreTypeFallback) || 'assets/good-news.png';
      var uniFb = (opts && opts.exploreUniversalFallback) || BUILTIN_FB;
      var imgDataAttrs = ' data-lc-t="' + esc(typeFb) + '" data-lc-u="' + esc(uniFb) + '"';
      var imgErr = ' onerror="var el=this;var t=el.getAttribute(\'data-lc-t\');var u=el.getAttribute(\'data-lc-u\');var cur=el.getAttribute(\'src\')||\'\';if(el.dataset.lc!==\'1\'){el.dataset.lc=\'1\';if(t&&t!==cur){el.src=t;return;}el.onerror=null;if(u&&u!==cur)el.src=u;return;}el.onerror=null;if(u&&u!==cur)el.src=u;"';
      var mediaBlock = '';
      if (imageUrl) {
        mediaBlock = '<div class="lanternCardNewsMedia lanternCardNewsMedia--img lanternCardNewsMedia--railBound lanternProtectedMedia"><img class="lcCardImg lanternProtectedMedia" draggable="false" src="' + esc(imageUrl) + '" alt=""' + imgDataAttrs + imgErr + '></div>';
      } else if (videoUrl) {
        mediaBlock = '<div class="lanternCardNewsMedia lanternCardNewsMedia--img lanternCardNewsMedia--railBound lanternProtectedMedia"><img class="lcCardImg lanternProtectedMedia" draggable="false" src="assets/create-something.png" alt=""' + imgDataAttrs + imgErr + '></div>';
      } else if (linkUrl) {
        mediaBlock = '<div class="lanternCardNewsMedia lanternCardNewsMedia--link lanternCardNewsMedia--railBound">' +
          '<span class="lcExploreLinkFill" aria-hidden="true"></span>' +
          '<span class="lcExploreLinkGlyph" aria-hidden="true">🔗</span>' +
          '<a href="' + esc(linkUrl) + '" target="_blank" rel="noopener noreferrer" class="lcCardLink" onclick="event.stopPropagation();">' + esc(linkUrl) + '</a></div>';
      }
      return { mediaBlock: mediaBlock };
    }

    if (variant === 'teacher') {
      // Sensible fallback glyph only on actual <img> load error — never a browser broken-image
      // icon and never raw media URL text; the data URI has no quote characters so it is safe
      // to inline inside this attribute without any HTML-entity nesting tricks.
      var imgErrTeacher = ' onerror="this.onerror=null;this.src=\'' + TEACHER_IMG_FALLBACK_SVG + '\';this.style.opacity=\'.55\';this.title=\'Photo unavailable\';"';
      var imageHtml = (fullImageUrl) ? '<p style="margin:14px 0 8px 0;font-weight:800;font-size:22px;color:var(--muted);">Image</p><img class="reviewLargeImg lanternProtectedMedia" draggable="false" src="' + esc(fullImageUrl) + '" alt=""' + imgErrTeacher + '>' : '';
      var videoHtml = (videoUrl) ? '<p style="margin:14px 0 8px 0;font-weight:800;font-size:22px;color:var(--muted);">Video</p><video class="reviewVideo lanternProtectedMedia" draggable="false" controls preload="metadata" muted src="' + esc(videoUrl) + '"></video>' : '';
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
   * A mission of submission_type "text" may carry a JSON envelope { text, image_url }
   * instead of a plain string, when the student attached a photo alongside their text
   * response (mission allows_image = true). This mirrors the existing poll/bug_report
   * JSON-in-content convention already used elsewhere in submission_content.
   * @param {string} raw - trimmed submission_content string
   * @returns {{isEnvelope:boolean, text:string, image_url:string}}
   */
  function parseTextEnvelope(raw) {
    var s = String(raw || '').trim();
    if (s.length < 2 || s.charCodeAt(0) !== 123 /* '{' */) return { isEnvelope: false, text: '', image_url: '' };
    try {
      var parsed = JSON.parse(s);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) &&
        (typeof parsed.text === 'string' || typeof parsed.image_url === 'string' || typeof parsed.image === 'string' || typeof parsed.body === 'string' || typeof parsed.caption === 'string')) {
        return {
          isEnvelope: true,
          text: String(parsed.text || parsed.body || parsed.caption || parsed.note || '').trim(),
          image_url: String(parsed.image_url || parsed.image || '').trim()
        };
      }
    } catch (_) {}
    return { isEnvelope: false, text: '', image_url: '' };
  }

  /**
   * Normalize a mission submission item to the shape expected by renderMedia (image_url, video_url, link_url).
   * Precedence: image_url (from API, or from a text-type JSON envelope, or submission_content when
   * submission_type === 'image_url'), then video_url (from API or submission_content when
   * submission_type === 'video'), then link_url (submission_content when submission_type === 'link').
   * @param {Object} item - { submission_type?, submission_content?, image_url?, video_url? }
   * @returns {Object} - { image_url?, video_url?, link_url?, text? } for renderMedia (text set only when content is a parsed envelope)
   */
  function normalizeMissionItemForMedia(item) {
    if (!item) return {};
    var envelope = item.submission_type === 'text' ? parseTextEnvelope(item.submission_content) : { isEnvelope: false, text: '', image_url: '' };
    var imageUrl = toSameOriginMediaUrl((item.image_url && String(item.image_url).trim()) || (envelope.isEnvelope ? envelope.image_url : '') || (item.submission_type === 'image_url' && item.submission_content ? String(item.submission_content).trim().slice(0, 2000) : '') || '');
    var videoUrl = toSameOriginMediaUrl((item.video_url && String(item.video_url).trim()) || (item.submission_type === 'video' && item.submission_content ? String(item.submission_content).trim().slice(0, 2000) : '') || '');
    var linkUrl = (item.submission_type === 'link' && item.submission_content && LINK_REGEX.test(String(item.submission_content).trim())) ? String(item.submission_content).trim().slice(0, LINK_MAX_LEN) : '';
    var out = { image_url: imageUrl || undefined, video_url: videoUrl || undefined, link_url: linkUrl || undefined };
    // .text is always a string (never undefined) — media URLs/raw JSON must never leak into
    // caller code paths that fall back to "text is undefined => show raw submission_content".
    if (envelope.isEnvelope) out.text = envelope.text;
    else if (item.submission_type === 'text' && item.submission_content) out.text = String(item.submission_content).trim();
    else out.text = '';
    return out;
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
    parseTextEnvelope: parseTextEnvelope,
    isValidLinkUrl: isValidLinkUrl,
    toSameOriginMediaUrl: toSameOriginMediaUrl
  };
})(typeof window !== 'undefined' ? window : this);
