/**
 * Lantern canonical card system — single rail layout only (media, title, identity, meta). See docs/LANTERN_SYSTEM_CONTEXT.md §10 (archived: docs/archive/CARD_SYSTEM.md).
 * Depends: LANTERN_AVATAR_API (optional), LanternMedia (optional).
 */
(function (global) {
  'use strict';

  var TYPE_ICONS = { image: '📷', link: '🔗', video: '🎬', webapp: '📱', project: '📂', poll: '📊', teach: '🧠', create: '🛠', news: '📢', shoutout: '⭐' };
  /** Top-right type badges: always icon + short label (single format for all standard cards). */
  var TYPE_BADGES = {
    poll: '📊 Poll',
    teach: '🧠 Teach',
    create: '🛠 Create',
    news: '📢 News',
    shoutout: '⭐ Shoutout',
    image: '📷 Image',
    video: '🎬 Video',
    link: '🔗 Link',
    project: '📂 Project',
    webapp: '📱 App'
  };

  var CARD_MODE = { RAIL: 'rail', OPENED: 'opened' };
  /** Single outer shell: fixed width/height via CSS vars; no type/size layout variants. */
  var HARD_RAIL_SHELL_CLASS = 'exploreCard exploreCard--rail railCardShell medium exploreCard--size-rail lcCardHardLayout';
  /** Factory stamp — must match LanternCanonicalEnforce.FACTORY_EXPECTED */
  var CARD_FACTORY = 'LanternCards';
  var CARD_CONTRACT_VERSION = '1';

  function applyFactoryStampToCardElement(cardEl) {
    if (!cardEl || !cardEl.setAttribute) return;
    cardEl.setAttribute('data-lantern-card-factory', CARD_FACTORY);
    cardEl.setAttribute('data-lantern-card-contract-version', CARD_CONTRACT_VERSION);
  }

  var TOPIC_TO_LIBRARY = [
    { keywords: ['robot', 'robotics', 'engineering', 'build', 'machine'], category: 'robotics' },
    { keywords: ['code', 'coding', 'programming', 'script', 'developer'], category: 'coding' },
    { keywords: ['ai', 'artificial intelligence', 'machine learning', 'neural'], category: 'ai' },
    { keywords: ['art', 'design', 'drawing', 'paint', 'creative'], category: 'art' },
    { keywords: ['school', 'student', 'class', 'community', 'news', 'report', 'life'], category: 'school-life' },
    { keywords: ['abstract', 'idea', 'think'], category: 'abstract' }
  ];
  var LIBRARY_IMAGE_COUNTS = { robotics: 3, coding: 3, ai: 3, engineering: 3, art: 3, 'school-life': 3, abstract: 3 };

  function stripHtmlToText(html) {
    return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /** Strip layout-affecting shell tokens; semantic classes (pollCard, gamesHubPlayCard, …) remain. */
  function mergeShellExtras(opts) {
    opts = opts || {};
    var raw = String(opts.classNames || '').trim();
    if (!raw) return '';
    return raw.split(/\s+/).filter(Boolean).filter(function (t) {
      if (/^type-/i.test(t)) return false;
      if (t === 'exploreCard--size-wide' || t === 'exploreCard--size-compact' || t === 'exploreCard--size-rail') return false;
      if (t === 'hero' || t === 'compact' || t === 'medium') return false;
      return true;
    }).join(' ');
  }

  function apiBase() {
    return (typeof global !== 'undefined' && global.LANTERN_AVATAR_API) ? String(global.LANTERN_AVATAR_API).replace(/\/$/, '') : '';
  }

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;';
    });
  }

  function truncateMeta(s, max) {
    var t = String(s || '').replace(/\s+/g, ' ').trim();
    if (t.length <= (max || 76)) return t;
    return t.slice(0, (max || 76) - 1) + '…';
  }

  /** Rail title row: keep within two typographic lines (inspectRailContract TITLE_EXCEEDS_TWO_LINES); line-clamp scrollHeight can lie in WebKit. */
  function truncateRailTitleTwoLines(s, maxLen) {
    var t = String(s || '').replace(/\s+/g, ' ').trim();
    var max = maxLen != null ? maxLen : 36;
    if (t.length <= max) return t;
    return t.slice(0, max - 1) + '\u2026';
  }

  /** Rail identity row: first whitespace-delimited token (given name); empty → Anonymous. */
  function railIdentityFirstName(displayName) {
    var s = String(displayName || '').replace(/\s+/g, ' ').trim();
    if (!s) return 'Anonymous';
    var i = s.indexOf(' ');
    if (i === -1) return s;
    return s.slice(0, i);
  }

  /**
   * Canonical interior row wrapper — same zone grammar for every card (see lantern-cards.css .lcRailRow--*).
   * Zones: media | title | identity | meta only (no body/footer).
   */
  function lcRailRow(zone, innerHtml, extraClass) {
    var z = String(zone || 'body').replace(/[^a-z-]/gi, '');
    var h = String(innerHtml || '').trim();
    if (!h) return '';
    var xc = String(extraClass || '').trim();
    return '<div class="lcRailRow lcRailRow--' + z + (xc ? ' ' + xc : '') + '">' + h + '</div>';
  }

  /** Row 3 only: avatar + given name (see lantern-canonical-enforce inspectRailContract). */
  function lcRailIdentityRow(displayName, avatarPost) {
    avatarPost = avatarPost || {};
    var first = esc(railIdentityFirstName(String(displayName || '').trim() || 'Lantern'));
    var av = buildExploreAuthorAvatarHtml(avatarPost);
    return lcRailRow('identity', '<div class="exploreCardIdentity exploreCardIdentity--rail">' + av + '<span class="exploreAuthor exploreAuthor--identity">' + first + '</span></div>');
  }

  /**
   * Bottom-right report control on every .exploreCard root. data-report-type / data-report-id on the card.
   * Empty id → button visible but disabled (Pass 1: API only supports subset of types).
   */
  function applyReportControl(cardEl) {
    if (!cardEl || !cardEl.classList || !cardEl.classList.contains('exploreCard')) return;
    if (cardEl.querySelector(':scope > .exploreCardReportBtn')) return;
    var rid = (cardEl.getAttribute('data-report-id') || '').trim();
    var disabled = !rid;
    var btn = global.document.createElement('button');
    btn.type = 'button';
    btn.className = 'exploreCardReportBtn';
    btn.setAttribute('aria-label', disabled ? 'Report unavailable for this item' : 'Report');
    if (disabled) btn.setAttribute('aria-disabled', 'true');
    btn.innerHTML = '<span class="exploreCardReportBtnIcon" aria-hidden="true">\u2691</span>';
    if (disabled) btn.disabled = true;
    if (disabled) cardEl.classList.add('exploreCard--reportDisabled');
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (btn.disabled) return;
      if (global.LanternCardUI && typeof global.LanternCardUI.openReportModal === 'function') {
        global.LanternCardUI.openReportModal({
          reportType: cardEl.getAttribute('data-report-type') || '',
          reportId: cardEl.getAttribute('data-report-id') || ''
        });
      }
    });
    btn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    cardEl.appendChild(btn);
  }

  /** Sibling report button for game link wraps (button must not be inside <a>). */
  function applyReportControlToOuterWrap(wrapEl) {
    if (!wrapEl || !wrapEl.classList || !wrapEl.classList.contains('exploreCardOuterWrap')) return;
    if (wrapEl.querySelector(':scope > .exploreCardReportBtn')) return;
    var a = wrapEl.querySelector('a.exploreCard');
    if (!a) return;
    var rid = (a.getAttribute('data-report-id') || '').trim();
    var disabled = !rid;
    var btn = global.document.createElement('button');
    btn.type = 'button';
    btn.className = 'exploreCardReportBtn';
    btn.setAttribute('aria-label', disabled ? 'Report unavailable for this item' : 'Report');
    if (disabled) btn.setAttribute('aria-disabled', 'true');
    btn.innerHTML = '<span class="exploreCardReportBtnIcon" aria-hidden="true">\u2691</span>';
    if (disabled) btn.disabled = true;
    if (disabled) wrapEl.classList.add('exploreCardOuterWrap--reportDisabled');
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (btn.disabled) return;
      if (global.LanternCardUI && typeof global.LanternCardUI.openReportModal === 'function') {
        global.LanternCardUI.openReportModal({
          reportType: a.getAttribute('data-report-type') || '',
          reportId: a.getAttribute('data-report-id') || ''
        });
      }
    });
    btn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    wrapEl.appendChild(btn);
  }

  function enhanceReportControlsIn(rootEl) {
    if (!rootEl || !rootEl.querySelectorAll) return;
    rootEl.querySelectorAll('.exploreCardOuterWrap').forEach(function (w) { applyReportControlToOuterWrap(w); });
    rootEl.querySelectorAll('.exploreCard').forEach(function (card) {
      if (card.closest('.exploreCardOuterWrap') && card.tagName && String(card.tagName).toLowerCase() === 'a') return;
      applyReportControl(card);
    });
    try {
      if (global.LanternCanonicalEnforce && typeof global.LanternCanonicalEnforce.scanAllExploreCards === 'function') {
        var doc = rootEl && rootEl.ownerDocument ? rootEl.ownerDocument : global.document;
        if (global.requestAnimationFrame) {
          global.requestAnimationFrame(function () { global.LanternCanonicalEnforce.scanAllExploreCards(doc); });
        } else {
          global.LanternCanonicalEnforce.scanAllExploreCards(doc);
        }
      }
    } catch (err) {
      if (global.console && global.console.warn) global.console.warn('[LanternCards] canonical cancer scan skipped', err);
    }
  }

  function getDefaultImageKey(type) {
    var t = (type || '').toLowerCase();
    if (t === 'poll') return 'default/default_poll.png';
    if (t === 'news') return 'default/default_news.png';
    if (t === 'creation' || t === 'create') return 'default/default_creation.png';
    if (t === 'explain') return 'default/default_explain.png';
    if (t === 'shoutout') return 'default/default_shoutout.png';
    return 'default/default_creation.png';
  }

  function getDefaultImageUrl(type) {
    var b = apiBase();
    return b ? b + '/api/media/image?key=' + encodeURIComponent(getDefaultImageKey(type || 'creation')) : '';
  }

  function getDefaultAvatarImageKey() {
    return 'default/default_avatar.png';
  }

  /** Inline SVG when Worker media is unavailable — never blank. */
  function svgDefaultAvatarDataUri() {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#2a3a52"/><circle cx="32" cy="26" r="12" fill="rgba(255,255,255,.35)"/><ellipse cx="32" cy="52" rx="18" ry="14" fill="rgba(255,255,255,.38)"/></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  /** Canonical default author avatar for cards — always resolves to a URL or data URI. */
  function getDefaultAvatarImageUrl() {
    var b = apiBase();
    return b ? b + '/api/media/image?key=' + encodeURIComponent(getDefaultAvatarImageKey()) : svgDefaultAvatarDataUri();
  }

  /** Row-3 parity: legacy emoji `avatar` → single data-URI img (same node shape as photo URLs). */
  function emojiAvatarSvgDataUri(emoji) {
    var e = String(emoji != null ? emoji : '').trim().slice(0, 12);
    if (!e) return '';
    if (/^https?:\/\//i.test(e) || e.indexOf('data:') === 0 || (e.charAt(0) === '/' && e.length > 1)) return '';
    var safe = e.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#2a3a52"/><text x="32" y="40" text-anchor="middle" font-size="26" font-family="Segoe UI Emoji,Apple Color Emoji,Noto Color Emoji,system-ui,sans-serif">' + safe + '</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function accountKeyFromCardModel(p) {
    p = p || {};
    return String(p.character_name || p.author_name || '').trim();
  }

  /**
   * Row-3 avatar chip: identity rows MUST use LanternAvatar — pre-resolve `_canonicalAvatar` on the model
   * (see LanternAvatar.attachCanonicalAvatarsToItems). Do not pass custom_avatar / avatar_image / URL fields here.
   * Non-account rails (games, missions label) omit character_name and use decorative emoji only.
   */
  function buildExploreAuthorAvatarHtml(p) {
    p = p || {};
    var def = getDefaultAvatarImageUrl();
    var svgFb = svgDefaultAvatarDataUri();
    var frameVal = String(p.frame || 'none').trim().replace(/_/g, '-').replace(/[^a-z0-9-]/gi, '') || 'none';
    var ak = accountKeyFromCardModel(p);
    var defEm = global.LanternAvatar && global.LanternAvatar.DEFAULT_EMOJI ? global.LanternAvatar.DEFAULT_EMOJI : '🌟';
    if (ak && !p._canonicalAvatar && global.LANTERN_AVATAR_STRICT_IDENTITY && global.console && global.console.warn) {
      global.console.warn('[LanternCards] Identity chip missing _canonicalAvatar — call LanternAvatar.attachCanonicalAvatarsToItems first:', ak);
    }
    if (ak && p._canonicalAvatar && typeof p._canonicalAvatar === 'object') {
      var canon = p._canonicalAvatar;
      var primary = (canon.imageUrl && String(canon.imageUrl).trim()) ? String(canon.imageUrl).trim() : '';
      var em = (canon.emoji && String(canon.emoji).trim()) ? String(canon.emoji).trim() : defEm;
      var emojiUri = '';
      if (!primary) emojiUri = emojiAvatarSvgDataUri(em);
      var src = primary || emojiUri || def;
      return '<span class="identity-chip frame-' + frameVal + '">' +
        '<img class="exploreCardAvatarImg" src="' + esc(src) + '" alt="" data-lc-av-def="' + esc(def) + '" data-lc-av-svg="' + esc(svgFb) + '" ' +
        'onerror="var el=this;var d=el.getAttribute(\'data-lc-av-def\');var s=el.getAttribute(\'data-lc-av-svg\');if(el.dataset.lc===\'1\'){el.onerror=null;el.src=s;return;}el.dataset.lc=\'1\';el.src=d||s;">' +
        '</span>';
    }
    if (ak) {
      var legForAk = global.LanternAvatar && typeof global.LanternAvatar.getLegacyEmojiForCharacter === 'function'
        ? global.LanternAvatar.getLegacyEmojiForCharacter(ak)
        : defEm;
      var srcMissing = emojiAvatarSvgDataUri(legForAk) || def;
      return '<span class="identity-chip frame-' + frameVal + '">' +
        '<img class="exploreCardAvatarImg" src="' + esc(srcMissing) + '" alt="" data-lc-av-def="' + esc(def) + '" data-lc-av-svg="' + esc(svgFb) + '" ' +
        'onerror="var el=this;var d=el.getAttribute(\'data-lc-av-def\');var s=el.getAttribute(\'data-lc-av-svg\');if(el.dataset.lc===\'1\'){el.onerror=null;el.src=s;return;}el.dataset.lc=\'1\';el.src=d||s;">' +
        '</span>';
    }
    var rawAv = String(p.avatar != null ? p.avatar : '').trim();
    var emojiUri = '';
    if (rawAv && rawAv.length <= 12 && !/^https?:\/\//i.test(rawAv) && rawAv.indexOf('data:') !== 0 && !(rawAv.charAt(0) === '/' && rawAv.length > 1)) {
      emojiUri = emojiAvatarSvgDataUri(rawAv);
    }
    var src = emojiUri || def;
    return '<span class="identity-chip frame-' + frameVal + '">' +
      '<img class="exploreCardAvatarImg" src="' + esc(src) + '" alt="" data-lc-av-def="' + esc(def) + '" data-lc-av-svg="' + esc(svgFb) + '" ' +
      'onerror="var el=this;var d=el.getAttribute(\'data-lc-av-def\');var s=el.getAttribute(\'data-lc-av-svg\');if(el.dataset.lc===\'1\'){el.onerror=null;el.src=s;return;}el.dataset.lc=\'1\';el.src=d||s;">' +
      '</span>';
  }

  function getTopicLibraryKey(title, description, question) {
    var text = ((title || '') + ' ' + (description || '') + ' ' + (question || '')).toLowerCase();
    if (!text.trim()) return null;
    for (var i = 0; i < TOPIC_TO_LIBRARY.length; i++) {
      var row = TOPIC_TO_LIBRARY[i];
      for (var j = 0; j < row.keywords.length; j++) {
        if (text.indexOf(row.keywords[j]) !== -1) {
          var cat = row.category;
          var n = LIBRARY_IMAGE_COUNTS[cat] || 3;
          var hash = 0;
          for (var k = 0; k < text.length; k++) hash = ((hash << 5) - hash) + text.charCodeAt(k) | 0;
          var idx = (Math.abs(hash) % n) + 1;
          var name = cat === 'school-life' ? 'school-life' : cat;
          return 'library/' + cat + '/' + name + '_' + idx + '.png';
        }
      }
    }
    return null;
  }

  function getTopicLibraryImageUrl(p) {
    var key = getTopicLibraryKey(p.title, p.description, p.question);
    var b = apiBase();
    return key && b ? b + '/api/media/image?key=' + encodeURIComponent(key) : '';
  }

  function getCardImageUrl(p) {
    var url = (p.url || p.preview_src || p.image || p.thumbnail || p.image_url || '').trim();
    if (url) return url;
    var topicUrl = getTopicLibraryImageUrl(p);
    if (topicUrl) return topicUrl;
    return getDefaultImageUrl(p.type || p.mission_type || 'creation');
  }

  function svgSpecForContentType(type) {
    var t = (type || '').toLowerCase();
    if (t === 'news' || t === 'shoutout') return { a: '#3a4f6e', b: '#1c2838', label: 'News' };
    if (t === 'poll') return { a: '#4a3a5c', b: '#261d32', label: 'Poll' };
    if (t === 'teach' || t === 'explain') return { a: '#2a4d45', b: '#182a24', label: 'Learn' };
    if (t === 'activity' || t === 'mission' || t === 'school') return { a: '#3d4f36', b: '#222818', label: 'School' };
    if (t === 'recognition' || t === 'spotlight') return { a: '#5a4535', b: '#302418', label: 'Spotlight' };
    if (t === 'create' || t === 'image' || t === 'video' || t === 'link' || t === 'project' || t === 'webapp' || t === 'creation') return { a: '#2a4f5c', b: '#182830', label: 'Create' };
    return { a: '#2c3a4f', b: '#161d28', label: 'Lantern' };
  }

  function svgTypeFallbackDataUri(type) {
    var s = svgSpecForContentType(type);
    var lab = String(s.label || 'Lantern').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="' + s.a + '"/><stop offset="100%" stop-color="' + s.b + '"/></linearGradient></defs><rect width="640" height="360" fill="url(#g)"/><text x="320" y="185" text-anchor="middle" fill="rgba(255,255,255,.38)" font-size="21" font-family="system-ui,sans-serif">' + lab + '</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function svgUniversalLanternDataUri() {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><defs><linearGradient id="u" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#1a2d48"/><stop offset="50%" stop-color="#2a2440"/><stop offset="100%" stop-color="#1a3830"/></linearGradient></defs><rect width="640" height="360" fill="url(#u)"/><circle cx="320" cy="165" r="34" fill="none" stroke="rgba(242,194,48,.45)" stroke-width="3"/><text x="320" y="228" text-anchor="middle" fill="rgba(255,255,255,.48)" font-size="24" font-weight="700" font-family="system-ui,sans-serif">Lantern</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function buildGuaranteedExploreImageHtml(contentType, primaryUrl) {
    var typeSvg = svgTypeFallbackDataUri(contentType);
    var uniSvg = svgUniversalLanternDataUri();
    var def = getDefaultImageUrl(contentType);
    var remote = String(primaryUrl || '').trim() || String(def || '').trim() || typeSvg;
    return '<img class="lcCardImg" src="' + esc(remote) + '" alt="" data-lc-t="' + esc(typeSvg) + '" data-lc-u="' + esc(uniSvg) + '" onerror="var el=this;var t=el.getAttribute(\'data-lc-t\');var u=el.getAttribute(\'data-lc-u\');if(el.dataset.lc!==\'1\'){el.dataset.lc=\'1\';el.src=t;}else{el.src=u;}">';
  }

  /** Canonical card stamp for rail shells — opts.lanternCardType overrides class inference. */
  function inferLanternCardTypeFromOpts(opts, classNames) {
    opts = opts || {};
    if (opts.lanternCardType != null && String(opts.lanternCardType).trim() !== '') {
      return String(opts.lanternCardType).trim();
    }
    var s = String(classNames || '');
    if (/\bmissionSpotlightCard\b/.test(s)) return 'mission';
    if (/\bpollCard\b/.test(s)) return 'poll';
    if (/\bgamesHubPlayCard\b/.test(s)) return 'game_hub';
    if (/\bgameHighlightCard\b/.test(s)) return 'game_highlight';
    if (/\bexploreCard--activityPulse\b/.test(s)) return 'activity';
    if (/\bexploreCard--gamesLbSummary\b/.test(s)) return 'games_leaderboard';
    if (/\bexploreCardProfileRail\b/.test(s)) return 'profile_rail';
    if (/\bexploreCard--cosmeticRail\b/.test(s)) return 'cosmetic';
    if (/\bexploreCard--leaderboardChip\b/.test(s)) return 'leaderboard_chip';
    if (/\bexploreCard--displayNewsTile\b/.test(s)) return 'display_news';
    if (/\brailStressVerifyFake\b/.test(s)) return 'verify_stress_creation';
    var m = s.match(/\btype-([a-z0-9_-]+)\b/i);
    if (m) return m[1];
    return 'rail';
  }

  /**
   * THE single student-facing card markup grammar: kind === 'rail' only (navHref uses same markup as legacy link wrap).
   */
  function studentFacingCardHtml(spec) {
    spec = spec || {};
    var kind = spec.kind;

    if (kind === 'rail') {
      var innerHtml = spec.innerStackHtml != null ? spec.innerStackHtml : '';
      var opts = spec.shell || {};
      var extraR = mergeShellExtras(opts);
      var shellClass = (HARD_RAIL_SHELL_CLASS + (extraR ? ' ' + extraR : '')).replace(/\s+/g, ' ').trim();
      var ct = inferLanternCardTypeFromOpts(opts, shellClass);
      var dataAttrs = opts.dataAttrs || {};
      var partsD = [];
      for (var k in dataAttrs) {
        if (dataAttrs.hasOwnProperty(k) && dataAttrs[k] !== '') {
          partsD.push(' data-' + k.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '') + '="' + esc(String(dataAttrs[k])) + '"');
        }
      }
      var dataStr = partsD.join('');
      var rt = opts.reportType != null ? esc(String(opts.reportType)) : '';
      var rid = opts.reportId != null ? esc(String(opts.reportId)) : '';
      var reportData = ' data-report-type="' + rt + '" data-report-id="' + rid + '"';
      var canonicalStamp = ' data-lantern-card="true" data-lantern-brand="lantern" data-lantern-card-factory="' + CARD_FACTORY + '" data-lantern-card-contract-version="' + CARD_CONTRACT_VERSION + '" data-lantern-card-type="' + esc(ct) + '"';
      var a11y = '';
      if (opts.role) a11y += ' role="' + esc(String(opts.role)) + '"';
      if (opts.tabIndex != null && opts.tabIndex !== '') a11y += ' tabindex="' + esc(String(opts.tabIndex)) + '"';
      if (opts.ariaLabel) a11y += ' aria-label="' + esc(String(opts.ariaLabel)) + '"';
      var navHref = opts.navHref != null ? String(opts.navHref).trim() : '';
      if (navHref) {
        return '<div class="exploreCardOuterWrap" data-lantern-card-wrap="true">' +
          '<a href="' + esc(navHref) + '" class="' + shellClass + '"' + canonicalStamp + dataStr + reportData + a11y + '><div class="exploreCardRailStack">' + innerHtml + '</div></a></div>';
      }
      return '<div class="' + shellClass + '"' + canonicalStamp + dataStr + reportData + a11y + '><div class="exploreCardRailStack">' + innerHtml + '</div></div>';
    }

    throw new Error('[LanternCards] studentFacingCardHtml: unknown kind "' + kind + '" (only "rail" is valid)');
  }

  /** Data-only spec for feed posts; DOM via createStudentCard(specFeedPostRail(p, options)) + wireFeedPostCard. */
  function specFeedPostRail(p, options) {
    p = p || {};
    options = options || {};
    var parts = buildFeedPostParts(p, Object.assign({}, options, { mode: CARD_MODE.RAIL }));
    var pid = String(p.id || '').trim();
    var rType = 'feed_post';
    var rId = pid;
    if (pid.indexOf('mission_') === 0) {
      rType = 'mission_submission';
      rId = pid.replace(/^mission_/, '');
    } else if (pid.indexOf('news_') === 0) {
      rType = 'news';
      rId = pid.replace(/^news_/, '');
    } else if (pid.indexOf('learning_') === 0) {
      rType = 'learning';
      rId = pid.replace(/^learning_/, '') || pid;
    }
    var extraFeed = mergeShellExtras({ classNames: options.extraClass || '' });
    return {
      kind: 'rail',
      innerStackHtml: parts.inner,
      _feedPostWire: { p: p, options: options, parts: parts },
      shell: {
        classNames: extraFeed,
        reportType: rType,
        reportId: rId,
        lanternCardType: String((p && p.type) ? p.type : 'link'),
        dataAttrs: options.dataAttrs
      }
    };
  }

  /** Apply feed-post behaviors after createStudentCard(specFeedPostRail(...)). */
  function wireFeedPostCard(card, wire) {
    if (!card || !wire) return card;
    var p = wire.p || {};
    var options = wire.options || {};
    var parts = wire.parts || buildFeedPostParts(p, Object.assign({}, options, { mode: CARD_MODE.RAIL }));
    applyReportControl(card);
    var linkUrl = (options.openUrlOverride !== undefined ? options.openUrlOverride : (p.url || '').trim());
    var openUrl = linkUrl || (parts.isMissionCard ? 'missions.html' : '');
    if (options.noNavigate) openUrl = '';
    if (typeof options.onCardActivate === 'function') {
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', 'View: ' + (p.title || 'item'));
      card.classList.add('exploreCard--activatable');
      card.addEventListener('click', function (e) {
        if (e.target.closest('.exploreCardReportBtn')) return;
        if (e.target.closest('a[href]')) return;
        options.onCardActivate(p, card, e);
      });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          options.onCardActivate(p, card, e);
        }
      });
    }
    if (openUrl && typeof options.onCardActivate !== 'function') {
      card.setAttribute('role', 'link');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', 'Open: ' + (p.title || 'creation'));
      card.addEventListener('click', function (e) {
        if (e.target.closest('.exploreCardReportBtn')) return;
        if (e.target.closest('a[href]')) return;
        e.preventDefault();
        if (openUrl.indexOf('http') === 0) global.open(openUrl, '_blank', 'noopener');
        else global.location.href = openUrl;
      });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (openUrl.indexOf('http') === 0) global.open(openUrl, '_blank', 'noopener');
          else global.location.href = openUrl;
        }
      });
    }
    var rh = options.routeHelp || p.lantern_route;
    if (rh && global.LanternRouteHelp && global.LanternRouteHelp.tagElement) {
      global.LanternRouteHelp.tagElement(card, rh);
    }
    return card;
  }

  function materializeFeedPostCard(p, options) {
    options = options || {};
    if (options.cardPreview !== undefined && options.mode === undefined) {
      throw new Error('[LanternCards] cardPreview is removed. Pass mode: LanternCards.CARD_MODE.RAIL. See docs/LANTERN_SYSTEM_CONTEXT.md §10');
    }
    var spec = specFeedPostRail(p, options);
    var wire = spec._feedPostWire;
    delete spec._feedPostWire;
    var card = createStudentCard(spec);
    if (!card) return null;
    return wireFeedPostCard(card, wire);
  }

  /** Sole DOM materialization path for root student-facing cards (.exploreCard / .exploreCardOuterWrap). */
  function createStudentCard(spec) {
    spec = spec || {};
    var clean = {};
    for (var ck in spec) {
      if (spec.hasOwnProperty(ck) && ck !== '_feedPostWire') clean[ck] = spec[ck];
    }
    var html = studentFacingCardHtml(clean);
    var w = global.document.createElement('div');
    w.innerHTML = String(html || '').trim();
    return w.firstElementChild;
  }

  /** Shallow merge + image_url fallbacks so LanternMedia.renderMedia (explore) sees a preview when API sends full_image_url only. */
  function normalizeNewsMediaItemForExplore(n) {
    if (!n || typeof n !== 'object') return {};
    var out = {};
    for (var k in n) {
      if (Object.prototype.hasOwnProperty.call(n, k)) out[k] = n[k];
    }
    var img = String(out.image_url || '').trim();
    if (!img) {
      var full = String(out.full_image_url || '').trim();
      if (full) out.image_url = full;
    }
    if (!String(out.image_url || '').trim()) {
      var pv = String(out.preview_url || '').trim();
      if (pv) out.image_url = pv;
    }
    return out;
  }

  function buildNewsCardVisualBlockFromItem(n, eFn, options) {
    options = options || {};
    var e = eFn || esc;
    var mediaItem = normalizeNewsMediaItemForExplore(n);
    var typeFb = svgTypeFallbackDataUri('news');
    var uniFb = svgUniversalLanternDataUri();
    var media = global.LanternMedia && global.LanternMedia.renderMedia ? global.LanternMedia.renderMedia(mediaItem, { esc: e, variant: 'explore', exploreTypeFallback: typeFb, exploreUniversalFallback: uniFb }) : { mediaBlock: '' };
    var inner = (media && media.mediaBlock) ? String(media.mediaBlock).trim() : '';
    var visualClass = 'exploreCardVisual' + (options.exploreNewsExploreRail ? ' exploreCardVisual--newsExploreRail' : '');
    var badge = '<span class="exploreCardTypeBadge">' + TYPE_BADGES.news + '</span>';
    if (inner) return '<div class="' + visualClass + '">' + badge + inner + '</div>';
    var fallbackImg = String(mediaItem.image_url || mediaItem.preview_url || mediaItem.full_image_url || '').trim() || getDefaultImageUrl('news');
    return '<div class="' + visualClass + '">' + badge + buildGuaranteedExploreImageHtml('news', fallbackImg) + '</div>';
  }

  function buildVisualBlockForPost(p) {
    var type = p.type || 'link';
    var typeBadge = TYPE_BADGES[type] ? '<span class="exploreCardTypeBadge">' + TYPE_BADGES[type] + '</span>' : '';
    var typeFb = svgTypeFallbackDataUri(type);
    var uniFb = svgUniversalLanternDataUri();
    var hasMedia = (p.image_url && String(p.image_url).trim()) || (p.video_url && String(p.video_url).trim()) || (p.link_url && String(p.link_url).trim());
    if (hasMedia && global.LanternMedia && global.LanternMedia.renderMedia) {
      var media = global.LanternMedia.renderMedia({ image_url: p.image_url, video_url: p.video_url, link_url: p.link_url }, { esc: esc, variant: 'explore', exploreTypeFallback: typeFb, exploreUniversalFallback: uniFb });
      var mb = media && media.mediaBlock ? String(media.mediaBlock).trim() : '';
      if (mb) return '<div class="exploreCardVisual">' + typeBadge + media.mediaBlock + '</div>';
    }
    var visualUrl = getCardImageUrl(p);
    return '<div class="exploreCardVisual">' + typeBadge + buildGuaranteedExploreImageHtml(type, visualUrl) + '</div>';
  }

  /** Curation (pick/featured) as top-left overlay inside .exploreCardVisual — does not affect title row layout. */
  function injectCurationIntoVisual(visualHtml, p) {
    if (!visualHtml || !p) return visualHtml;
    var hasPick = !!p.teacher_pick;
    var hasFeat = !!p.teacher_featured && !hasPick;
    if (!hasPick && !hasFeat) return visualHtml;
    var curation;
    if (hasPick) {
      curation = '<span class="lanternBadge pick exploreCardCurationBadge" aria-hidden="true">🏆</span>';
    } else {
      curation = '<span class="lanternBadge featured exploreCardCurationBadge" aria-hidden="true">🌟</span>';
    }
    var idx = visualHtml.indexOf('exploreCardVisual');
    if (idx === -1) return visualHtml;
    var gt = visualHtml.indexOf('>', idx);
    if (gt === -1) return visualHtml;
    return visualHtml.slice(0, gt + 1) + curation + visualHtml.slice(gt + 1);
  }

  function buildFeedPostParts(p, options) {
    options = options || {};
    var authorRaw = String(p.display_name || p.character_name || '').trim();
    var time = '';
    try {
      var dt = new Date(p.created_at || '');
      if (!isNaN(dt.getTime())) time = dt.toLocaleDateString();
    } catch (e) {}
    var visualBlock = injectCurationIntoVisual(buildVisualBlockForPost(p), p);
    var isMissionCard = (p.id && String(p.id).indexOf('mission_') === 0);
    var title = esc(p.title || 'Untitled');
    var metaLine = '';
    if ((p.card_meta || '').trim()) metaLine = truncateMeta(String(p.card_meta).trim(), 76);
    var createdBy = ((p.type === 'create' || p.type === 'image' || p.type === 'video' || p.type === 'link') && (p.created_by_teacher_name || '').trim())
      ? truncateMeta('Created by: ' + String(p.created_by_teacher_name || 'Teacher').trim(), 40) : '';
    var capRaw = (p.caption && String(p.caption).trim()) ? String(p.caption).trim().replace(/\s+/g, ' ') : '';
    var capForPreview = capRaw ? truncateMeta(capRaw, 220) : '';
    var authorDisplay = authorRaw || 'Anonymous';
    var firstName = railIdentityFirstName(authorDisplay);
    var railIdentity = lcRailRow('identity', '<div class="exploreCardIdentity exploreCardIdentity--rail">' + buildExploreAuthorAvatarHtml(p) + '<span class="exploreAuthor exploreAuthor--identity">' + esc(firstName) + '</span></div>');
    var previewRow = '';
    if (capForPreview) {
      previewRow = lcRailRow('body', '<div class="exploreCaption exploreCaption--railPreview">' + esc(capForPreview) + '</div>');
    }
    var metaParts = [];
    if (time) metaParts.push(time);
    if (metaLine) metaParts.push(metaLine);
    if (createdBy) metaParts.push(createdBy);
    var metaCombined = truncateMeta(metaParts.join(' · '), 76) || '\u00a0';
    var metaRow = lcRailRow('meta', '<div class="exploreCardMetaOneLine">' + esc(metaCombined) + '</div>');
    var inner = lcRailRow('media', visualBlock) +
      lcRailRow('title', '<div class="exploreCardHd exploreCardHd--preview"><span class="exploreTitle">' + title + '</span></div>') +
      railIdentity +
      previewRow +
      metaRow;
    return { inner: inner, isMissionCard: isMissionCard };
  }

  function specNewsRailCard(n, escFn, authorLabelText, isActive) {
    var e = escFn || esc;
    var dateStr = '';
    try {
      var dt = new Date(n.approved_at || n.created_at || '');
      if (!isNaN(dt.getTime())) dateStr = dt.toLocaleDateString();
    } catch (err) {}
    var visualBlock = buildNewsCardVisualBlockFromItem(n, e, { exploreNewsExploreRail: true });
    var displayNm = String((n.author_name || '').trim() || '');
    var accountKey = String((n.character_name || n.author_name || '').trim() || '');
    var idFirst = railIdentityFirstName(displayNm || authorLabelText || 'Anonymous');
    var cat = String((n.category || '').trim());
    var metaOne = truncateMeta([authorLabelText, dateStr].filter(Boolean).join(' · '), 80);
    var avBlock = buildExploreAuthorAvatarHtml({
      character_name: accountKey,
      author_name: displayNm,
      _canonicalAvatar: n._canonicalAvatar,
      frame: 'none'
    });
    var titleStack = '<div class="exploreCardHd exploreCardHd--preview"><span class="exploreTitle">' + e(n.title || 'Untitled') + '</span></div>';
    if (cat) titleStack += '<div class="exploreCardCategoryBadgeWrap"><span class="exploreCardCategoryBadge">' + e(cat) + '</span></div>';
    var inner = lcRailRow('media', visualBlock) +
      lcRailRow('title', titleStack, cat ? 'lcRailRow--titleHasCategory' : '') +
      lcRailRow('identity', '<div class="exploreCardIdentity exploreCardIdentity--rail">' + avBlock + '<span class="exploreAuthor exploreAuthor--identity">' + e(idFirst) + '</span></div>') +
      lcRailRow('meta', '<div class="exploreCardMetaOneLine">' + e(metaOne) + '</div>');
    return {
      kind: 'rail',
      innerStackHtml: inner,
      shell: {
        classNames: 'exploreCard--previewRail exploreCard--newsExploreRail' + (isActive ? ' studioScrollerCardActive' : ''),
        lanternCardType: 'news',
        dataAttrs: { 'route-surface': 'explore_happening_news', 'route-pipeline': 'approved_news' },
        reportType: 'news',
        reportId: (n && n.id != null) ? String(n.id) : ''
      }
    };
  }

  /** Studio / moderation news preview — same four-row rail as every other card (body copy folded into meta text only). Pass _canonicalAvatar from LanternAvatar.attachCanonicalAvatarsToItems; do not pass legacy authorAvatarUrl. */
  function specOpenedNews(opts) {
    opts = opts || {};
    var eFn = opts.esc || esc;
    var title = eFn(opts.title || 'Untitled');
    var category = String(opts.category || '').trim();
    var authorNameRaw = String(opts.authorName || '').trim();
    var dateStr = String(opts.dateStr || '').trim();
    var badgeText = String(opts.badgeText || '').trim();
    var bodySnippet = truncateMeta(stripHtmlToText(opts.bodyHtml), 48);
    var featMedia = (opts.featuredMediaHtml && String(opts.featuredMediaHtml).trim()) ? opts.featuredMediaHtml : buildNewsCardVisualBlockFromItem(opts.newsMediaItem || {}, eFn);
    var repId = (opts.reportId != null) ? String(opts.reportId) : '';
    var avOpened = buildExploreAuthorAvatarHtml({
      character_name: authorNameRaw,
      author_name: authorNameRaw,
      _canonicalAvatar: opts._canonicalAvatar,
      frame: 'none'
    });
    var idFirst = eFn(railIdentityFirstName(authorNameRaw || 'Anonymous'));
    var metaBits = [category, dateStr, badgeText, bodySnippet].filter(Boolean);
    var metaOne = truncateMeta(metaBits.join(' · '), 76) || '\u00a0';
    var inner = lcRailRow('media', featMedia) +
      lcRailRow('title', '<div class="exploreCardHd exploreCardHd--preview"><span class="exploreTitle">' + title + '</span></div>') +
      lcRailRow('identity', '<div class="exploreCardIdentity exploreCardIdentity--rail">' + avOpened + '<span class="exploreAuthor exploreAuthor--identity">' + idFirst + '</span></div>') +
      lcRailRow('meta', '<div class="exploreCardMetaOneLine">' + eFn(metaOne) + '</div>');
    return {
      kind: 'rail',
      innerStackHtml: inner,
      shell: {
        classNames: 'exploreCard--previewRail studioNewsPreviewRail',
        lanternCardType: 'news',
        reportType: 'news',
        reportId: repId
      }
    };
  }

  /**
   * Poll rail card as HTML string (Explore rails, Contribute studio). Same shell as materializePollRailCard; no listeners.
   * options.isActive — highlight center draft in studio scroller.
   */
  function specPollRailCard(poll, options) {
    options = options || {};
    var p = poll || {};
    var imgUrl = getCardImageUrl({ question: p.question, title: p.question, image_url: p.image_url }) || getDefaultImageUrl('poll');
    var visualBlock = '<div class="exploreCardVisual"><span class="exploreCardTypeBadge">' + TYPE_BADGES.poll + '</span>' + buildGuaranteedExploreImageHtml('poll', imgUrl) + '</div>';
    var nch = p.choices ? p.choices.length : 0;
    var rawPollMeta = (p.card_meta && String(p.card_meta).trim()) || (options.returnedMeta && String(options.returnedMeta).trim());
    var metaLine = rawPollMeta
      ? esc(truncateMeta(String(rawPollMeta).trim(), 76))
      : esc(truncateMeta(nch + ' choice' + (nch !== 1 ? 's' : '') + ' · Poll', 76));
    var title = esc(truncateRailTitleTwoLines(p.question || 'Poll', 22));
    var pollAv = buildExploreAuthorAvatarHtml(p);
    var pollDisplayNm = String((p.author_name || p.display_name || '').trim() || '');
    var pollAuthorRaw = pollDisplayNm || String((p.character_name || '').trim() || 'Community');
    var pollFirst = esc(railIdentityFirstName(pollAuthorRaw));
    var inner = lcRailRow('media', visualBlock) +
      lcRailRow('title', '<div class="exploreCardHd exploreCardHd--preview"><span class="exploreTitle">' + title + '</span></div>') +
      lcRailRow('identity', '<div class="exploreCardIdentity exploreCardIdentity--rail">' + pollAv + '<span class="exploreAuthor exploreAuthor--identity">' + pollFirst + '</span></div>') +
      lcRailRow('meta', '<div class="exploreCardMetaOneLine">' + metaLine + '</div>');
    var pollRid = (p && p.id != null) ? String(p.id) : '';
    var activeCls = options.isActive ? ' studioScrollerCardActive' : '';
    return {
      kind: 'rail',
      innerStackHtml: inner,
      shell: {
        classNames: 'pollCard' + activeCls,
        lanternCardType: 'poll',
        reportType: 'poll',
        reportId: pollRid
      }
    };
  }

  /** Poll “opened” simulator — same structure/classes as explore poll modal (preview only). */
  function buildPollDraftOpenedPreviewHtml(poll, escFn) {
    var e = escFn || esc;
    var p = poll || {};
    var fk = String(p.fallback_key || 'poll').trim();
    var typeForDefault = fk === 'news' ? 'news' : fk === 'creation' ? 'creation' : fk === 'generic' ? 'creation' : fk === 'shoutout' ? 'shoutout' : fk === 'explain' ? 'explain' : 'poll';
    var imgUrl = String(p.image_url || '').trim();
    if (!imgUrl) imgUrl = getDefaultImageUrl(typeForDefault);
    var q = e(p.question || '');
    var choices = p.choices || [];
    var html = '<div class="pollModal pollModal--studioPreview">';
    html += '<div class="pollModalImageWrap"><img class="pollModalImage" src="' + e(imgUrl) + '" alt="" /></div>';
    html += '<div class="pollModalQuestion">' + q + '</div><div class="pollModalChoices">';
    for (var i = 0; i < choices.length; i++) {
      html += '<button type="button" class="pollChoiceBtn" disabled tabindex="-1">' + e(choices[i]) + '</button>';
    }
    html += '</div><p class="pollStudioOpenedHint">After approval, votes and nuggets work like on Explore.</p></div>';
    return html;
  }

  function wirePollRailCard(card, poll, options) {
    if (!card) return null;
    options = options || {};
    var p = poll || {};
    var isReturned = !!options.isReturned || (String(p.card_meta || '').indexOf('Returned to revise') === 0) || !!(options.returnedMeta && String(options.returnedMeta).trim());
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', isReturned ? 'Revise and resubmit poll: ' + (p.question || '') : 'Open poll: ' + (p.question || ''));
    card.classList.add('exploreCard--activatable');
    applyReportControl(card);
    card.addEventListener('click', function (e) {
      if (e.target.closest('.exploreCardReportBtn')) return;
      if (typeof options.onActivate === 'function') options.onActivate(p);
    });
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (e.target.closest('.exploreCardReportBtn')) return;
        if (typeof options.onActivate === 'function') options.onActivate(p);
      }
    });
    if (global.LanternRouteHelp && global.LanternRouteHelp.tagElement) {
      global.LanternRouteHelp.tagElement(card, { surface: 'explore_poll' });
    }
    return card;
  }

  function materializePollRailCard(poll, options) {
    var card = createStudentCard(specPollRailCard(poll, options || {}));
    return wirePollRailCard(card, poll, options || {});
  }

  function specMissionSpotlightRail(mission) {
    var m = mission || {};
    var imgUrl = getCardImageUrl({ title: m.title, description: m.description, image_url: m.image_url, image: m.image });
    var visualBlock = '<div class="exploreCardVisual"><span class="exploreCardTypeBadge">' + TYPE_BADGES.create + '</span>' + buildGuaranteedExploreImageHtml('mission', imgUrl) + '</div>';
    var msAv = buildExploreAuthorAvatarHtml({});
    var inner = lcRailRow('media', visualBlock) +
      lcRailRow('title', '<div class="exploreCardHd exploreCardHd--preview"><span class="exploreTitle">' + esc(m.title || 'Mission') + '</span></div>') +
      lcRailRow('identity', '<div class="exploreCardIdentity exploreCardIdentity--rail">' + msAv + '<span class="exploreAuthor exploreAuthor--identity">Missions</span></div>') +
      lcRailRow('meta', '<div class="exploreCardMetaOneLine">' + esc('+' + (m.reward_amount || 0) + ' nuggets · Quick mission') + '</div>');
    var mid = (m && m.id != null) ? String(m.id) : '';
    return {
      kind: 'rail',
      innerStackHtml: inner,
      shell: { classNames: 'missionSpotlightCard', lanternCardType: 'mission', reportType: 'mission', reportId: mid }
    };
  }

  function wireMissionSpotlightRail(card, mission, options) {
    if (!card) return null;
    options = options || {};
    var m = mission || {};
    applyReportControl(card);
    if (options.studioActivate) {
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      var onAct = typeof options.onActivate === 'function' ? options.onActivate : null;
      card.addEventListener('click', function (e) {
        if (e.target.closest('.exploreCardReportBtn')) return;
        e.preventDefault();
        if (onAct) onAct(m, card, e);
      });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (e.target.closest('.exploreCardReportBtn')) return;
          if (onAct) onAct(m, card, e);
        }
      });
      if (global.LanternRouteHelp && global.LanternRouteHelp.tagElement) {
        global.LanternRouteHelp.tagElement(card, { surface: 'contribute_mission_rail', pipeline: 'studio_mission_select' });
      }
    } else {
      card.setAttribute('role', 'link');
      card.setAttribute('tabindex', '0');
      card.addEventListener('click', function (e) {
        if (e.target.closest('.exploreCardReportBtn')) return;
        global.location.href = 'missions.html';
      });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (e.target.closest('.exploreCardReportBtn')) return;
          global.location.href = 'missions.html';
        }
      });
      if (global.LanternRouteHelp && global.LanternRouteHelp.tagElement) {
        global.LanternRouteHelp.tagElement(card, { surface: 'explore_mission_spotlight', pipeline: 'active_mission' });
      }
    }
    return card;
  }

  function materializeMissionSpotlightRail(mission, options) {
    var card = createStudentCard(specMissionSpotlightRail(mission || {}));
    return wireMissionSpotlightRail(card, mission, options || {});
  }

  /** Studio / moderation mission submission preview — same four-row rail as every other card. */
  function specOpenedMissionDraft(missionTitle, type, imageUrl, videoUrl, linkUrl, contentText, emptyPlaceholder) {
    var e2 = esc;
    var mt = e2(String(missionTitle || 'Mission'));
    var draftType = type || 'create';
    var isEmpty = !String(contentText || '').trim() && !String(imageUrl || '').trim() && !String(videoUrl || '').trim() && !String(linkUrl || '').trim();
    var avYou = buildExploreAuthorAvatarHtml({});
    var metaPh = truncateMeta(String(emptyPlaceholder || 'Add your response — preview updates here.').replace(/\s+/g, ' ').trim(), 76) || '\u00a0';
    if (isEmpty) {
      var vb0 = '<div class="exploreCardVisual"><span class="exploreCardTypeBadge">' + TYPE_BADGES.create + '</span>' + buildGuaranteedExploreImageHtml('create', getDefaultImageUrl('creation')) + '</div>';
      var inner0 = lcRailRow('media', vb0) +
        lcRailRow('title', '<div class="exploreCardHd exploreCardHd--preview"><span class="exploreTitle">' + mt + '</span></div>') +
        lcRailRow('identity', '<div class="exploreCardIdentity exploreCardIdentity--rail">' + avYou + '<span class="exploreAuthor exploreAuthor--identity">You</span></div>') +
        lcRailRow('meta', '<div class="exploreCardMetaOneLine">' + e2(metaPh) + '</div>');
      return { kind: 'rail', innerStackHtml: inner0, shell: { lanternCardType: 'mission_draft', reportType: 'mission_draft', reportId: '' } };
    }
    var typeBadge = TYPE_BADGES[draftType] ? '<span class="exploreCardTypeBadge">' + TYPE_BADGES[draftType] + '</span>' : '<span class="exploreCardTypeBadge">' + TYPE_BADGES.create + '</span>';
    var typeFb = svgTypeFallbackDataUri(type || 'create');
    var uniFb = svgUniversalLanternDataUri();
    var media = global.LanternMedia && global.LanternMedia.renderMedia ? global.LanternMedia.renderMedia({ image_url: imageUrl, video_url: videoUrl, link_url: linkUrl }, { esc: e2, variant: 'explore', exploreTypeFallback: typeFb, exploreUniversalFallback: uniFb }) : { mediaBlock: '' };
    var mb = (media && media.mediaBlock) ? String(media.mediaBlock).trim() : '';
    var visualBlock = mb
      ? '<div class="exploreCardVisual">' + typeBadge + media.mediaBlock + '</div>'
      : '<div class="exploreCardVisual">' + typeBadge + buildGuaranteedExploreImageHtml(type || 'create', String(imageUrl || '').trim() || getDefaultImageUrl(type)) + '</div>';
    var ctRaw = String(contentText || '').replace(/\s+/g, ' ').trim();
    var capPreview = ctRaw ? truncateMeta(ctRaw, 220) : '';
    var bodyDraft = capPreview
      ? lcRailRow('body', '<div class="exploreCaption exploreCaption--railPreview">' + e2(capPreview) + '</div>')
      : '';
    var inner1 = lcRailRow('media', visualBlock) +
      lcRailRow('title', '<div class="exploreCardHd exploreCardHd--preview"><span class="exploreTitle">' + mt + '</span></div>') +
      lcRailRow('identity', '<div class="exploreCardIdentity exploreCardIdentity--rail">' + avYou + '<span class="exploreAuthor exploreAuthor--identity">You</span></div>') +
      bodyDraft +
      lcRailRow('meta', '<div class="exploreCardMetaOneLine">' + e2('\u00a0') + '</div>');
    return { kind: 'rail', innerStackHtml: inner1, shell: { lanternCardType: 'mission_draft', reportType: 'mission_draft', reportId: '' } };
  }

  function specIconRailCard(o) {
    o = o || {};
    var e = esc;
    var icon = o.icon || '⭐';
    var muted = o.muted ? ' exploreCardMuted' : '';
    var imgHtml = o.imageUrl
      ? '<img src="' + e(o.imageUrl) + '" alt="" onerror="var p=this.parentNode;this.remove();p.classList.add(\'exploreCardVisualEmoji\');p.textContent=\'' + e(icon) + '\';">'
      : '';
    var visualInner = imgHtml || '<span class="exploreCardVisualEmoji">' + icon + '</span>';
    var badge = (o.typeBadge != null && String(o.typeBadge).trim() !== '')
      ? '<span class="exploreCardTypeBadge">' + e(String(o.typeBadge)) + '</span>'
      : '';
    var metaParts = [o.caption || '', o.meta || ''].filter(Boolean);
    var metaOne = truncateMeta(metaParts.join(' · '), 76) || '\u00a0';
    var idLabel = o.identityLabel != null ? o.identityLabel : o.title;
    var avPost = { frame: 'none' };
    if (String(o.character_name || '').trim()) {
      avPost.character_name = String(o.character_name).trim();
      avPost._canonicalAvatar = o._canonicalAvatar;
    } else {
      avPost.avatar = o.icon || '⭐';
    }
    var inner = lcRailRow('media', '<div class="exploreCardVisual exploreCardVisualIconRail">' + badge + visualInner + '</div>') +
      lcRailRow('title', '<div class="exploreCardHd exploreCardHd--preview"><span class="exploreTitle">' + e(o.title || '') + '</span></div>') +
      lcRailIdentityRow(idLabel, avPost) +
      lcRailRow('meta', '<div class="exploreCardMetaOneLine">' + e(metaOne) + '</div>');
    var rt = (o && o.reportType != null) ? String(o.reportType) : 'profile_rail';
    var rid = (o && o.reportId != null) ? String(o.reportId) : '';
    var da = o.dataAttrs && typeof o.dataAttrs === 'object' ? o.dataAttrs : {};
    if (o.gameName != null && String(o.gameName).trim() !== '') da.gameName = String(o.gameName);
    var shellOpts = {
      classNames: ('exploreCardProfileRail' + muted + (o.extraClass ? ' ' + String(o.extraClass) : '')).replace(/\s+/g, ' ').trim(),
      reportType: rt,
      reportId: rid,
      dataAttrs: da
    };
    if (o.role) shellOpts.role = o.role;
    if (o.tabIndex != null) shellOpts.tabIndex = o.tabIndex;
    if (o.ariaLabel) shellOpts.ariaLabel = o.ariaLabel;
    return { kind: 'rail', innerStackHtml: inner, shell: shellOpts };
  }

  /** Games page — weekly pace link rail (canonical inner; wraps specLinkCard). */
  function specWeeklyPaceLinkCard(href, title, iconEmoji, metaLine, reportId) {
    var e = esc;
    var ic = iconEmoji != null ? String(iconEmoji) : '🎮';
    var metaMerged = truncateMeta([metaLine || '', 'This week →'].filter(Boolean).join(' · '), 76) || '\u00a0';
    var inner = lcRailRow('media', '<div class="exploreCardVisual exploreCardVisualIconRail"><span class="exploreCardTypeBadge">🌟 Weekly</span><span class="exploreCardVisualEmoji">' + e(ic) + '</span></div>') +
      lcRailRow('title', '<div class="exploreCardHd exploreCardHd--preview"><span class="exploreTitle">' + e(title || '') + '</span></div>') +
      lcRailIdentityRow(title || 'Weekly', { avatar: ic, frame: 'none' }) +
      lcRailRow('meta', '<div class="exploreCardMetaOneLine">' + e(metaMerged) + '</div>');
    return specLinkCard(href || 'games.html', inner, 'gameHighlightCard', 'game_highlight', reportId != null ? String(reportId) : '');
  }

  /**
   * Games hub: same four-row rail; optional bodyHtml from callers is ignored (play surfaces live outside the card shell).
   */
  function specGameHubRailCard(o) {
    o = o || {};
    var e = esc;
    var icon = o.icon || '🎮';
    var typeBadge = o.typeBadge != null ? String(o.typeBadge) : '🎮 Game';
    var visual = '<div class="exploreCardVisual exploreCardVisualIconRail gamesHubCardVisual"><span class="exploreCardTypeBadge">' + e(typeBadge) + '</span><span class="exploreCardVisualEmoji">' + icon + '</span></div>';
    var title = '<div class="exploreCardHd exploreCardHd--preview"><span class="exploreTitle">' + e(o.title || '') + '</span></div>';
    var metaBits = [o.metaOne || '', o.rewardText || ''].filter(Boolean);
    var metaMerged = truncateMeta(metaBits.join(' · '), 76) || '\u00a0';
    var meta = '<div class="exploreCardMetaOneLine">' + e(metaMerged) + '</div>';
    var inner = lcRailRow('media', visual) +
      lcRailRow('title', title) +
      lcRailIdentityRow(o.hubIdentityLabel || 'Games', { avatar: o.icon || '🎮', frame: 'none' }) +
      lcRailRow('meta', meta);
    return {
      kind: 'rail',
      innerStackHtml: inner,
      shell: {
        classNames: ('gamesHubPlayCard ' + mergeShellExtras({ classNames: o.extraClass || '' })).replace(/\s+/g, ' ').trim(),
        lanternCardType: 'game_hub',
        reportType: o.reportType != null ? o.reportType : 'game_hub',
        reportId: o.reportId != null ? o.reportId : '',
        dataAttrs: o.dataAttrs || {},
        role: o.role,
        tabIndex: o.tabIndex,
        ariaLabel: o.ariaLabel
      }
    };
  }

  /** Games page — leaderboard summary rail (scores as single meta line). */
  function specGamesLeaderboardSummaryCard(gameName, gameId, entries) {
    var e = esc;
    var summaryText = (entries && entries.length)
      ? entries.slice(0, 3).map(function (ent, i) {
        return '#' + (i + 1) + ' ' + String(ent.character_name || '') + ' · ' + String(ent.score_display != null ? ent.score_display : ent.score || '');
      }).join(' · ')
      : 'No scores yet this week.';
    return specGameHubRailCard({
      title: gameName || '',
      icon: '🏆',
      metaOne: truncateMeta(summaryText, 76),
      typeBadge: '🏆 LB',
      reportId: gameId != null ? String(gameId) : '',
      reportType: 'games_leaderboard',
      extraClass: 'exploreCard--gamesLbSummary',
      dataAttrs: { routeSurface: 'games_leaderboard', routeDetail: gameName || '' }
    });
  }

  /** Link-card inner only (canonical structure; escapes text once). */
  function gameHighlightLinkInnerStackHtml(labelText, headlineText, bodyText) {
    var visual = '<div class="exploreCardVisual exploreCardVisualIconRail"><span class="exploreCardTypeBadge">🎮</span><span class="exploreCardVisualEmoji">🕹</span></div>';
    var metaMerged = truncateMeta([headlineText || '', bodyText || ''].filter(Boolean).join(' — '), 76) || '\u00a0';
    return lcRailRow('media', visual) +
      lcRailRow('title', '<div class="exploreCardHd exploreCardHd--preview"><span class="exploreTitle">' + esc(labelText || '') + '</span></div>') +
      lcRailIdentityRow(labelText || 'Games', { avatar: '🎮', frame: 'none' }) +
      lcRailRow('meta', '<div class="exploreCardMetaOneLine">' + esc(metaMerged) + '</div>');
  }

  /** Verify stress / minimal two-line link inner (canonical structure). */
  function verifyStressLinkInnerStackHtml(titleText, metaText) {
    var visual = '<div class="exploreCardVisual exploreCardVisualIconRail"><span class="exploreCardVisualEmoji">✓</span></div>';
    return lcRailRow('media', visual) +
      lcRailRow('title', '<div class="exploreCardHd exploreCardHd--preview"><span class="exploreTitle">' + esc(titleText || '') + '</span></div>') +
      lcRailIdentityRow('Verify', { avatar: '✓', frame: 'none' }) +
      lcRailRow('meta', '<div class="exploreCardMetaOneLine">' + esc(truncateMeta(metaText || '', 76) || '\u00a0') + '</div>');
  }

  /** Navigating rail: same rail grammar; shell.navHref produces exploreCardOuterWrap + <a>. */
  function specLinkCard(href, innerHtml, extraClass, reportType, reportId) {
    return {
      kind: 'rail',
      innerStackHtml: innerHtml,
      shell: {
        classNames: extraClass || '',
        navHref: href != null ? String(href) : '',
        reportType: reportType,
        reportId: reportId
      }
    };
  }

  function specGameHighlightLinkCard(href, labelText, headlineText, bodyText, reportId) {
    return specLinkCard(href || 'games.html', gameHighlightLinkInnerStackHtml(labelText, headlineText, bodyText), 'gameHighlightCard', 'game_highlight', reportId != null ? String(reportId) : '');
  }

  function specVerifyStressLinkCard(href, titleText, metaText, reportId) {
    return specLinkCard(href || '#', verifyStressLinkInnerStackHtml(titleText, metaText), 'railStressVerifyFake', 'verify_stress_creation', reportId != null ? String(reportId) : '');
  }

  /**
   * Store / locker / profile — cosmetics: four rows only; price/footer HTML from callers is flattened to meta text (tap card to buy/equip in page scripts).
   */
  function specCosmeticRailCard(o) {
    o = o || {};
    var spotlight = o.spotlight
      ? '<span class="exploreCardTypeBadge exploreCardCosmeticSpotlightBadge">Spotlight</span>'
      : '';
    var visual = '<div class="exploreCardVisual exploreCardVisualIconRail exploreCardVisual--cosmeticRail">' + spotlight +
      '<span class="exploreCardVisualEmoji">' + esc(o.icon != null ? String(o.icon) : '✨') + '</span></div>';
    var titleRow = '<div class="exploreCardHd exploreCardHd--preview"><span class="exploreTitle">' + esc(o.title || '') + '</span></div>';
    var rLab = (o.rarityLabel && String(o.rarityLabel).trim()) ? String(o.rarityLabel).trim() : '';
    var sub = (o.subline && String(o.subline).trim()) ? String(o.subline).trim() : '';
    var priceTxt = o.priceBandHtml ? stripHtmlToText(String(o.priceBandHtml)) : '';
    var footTxt = o.footerHtml ? stripHtmlToText(String(o.footerHtml)) : '';
    var metaCombined = truncateMeta([rLab, sub, priceTxt, footTxt].filter(Boolean).join(' · '), 76) || '\u00a0';
    var metaRow = lcRailRow('meta', '<div class="exploreCardMetaOneLine">' + esc(metaCombined) + '</div>');
    var inner = lcRailRow('media', visual) + lcRailRow('title', titleRow) +
      lcRailIdentityRow(o.identityLabel || 'Store', { avatar: o.icon != null ? String(o.icon) : '✨', frame: 'none' }) +
      metaRow;
    var rar = String(o.rarityKey || 'common').toLowerCase();
    if (['common', 'uncommon', 'rare', 'epic', 'legendary'].indexOf(rar) < 0) rar = 'common';
    var state = [];
    if (o.stateEquipped) state.push('exploreCard--cosmeticEquipped');
    if (o.stateOwned && !o.stateEquipped) state.push('exploreCard--cosmeticOwned');
    if (o.stateLocked) state.push('exploreCard--cosmeticLocked');
    if (o.stateNeed) state.push('exploreCard--cosmeticNeed');
    if (o.featured) state.push('exploreCard--cosmeticFeatured');
    if (o.future) state.push('exploreCard--cosmeticFuture');
    if (o.placeholder) state.push('exploreCard--cosmeticPlaceholder');
    var xcls = ('exploreCard--cosmeticRail exploreCard--cosmeticRarity-' + rar + ' ' + state.join(' ') + ' ' + (o.extraClass || '')).replace(/\s+/g, ' ').trim();
    return {
      kind: 'rail',
      innerStackHtml: inner,
      shell: {
        classNames: xcls,
        lanternCardType: 'cosmetic',
        reportType: o.reportType != null ? o.reportType : 'cosmetic',
        reportId: o.reportId != null ? String(o.reportId) : '',
        dataAttrs: o.dataAttrs || {},
        role: o.role,
        tabIndex: o.tabIndex,
        ariaLabel: o.ariaLabel
      }
    };
  }

  /** Store leaderboard horizontal chips — same Lantern shell. */
  function specLeaderboardChipRailCard(rank, name, availText, rowIndex) {
    var visual = '<div class="exploreCardVisual exploreCardVisualIconRail"><span class="exploreCardVisualEmoji">🏅</span></div>';
    var inner = lcRailRow('media', visual) +
      lcRailRow('title', '<div class="exploreCardHd exploreCardHd--preview"><span class="exploreTitle">#' + esc(String(rank)) + ' ' + esc(name) + '</span></div>') +
      lcRailIdentityRow(name, { avatar: '🏅', frame: 'none' }) +
      lcRailRow('meta', '<div class="exploreCardMetaOneLine">' + esc(truncateMeta(availText || '', 76) || '\u00a0') + '</div>');
    return {
      kind: 'rail',
      innerStackHtml: inner,
      shell: {
        classNames: 'exploreCard--leaderboardChip',
        lanternCardType: 'leaderboard_chip',
        reportType: 'store_leaderboard_chip',
        reportId: String(rowIndex),
        dataAttrs: { 'lb-row': String(rowIndex) },
        role: 'button',
        tabIndex: '0',
        ariaLabel: 'Rank ' + rank + ' ' + String(name || '').slice(0, 80)
      }
    };
  }

  /** Display mode — news grid tile; body + praise hook folded into single meta line. */
  function specDisplayNewsSpotlightCard(id, category, title, bodySnippet) {
    var cat = String(category || 'News');
    var metaMerged = truncateMeta([cat, String(bodySnippet || '').replace(/\s+/g, ' ').trim()].filter(Boolean).join(' · '), 76) || '\u00a0';
    var inner = lcRailRow('media', '<div class="exploreCardVisual exploreCardVisualIconRail"><span class="exploreCardTypeBadge">📰</span><span class="exploreCardVisualEmoji">📰</span></div>') +
      lcRailRow('title', '<div class="exploreCardHd exploreCardHd--preview"><span class="exploreTitle">' + esc(title) + '</span></div>') +
      lcRailIdentityRow(cat, { avatar: '📰', frame: 'none' }) +
      lcRailRow('meta', '<div class="exploreCardMetaOneLine displayPraiseSummary exploreCardMetaOneLine--dim">' + esc(metaMerged) + '</div>');
    return {
      kind: 'rail',
      innerStackHtml: inner,
      shell: {
        classNames: 'exploreCard--displayNewsTile',
        lanternCardType: 'display_news',
        reportType: 'display_news',
        reportId: String(id || ''),
        dataAttrs: { 'reaction-item-type': 'news', 'reaction-item-id': String(id || '') }
      }
    };
  }

  function specActivityPulseCard(iconChar, lineText, timeStr, eventType, reportIdOpt) {
    var det = esc(String(eventType || '').slice(0, 100));
    var metaOne = truncateMeta((timeStr ? String(timeStr).trim() + ' · ' : '') + (lineText || ''), 76) || '\u00a0';
    var inner = lcRailRow('media', '<div class="exploreCardVisual exploreCardVisualIconRail exploreCardVisualIconRail--pulse"><span class="exploreCardVisualEmoji">' + esc(iconChar || '✨') + '</span></div>') +
      lcRailRow('title', '<div class="exploreCardHd exploreCardHd--preview"><span class="exploreTitle">Activity</span></div>') +
      lcRailIdentityRow('Activity', { avatar: String(iconChar || '✨'), frame: 'none' }) +
      lcRailRow('meta', '<div class="exploreCardMetaOneLine">' + esc(metaOne) + '</div>');
    var rid = reportIdOpt != null ? String(reportIdOpt) : '';
    return {
      kind: 'rail',
      innerStackHtml: inner,
      shell: {
        classNames: 'exploreCard--activityPulse',
        dataAttrs: { 'route-surface': 'explore_activity', 'route-detail': det },
        reportType: 'activity',
        reportId: rid
      }
    };
  }

  function postToRailModel(p, identity) {
    identity = identity || {};
    var c = p.curation || {};
    var st = '';
    if (p.rejected) st = 'Rejected';
    else if (p.returned) st = 'Returned';
    else if (p.approved === false && !p.rejected && !p.returned) st = 'Pending';
    var time = '';
    try {
      var dt = new Date(p.created_at || '');
      if (!isNaN(dt.getTime())) time = dt.toLocaleDateString() + ' ' + dt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    } catch (e) {}
    var meta = [st, time].filter(Boolean).join(' · ') || time || 'Your post';
    var dn = identity.display_name || '';
    var typ = p.type || 'link';
    var imgUrl = typ === 'image' ? String(p.url || '').trim() : String(p.image_url || '').trim();
    var vidUrl = typ === 'video' ? String(p.url || '').trim() : String(p.video_url || '').trim();
    var lnkUrl = (typ === 'link' || typ === 'webapp' || typ === 'project') ? String(p.url || '').trim() : String(p.link_url || '').trim();
    var avEm = (identity.avatar != null && String(identity.avatar).trim()) ? String(identity.avatar).trim()
      : (String(p.avatar != null ? p.avatar : '').trim() || '🌟');
    var cn = String(identity.character_name || identity.display_name || p.character_name || dn || '').trim();
    return {
      id: p.id,
      type: typ,
      title: (p.title || 'Untitled') + (p.pinned ? ' 📌' : ''),
      display_name: dn,
      character_name: cn,
      avatar: avEm,
      frame: identity.frame || p.frame || 'none',
      url: String(p.url || '').trim(),
      image_url: imgUrl,
      video_url: vidUrl,
      link_url: lnkUrl,
      preview_src: p.preview_src,
      thumbnail: p.thumbnail,
      image: p.image,
      created_at: p.created_at,
      teacher_pick: !!c.teacher_pick,
      teacher_featured: !!c.teacher_featured,
      card_meta: meta
    };
  }

  global.LanternCards = {
    CARD_MODE: CARD_MODE,
    CARD_FACTORY: CARD_FACTORY,
    CARD_CONTRACT_VERSION: CARD_CONTRACT_VERSION,
    esc: esc,
    railIdentityFirstName: railIdentityFirstName,
    lcRailRow: lcRailRow,
    lcRailIdentityRow: lcRailIdentityRow,
    TYPE_ICONS: TYPE_ICONS,
    TYPE_BADGES: TYPE_BADGES,
    getCardImageUrl: getCardImageUrl,
    getDefaultImageUrl: getDefaultImageUrl,
    getDefaultAvatarImageUrl: getDefaultAvatarImageUrl,
    buildExploreAuthorAvatarHtml: buildExploreAuthorAvatarHtml,
    accountKeyFromCardModel: accountKeyFromCardModel,
    getTypeFallbackMediaDataUri: svgTypeFallbackDataUri,
    getUniversalFallbackMediaDataUri: svgUniversalLanternDataUri,
    buildGuaranteedExploreImageHtml: buildGuaranteedExploreImageHtml,
    buildNewsCardVisualBlockFromItem: buildNewsCardVisualBlockFromItem,
    buildFeedPostParts: buildFeedPostParts,
    specFeedPostRail: specFeedPostRail,
    wireFeedPostCard: wireFeedPostCard,
    materializeFeedPostCard: materializeFeedPostCard,
    wirePollRailCard: wirePollRailCard,
    materializePollRailCard: materializePollRailCard,
    wireMissionSpotlightRail: wireMissionSpotlightRail,
    materializeMissionSpotlightRail: materializeMissionSpotlightRail,
    createStudentCard: createStudentCard,
    specNewsRailCard: specNewsRailCard,
    specPollRailCard: specPollRailCard,
    buildPollDraftOpenedPreviewHtml: buildPollDraftOpenedPreviewHtml,
    specOpenedNews: specOpenedNews,
    specOpenedMissionDraft: specOpenedMissionDraft,
    buildMissionSpotlightRailElement: materializeMissionSpotlightRail,
    buildMissionSpotlightCardElement: materializeMissionSpotlightRail,
    specMissionSpotlightRail: specMissionSpotlightRail,
    specIconRailCard: specIconRailCard,
    specWeeklyPaceLinkCard: specWeeklyPaceLinkCard,
    specGamesLeaderboardSummaryCard: specGamesLeaderboardSummaryCard,
    specGameHubRailCard: specGameHubRailCard,
    specLinkCard: specLinkCard,
    specGameHighlightLinkCard: specGameHighlightLinkCard,
    specVerifyStressLinkCard: specVerifyStressLinkCard,
    specCosmeticRailCard: specCosmeticRailCard,
    specLeaderboardChipRailCard: specLeaderboardChipRailCard,
    specDisplayNewsSpotlightCard: specDisplayNewsSpotlightCard,
    specActivityPulseCard: specActivityPulseCard,
    postToRailModel: postToRailModel,
    applyReportControl: applyReportControl,
    applyReportControlToOuterWrap: applyReportControlToOuterWrap,
    enhanceReportControlsIn: enhanceReportControlsIn
  };
})(typeof window !== 'undefined' ? window : this);
